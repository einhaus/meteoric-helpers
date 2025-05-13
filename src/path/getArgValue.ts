export const getArgValue = (argument: string): string | void => {
    const combinedTitleIDsArgument = process.argv.find((arg) => arg.includes(`--${argument}=`));
    const idSplit = combinedTitleIDsArgument?.split('=');
    if (!idSplit) return;

    return idSplit[1];
};
