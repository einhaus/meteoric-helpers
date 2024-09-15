import { ymd, ymdhms } from './constants.js';
import dayjs from 'dayjs';

export const convertDateStringFormat = (dateTime: string, inputFormat: 'MM/DD/YYYY', returnFormat: 'ymd' | 'ymdhms' = 'ymd') => {
    const dateObject = dayjs(dateTime, [inputFormat]);

    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    return dateFormatted;
};
