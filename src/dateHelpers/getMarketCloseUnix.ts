import { marketCloseHour, marketCloseMinute } from './constants.js';
import dayjs from 'dayjs';

export const getMarketCloseUnix = (timestamp: number) => {
    return dayjs.unix(timestamp).hour(marketCloseHour).minute(marketCloseMinute).unix();
};
