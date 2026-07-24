import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const utilitiesDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(utilitiesDir, '..');

const srcDir = path.join(projectRoot, 'src');
const buildScript = path.join(utilitiesDir, 'buildBarrelFile.ts');

const ignoredFiles = new Set(['index.ts', 'node.ts']);
const debounceMs = 100;

const watchers = new Map<string, fs.FSWatcher>();

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let isRunning = false;
let shouldRunAgain = false;
let ignoreRootUnknownFileEventsUntil = 0;

function normalizeFilename(filename: string | Buffer | null | undefined): string | undefined {
    if (!filename) return undefined;
    return typeof filename === 'string' ? filename : String(filename);
}

function markIgnoreRootUnknownFileEvents(): void {
    ignoreRootUnknownFileEventsUntil = Date.now() + 500;
}

async function buildBarrelFiles(): Promise<void> {
    return new Promise((resolve, reject) => {
        markIgnoreRootUnknownFileEvents();
        const child = spawn(process.execPath, [buildScript], { stdio: 'inherit' });

        child.on('error', reject);
        child.on('exit', (code, signal) => {
            markIgnoreRootUnknownFileEvents();
            if (signal) {
                reject(new Error(`Barrel build terminated by signal: ${signal}`));
                return;
            }

            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`Barrel build failed with exit code ${code ?? 'unknown'}`));
        });
    });
}

function getDirectoriesToWatch(): Set<string> {
    const directories = new Set<string>();
    directories.add(srcDir);

    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        directories.add(path.join(srcDir, entry.name));
    }

    return directories;
}

function watchDirectory(dir: string): fs.FSWatcher {
    return fs.watch(dir, (eventType, filename) => {
        if (dir === srcDir && !filename && Date.now() < ignoreRootUnknownFileEventsUntil) return;

        const normalized = normalizeFilename(filename);
        if (normalized && ignoredFiles.has(normalized)) return;

        scheduleRebuild(`${eventType}${normalized ? `: ${path.join(dir, normalized)}` : ''}`);
    });
}

function refreshWatchers(): void {
    const desired = getDirectoriesToWatch();

    for (const [dir, watcher] of watchers) {
        if (desired.has(dir)) continue;
        watcher.close();
        watchers.delete(dir);
    }

    for (const dir of desired) {
        if (watchers.has(dir)) continue;

        watchers.set(dir, watchDirectory(dir));
    }
}

async function runRebuild(): Promise<void> {
    if (isRunning) {
        shouldRunAgain = true;
        return;
    }

    isRunning = true;
    try {
        do {
            shouldRunAgain = false;
            refreshWatchers();
            await buildBarrelFiles();
        } while (shouldRunAgain);
    } finally {
        isRunning = false;
    }
}

function scheduleRebuild(reason: string): void {
    refreshWatchers();

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        console.log(`[watch:barrel] Change detected (${reason}). Rebuilding barrel files...`);
        void runRebuild();
    }, debounceMs);
}

function closeWatchers(): void {
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
}

if (!fs.existsSync(srcDir)) {
    throw new Error(`[watch:barrel] src directory not found: ${srcDir}`);
}

console.log('[watch:barrel] Starting barrel file watcher...');
refreshWatchers();

if (!process.argv.includes('--no-initial')) {
    void runRebuild();
} else {
    console.log('[watch:barrel] Skipping initial barrel build (--no-initial).');
}

process.on('SIGINT', () => {
    closeWatchers();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeWatchers();
    process.exit(0);
});
