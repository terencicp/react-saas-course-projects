import { spawnSync } from 'node:child_process';

const n = process.argv[2];

if (!n) {
  console.error('Usage: pnpm test:lesson <lesson-number>');
  process.exit(1);
}

// A bare `vitest run` glob won't narrow — pnpm passes `<n>` as a positional that
// vitest OR-matches against every `Lesson *.ts`. This wrapper runs exactly one
// file by passing its full path as the single test filter.
const result = spawnSync(
  'npx',
  ['vitest', 'run', '--root', '.', `lesson-verification/Lesson ${n}.ts`],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
