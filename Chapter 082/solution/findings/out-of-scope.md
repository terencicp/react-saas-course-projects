# Out-of-scope observations

The eight categories are the pass. Anything outside them is recorded here, not scored as a finding — the discipline is to keep observations that are real but off-category from inflating the count, so a "code smell" never sits in the same column as an Article 17 breach. Each note below is something the audit *saw* while reading the source, decided is not one of the eight categories, and parked here on purpose.

## Duplicated ownership-transfer logic (code quality, not a finding)

`src/lib/admin/transfer-ownership.ts` ships the ownership-transfer flow twice: `transferOwnershipAction` (the `authedAction`-wrapped Server Action, lines 24–58) and `transferOwnership` (the direct server-side variant the admin console calls, lines 60–73). The two carry near-identical membership-update bodies. This is a maintainability concern — two copies drift, and a future change to the transfer flow has to be made in both places — and finding 1's fix already names collapsing them to the one wrapped seam as the senior reach.

It is **out of scope as its own finding**: duplication is a code-quality observation, not one of the eight audit categories. It is recorded here so the next sprint's refactor ticket has a home, and so the audit does not double-count the same file — the *fail-closed* defect on these call sites is finding 1; the *duplication* is this note. Naming both keeps the finding count honest: one defect, one finding, plus one parked observation.

## Why this file exists

A real launch review surfaces more than its scoped categories — typing inconsistencies, naming drift, dead config, a missing index. The senior move is to write them down without scoring them, so the coverage number reflects the audit's actual scope and the team still has the list. An observation in `out-of-scope.md` is a ticket-in-waiting, never a finding; a finding is a defect named against one of the eight rules, with a location, a consequence, and a fix.
