import { sleep } from './sleep.js';

export const sleepForRandomMs = async (minMs: number, maxMs: number): Promise<void> => {
    const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await sleep(randomMs);
};
