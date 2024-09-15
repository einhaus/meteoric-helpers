
export const convertToTimeString = (time: number): string => {
    // Extract hours and minutes from the time parameter
    const hours = Math.floor(time / 100);
    const minutes = time % 100;

    // Convert hours to 12-hour format
    const formattedHours = hours > 12 ? hours - 12 : hours;

    // Determine the period (am/pm)
    const period = hours >= 12 ? 'pm' : 'am';

    // Format the time string
    let hoursMinutes = `${formattedHours}:${minutes.toString().padStart(2, '0')}`;
    hoursMinutes = hoursMinutes.endsWith('00') ? hoursMinutes.slice(0, -3) : hoursMinutes;
    const timeString = `${hoursMinutes}${period}`;

    return timeString;
};