export const getOptionSellQuantity = (targetSharesToSell: number, shares: number): number => {
    const closestDivisibleBy100Up = Math.ceil(targetSharesToSell / 100) * 100;
    const closestDivisibleBy100Down = Math.floor(targetSharesToSell / 100) * 100;

    const upDifference = closestDivisibleBy100Up - targetSharesToSell;
    const downDifference = targetSharesToSell - closestDivisibleBy100Down;

    return upDifference <= downDifference && closestDivisibleBy100Up <= shares ? closestDivisibleBy100Up : closestDivisibleBy100Down;
};
