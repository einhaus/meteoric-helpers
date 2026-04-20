import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(timezone);

export const checkTimezoneIsEst = () => {
    if (dayjs.tz.guess() !== 'America/New_York')
        console.log('Warning! Running application outside of the EST timezone can cause unexpected behavior.');
};
