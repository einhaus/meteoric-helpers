export const extractValuesInRange = <ValueType>(map: Map<number, ValueType>, startTimestamp: number, endTimestamp: number): ValueType[] => {
    const valuesInRange: ValueType[] = [];

    for (const [timestamp, value] of map.entries()) {
        if (timestamp < startTimestamp) {
            continue; // Skip timestamps before the start range
        } else if (timestamp > endTimestamp) {
            break; // Exit the loop once the end range is surpassed
        } else {
            valuesInRange.push(value); // Collect values within the range
        }
    }

    return valuesInRange;
};
