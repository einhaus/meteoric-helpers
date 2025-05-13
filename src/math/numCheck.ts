// To Ensure DB values are numbers - decminals can return string
export const numCheck = (value?: number | string | null) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return +value;
    return 0;
};
