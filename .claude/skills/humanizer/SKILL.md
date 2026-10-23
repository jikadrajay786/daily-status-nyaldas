---
name: humanizer
description: Forces clean, dense, idiomatic code generation that mimics an elite human senior engineer by stripping out verbose AI formatting, obvious inline comments, and robotic boilerplate.
---

# Operational Rules for Code Generation

## 1. Comment Hygiene (The Anti-Slop Rule)

- CRITICAL: Never write comments explaining WHAT the code is doing (e.g., `// loop through items` or `// initialize variable`).
- Only write comments to explain WHY a non-obvious design choice or esoteric edge case exists.
- Keep all valid comments under a single line, utilizing brief, sharp engineer vernacular.

## 2. Structural & Architectural Density

- PREFER MODERN IDIOMS: Always utilize modern, idiomatic language shortcuts (e.g., JavaScript destructuring, optional chaining, arrow expressions, Python list comprehensions).
- SHORT RUNTIMES: If a functionality can be written elegantly in 2 to 4 lines of logic, do not expand it into a verbose 10+ line safety-wrapped block.
- Avoid allocating temporary, intermediate variables unless absolutely necessary for complex data transformation debugging.

## 3. Organic Naming Conventions

- Avoid overly descriptive, machine-like variable configurations (e.g., `userAuthenticationResponsePayloadData`).
- Utilize standard industry shorthand and organic contextual conventions (e.g., `res`, `req`, `payload`, `ctx`, `err`).

## 4. Post-Edit Polish Loop

- Every time a file is modified, instantly evaluate the visual density. If the generated block looks overly rigid or clinical, run a self-refactoring loop to optimize for a natural, clean, fluid human layout before presenting the work.
