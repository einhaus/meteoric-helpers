import type { DateInterval } from './constants.js';
import dayjs from 'dayjs';

export const getStartOrEndUnix = (timestamp: number | null, startOrEnd: 'start' | 'end', intervalType: DateInterval) => {
    const dateObject = timestamp ? dayjs.unix(timestamp) : dayjs();
    return startOrEnd === 'start' ? dateObject.startOf(intervalType).unix() : dateObject.endOf(intervalType).unix();
};
