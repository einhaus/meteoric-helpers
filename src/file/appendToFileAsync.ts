import fs from 'fs';
import path from 'path';

export const appendToFileAsync = async (filePath: string, data: string): Promise<void> => {
    // Ensure filePath contains a valid directory part
    const dir = path.dirname(filePath);

    // If the directory is invalid or empty, return without doing anything
    if (!dir || dir === '.' || dir === '/') {
        console.error(`Invalid file path: ${filePath}`);
        return;
    }

    try {
        // Recursively create the directory if it doesn't exist
        await fs.promises.mkdir(dir, { recursive: true });

        // Add a newline if it's not present in the data
        if (!data.includes('\n')) {
            data += '\n';
        }

        // Append data to the file
        await fs.promises.appendFile(filePath, data);
    } catch (err) {
        console.error(`Error appending to file: ${JSON.stringify(err)}`);
    }
};
