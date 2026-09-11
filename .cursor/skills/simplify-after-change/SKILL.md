---
name: simplify-after-change
description: Review code changed in the current task for unnecessary complexity and make small behavior-preserving simplifications only where they improve readability.
---

# simplify-after-change

## Purpose

After code changes, inspect the final diff for unnecessary complexity. The review is required when the package calls for it; edits are not. Leave already clear code unchanged.

## Default scope

Review the code changed by the current task. Inspect nearby code and direct callers only when needed to understand behavior; an open or previously modified file is not automatically in scope.

Do not refactor unrelated code or include pre-existing user changes. Expand edits only when necessary to complete the requested change and explain that dependency.

## Non-negotiables

- Preserve behavior and public APIs.
- Keep diffs small and local.
- Do not introduce new dependencies.
- Do not change logging, error semantics, or concurrency behavior unless requested.

## Simplification goals

- Reduce indirection.
- Remove unnecessary abstractions.
- Remove unused code and typing scaffolding.
- Prefer explicit, readable control flow.

## Remove these complexity smells

### Unused and redundant code

- Unused imports, unused variables, unused functions.
- Commented-out blocks and “maybe later” placeholders.
- Helper functions used only once that add indirection.

### Typing and import overengineering

- Do not add `TYPE_CHECKING` blocks unless:
  1. there is a real import cycle, AND
  2. the guarded type is actually referenced.
- If a type is only used in docstrings or not used at all, delete the import.
- Prefer simple annotations over heavy generics and type-level patterns.
- Avoid `Protocol`, `@overload`, deeply nested unions, and complex generics unless they prevent real bugs.
- If advanced typing is truly necessary, add a short comment explaining why.

### Over-abstraction

- Avoid wrapper classes, “manager” layers, factories, registries, and generic helper chains unless they remove real duplication.
- Prefer a direct function call over a forwarding layer.
- Prefer data-in/data-out functions over stateful classes, unless state genuinely simplifies logic.

### Overly clever style

- Avoid dense one-liners, deeply nested comprehensions, clever short-circuiting, and excessive chaining when readability drops.
- Prefer clear loops and early returns.
- Prefer straightforward error handling over meta patterns.

## What to prefer instead

- Straight-line, explicit code.
- Small functions when they reduce cognitive load, but do not split into many tiny functions that add indirection.
- Concrete types (`Path`, `dict[str, str]`, `list[int]`) over `Any` or overly generic constructs.

## Process

1. Review the final diff once for complexity introduced or directly affected by the task.
2. Make a small simplification only when its benefit and behavior preservation are clear. No edits is a valid result.
3. Remove unused imports or dead code introduced by the change.
4. If behavior preservation is uncertain, leave the code unchanged and report the specific unresolved concern; do not add speculative TODOs.
5. Validate any simplification with checks appropriate to the affected behavior. Revisit only code changed after this review or a concrete unresolved concern, rather than restarting the whole pass.

## Output

- Include meaningful simplifications in the task's existing change summary. If no edits were needed, a brief statement is sufficient.
- Report relevant validation or an unresolved concern without adding a separate checklist for each pass.
