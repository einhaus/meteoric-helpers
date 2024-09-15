import { marketOpenHour, marketOpenMinute, marketCloseHour, marketCloseMinute } from './constants.js';
import dayjs from 'dayjs';

export const getOpenOrCloseUnix = (timestamp: number, openOrClose: 'open' | 'close') => {
    return openOrClose === 'open'
        ? dayjs.unix(timestamp).hour(marketOpenHour).minute(marketOpenMinute).unix()
        : dayjs.unix(timestamp).hour(marketCloseHour).minute(marketCloseMinute).unix();
};
