# Chapter 104 — Review a PR, write the ADR

A read-only **audit target**: an in-memory SaaS app whose `feature/customer-plan-overview` change has already landed, adding a `/plan` overview surface that carries **five review-worthy defects plus one design decision worth an ADR**. Your job is not to fix the code — it is to *review* it and *record* the one decision that outlives the PR.

## Setup

```bash
pnpm install
pnpm dev          # app on http://localhost:3000
```

No environment variables, no Docker, no database, no login. The app boots from an in-memory store and the dev identity defaults to `org-acme:admin`.

- **`/plan`** — the surface under review. The entitlement, the seat counter, and the renewal countdown.
- `/invoices`, `/inspector` — carried in from the lineage; not under review.

## The deliverables

Two committed Markdown artifacts, both at the repo root:

1. **`reviews/chapter 104.md`** — the review. Five line-anchored comments in the four-part shape, a `## Summary` with severity totals, and a `Verdict:` line. Write each comment against the contract in **`reviews/template.md`** and the **principle-and-pattern map** from chapter 103.
2. **`docs/adr/0007-cache-entitlement-reads-with-cacheTag.md`** — the ADR for the caching decision, in the Nygard shape (Status / Context / Decision / Consequences). Append its one-line index row to **`docs/adr/README.md`** in the same change.

## The pass-order reflex

Review **top-down on the review stack, not top-down on the file**: surface findings in the order correctness/security → principles → patterns → tests/contracts → style. The pass-order header is the first line you commit to `reviews/chapter 104.md` — before you open the diff.

## The real-course workflow (narrative)

In the live course you clone the target with `degit`, then `git checkout feature/customer-plan-overview` to read the change as a branch diff, and you keep yourself honest by not peeking at the `v1.0-answer-key` tag until your review is written.

In *this* repo the change is already merged on the default branch, and the answer key is the filled `reviews/` and `docs/adr/0007-*.md` you are reading. The discipline is the same: name the rule, sever the severity, propose the action, and record the one decision worth an ADR.
