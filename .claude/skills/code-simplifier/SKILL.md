---
name: code-simplifier
description: Post-generation self-audit. Run after writing or changing code to collapse bloated blocks to the 2-to-4 line density baseline without changing behavior.
---

# Code Simplifier

After generating code, audit your own diff and refactor it until it's dense.

## Audit loop
1. Review the diff (`git diff --stat`, then targeted `git diff <file>`).
2. Flag every block over 4 lines that could be 2–4 lines.
3. Refactor, then rerun `spartan-quality-gate`. Behavior must stay the same.
4. Repeat until nothing is flagged.

## Patterns to collapse
| Bloat                                   | Dense form                              |
|-----------------------------------------|-----------------------------------------|
| `if/else` that assigns one value        | ternary                                 |
| `for` loop that builds an array         | `map` / `filter` / `flatMap`            |
| `for` loop that accumulates a value     | `reduce`, or a built-in like `Math.max` |
| `x && x.y && x.y.z`                     | `x?.y?.z`                               |
| `if (v == null) v = d`                  | `v ??= d`                               |
| single-use temp variable                | inline it                               |
| `function f(a) { return g(a) }`         | `const f = a => g(a)`, or just `g`      |
| manual object copy and override         | spread `{ ...o, k: v }`                 |
| repeated `obj.a`, `obj.b`               | destructuring                           |

## Limits
- Don't trade clarity for brevity: max 2 levels of nested ternaries, no puzzle one-liners.
- Keep names that explain *why*. Remove only names that repeat *what*.
- Error handling and security checks are never removed for density.
