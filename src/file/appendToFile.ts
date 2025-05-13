import fs from 'fs';
import path from 'path';

export const appendToFile = (filePath: string, data: string) => {
    // Ensure filePath contains a valid directory part
    const dir = path.dirname(filePath);

    // If the directory is invalid or empty, return without doing anything
    if (!dir || dir === '.' || dir === '/') {
        console.error(`Invalid file path: ${filePath}`);
        return;
    }

    // Make sure the directory exists, if not, create it
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Add a newline if it's not present in the data
    if (!data.includes('\n')) data += '\n';

    // Append the data to the file
    fs.appendFileSync(filePath, data);
};
