---
name: type-discipline
description: Strict TypeScript type discipline, in the spirit of mattpocock/skills. Use when writing or reviewing typed code.
---

# Type Discipline

Inspired by the community **mattpocock/skills** collection. It isn't installed here; these are the local rules.

- `strict: true` in tsconfig. Also enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- No `any`. Use `unknown` and narrow it. Every `as` cast needs a one-line justification comment.
- Let inference work inside functions. Annotate at boundaries: exported functions, public APIs, IPC payloads.
- Model state with discriminated unions, not optional-flag bags.
- Use `satisfies` to check config and constant objects without widening them.
- Validate external data at runtime at the boundary (IPC, file reads, network), e.g. with zod, and derive types from the schema.
- Exhaustive `switch` with a `never` check in the default branch.
- Prefer `readonly` and `as const` for data that shouldn't change.
- No non-null `!` assertions. Narrow instead.
