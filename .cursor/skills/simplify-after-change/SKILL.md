# simplify-after-change

## Purpose

After any code change, simplify the changed code so it is boring, readable, and minimal while preserving behavior.

## Default scope

Operate only on:

1. files edited in this change, or
2. the currently open file(s)

Do not refactor unrelated modules unless requested.

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

1. Identify complexity smells in the scoped files.
2. Simplify in-place with minimal, safe edits.
3. Ensure no unused imports or dead code remain.
4. If anything is uncertain, leave a TODO and explain the risk.

## Output

- Provide a short bullet list of what was simplified and why.
- Apply edits directly in the files.
