import { getUnixTime } from './getUnixTime.js';

export const generateTimestampRanges = (startDateTime: string, endDateTime: string, stepSeconds = 60): number[] => {
    const timestamps: number[] = [];

    const startTimestamp = getUnixTime(startDateTime);
    const endTimestamp = getUnixTime(endDateTime);

    for (let i = startTimestamp; i <= endTimestamp; i += stepSeconds) {
        timestamps.push(i);
    }

    return timestamps;
};
