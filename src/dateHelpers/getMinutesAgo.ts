import dayjs from 'dayjs';

export const getMinutesAgo = (date: string | number): number => {
    return Math.abs(dayjs().diff(dayjs(date), 'minutes'));
};
