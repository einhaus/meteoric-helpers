/* eslint-disable @typescript-eslint/naming-convention */
import { getDate } from '../date/getDate.js';
import { appendToFile } from '../file/appendToFile.js';
import { sleep } from './sleep.js';
import url from 'url';

export type RequestMethod = 'GET' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT';

type RedactionConfig = {
    enabled?: boolean;
    level?: 'full' | 'partial';
    customPatterns?: {
        headers?: string[];
        urlParams?: string[];
        bodyFields?: string[];
    };
};

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
    redaction?: RedactionConfig;
};

interface RequestInitWithTimeout extends RequestInit {
    timeout?: number;
}

export type ErrorResponse = { isError: boolean; message: string; statusCode?: number };

export const FETCH_DEFAULT_RETRY_MS = 10000;
export const FETCH_DEFAULT_TIMEOUT_MS = 10000;
export const FETCH_RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

// Default sensitive patterns for redaction
const DEFAULT_SENSITIVE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'api-key',
    'apikey',
    'x-secret',
    'x-token',
    'proxy-authorization',
    'www-authenticate'
];

const DEFAULT_SENSITIVE_URL_PARAMS = [
    'api_key',
    'apikey',
    'access_token',
    'token',
    'auth',
    'secret',
    'password',
    'key',
    'session',
    'session_id',
    'client_secret',
    'refresh_token'
];

const DEFAULT_SENSITIVE_BODY_FIELDS = [
    'password',
    'token',
    'secret',
    'creditCard',
    'credit_card',
    'ssn',
    'api_key',
    'apiKey',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'client_secret',
    'clientSecret',
    'private_key',
    'privateKey'
];

let doFetchErrorsLogDirectory = '';

// Helper function to check if a key matches sensitive patterns
const isSensitiveKey = (key: string, patterns: string[]): boolean => {
    const lowerKey = key.toLowerCase();
    return patterns.some((pattern) => {
        const lowerPattern = pattern.toLowerCase();
        // Check for exact match or if the key contains the pattern
        return lowerKey === lowerPattern || lowerKey.includes(lowerPattern);
    });
};

// Redact sensitive value based on redaction level
const redactValue = (value: string, level: 'full' | 'partial'): string => {
    if (!value || typeof value !== 'string') return '[REDACTED]';

    if (level === 'full') {
        return '[REDACTED]';
    }

    // Partial redaction: show first few characters
    if (value.length <= 8) {
        return '[REDACTED]';
    }

    // For Bearer tokens, show the type
    if (value.toLowerCase().startsWith('bearer ')) {
        return 'Bearer [REDACTED]';
    }

    // For API keys with prefixes, show the prefix
    const prefixMatch = value.match(/^(sk_|pk_|api_|key_)[a-zA-Z]+_/);

    if (prefixMatch) {
        return `${prefixMatch[0]}[REDACTED]`;
    }

    // Default partial: show first 4 chars
    return `${value.substring(0, 4)}[REDACTED]`;
};

