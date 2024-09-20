import { parentPort } from 'worker_threads';

export const msg = (message: unknown) => {
    if (parentPort) {
        parentPort.postMessage(message);
    } else {
        console.log(message);
    }
};
