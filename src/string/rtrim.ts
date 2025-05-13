export const rtrim = (str: string, characters: string) => {
    return str.endsWith(characters) ? str.slice(0, -characters.length) : str;
};
