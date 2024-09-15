import dayjs from 'dayjs';

export const getDaysAgo = (date: string | number): number => {
    return Math.abs(dayjs().diff(dayjs(date), 'days'));
};
