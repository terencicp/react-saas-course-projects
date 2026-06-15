# Finding 007 — Supply-chain defaults disabled in pnpm-workspace.yaml

**Category:** Dependency hygiene (security baseline).
**Severity:** high — a malicious release installs the instant it lands in the registry, on a project that ships background workers and runs `pnpm install` in CI and on every developer's machine; it does not directly expose data today, so it sits below the live secret leak (finding 5), but the blast radius of one compromised transitive is the whole runtime.

## Rule

pnpm 11+ ships supply-chain defaults that are on unless a project turns them off, and a project keeps them on: `minimumReleaseAge` holds every install back behind a 24-hour window (the time the community needs to catch and yank a compromised release), `blockExoticSubdeps` refuses git/tarball/exotic transitive specs, `strictDepBuilds` fails an install when an un-acknowledged dependency wants to run a build script, and `allowBuilds` is a reviewed allow-list of the few packages whose build scripts are actually needed (chapter 081, lesson 8 — the pre-install defense; the threat model is typosquats and maintainer-compromise vectors like Shai-Hulud, where the attacker's window is the hours between publishing a poisoned version and the registry pulling it).

## Location

`pnpm-workspace.yaml` at the repo root — the load-bearing evidence, found by reading the file with **no install step**:

- Lines 13–15: the three defaults are explicitly disabled, overriding pnpm 11's safe shipped values:
  - `minimumReleaseAge: 0` — no pre-install window; an install takes a release the moment it ships.
  - `blockExoticSubdeps: false` — exotic transitive specs (git/tarball) are allowed.
  - `strictDepBuilds: false` — an un-acknowledged build script does not fail the install.
- Lines 19–29: `onlyBuiltDependencies` + the `allowBuilds` map are present and correct (`sharp: true`, the rest acknowledged-but-skipped), so the build allow-list is **not** the gap — the gap is the three flags above. (This is why `next build` still passes; the relaxed flags do not break it, which is exactly what makes the defect ship green.)

`.npmrc` holds only `engine-strict=true` and `auto-install-peers=true` — registry/auth-shaped config. It is recorded here as the **not-where-supply-chain-settings-live** evidence: a reviewer who greps `.npmrc` for `minimumReleaseAge` finds nothing and might conclude the controls are fine; pnpm 11 reads these settings from `pnpm-workspace.yaml`, never `.npmrc`, so the audit reads the workspace file.

`package.json` line 5: `packageManager` is pinned (`pnpm@11.3.0`) — recorded as **present and healthy**, so this part of the checklist passes and is not a finding. CI's `--frozen-lockfile` flag is a forward thread (chapter 097, lesson 3): there is no CI gate in this repo yet, so the lockfile-enforcement and the audit gate are named as the follow-up, not scored as a gap here.

How it surfaced — the read is the discovery (no install needed), and `pnpm audit --prod` is the corroborating secondary signal:

```
# 1. The load-bearing, deterministic check — read the workspace file, no install.
rg -n 'minimumReleaseAge|blockExoticSubdeps|strictDepBuilds|allowBuilds' pnpm-workspace.yaml
# Confirm settings do NOT live in .npmrc (the common misread).
rg -n 'minimumReleaseAge|blockExoticSubdeps|strictDepBuilds' .npmrc   # -> zero hits
# 2. The corroborating post-install signal — read the output, do not treat it as the defense.
pnpm audit --prod
```

Grep 1 returns the three disabled flags. `pnpm audit --prod` corroborates that real advisory-bearing versions are already in the tree: 10 vulnerabilities (5 high, 3 moderate, 2 low). The high-severity hits are command-injection advisories in `systeminformation` pulled transitively through `@trigger.dev/sdk > @trigger.dev/core > @opentelemetry/host-metrics`, plus the esbuild RCE/dev-server advisories reached through `better-auth > drizzle-kit`. These are the **outdated/advisory pins** the finding names — they are transitive, so the audit output is how you see them, and they prove the point: with `minimumReleaseAge: 0` there was no window to catch any of them before install.

## Consequence

A malicious release lands the day it ships and this project installs it the same day, with no defense in the way. With `minimumReleaseAge: 0` there is no 24-hour window — the moment an attacker publishes a poisoned version of a dependency or a transitive (the Shai-Hulud pattern: compromise a maintainer, publish, the worm spreads through every project that installs before the registry yanks it), the next `pnpm install` here — on a developer's laptop or in CI — pulls it and runs whatever it carries. `strictDepBuilds: false` means an un-acknowledged dependency's build script runs without the install failing to flag it, so a poisoned `postinstall` executes silently; `blockExoticSubdeps: false` means a transitive can point at an attacker-controlled git/tarball spec and it is accepted. The audit output is not a substitute for any of this: `pnpm audit` is a *post-install* signal — it tells you a known-bad version is already in your tree — and Dependabot/Renovate raise PRs *after* a compromised release has landed in the registry. Neither is a pre-install defense; `minimumReleaseAge` is the only one of the three that stops the bad version from being installed in the first place, and it is the one turned off.

## Fix

Keep pnpm 11's supply-chain defaults **on** in `pnpm-workspace.yaml` — restore the three flags to their safe values and treat `allowBuilds` as the reviewed allow-list it is. This is a config change, not a version-bump chore: the load-bearing fix is the flags, and bumping the advisory-bearing deps is the follow-on cleanup the restored window then protects.

```yaml
# pnpm-workspace.yaml — the three defaults back on.
minimumReleaseAge: 1440      # 24h pre-install window — the only pre-install defense
blockExoticSubdeps: true     # refuse git/tarball/exotic transitive specs
strictDepBuilds: true        # fail install on an un-acknowledged build script
allowBuilds:                 # reviewed allow-list — only what truly needs a build step
  sharp: true
  esbuild: false
```

1. **Set `minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, `strictDepBuilds: true`** so installs sit behind the 24-hour window, exotic transitive specs are refused, and an un-acknowledged build script fails the install instead of running silently.
2. **Keep `allowBuilds` as the reviewed allow-list** (`sharp: true`, everything else acknowledged-but-skipped) — `strictDepBuilds: true` is only safe because the few packages that genuinely need a build step are named here; review the list rather than blanket-allowing.
3. **Bump the advisory-bearing deps** the `pnpm audit --prod` output names — the transitive `systeminformation` (via `@trigger.dev/sdk`) and `esbuild` (via `better-auth > drizzle-kit`) high-severity advisories — pulling forward to patched ranges, or pinning a patched version through `overrides` where the direct dependency lags. This is the post-install cleanup; the restored `minimumReleaseAge` is what keeps the *next* bad release out.
4. **Gate `pnpm audit` and `pnpm install --frozen-lockfile` in CI** — the forward thread (chapter 081, lesson 8 names the controls; chapter 097, lesson 3 wires the CI gate), so the audit signal and the lockfile enforcement run on every push rather than depending on a developer remembering to look.
