export const getTradingDaysPlusMinus = (config: { operator: '+' | '-'; days: number; date: string; tradingDates: { date: string }[] }) => {
    const { operator, days, tradingDates } = config;
    let { date } = config;
    if (!tradingDates.length) throw new Error('getPreviousTradingDate: No trading dates found');
    if (date.length > 10) date = date.slice(0, 10);

    const tradingDateIndex = tradingDates.findIndex((td) => td.date === date);
    return tradingDates[operator === '+' ? tradingDateIndex + days : tradingDateIndex - days]?.date ?? '';
};
