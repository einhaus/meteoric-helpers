import fs from 'fs';

export const appendToFile = (filePath: string, data: string) => {
    // make sure directory exists, if not create it
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!data.includes('\n')) data += '\n';
    fs.appendFileSync(filePath, data);
};
