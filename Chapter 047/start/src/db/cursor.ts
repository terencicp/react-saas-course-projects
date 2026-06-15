import { z } from 'zod';

// An opaque pagination cursor: the (createdAt, id) tiebreaker pair the list
// query orders by, serialized as a base64url token the URL can carry.
export type Cursor = { createdAt: string; id: string };

export const cursorSchema = z.object({
  createdAt: z.string(),
  id: z.uuid(),
});

export const encodeCursor = (c: Cursor): string =>
  Buffer.from(JSON.stringify(c)).toString('base64url');

// Decode-then-validate: a malformed or tampered token returns null rather than
// throwing, so a bad ?cursor degrades to the first page instead of a 500.
export const decodeCursor = (token: string): Cursor | null => {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = cursorSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
