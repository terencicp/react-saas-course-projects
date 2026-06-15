# Finding NNN — <short title>

**Category:** one of the eight audit categories.
**Severity:** critical | high | medium | low (senior call, justified in two lines).

## Rule
The named rule from chapter 092, 093, or 094 this finding violates. One sentence; link the lesson section by ID.

## Location
File path(s) and line range(s), **and the diagnostic command/surface that surfaced it** (a grep, a DevTools trace, the Network panel, `pnpm next experimental-analyze`, `.toSQL()`, `EXPLAIN ANALYZE`). For "missing-piece" findings, name the file where the piece should live.

## Consequence
The failure mode in operator- or user-visible terms — a timing, a leaked secret, lost data. Two to four sentences. No "code smell," no "could potentially" hedging.

## Fix
The seam to install (the wired findings) or the senior reach named by its helper/config (the documented findings). Five to ten lines.
A short illustrative snippet is allowed when the fix is structural — no full diffs.
