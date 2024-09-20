import { createWriteStream } from 'fs';
import { type IncomingMessage, get } from 'http';
import { sleep } from '../miscHelpers/sleep.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

export const downloadFile = async (url: string, localFilePath: string, retryCount = 1): Promise<string | void> => {
    try {
        const res = await new Promise<IncomingMessage>((resolve, reject) => {
            get(url, (response) => {
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
