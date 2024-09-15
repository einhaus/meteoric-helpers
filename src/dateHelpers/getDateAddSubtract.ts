import { ymd, ymdhms, type DateInterval } from './constants.js';
import dayjs from 'dayjs';

export const getDateAddSubtract = (config: {
    operator: '+' | '-';
    interval: number;
    intervalType: DateInterval;
    format: 'ymd' | 'ymdhms';
    startOrEndOfDay?: 'start' | 'end' | null;
    inputDateTime?: string | Date;
}): string => {
    const returnFormat = config ? config.format : undefined;
    const startOrEndOfDay = config ? config.startOrEndOfDay : undefined;
    let dateObject = config.inputDateTime ? dayjs(config.inputDateTime) : dayjs();

    dateObject =
        config.operator === '+'
            ? dateObject.add(config.interval, config.intervalType)
            : dateObject.subtract(config.interval, config.intervalType);

    dateObject = startOrEndOfDay && startOrEndOfDay === 'start' ? dateObject.startOf('day') : dateObject;
    dateObject = startOrEndOfDay && startOrEndOfDay === 'end' ? dateObject.endOf('day') : dateObject;
    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    return dateFormatted;
};
