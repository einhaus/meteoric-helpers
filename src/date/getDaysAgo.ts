import dayjs from 'dayjs';

export const getDaysAgo = (date: string | number): number => {
    const dateObj = typeof date === 'string' ? dayjs(date) : dayjs.unix(date);
    return Math.abs(dayjs().diff(dateObj, 'days'));
};
