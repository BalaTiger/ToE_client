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

