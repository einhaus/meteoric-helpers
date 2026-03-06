// Add this to scripts that need more memory to make sure we didnt forget to set the max heap size
export const ensureMaxHeap = () => {
    const bunVersion = (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    const runtimeName = bunVersion ? 'bun' : 'node';
    const hasNodeMaxHeap = process.execArgv.some((arg) => arg.startsWith('--max-old-space-size'));
    const bunJscGcMaxHeapSize = process.env.BUN_JSC_gcMaxHeapSize?.trim();

    if (runtimeName === 'bun') {
        if (!bunJscGcMaxHeapSize && !hasNodeMaxHeap) {
            console.warn('Warning: no explicit Bun heap sizing detected. Consider setting BUN_JSC_gcMaxHeapSize if memory usage grows.');
            console.warn('Example: BUN_JSC_gcMaxHeapSize=<bytes> bun run your_script.ts');
        }

        return;
    }

    if (!hasNodeMaxHeap) {
        console.warn('Warning: --max-old-space-size flag not set. Consider increasing it if you run out of memory.');
        console.warn('You can set it by using the command: node --max-old-space-size=<size_in_mb> your_script.js');
    }
};
