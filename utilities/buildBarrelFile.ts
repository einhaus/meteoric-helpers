import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url)) + "/../src";
const barrelFile = path.join(srcDir, "index.ts");

fs.writeFileSync(barrelFile, "");

const directoriesToInclude: string[] = [];
const filesInSrcDir = fs.readdirSync(srcDir);

// TODO - recursively search for sub directories
for (const file of filesInSrcDir) {
    // is directory?
    if (fs.statSync(path.join(srcDir, file)).isDirectory()) {
        // Full path
        const fullPath = path.join(srcDir, file);
        directoriesToInclude.push(fullPath);
    }
}

for (const directory of directoriesToInclude) {
    const filesInDirectory = fs.readdirSync(directory);
    for (const file of filesInDirectory) {
        const fileExtension = path.extname(file);
        const directoryName = path.basename(directory);
        if (fileExtension === ".ts" && file !== "index.ts") {
            const fileWithoutExtension = path.basename(file, fileExtension);
            const importStatement = `export * from './${directoryName}/${fileWithoutExtension}.js';`;
            fs.appendFileSync(barrelFile, importStatement + "\n");
        }
    }
}
