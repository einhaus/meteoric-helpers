/* eslint-disable @typescript-eslint/naming-convention */
import { getDate } from '../dateHelpers/getDate.js';
import { appendToFile } from '../fileHelpers/appendToFile.js';
import { sleep } from './sleep.js';
import url from 'url';

export type RequestMethod = 'GET' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT';

type RequestConfig = {
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
    method?: RequestMethod;
    paramsFieldName?: string;
    type?: 'json' | 'form';
    timesToRetry?: number;
    retryWaitType?: 'exponential' | 'static';
    retryDelayMilliseconds?: number;
    statusCodesToRetry?: number[];
    timeoutMilliseconds?: number;
    logDirectory?: string;
};

interface RequestInitWithTimeout extends RequestInit {
    timeout?: number;
}

export type ErrorResponse = { isError: boolean; message: string; statusCode?: number };

export const FETCH_DEFAULT_RETRY_MS = 10000;
export const FETCH_DEFAULT_TIMEOUT_MS = 10000;
export const FETCH_RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

let logDirectory = '';

export const doFetch = async <T>(requestUrl: string, config?: RequestConfig): Promise<T | ErrorResponse> => {
    if (config?.logDirectory) ({ logDirectory } = config);
    const { fetchConfig, urlWithParams } = configureFetchRequest(requestUrl, config);
    const timesToAttempt = (config?.timesToRetry ?? 2) + 1;
    const statusCodesToRetry = config?.statusCodesToRetry ?? FETCH_RETRY_STATUS_CODES;

    const ATTEMPTS_LOGGING_THRESHOLD = 10;

    for (let attempts = 0; attempts < timesToAttempt; attempts++) {
        if ((attempts > ATTEMPTS_LOGGING_THRESHOLD || timesToAttempt > ATTEMPTS_LOGGING_THRESHOLD) && logDirectory)
            appendToFile(`${logDirectory}doFetchErrors.log`, `doFetch: ${attempts} ${timesToAttempt}`);

        try {
            const response = await fetchWithTimeout(urlWithParams, fetchConfig);
            if (response.ok) return await parseResponse<T>(response);

            const urlString = urlWithParams.toString();

            const shouldRetryFailure = await handleRetry({
                response,
                statusCodesToRetry,
                attempts,
                timesToAttempt,
                config,
                urlString
            });

            if (!shouldRetryFailure) {
                const message = await extractErrorMessage(response);
                return returnError(message, urlString, response, response.status);
            }
        } catch (error: unknown) {
            if (attempts >= timesToAttempt - 1)
                return returnError((error as Error).message, urlWithParams.toString(), new Response(), attempts);
            await sleep(FETCH_DEFAULT_RETRY_MS);
        }
    }

    return returnError('Request failed after loop', urlWithParams.toString(), new Response());
};

const returnError = (message: string, url: string, response: Response, statusCode?: number): ErrorResponse => {
    appendToFile(
        `${logDirectory}doFetchErrors.log`,
        `${getDate({ format: 'ymdhms' })} ${url} ${JSON.stringify(response)} ${message} ${statusCode}`
    );

    return statusCode ? { isError: true, message, statusCode } : { isError: true, message };
};

