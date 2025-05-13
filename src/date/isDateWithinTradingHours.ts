import { marketOpenHour, marketCloseHour, marketOpenMinute } from './constants.js';
import { getDatePieces } from './getDatePieces.js';

export const isDateWithinTradingHours = (dateTime: string | number | Date = '') => {
    const { hour, minute } = getDatePieces(dateTime);

    if (hour < marketOpenHour || hour >= marketCloseHour) return false;

    if (hour === marketOpenHour && minute < marketOpenMinute) return false;

    return true;
};
