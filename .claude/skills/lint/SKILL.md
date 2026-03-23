---
name: lint
description: Run all configured linters across the repository and report issues with file paths and line numbers
---

Run the following linters in order. Report all findings with file paths and line numbers.

## ShellCheck (Bash)

Run ShellCheck on all `.sh` files in the repository:

```bash
find . -name '*.sh' -not -path './.git/*' | xargs shellcheck
```

If ShellCheck finds issues, show them grouped by file with the severity level (error/warning/info/style).

## Summary

After running all linters:
- Report total issues found per linter
- If all linters pass cleanly, confirm no issues found
- If issues are found, suggest fixes for the most critical ones first
