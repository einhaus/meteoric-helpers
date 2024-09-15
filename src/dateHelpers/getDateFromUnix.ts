import dayjs from 'dayjs';

export const getDateFromUnix = (
    unixTimestamp: number,
    returnFormat: 'ymd' | 'ymdhms' | 'ymdhm' | 'readable1' = 'ymd',
    timezone?: 'Etc/UTC' | 'America/New_York' | 'America/Chicago',
    startOrEndOfDay?: 'start' | 'end'
): string => {
    if (timezone) {
        let dateObject = dayjs.unix(unixTimestamp);
        dateObject = dateObject.tz(timezone);
        unixTimestamp = dateObject.unix();
    }

    const datetime = new Date(unixTimestamp * 1000);

    if (startOrEndOfDay === 'start') {
        datetime.setHours(0, 0, 0, 0);
    } else if (startOrEndOfDay === 'end') {
        datetime.setHours(23, 59, 59, 999);
    }

    const year = datetime.getFullYear();
    const month = `0${datetime.getMonth() + 1}`.slice(-2);
    const day = `0${datetime.getDate()}`.slice(-2);
    const hours = `0${datetime.getHours()}`.slice(-2);
    const minutes = `0${datetime.getMinutes()}`.slice(-2);
    const seconds = `0${datetime.getSeconds()}`.slice(-2);

    let datetimeString = returnFormat === 'ymd' ? `${year}-${month}-${day}` : '';
    datetimeString = returnFormat === 'ymdhms' ? `${year}-${month}-${day} ${hours}:${minutes}:${seconds}` : datetimeString;
    datetimeString = returnFormat === 'ymdhm' ? `${year}-${month}-${day} ${hours}:${minutes}` : datetimeString;
    datetimeString = returnFormat === 'readable1' ? `${datetime.toDateString()} ${hours}:${minutes}` : datetimeString;

    return datetimeString;
};
