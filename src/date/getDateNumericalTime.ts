import dayjs from 'dayjs';

export const getDateNumericalTime = (inputDateTime: string | number | Date = '') => {
    let dateObject = inputDateTime && typeof inputDateTime !== 'number' ? dayjs(inputDateTime) : dayjs();
    dateObject = typeof inputDateTime === 'number' ? dayjs.unix(inputDateTime) : dateObject;
    return +dateObject.format('HHmm');
};
