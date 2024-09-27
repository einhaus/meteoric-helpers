// binary search to find the first key greater than a target value
export const findFirstGreaterKeyIndex = (keys: number[], target: number): number => {
    let low = 0;
    let high = keys.length - 1;
    let result = keys.length; // Default to length if target is larger than all keys

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        if (keys[mid]! > target) {
            result = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    return result;
};
