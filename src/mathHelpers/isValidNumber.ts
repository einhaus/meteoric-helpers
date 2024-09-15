export const isValidNumber = (value: number | null | undefined): boolean => {
    return value !== null && value !== undefined && typeof value === 'number';
};
