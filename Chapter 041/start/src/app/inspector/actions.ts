'use server';

import { revalidatePath } from 'next/cache';

import { runSeed } from '../../../scripts/seed';

// The ONE provided mutation: a minimal Server Action wrapping the student's seed
// so the inspector has a "Reset and re-seed" control. Students do not author
// 'use server' in this project (Unit 6 owns Server Actions) — this is provided.
export const reseed = async (): Promise<void> => {
  await runSeed();
  revalidatePath('/inspector');
};
