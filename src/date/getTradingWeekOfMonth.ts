// A partial week will return 0. 1 starts from the first Monday
export const getTradingWeekOfMonth = (dateTime: string) => {
    const currentDate = new Date(dateTime);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const date = new Date(year, month, 1);

    if (date.getDay() === 1) return 1;

    // Get the first Monday of the month
    while (date.getDay() !== 1) {
        date.setDate(date.getDate() + 1);
    }

    const days = currentDate.getDate() - date.getDate();
    const weeks = Math.abs(Math.ceil(days / 7));

    return weeks;
};
