import { spawnSync } from 'node:child_process';

const lesson = process.argv[2];

if (!lesson) {
  console.error('Usage: pnpm test:lesson <lesson-number>');
  process.exit(1);
}

// Run exactly the one lesson-verification file via the `lesson` Vitest project. A bare
// `vitest run <n>` glob would OR-match every `Lesson *.ts`, so naming the single file
// (scoped to the lesson project, node env, no DOM) is mandatory.
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--project',
    'lesson',
    `lesson-verification/Lesson ${lesson}.ts`,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
