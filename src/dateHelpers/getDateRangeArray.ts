import { ymd } from './constants.js';
import dayjs from 'dayjs';

// Create an array of dates including and between two dates
export const getDateRangeArray = (startDate: string, endDate: string): string[] => {
    const dateArray = [];
    let currentDate = dayjs(startDate);

    while (currentDate <= dayjs(endDate)) {
        dateArray.push(dayjs(currentDate).format(ymd));
        currentDate = dayjs(currentDate).add(1, 'days');
    }

    return dateArray;
};
