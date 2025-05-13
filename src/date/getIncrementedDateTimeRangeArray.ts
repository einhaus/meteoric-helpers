import { ymdhms, type DateInterval } from './constants.js';
import dayjs from 'dayjs';

export const getIncrementedDateTimeRangeArray = (config: {
    startDateTime: string;
    endDateTime: string;
    increment: number;
    unit: DateInterval;
}): string[] => {
    const dateTimeArray = [];
    const { startDateTime, endDateTime, increment, unit } = config;

    let currentDate = dayjs(startDateTime);

    while (currentDate <= dayjs(endDateTime)) {
        dateTimeArray.push(dayjs(currentDate).format(ymdhms));
        currentDate = dayjs(currentDate).add(increment, unit);
    }

    return dateTimeArray;
};
