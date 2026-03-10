type WorkerRuntimeGlobal = typeof globalThis & {
    postMessage?: (message: unknown) => void;
};

const BUN_GLOBAL_KEY = 'Bun';
const METEORIC_WORKER_DATA_KEY = '__meteoricWorkerData';
const METEORIC_WORKER_THREAD_ID_KEY = '__meteoricWorkerThreadId';

const getWorkerRuntimeGlobal = () => globalThis as WorkerRuntimeGlobal;

const createSyntheticWorkerThreadId = () => {
    const timestampSeed = Date.now() % 1_000_000_000;
    const randomSeed = Math.floor(Math.random() * 1_000_000);

    return timestampSeed + randomSeed;
};

export const isBunWorkerRuntime = () => {
    const runtimeGlobal = getWorkerRuntimeGlobal() as Record<string, unknown>;
    const bunGlobal = runtimeGlobal[BUN_GLOBAL_KEY];
    const isIpcChildProcess = typeof process !== 'undefined' && typeof process.send === 'function';

    if (isIpcChildProcess) return true;

    if (typeof bunGlobal !== 'object' || bunGlobal === null) return false;

    const bunRuntime = bunGlobal as { isMainThread?: boolean };

    return bunRuntime.isMainThread === false;
};

export const ensureMeteoricWorkerThreadId = () => {
    const runtimeGlobal = getWorkerRuntimeGlobal() as Record<string, unknown>;

    if (typeof runtimeGlobal[METEORIC_WORKER_THREAD_ID_KEY] !== 'number') {
        runtimeGlobal[METEORIC_WORKER_THREAD_ID_KEY] = createSyntheticWorkerThreadId();
    }

    return runtimeGlobal[METEORIC_WORKER_THREAD_ID_KEY] as number;
};

export const getMeteoricWorkerThreadId = () => {
    if (!isBunWorkerRuntime()) return 0;

    return ensureMeteoricWorkerThreadId();
};

export const setMeteoricWorkerData = (workerData: unknown) => {
    const runtimeGlobal = getWorkerRuntimeGlobal() as Record<string, unknown>;
    runtimeGlobal[METEORIC_WORKER_DATA_KEY] = workerData;
};

export const getMeteoricWorkerData = () => {
    const runtimeGlobal = getWorkerRuntimeGlobal() as Record<string, unknown>;

    return runtimeGlobal[METEORIC_WORKER_DATA_KEY];
};

export const postMeteoricWorkerMessage = (message: unknown) => {
    if (!isBunWorkerRuntime()) return false;

    if (typeof process !== 'undefined' && typeof process.send === 'function') {
        process.send(message);
        return true;
    }

    const runtimeGlobal = getWorkerRuntimeGlobal();
    runtimeGlobal.postMessage?.(message);

    return true;
};
