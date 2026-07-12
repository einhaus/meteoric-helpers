import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

export const isDateValid = (date: string, format = 'YYYY-MM-DD'): boolean => {
    return dayjs(date, format, true).isValid();
};
