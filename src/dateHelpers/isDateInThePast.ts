import dayjs from 'dayjs';

export const isDateInThePast = (date: string): boolean => {
    return dayjs().isAfter(dayjs(date));
};
