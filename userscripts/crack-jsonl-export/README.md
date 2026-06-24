# Crack JSONL Export

Personal userscript for exporting the currently opened ordinary Crack chat as
JSONL.

## Scope

- Exports only the active ordinary chat opened by the signed-in user.
- Preserves raw API payloads in JSONL records.
- Does not upload exported data.
- Uses conservative request pacing.
- Does not support party chat.

## Files

- `crack-jsonl-export.user.js`: Tampermonkey userscript.
- `src/exporter-core.js`: Shared export helpers used by tests.
- `test/exporter-core.test.js`: Node test suite.
- `scripts/validate-jsonl.js`: Local validator for exported JSONL files.

## Verification

```powershell
node --check .\userscripts\crack-jsonl-export\crack-jsonl-export.user.js
node --check .\userscripts\crack-jsonl-export\scripts\validate-jsonl.js
node --test .\userscripts\crack-jsonl-export\test\exporter-core.test.js
```
