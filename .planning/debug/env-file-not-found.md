---
status: diagnosed
trigger: "npm run dev fails with [server] node: .env: not found and tsx --env-file .env watch server/index.ts exited with code 9"
created: 2026-03-14T00:00:00Z
updated: 2026-03-14T00:00:00Z
---

## Current Focus

hypothesis: .env file does not exist at project root; --env-file flag requires the file to be present
test: confirmed by ls and by reproducing the exact error with tsx --env-file pointing to a missing file
expecting: n/a -- confirmed
next_action: return diagnosis

## Symptoms

expected: npm run dev starts both Vite (port 5173) and Express (port 3001) concurrently
actual: Fails with `[server] node: .env: not found` and exit code 9
errors: `node: .env: not found`, exit code 9
reproduction: run `npm run dev` without a .env file at project root
started: first time running dev server after adding server scripts

## Eliminated

- hypothesis: Node.js version too old for --env-file (requires >= 20.6.0)
  evidence: Node v25.6.1 is installed, well above minimum
  timestamp: 2026-03-14

- hypothesis: tsx does not support --env-file passthrough
  evidence: tsx v4.21.0 successfully passes --env-file to Node; tested with a temp file and it works
  timestamp: 2026-03-14

- hypothesis: Script syntax is incorrect
  evidence: The script syntax in package.json line 7 and 9 is correct; tsx --env-file .env watch server/index.ts is valid
  timestamp: 2026-03-14

## Evidence

- timestamp: 2026-03-14
  checked: Node.js version
  found: v25.6.1 (supports --env-file, which requires >= 20.6.0)
  implication: Node version is not the problem

- timestamp: 2026-03-14
  checked: .env file existence
  found: .env does NOT exist; .env.example DOES exist at project root
  implication: User has not copied .env.example to .env

- timestamp: 2026-03-14
  checked: tsx --env-file behavior with missing file
  found: Running `tsx --env-file .env <file>` when .env is missing produces exact error: "node: .env: not found" with exit code 9
  implication: This is the root cause -- confirmed by reproduction

- timestamp: 2026-03-14
  checked: tsx --env-file behavior with existing file
  found: Running `tsx --env-file /tmp/test.env <file>` with a valid file works correctly, env vars are loaded
  implication: The flag and tsx version work fine; only the missing file is the problem

## Resolution

root_cause: The `.env` file does not exist at the project root. The `dev:server` script (package.json line 9) uses `tsx --env-file .env watch server/index.ts`, and Node.js requires the file specified by `--env-file` to actually exist. A `.env.example` file is present but has not been copied to `.env`.
fix: Copy .env.example to .env (`cp .env.example .env`)
verification: n/a -- diagnosis only
files_changed: []
