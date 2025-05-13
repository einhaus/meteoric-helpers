import { ymdhms } from './constants.js';
import dayjs from 'dayjs';

export const getDateTimeXDaysAgo = (daysAgo: number, startOrEndOfDay: 'start' | 'end' = 'start') => {
    let dateObject = dayjs().subtract(daysAgo, 'day');
    dateObject = startOrEndOfDay === 'start' ? dateObject.startOf('day') : dateObject;
    dateObject = startOrEndOfDay === 'end' ? dateObject.endOf('day') : dateObject;
    return dateObject.format(ymdhms);
};
