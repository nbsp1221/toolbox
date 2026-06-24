function jsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

function sanitizeFilePart(value) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'untitled';
}

function extractItems(raw, keys) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;

  const containers = [raw, raw.data, raw.result, raw.payload].filter(
    (item) => item && typeof item === 'object'
  );

  for (const container of containers) {
    for (const key of keys) {
      if (Array.isArray(container[key])) return container[key];
    }
  }

  return [];
}

function getNextCursor(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidates = [raw, raw.data, raw.result, raw.payload].filter(
    (item) => item && typeof item === 'object'
  );
  for (const item of candidates) {
    if (item.nextCursor) return item.nextCursor;
    if (item.cursor) return item.cursor;
  }
  return null;
}

function appendQuery(path, params) {
  const [base, query = ''] = path.split('?');
  const search = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString();
  return suffix ? `${base}?${suffix}` : base;
}

async function collectCursorPages({ initialPath, limit = 100, requestJson, maxPages = 10000 }) {
  const pages = [];
  let cursor = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const path = appendQuery(initialPath, { limit, cursor });
    const raw = await requestJson(path);
    pages.push({ pageIndex, path, raw });

    const nextCursor = getNextCursor(raw);
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return pages;
}

module.exports = {
  collectCursorPages,
  extractItems,
  getNextCursor,
  jsonl,
  sanitizeFilePart,
};
