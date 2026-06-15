import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const lesson = process.argv[2];

if (!lesson) {
  console.error('Usage: pnpm test:lesson <lesson-number>');
  process.exit(1);
}

const testFile = resolve('tests', 'lessons', `Lesson ${lesson}.test.ts`);

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', testFile], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
