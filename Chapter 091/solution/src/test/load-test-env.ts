import { config } from 'dotenv';

// Side-effect-only: load .env.test and pin the timezone. Imported as the FIRST import of
// integration-setup.ts so process.env is populated before any @/… module body reads it.
// Kept in its own file because Biome's organizeImports sorts imports — a bare top-of-file
// side-effect import survives that sort, whereas inline `config()` calls between imports
// would not.
config({ path: '.env.test' });

// Production discipline (065/083): deterministic date projections.
process.env.TZ = 'UTC';
