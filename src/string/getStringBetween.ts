export const getStringBetween = (str: string, startStr: string, endStr: string) => {
    let startIdx = str.indexOf(startStr);

    if (startIdx === -1) return '';

    startIdx += startStr.length;
    const endIdx = str.indexOf(endStr, startIdx);

    if (endIdx === -1) return '';

    return str.substring(startIdx, endIdx);
};
