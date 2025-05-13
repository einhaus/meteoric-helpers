export const convertUnixTimestampToMinuteStart = (unixTimestamp: number): number => {
    // Calculate the number of seconds into the current minute
    const secondsIntoMinute = unixTimestamp % 60;

    // Subtract the seconds to get the timestamp at the start of the minute
    return unixTimestamp - secondsIntoMinute;
};
