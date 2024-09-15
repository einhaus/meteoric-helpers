import type { DateInterval } from './constants.js';
import dayjs from 'dayjs';

export const getUnixTimePlusMinus = (
    operator: '+' | '-',
    interval: number,
    intervalType: DateInterval,
    startOrEndOfDay?: 'start' | 'end' | 'tradingOpen' | 'tradingClose',
    dateTime: string | number | null = ''
): number => {
    let dateObject = dateTime && typeof dateTime !== 'number' ? dayjs(dateTime) : dayjs();
    dateObject = typeof dateTime === 'number' ? dayjs.unix(dateTime) : dateObject;
    dateObject = operator === '+' ? dateObject.add(interval, intervalType) : dateObject.subtract(interval, intervalType);
    dateObject = startOrEndOfDay === 'start' ? dateObject.startOf('day') : dateObject;
    dateObject = startOrEndOfDay === 'end' ? dateObject.endOf('day') : dateObject;
    dateObject = startOrEndOfDay === 'tradingOpen' ? dateObject.hour(9).minute(30).second(0).millisecond(0) : dateObject;
    dateObject = startOrEndOfDay === 'tradingClose' ? dateObject.hour(16).minute(0).second(0).millisecond(0) : dateObject;
    return dateObject.unix();
};
