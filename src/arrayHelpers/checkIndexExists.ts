export const checkIndexExists = <T>(arr: T[], index: number): T => {
    if (index < 0 || index >= arr.length) {
        throw new Error(`Array index ${index} does not exist.`);
    }

    if (arr[index] === undefined) throw new Error(`Array index ${index} does not exist.`);

    return arr[index]!;
};
