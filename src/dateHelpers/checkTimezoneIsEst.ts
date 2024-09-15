import dayjs from 'dayjs';

export const checkTimezoneIsEst = () => {
    if (dayjs.tz.guess() !== 'America/New_York')
        console.log('Warning! Running application outside of the EST timezone can cause unexpected behavior.');
};
