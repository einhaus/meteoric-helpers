import dayjs from 'dayjs';

export const isDateValid = (date: string, format = 'YYYY-MM-DD'): boolean => {
    return dayjs(date, format, true).isValid();
};
