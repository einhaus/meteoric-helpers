export const roundUnixTimestampToMinuteStart = (unixTimestamp: number): number => {
    // Calculate the number of seconds into the current minute
    const secondsIntoMinute = unixTimestamp % 60;

    if (secondsIntoMinute <= 30) {
        // Subtract the seconds to get the timestamp at the start of the minute
        return unixTimestamp - secondsIntoMinute;
    } else {
        // Add the remaining seconds to get the timestamp at the start of the next minute
        return unixTimestamp + (60 - secondsIntoMinute);
    }
};
