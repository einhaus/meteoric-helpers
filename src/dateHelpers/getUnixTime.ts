export const getUnixTime = (
    datetimeString: string | number | null = '',
    startOrEndOfDay?: 'start' | 'end' | 'tradingOpen' | 'tradingClose'
) => {
    datetimeString =
        datetimeString && typeof datetimeString === 'string' && datetimeString.length === 10
            ? `${datetimeString} 00:00:00`
            : datetimeString;

    let datetime = datetimeString && typeof datetimeString === 'string' ? new Date(datetimeString) : null;
    datetime = datetimeString && typeof datetimeString === 'number' ? new Date(datetimeString * 1000) : datetime;
    datetime = !datetime ? new Date() : datetime;

    if (startOrEndOfDay) {
        if (startOrEndOfDay === 'start') {
            datetime.setHours(0, 0, 0, 0);
        } else if (startOrEndOfDay === 'end') {
            datetime.setHours(23, 59, 59, 999);
        } else if (startOrEndOfDay === 'tradingOpen') {
            datetime.setHours(9, 30, 0, 0);
        } else if (startOrEndOfDay === 'tradingClose') {
            datetime.setHours(16, 0, 0, 0);
        }
    }

    const unixTimestamp = Math.floor(datetime.getTime() / 1000);
    return unixTimestamp;
};
