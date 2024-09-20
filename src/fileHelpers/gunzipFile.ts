import child_process from 'child_process';
import util from 'util';

export const gunzipFile = async (filePath: string): Promise<string | void> => {
    let attempts = 0;

    while (attempts < 4) {
        try {
            await util.promisify(child_process.exec)(`gunzip -f ${filePath}`);
            return filePath.replace('.gz', '');
        } catch (e) {
            console.log(e);
            attempts++;
            if (attempts === 3) return;
        }
    }
};
