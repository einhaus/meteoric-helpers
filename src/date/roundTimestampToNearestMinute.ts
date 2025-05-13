export const roundTimestampToNearestMinute = (unixTimestamp: number) => {
    // Convert Unix timestamp to milliseconds for JavaScript Date (Unix timestamp is in seconds)
    const date = new Date(unixTimestamp * 1000);

    // Set seconds (and milliseconds) to 0 to round down to the nearest minute
    date.setSeconds(0, 0);

    // Convert the date back to a Unix timestamp in seconds and return
    return Math.floor(date.getTime() / 1000);
};
