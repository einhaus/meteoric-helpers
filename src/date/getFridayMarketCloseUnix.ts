import { marketCloseDay, marketCloseHour, marketCloseMinute } from './constants.js';
import dayjs from 'dayjs';

export const getFridayMarketCloseUnix = (timestamp: number) => {
    return dayjs.unix(timestamp).day(marketCloseDay).hour(marketCloseHour).minute(marketCloseMinute).unix();
};
