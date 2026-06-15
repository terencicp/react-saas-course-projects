import { spawnSync } from 'node:child_process';

const n = process.argv[2];

if (!n) {
  console.error('Usage: pnpm test:lesson <lesson-number>');
  process.exit(1);
}

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--root',
    '.',
    `lesson-verification/Lesson ${n}.ts`,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
