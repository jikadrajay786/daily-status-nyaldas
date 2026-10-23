---
name: spartan-quality-gate
description: Mandatory post-edit checklist. Run after ANY file modification to route changes through syntax validation, type-checking, linting, formatting and tests before reporting work as done.
---

# Spartan Quality Gate

Run this after every Edit/Write. Work isn't done until the gate passes.

The `PostToolUse` hook (`.claude/hooks/post-edit.sh`) formats files automatically. Steps 2–5 are on you.

## Checklist
1. **Format**: confirm the hook ran, or run `<FORMAT_CMD> <file>`.
2. **Syntax**: the file parses (the linter/compiler reports no parse errors).
3. **Lint**: `<LINT_CMD> <changed files> | tail -n 30`. Fix errors; don't add disable comments unless you justify them.
4. **Typecheck**: `<TYPECHECK_CMD> | tail -n 30`. Zero new errors.
5. **Test**: `<TEST_CMD> | tail -n 30`. Run tests related to the change; run the full suite before a commit.
6. **Density**: run the `code-simplifier` skill on the diff.

## Rules
- Cap all output (`| tail -n 30`). Show failures, not passes.
- If a step fails, fix it and rerun the gate from step 1.
- If a command is still a `<PLACEHOLDER>`, say the step was skipped. Never claim it passed.
- Report results honestly: `Gate: format ✓ lint ✓ types ✓ tests 12/12 ✓` or name the failure.
