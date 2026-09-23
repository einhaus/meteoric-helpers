import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], {
    cwd: process.cwd(),
    encoding: 'utf8'
});

if (result.status !== 0) {
    throw new Error(`Could not inspect repository state before publishing: ${result.stderr.trim() || 'git status failed'}`);
}

if (result.stdout.trim()) {
    throw new Error('Refusing to publish from a repository with uncommitted or untracked files');
}
