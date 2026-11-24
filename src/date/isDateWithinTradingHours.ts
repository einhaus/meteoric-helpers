import { marketOpenHour, marketCloseHour, marketOpenMinute } from './constants.js';
import { getDateNumericalTime } from './getDateNumericalTime.js';

/** Standard New York regular-hours clock. Use the exchange calendar for holidays and early closes. */
export const isDateWithinTradingHours = (dateTime: string | number | Date = '') => {
    const minute = getDateNumericalTime(dateTime, 'America/New_York');
    return minute >= marketOpenHour * 100 + marketOpenMinute && minute < marketCloseHour * 100;
};
