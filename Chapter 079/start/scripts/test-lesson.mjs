import { spawnSync } from 'node:child_process';

const n = process.argv[2];

if (!n) {
  console.error('Usage: pnpm test:lesson <lesson-number>');
  process.exit(1);
}

// Narrow to exactly one file by passing its explicit path positional. A bare
// `vitest run` glob would let pnpm forward `<n>` as a positional vitest
// OR-matches against every `Lesson *.ts`, so the path is the load-bearing part.
const result = spawnSync(
  'vitest',
  ['run', '--root', '.', `lesson-verification/Lesson ${n}.ts`],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
