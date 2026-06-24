const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractItems,
  jsonl,
  sanitizeFilePart,
  collectCursorPages,
} = require('../src/exporter-core');

test('jsonl serializes one valid JSON object per line', () => {
  const output = jsonl([
    { type: 'meta', exported_at: '2026-06-25T00:00:00.000Z' },
    { type: 'message', text: 'line 1\nline 2', raw: { nested: true } },
  ]);

  const lines = output.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), {
    type: 'meta',
    exported_at: '2026-06-25T00:00:00.000Z',
  });
  assert.deepEqual(JSON.parse(lines[1]), {
    type: 'message',
    text: 'line 1\nline 2',
    raw: { nested: true },
  });
});

test('extractItems finds arrays through common API response shapes', () => {
  assert.deepEqual(
    extractItems({ data: { chats: [{ id: 'a' }], nextCursor: 'next' } }, ['chats']),
    [{ id: 'a' }]
  );
  assert.deepEqual(
    extractItems({ result: 'SUCCESS', data: { messages: [{ _id: 'm1' }] } }, ['messages']),
    [{ _id: 'm1' }]
  );
  assert.deepEqual(
    extractItems({ data: [{ id: 'direct' }] }, ['chats']),
    [{ id: 'direct' }]
  );
});

test('sanitizeFilePart removes filesystem-hostile characters and caps length', () => {
  assert.equal(sanitizeFilePart('a/b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i');
  assert.equal(sanitizeFilePart('  ...  '), 'untitled');
  assert.equal(sanitizeFilePart('x'.repeat(200)).length, 80);
});

test('collectCursorPages follows nextCursor until exhaustion', async () => {
  const seen = [];
  const pages = [
    { data: { chats: [{ id: '1' }], nextCursor: 'c2' } },
    { data: { chats: [{ id: '2' }], nextCursor: null } },
  ];

  const result = await collectCursorPages({
    initialPath: '/v3/chats',
    limit: 20,
    requestJson: async (path) => {
      seen.push(path);
      return pages.shift();
    },
  });

  assert.deepEqual(seen, ['/v3/chats?limit=20', '/v3/chats?limit=20&cursor=c2']);
  assert.deepEqual(result.map((page) => page.raw.data.chats[0].id), ['1', '2']);
});

test('userscript only targets ordinary chat exports', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.doesNotMatch(script, /party/i);
  assert.match(script, /\/v3\/chats/);
  assert.match(script, /\/character-chats/);
});

test('userscript is scoped to ordinary chat detail pages', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.match(script, /\/\/ @match\s+https:\/\/crack\.wrtn\.ai\/\*/);
  assert.ok(script.includes('pathname.match(/^\\/stories\\/([^/]+)\\/episodes\\/([^/?#]+)/)'));
  assert.ok(script.includes('pathname.match(/^\\/characters\\/([^/]+)\\/chats\\/([^/?#]+)/)'));
});

test('userscript exports only the current chat instead of all chat lists', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.doesNotMatch(script, /listPath:\s*'\/v3\/chats'/);
  assert.doesNotMatch(script, /listPath:\s*'\/character-chats'/);
  assert.doesNotMatch(script, /function collectChatType/);
  assert.match(script, /function getCurrentChatContext/);
  assert.match(script, /function exportCurrentChat/);
});

test('userscript has conservative request pacing constants', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.match(script, /const REQUEST_DELAY_MS = 750;/);
  assert.match(script, /const CHAT_DELAY_MS = 1200;/);
  assert.match(script, /await sleep\(REQUEST_DELAY_MS\);/);
  assert.match(script, /await sleep\(CHAT_DELAY_MS\);/);
});

test('userscript uses API-accepted lowercase message sort order', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.doesNotMatch(script, /sortOrder=ASC/);
  assert.match(script, /messages\?sortOrder=asc/);
});

test('userscript preserves story card metadata without community data', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.match(script, /'story_card'/);
  assert.match(script, /cardPath:\s*`\/crack-api\/stories\/\$\{encodeURIComponent\(storyMatch\[1\]\)\}`/);
  assert.match(script, /associatedCharactersPath/);
  assert.match(script, /collectedImagesInfoPath/);
  assert.match(script, /collectedEndingsBaseInfoPath/);
  assert.doesNotMatch(script, /comments\?limit/);
  assert.doesNotMatch(script, /shortcut-commands/);
});

test('userscript preserves character card metadata without image binaries', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'crack-jsonl-export.user.js'),
    'utf8'
  );

  assert.match(script, /'character_card'/);
  assert.match(script, /cardPath:\s*`\/crack-api\/characters\/\$\{encodeURIComponent\(characterMatch\[1\]\)\}`/);
  assert.match(script, /\/collected-images\/character-snapshots\//);
  assert.doesNotMatch(script, /character-starting-sets/);
  assert.doesNotMatch(script, /base64/);
});
