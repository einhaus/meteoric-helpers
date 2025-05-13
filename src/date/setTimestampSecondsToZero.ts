export const setTimestampSecondsToZero = (timestamp: number): number => {
    // Convert the Unix timestamp to milliseconds
    const timestampInMs = timestamp * 1000;

    // Create a new Date object from the timestamp
    const date = new Date(timestampInMs);

    // Set the seconds to 0
    date.setSeconds(0);

    // Convert the updated date back to a Unix timestamp in seconds
    const truncatedTimestamp = Math.floor(date.getTime() / 1000);

    return truncatedTimestamp;
};
