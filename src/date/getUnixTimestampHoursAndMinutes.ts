export const getUnixTimestampHoursAndMinutes = (unixTimestamp: number): number => {
    const date = new Date(unixTimestamp * 1000); // The Date constructor expects milliseconds

    const hours = date.getHours();
    const minutes = date.getMinutes();

    return hours * 100 + minutes;
};
