# Crack JSONL Export

Personal userscript for exporting the currently opened ordinary Crack chat as
JSONL.

## Scope

- Exports only the active ordinary chat opened by the signed-in user.
- Preserves raw API payloads in JSONL records.
- Preserves public story/character card metadata and collected image metadata.
- Does not upload exported data.
- Uses conservative request pacing.
- Does not support party chat.
- Does not download image binaries or export community comments.

## JSONL Records

- `export_meta`: export context and schema version.
- `chat_detail`: raw chat detail response.
- `story_card` or `character_card`: raw public card detail response.
- `associated_characters`: raw story associated character response.
- `collected_images_info`: raw image metadata response.
- `collected_endings_base_info`: raw story ending metadata response.
- `messages_page`: raw paginated message response.
- `message`: one normalized message with the original raw message attached.
- `export_summary`: final counts.

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
