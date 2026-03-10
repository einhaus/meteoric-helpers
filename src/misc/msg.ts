import { postMeteoricWorkerMessage } from './workerRuntime.js';

export const msg = (message: unknown) => {
    if (postMeteoricWorkerMessage(message)) return;

    console.log(message);
};
