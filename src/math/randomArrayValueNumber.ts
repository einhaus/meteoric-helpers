export const randomArrayValueNumber = (items: number[]): number => {
    const value = items[Math.floor(Math.random() * items.length)];
    if (value === undefined) throw new Error('randomArrayValueNumber: value is undefined');
    return value;
};
