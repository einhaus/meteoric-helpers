// Add this to scripts that need more memory to make sure we didnt forget to set the max heap size
export const ensureMaxHeap = () => {
    const hasMaxHeap = process.execArgv.some((arg) => arg.startsWith('--max-old-space-size'));

    if (!hasMaxHeap) {
        console.warn('Warning: --max-old-space-size flag not set. Consider increasing it if you run out of memory.');
        console.warn('You can set it by using the command: node --max-old-space-size=<size_in_mb> your_script.js');
    }
};