// eslint-disable-next-line complexity
const configureFetchRequest = (requestUrl: string, config?: RequestConfig) => {
    let fetchConfig: RequestInitWithTimeout = {
        method: config?.method ? config.method : 'GET',
        redirect: 'follow',
        timeout: config?.timeoutMilliseconds ? config.timeoutMilliseconds : FETCH_DEFAULT_TIMEOUT_MS
    };

    if (fetchConfig.method === 'POST' && config?.params && (!config?.type || config?.type === 'form')) {
        const params = new url.URLSearchParams();

        for (const [key, value] of Object.entries(config.params)) {
            const stringValue = value as string;
            params.append(key, stringValue);
        }

        fetchConfig = { ...fetchConfig, body: params };

        fetchConfig.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    } else if (fetchConfig.method === 'POST' && config?.params && config?.type === 'json') {
        fetchConfig = { ...fetchConfig, body: JSON.stringify(config?.params) };
        fetchConfig.headers = { 'Content-Type': 'application/json' };
    } else if (fetchConfig.method === 'DELETE') {
        fetchConfig.headers = { 'Content-Type': 'application/json' };
    }

    try {
        const urlWithParams = new URL(requestUrl);

        if (fetchConfig.method === 'GET' && config?.params) {
            for (const [key, value] of Object.entries(config.params)) {
                const stringValue = typeof value === 'object' ? JSON.stringify(value) : (value as string);
                urlWithParams.searchParams.append(key, stringValue);
            }
        }

        if (config?.headers) fetchConfig.headers = { ...fetchConfig.headers, ...config.headers };

        return { fetchConfig, urlWithParams };
    } catch (error: unknown) {
        appendToFile(`${logDirectory}doFetchErrors.log`, `doFetch: ${error?.toString()} ${JSON.stringify(requestUrl)}`);

        return { fetchConfig, urlWithParams: new URL(requestUrl) };
    }
};

const fetchWithTimeout = async (requestUrl: string | URL, options: RequestInitWithTimeout = {}) => {
    const { timeout = FETCH_DEFAULT_TIMEOUT_MS } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(requestUrl, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        const error2 = error as Error;

        const errorLog = {
            status: 408,
            statusText: `Request timed out - fetchWithTimeout timeout: ${timeout} MS`,
            requestDetails: {
                url: requestUrl.toString(),
                method: options.method ?? 'GET',
                headers: options.headers ?? {},
                body: options.body
            },
            errorDetails: error2.message ?? '',
            errorStack: error2.stack ?? ''
        };

        return new Response('', { status: 408, statusText: JSON.stringify(errorLog) });
    }
};

const parseResponse = async <T>(response: Response): Promise<T | ErrorResponse> => {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
        try {
            return (await response.json()) as T;
        } catch {
            return returnError('JSON parsing error', response.url, response, response.status);
        }
    }

    try {
        const text = await response.text();
        return JSON.parse(text) as T;
    } catch {
        return returnError('Text parsing error', response.url, response, response.status);
    }
};

const handleRetry = async (details: {
    response: Response;
    statusCodesToRetry: number[];
    attempts: number;
    timesToAttempt: number;
    config: RequestConfig | undefined;
    urlString: string;
}): Promise<boolean> => {
    const { response, statusCodesToRetry, attempts, timesToAttempt, config, urlString } = details;
    if (!statusCodesToRetry.includes(response.status) || attempts >= timesToAttempt - 1) return false;

    const retryAfter =
        response.headers.get('x-retry-after') ??
        response.headers.get('Retry-After') ??
        response.headers.get('X-Retry-After') ??
        response.headers.get('retry-after');

    let timeToSleep = retryAfter && parseInt(retryAfter) < 500 ? parseInt(retryAfter) * 1000 : FETCH_DEFAULT_RETRY_MS;
    timeToSleep = !retryAfter && config?.retryDelayMilliseconds ? config.retryDelayMilliseconds : timeToSleep;

    const SLEEP_TIME_LOGGING_THRESHOLD = 100000;
    if (timeToSleep > SLEEP_TIME_LOGGING_THRESHOLD)
        appendToFile(`${logDirectory}doFetchErrors.log`, `doFetch: ${urlString} ${JSON.stringify(response)} timeToSleep: ${timeToSleep}`);

    await sleep(timeToSleep);
    return true;
};

const extractErrorMessage = async (response: Response): Promise<string> => {
    const text = typeof response.text === 'function' ? await response.text() : '';
    const message = text || response.statusText;

    try {
        const json = JSON.parse(text) as Record<string, string>;
        return json.errorMessage ?? json.message ?? json.error ?? json.Message ?? json.Error ?? json.errorMessages?.toString() ?? text;
    } catch {
        return message;
    }
};
