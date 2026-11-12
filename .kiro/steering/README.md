# Kiro steering for CityCatalyst

These files are the Kiro equivalent of `.cursor/rules/*.mdc` — same content,
converted front matter (`alwaysApply` → `inclusion: always`, `globs` →
`inclusion: fileMatch`). When you change a rule, change it in BOTH places
until we pick a single source of truth.

Notes:
- `cmd-windows.md` is `inclusion: manual` (load it with `#cmd-windows` in chat)
  since it only applies to Windows machines.
- Kiro docs on steering: https://kiro.dev/docs/steering/
