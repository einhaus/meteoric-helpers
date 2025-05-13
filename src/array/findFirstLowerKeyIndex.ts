export const findFirstLowerKeyIndex = (keys: number[], target: number): number => {
    let low = 0;
    let high = keys.length - 1;
    let result = -1; // Default to -1 if no key is lower than the target

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        if (keys[mid]! < target) {
            result = mid; // Store the index as a potential result
            low = mid + 1; // Search to the right of mid
        } else {
            high = mid - 1; // Search to the left of mid
        }
    }

    return result;
};
