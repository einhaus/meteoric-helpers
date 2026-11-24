import { getOpenOrCloseUnix } from './getOpenOrCloseUnix.js';

export const getMarketCloseUnix = (timestamp: number) => getOpenOrCloseUnix(timestamp, 'close');
