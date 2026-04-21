# Codex Workflow Notes

## Encoding First

- Before reading or editing project files from the terminal, force UTF-8 output/input handling first.
- In PowerShell, set:
  - `$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()`
- When reading files in PowerShell, prefer:
  - `Get-Content <path> -Encoding UTF8`
- If terminal output still looks garbled, stop and ask the user before making any text-changing edit.

## Editing Rule

- Do not "guess-fix" garbled text based on terminal mojibake.
- If encoding is uncertain, inspect safely first, then confirm with the user.
- Keep changes minimal and avoid broad rewrites when only one feature is requested.
- Before executing a new coding instruction, compare the planned work against the user's latest message and verify the task has not drifted.
- If the current action does not directly address the user's latest request, stop and realign before editing files.
