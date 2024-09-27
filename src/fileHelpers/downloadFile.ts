import { type IncomingMessage, get as httpGet } from 'http';
import { get as httpsGet } from 'https';
import { URL } from 'url';
import { sleep } from '../miscHelpers/sleep.js';
import { createWriteStream } from 'fs';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

export const downloadFile = async (url: string, localFilePath: string, retryCount = 1): Promise<string | void> => {
    try {
        const parsedUrl = new URL(url);
        const getFunction = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;

        const res = await new Promise<IncomingMessage>((resolve, reject) => {
            getFunction(url, (response) => {
                if (response.statusCode === 200) {
                    resolve(response);
                } else {
                    reject(new Error(`Request Failed With Status Code: ${response.statusCode}`));
                }
            }).on('error', reject);
        });

        await new Promise((resolve, reject) => {
            const stream = res.pipe(createWriteStream(localFilePath));
            stream.on('error', reject);
            stream.on('close', resolve);
        });

        return localFilePath;
    } catch (error) {
        if (retryCount < MAX_RETRIES && !(error instanceof Error && error.message.includes('404'))) {
            await sleep(RETRY_DELAY_MS * retryCount);
            return downloadFile(url, localFilePath, retryCount + 1);
        } else {
            console.error(`${url} downloadFile failed with error: ${JSON.stringify(error)}`);
        }
    }
};
