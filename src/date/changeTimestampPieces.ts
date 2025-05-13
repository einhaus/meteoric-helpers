import dayjs from 'dayjs';
import objectSupport from 'dayjs/plugin/objectSupport.js';
dayjs.extend(objectSupport);

export const changeTimestampPieces = (timestamp: number, newPieces: { hour?: number; minute?: number; seconds?: number }): number => {
    return dayjs.unix(timestamp).set({ hour: newPieces.hour, minute: newPieces.minute, seconds: newPieces.seconds }).unix();
};
