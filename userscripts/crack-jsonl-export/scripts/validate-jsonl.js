const fs = require('node:fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate-jsonl.js <export.jsonl>');
  process.exit(2);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
const records = lines.map((line, index) => {
  try {
    return JSON.parse(line);
  }
  catch (error) {
    throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
  }
});

const counts = records.reduce((acc, record) => {
  acc[record.type] = (acc[record.type] || 0) + 1;
  return acc;
}, {});

const apiPages = records.filter((record) => record.type === 'api_page');
const messages = records.filter((record) => record.type === 'message');
const messagesWithoutRaw = messages.filter((record) => !record.raw || typeof record.raw !== 'object');
const apiPagesWithoutRaw = apiPages.filter((record) => !record.raw || typeof record.raw !== 'object');

console.log(JSON.stringify({
  file,
  total_records: records.length,
  counts,
  api_pages_without_raw: apiPagesWithoutRaw.length,
  messages_without_raw: messagesWithoutRaw.length,
  first_api_paths: apiPages.slice(0, 5).map((record) => record.path),
}, null, 2));

if (!counts.export_meta || !counts.api_page) {
  process.exitCode = 1;
}
if (messagesWithoutRaw.length || apiPagesWithoutRaw.length) {
  process.exitCode = 1;
}
