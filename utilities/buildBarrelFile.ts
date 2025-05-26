import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node.js-specific modules that indicate a file should only be in the Node entry point
const nodeModules = [
    'fs',
    'node:fs',
    'path',
    'node:path',
    'crypto',
    'node:crypto',
    'bcrypt',
    'http',
    'node:http',
    'https',
    'node:https',
    'stream',
    'node:stream',
    'zlib',
    'node:zlib',
    'os',
    'node:os',
    'child_process',
    'node:child_process',
    'net',
    'node:net',
    'tls',
    'node:tls',
    'dgram',
    'node:dgram',
    'dns',
    'node:dns',
    'cluster',
    'node:cluster',
    'worker_threads',
    'node:worker_threads',
    'readline',
    'node:readline',
    'repl',
    'node:repl',
    'url',
    'node:url',
    'buffer',
    'node:buffer',
    'querystring',
    'node:querystring',
    'process',
    'node:process',
    'node-cache',
    '@redis/client'
];

// Files that should always be in Node entry point regardless of imports
const alwaysNodeFiles = ['S3Helper'];

const srcDir = path.dirname(fileURLToPath(import.meta.url)) + '/../src';
const mainBarrelFile = path.join(srcDir, 'index.ts');
const nodeBarrelFile = path.join(srcDir, 'node.ts');

// Clear or create barrel files
fs.writeFileSync(mainBarrelFile, '');
fs.writeFileSync(nodeBarrelFile, '');

// Function to check if a file contains Node.js-specific imports
function containsNodeImports(filePath: string): boolean {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for various import patterns with Node.js modules
        for (const nodeModule of nodeModules) {
            // NEW PATTERN: Match "import * as fs from 'fs';" (namespace import)
            const namespaceImportRegex = new RegExp(`import\\s+\\*\\s+as\\s+[^\\s]+\\s+from\\s+['"]${nodeModule}['"]`, 'i');

            // Existing patterns
            const importRegex = new RegExp(`import\\s+(?:\\{[^}]*\\}|[^{][^\\s]*)?\\s+from\\s+['"]${nodeModule}['"]`, 'i');
            const sideEffectRegex = new RegExp(`import\\s+['"]${nodeModule}['"]`, 'i');
            const requireRegex = new RegExp(`require\\s*\\(\\s*['"]${nodeModule}['"]\\s*\\)`, 'i');
            const tsRequireRegex = new RegExp(`import\\s+[^\\s]+\\s*=\\s*require\\s*\\(\\s*['"]${nodeModule}['"]\\s*\\)`, 'i');

            if (
                namespaceImportRegex.test(content) ||
                importRegex.test(content) ||
                sideEffectRegex.test(content) ||
                requireRegex.test(content) ||
                tsRequireRegex.test(content)
            ) {
                // For debugging, log which pattern matched
                if (namespaceImportRegex.test(content)) {
                    console.log(`File ${filePath} uses Node.js module "${nodeModule}" with namespace import syntax`);
                }
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return false;
    }
}

// Track all exports and node-specific exports
const allExports: string[] = [];
const nodeSpecificExports: string[] = [];

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
        if (fileExtension === '.ts' && file !== 'index.ts') {
            const fileWithoutExtension = path.basename(file, fileExtension);
            const importStatement = `export * from './${directoryName}/${fileWithoutExtension}.js';`;
            const fullFilePath = path.join(directory, file);

            // Check if this file should be Node.js only
            const isInAlwaysNodeList = alwaysNodeFiles.includes(fileWithoutExtension);
            const hasNodeImports = containsNodeImports(fullFilePath);
            const isNodeOnly = isInAlwaysNodeList || hasNodeImports;

            // If node-only, log the reason for better visibility
            if (isNodeOnly) {
                console.log(`Adding ${file} to node-only exports because:`);
                if (isInAlwaysNodeList) console.log(`- It's in the alwaysNodeFiles list`);
                if (hasNodeImports) console.log(`- It imports Node.js-specific modules`);
            }

            // Add to appropriate lists
            if (isNodeOnly) {
                nodeSpecificExports.push(importStatement);
            } else {
                allExports.push(importStatement);
            }
        }
    }
}

// Write all web-compatible exports to main barrel file
for (const exportStatement of allExports) {
    fs.appendFileSync(mainBarrelFile, exportStatement + '\n');
}

// Write all exports including node-specific ones to node barrel file
fs.appendFileSync(nodeBarrelFile, '// Include all web-compatible exports\n');
fs.appendFileSync(nodeBarrelFile, "export * from './index.js';\n\n");
fs.appendFileSync(nodeBarrelFile, '// Node.js specific exports\n');
for (const exportStatement of nodeSpecificExports) {
    fs.appendFileSync(nodeBarrelFile, exportStatement + '\n');
}

console.log(`\nBuild complete!`);
console.log(`- Created main barrel file with ${allExports.length} web-compatible exports`);
console.log(
    `- Created node barrel file with ${allExports.length + nodeSpecificExports.length} total exports (${nodeSpecificExports.length} Node.js-specific)`
);
