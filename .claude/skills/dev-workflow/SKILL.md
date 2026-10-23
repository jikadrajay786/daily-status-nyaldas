---
name: dev-workflow
description: Structured feature workflow (Clarify -> Spec -> Plan -> Execute -> Review), modeled on the community 'superpowers' framework. Use when starting any non-trivial feature or architecture change.
---

# Dev Workflow: Clarify → Spec → Plan → Execute → Review

Modeled on the community **superpowers** skills framework (obra/superpowers). It isn't installed here; this is the local adaptation.

1. **Clarify**: ask only questions whose answers change the implementation. Skip this step if the request is unambiguous.
2. **Spec**: write 3–8 bullets covering behavior, inputs/outputs, edge cases, and what's out of scope.
3. **Plan**: list the files to touch and the order of changes. For architecture or multi-file work, consult the advisor here.
4. **Execute**: make small edits. Run `spartan-quality-gate` after each one and `code-simplifier` on the result.
5. **Review**: self-review the diff, then make the advisor's final pass on complex tasks. Report as **Reviewed** with gate results.

Trivial changes (a typo, a one-line fix) skip straight to Execute → Review.