// Sanitize headers
const sanitizeHeaders = (
    headers: Record<string, string> | undefined,
    patterns: string[],
    level: 'full' | 'partial'
): Record<string, string> => {
    if (!headers) return {};

    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
        if (isSensitiveKey(key, patterns)) {
            sanitized[key] = redactValue(value, level);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

// Sanitize URL with query parameters
const sanitizeUrl = (urlString: string, patterns: string[]): string => {
    try {
        const urlObj = new URL(urlString);
        const params = urlObj.searchParams;
        const sanitizedParams = new URLSearchParams();

        for (const [key, value] of params.entries()) {
            if (isSensitiveKey(key, patterns)) {
                sanitizedParams.append(key, '[REDACTED]');
            } else {
                sanitizedParams.append(key, value);
            }
        }

        urlObj.search = sanitizedParams.toString();
        return urlObj.toString();
    } catch {
        // If URL parsing fails, return the original URL
        return urlString;
    }
};

// Deep sanitize body object
const sanitizeBody = (body: unknown, patterns: string[], level: 'full' | 'partial'): unknown => {
    if (!body || typeof body !== 'object') return body;

    if (Array.isArray(body)) {
        return body.map((item) => sanitizeBody(item, patterns, level));
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (isSensitiveKey(key, patterns)) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeBody(value, patterns, level);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

// Main sanitization function
// eslint-disable-next-line complexity
const sanitizeRequestDetails = (
    details: {
        url?: string;
        method?: string;
        headers?: Record<string, string> | Headers;
        body?: unknown;
    },
    redactionConfig?: RedactionConfig
): typeof details => {
    // Default redaction config
    const config = {
        enabled: redactionConfig?.enabled ?? true,
        level: redactionConfig?.level ?? 'partial',
        customPatterns: {
            headers: [...DEFAULT_SENSITIVE_HEADERS, ...(redactionConfig?.customPatterns?.headers ?? [])],
            urlParams: [...DEFAULT_SENSITIVE_URL_PARAMS, ...(redactionConfig?.customPatterns?.urlParams ?? [])],
            bodyFields: [...DEFAULT_SENSITIVE_BODY_FIELDS, ...(redactionConfig?.customPatterns?.bodyFields ?? [])]
        }
    };

    if (!config.enabled) {
        return details;
    }

    const sanitized: typeof details = { ...details };

    // Sanitize URL
    if (details.url) {
        sanitized.url = sanitizeUrl(details.url, config.customPatterns.urlParams);
    }

    // Sanitize headers
    if (details.headers) {
        let headersObj: Record<string, string>;

        if (details.headers instanceof Headers) {
            headersObj = {};

            details.headers.forEach((value, key) => {
                headersObj[key] = value;
            });
        } else {
            headersObj = details.headers;
        }

        sanitized.headers = sanitizeHeaders(headersObj, config.customPatterns.headers, config.level);
    }

    // Sanitize body
    if (details.body) {
        if (typeof details.body === 'string') {
            try {
                const parsed = JSON.parse(details.body);
                sanitized.body = JSON.stringify(sanitizeBody(parsed, config.customPatterns.bodyFields, config.level));
            } catch {
                // If not JSON, leave as is (could be form data)
                sanitized.body = details.body;
            }
        } else {
            sanitized.body = sanitizeBody(details.body, config.customPatterns.bodyFields, config.level);
        }
    }

    return sanitized;
};

// eslint-disable-next-line complexity
export const doFetch = async <T>(requestUrl: string, config?: RequestConfig): Promise<T | ErrorResponse> => {
    if (config?.logDirectory) ({ logDirectory: doFetchErrorsLogDirectory } = config);
    const { fetchConfig, urlWithParams } = configureFetchRequest(requestUrl, config);
    const timesToAttempt = (config?.timesToRetry ?? 2) + 1;
    const statusCodesToRetry = config?.statusCodesToRetry ?? FETCH_RETRY_STATUS_CODES;

    const ATTEMPTS_LOGGING_THRESHOLD = 10;

    for (let attempts = 0; attempts < timesToAttempt; attempts++) {
        if ((attempts > ATTEMPTS_LOGGING_THRESHOLD || timesToAttempt > ATTEMPTS_LOGGING_THRESHOLD) && doFetchErrorsLogDirectory)
            appendToFile(`${doFetchErrorsLogDirectory}doFetchErrors.log`, `doFetch: ${attempts} ${timesToAttempt}`);

        try {
            const requestStartTime = performance.now();
            const response = await fetchWithTimeout(urlWithParams, fetchConfig, config?.redaction);
            if (response.ok) return await parseResponse<T>(response, config?.redaction);
            const responseEndTime = performance.now();
            const responseTimeMs = responseEndTime - requestStartTime;

            const urlString = urlWithParams.toString();

            const shouldRetryFailure = await handleRetry({
                response,
                statusCodesToRetry,
                attempts,
                timesToAttempt,
                config,
                urlString,
                responseTimeMs
            });

            if (!shouldRetryFailure) {
                const message = await extractErrorMessage(response);
                return returnError({
                    message,
                    url: urlString,
                    logDirectory: doFetchErrorsLogDirectory,
                    ...(config?.redaction && { redactionConfig: config.redaction })
                });
            }
        } catch (error: unknown) {
            if (attempts >= timesToAttempt - 1) {
                return returnError({
                    message: (error as Error).message,
                    url: urlWithParams.toString(),
                    ...(config?.redaction && { redactionConfig: config.redaction })
                });
            }

            await sleep(FETCH_DEFAULT_RETRY_MS);
        }
    }

    return returnError({
        message: 'Request failed after loop',
        url: urlWithParams.toString(),
        response: new Response(),
        ...(config?.redaction && { redactionConfig: config.redaction })
    });
};

const returnError = (config: {
    message: string;
    url: string;
    response?: Response;
    logDirectory?: string;
    redactionConfig?: RedactionConfig;
}): ErrorResponse => {
    const { message, url, response, logDirectory, redactionConfig } = config;

    if (logDirectory) {
        // Sanitize the headers before logging
        let sanitizedHeaders = {};

        if (response?.headers) {
            const headersObj: Record<string, string> = {};

            response.headers.forEach((value, key) => {
                headersObj[key] = value;
            });

            const sanitized = sanitizeRequestDetails({ headers: headersObj }, redactionConfig);
            sanitizedHeaders = sanitized.headers || {};
        }

        appendToFile(
            `${logDirectory}doFetchErrors.log`,
            `${getDate({ format: 'ymdhms' })} ${url} ${response?.status} ${JSON.stringify(sanitizedHeaders)} ${message} ${response?.status}`
        );
    }

    return response?.status ? { isError: true, message, statusCode: response.status } : { isError: true, message };
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
    } else if ((fetchConfig.method === 'PUT' || fetchConfig.method === 'PATCH') && config?.params) {
        if (config.paramsFieldName === 'body') {
            fetchConfig = { ...fetchConfig, body: JSON.stringify(config.params) };
            fetchConfig.headers = { ...fetchConfig.headers, 'Content-Type': 'application/json' };
        } else {
            fetchConfig.headers = { 'Content-Type': 'application/json' };
        }
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
        if (doFetchErrorsLogDirectory)
            appendToFile(`${doFetchErrorsLogDirectory}doFetchErrors.log`, `doFetch: ${error?.toString()} ${JSON.stringify(requestUrl)}`);

        return { fetchConfig, urlWithParams: new URL(requestUrl) };
    }
};

const fetchWithTimeout = async (requestUrl: string | URL, options: RequestInitWithTimeout = {}, redactionConfig?: RedactionConfig) => {
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

        // Sanitize request details for logging
        const sanitizedDetails = sanitizeRequestDetails(
            {
                url: requestUrl.toString(),
                method: options.method ?? 'GET',
                headers: options.headers as Record<string, string>,
                body: options.body
            },
            redactionConfig
        );

        const errorLog = {
            status: 408,
            statusText: `Request timed out - fetchWithTimeout timeout: ${timeout} MS - ${error2.message}`,
            requestDetails: sanitizedDetails,
            errorDetails: error2.message ?? '',
            errorStack: error2.stack ?? ''
        };

        if (doFetchErrorsLogDirectory)
            appendToFile(
                `${doFetchErrorsLogDirectory}doFetchErrors.log`,
                `Do fetch timed out ${getDate({ format: 'ymdhms' })}
                 ${JSON.stringify(sanitizedDetails.url)} 
                 ${JSON.stringify(sanitizedDetails)}
                 ${JSON.stringify(errorLog)}\n\n`
            );
        return new Response('', { status: 408, statusText: JSON.stringify(errorLog) });
    }
};

const parseResponse = async <T>(response: Response, redactionConfig?: RedactionConfig): Promise<T | ErrorResponse> => {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
        try {
            return (await response.json()) as T;
        } catch {
            return returnError({
                message: 'JSON parsing error',
                url: response.url,
                response,
                ...(redactionConfig && { redactionConfig })
            });
        }
    }

    // Fallback to text, but still try to parse it as JSON just in case
    const text = await response.text();

    try {
        return JSON.parse(text) as T;
    } catch {
        return text as T;
    }
};

// eslint-disable-next-line complexity
const handleRetry = async (details: {
    response: Response;
    statusCodesToRetry: number[];
    attempts: number;
    timesToAttempt: number;
    responseTimeMs: number;
    config: RequestConfig | undefined;
    urlString: string;
}): Promise<boolean> => {
    const { response, statusCodesToRetry, attempts, timesToAttempt, config, urlString, responseTimeMs } = details;
    if (!statusCodesToRetry.includes(response.status) || attempts >= timesToAttempt - 1) return false;

    const retryAfter =
        response.headers.get('x-retry-after') ??
        response.headers.get('Retry-After') ??
        response.headers.get('X-Retry-After') ??
        response.headers.get('retry-after');

    let timeToSleep =
        retryAfter && parseInt(retryAfter) > 0 && parseInt(retryAfter) < 500 ? parseInt(retryAfter) * 1000 : FETCH_DEFAULT_RETRY_MS;

    timeToSleep = !retryAfter && config?.retryDelayMilliseconds ? config.retryDelayMilliseconds : timeToSleep;

    if (doFetchErrorsLogDirectory) {
        // Sanitize headers before logging
        const headersObj: Record<string, string> = {};

        response.headers.forEach((value, key) => {
            headersObj[key] = value;
        });

        const sanitized = sanitizeRequestDetails({ headers: headersObj }, config?.redaction);
        const sanitizedHeaders = sanitized.headers || {};

        appendToFile(
            `${doFetchErrorsLogDirectory}doFetchErrors.log`,
            `doFetch Retrying ${getDate({ format: 'ymdhms' })}
             ${urlString} ${response?.status} ${JSON.stringify(sanitizedHeaders)} 
             Elasped Time: ${responseTimeMs} timeToSleep: ${timeToSleep} ${JSON.stringify(config)}\n\n`
        );
    }

    const SLEEP_TIME_LOGGING_THRESHOLD = 100000;

    if (timeToSleep > SLEEP_TIME_LOGGING_THRESHOLD && doFetchErrorsLogDirectory) {
        // Sanitize headers before logging
        const headersObj: Record<string, string> = {};

        response.headers.forEach((value, key) => {
            headersObj[key] = value;
        });

        const sanitized = sanitizeRequestDetails({ headers: headersObj }, config?.redaction);
        const sanitizedHeaders = sanitized.headers || {};

        appendToFile(
            `${doFetchErrorsLogDirectory}doFetchErrors.log`,
            `doFetch: ${urlString}  ${response?.status} ${JSON.stringify(sanitizedHeaders)} timeToSleep: ${timeToSleep}\n`
        );
    }

    await sleep(timeToSleep);
    return true;
};

const extractErrorMessage = async (response: Response): Promise<string> => {
    const text = typeof response.text === 'function' ? await response.text() : '';
    const message = text?.trim().length ? text : response.statusText;

    try {
        const json = JSON.parse(text) as Record<string, string>;
        return json.errorMessage ?? json.message ?? json.error ?? json.Message ?? json.Error ?? json.errorMessages?.toString() ?? text;
    } catch {
        return message;
    }
};
