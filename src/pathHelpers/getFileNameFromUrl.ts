import path from 'path';
import { fileURLToPath } from 'url';

export const getFileNameFromUrl = (url: string) => {
    return path.basename(fileURLToPath(url));
};
