const fs = require('node:fs');

const RAW_RECORD_TYPES = new Set([
  'chat_detail',
  'story_card',
  'character_card',
  'associated_characters',
  'collected_images_info',
  'collected_endings_base_info',
  'messages_page',
]);

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

const rawRecords = records.filter((record) => RAW_RECORD_TYPES.has(record.type));
const messages = records.filter((record) => record.type === 'message');
const recordsMissingRaw = [...rawRecords, ...messages].filter(
  (record) => !record.raw || typeof record.raw !== 'object'
);
const cardCount = (counts.story_card || 0) + (counts.character_card || 0);
const requiredCounts = {
  export_meta: counts.export_meta || 0,
  chat_detail: counts.chat_detail || 0,
  card: cardCount,
  messages_page: counts.messages_page || 0,
};

console.log(JSON.stringify({
  file,
  total_records: records.length,
  counts,
  records_missing_raw: recordsMissingRaw.length,
  first_raw_paths: rawRecords.slice(0, 8).map((record) => record.path),
  required_counts: requiredCounts,
}, null, 2));

if (Object.values(requiredCounts).some((count) => count < 1)) {
  process.exitCode = 1;
}
if (recordsMissingRaw.length) {
  process.exitCode = 1;
}
