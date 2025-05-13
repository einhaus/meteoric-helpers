// to make sure option sell quantity is divisible by 100
export const getOptionSellQuantity = (targetSharesToSell: number, shares: number): number => {
    if (shares < 100) {
        console.error(`Not enough shares to sell options (minimum 100 required). ${shares} shares available.`);
        return shares;
    }

    // If target is less than 51, return 100 if possible
    if (targetSharesToSell < 51) {
        return shares >= 100 ? 100 : 0;
    }

    const closestDivisibleBy100Up = Math.ceil(targetSharesToSell / 100) * 100;
    const closestDivisibleBy100Down = Math.floor(targetSharesToSell / 100) * 100;

    const upDifference = closestDivisibleBy100Up - targetSharesToSell;
    const downDifference = targetSharesToSell - closestDivisibleBy100Down;

    // Prefer rounding up if it's closer and within available shares
    if (upDifference <= downDifference && closestDivisibleBy100Up <= shares) {
        return closestDivisibleBy100Up;
    }

    // Otherwise, return the lower bound (only if it's possible)
    if (closestDivisibleBy100Down > 0) {
        return closestDivisibleBy100Down;
    }

    throw new Error(`Not enough shares to sell options. ${shares} shares available.`);
};
