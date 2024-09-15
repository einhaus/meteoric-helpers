import dayjs from 'dayjs';

export const getDatePieces = (inputDateTime: string | number | Date = '') => {
    let dateObject = inputDateTime && typeof inputDateTime !== 'number' ? dayjs(inputDateTime) : dayjs();
    dateObject = typeof inputDateTime === 'number' ? dayjs.unix(inputDateTime) : dateObject;
    const minute = dateObject.minute();
    const weekday = dateObject.day();
    const date = dateObject.date();
    const dateWithZeros = date < 10 ? `0${date}` : date.toString();
    const month = dateObject.month() + 1;
    const monthWithZeros = month < 10 ? `0${month}` : month.toString();
    const monthText = dateObject.format('MMM');
    const hour = dateObject.hour();
    const second = dateObject.second();
    const year = dateObject.year();
    return { minute, weekday, month, monthText, date, dateWithZeros, monthWithZeros, hour, second, year };
};
