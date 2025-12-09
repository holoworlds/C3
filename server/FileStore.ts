
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR);
    } catch (e) {
        console.error('[FileStore] Failed to create data directory', e);
    }
}

export const FileStore = {
    load: <T>(key: string): T | null => {
        const filePath = path.join(DATA_DIR, `${key}.json`);
        if (fs.existsSync(filePath)) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(raw) as T;
            } catch (e) {
                console.error(`[FileStore] Error loading ${key}`, e);
            }
        }
        return null;
    },

    save: (key: string, data: any) => {
        const filePath = path.join(DATA_DIR, `${key}.json`);
        try {
            // Write prettified JSON for easier debugging
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error(`[FileStore] Error saving ${key}`, e);
        }
    }
};
