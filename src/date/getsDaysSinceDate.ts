import dayjs from 'dayjs';

export const getsDaysSinceDate = (startDate: string, endDate: string): number => {
    return dayjs(endDate).endOf('day').diff(dayjs(startDate).startOf('day'), 'days');
};
