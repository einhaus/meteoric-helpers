export const arePotentiallyEmptyStringsEqual = (a: string | undefined | null, b: string | undefined | null) => {
    // Check if both are either null, undefined, or empty string
    if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) {
        return true;
    }

    // If not, compare them for strict equality
    return a === b;
};
