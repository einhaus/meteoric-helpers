export const changeDatePieces = (
    dateTime: string,
    newPieces: { newHour?: number; newMinute?: number; newSeconds?: number; newDay?: number }
): string => {
    if (dateTime.length !== 19) {
        throw new Error('Invalid date time format. Must be "YYYY-MM-DD HH:mm:ss"');
    }

    const { newDay, newHour, newMinute, newSeconds } = newPieces;

    const year = dateTime.slice(0, 4);
    const month = dateTime.slice(5, 7);
    let day = dateTime.slice(8, 10);
    let hour = dateTime.slice(11, 13);
    let minute = dateTime.slice(14, 16);
    let seconds = dateTime.slice(17, 19);

    if (newDay !== undefined) day = newDay < 10 ? `0${newDay}` : newDay.toString();
    if (newHour !== undefined) hour = newHour < 10 ? `0${newHour}` : newHour.toString();
    if (newMinute !== undefined) minute = newMinute < 10 ? `0${newMinute}` : newMinute.toString();
    if (newSeconds !== undefined) seconds = newSeconds < 10 ? `0${newSeconds}` : newSeconds.toString();

    return `${year}-${month}-${day} ${hour}:${minute}:${seconds}`;
};
