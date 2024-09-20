import path from 'path';
import { fileURLToPath } from 'url';

export const getDirectoryFromUrl = (url: string) => {
    return path.dirname(fileURLToPath(url));
};
