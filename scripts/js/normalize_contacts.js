import { existsSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "csv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const targetArg = process.argv[2];

if (!targetArg) {
  console.error("Usage: node scripts/normalize_contacts.js <path-to-csv>");
  process.exit(1);
}

const SRC = resolve(process.cwd(), targetArg);

if (!existsSync(SRC)) {
  console.error("Source file not found:", SRC);
  process.exit(1);
}

const BACKUP = (() => {
  const base = `${SRC}.bak`;
  return base;
  if (!existsSync(base)) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${base}.${stamp}`;
})();

function parseCsv(buffer) {
  return new Promise((resolvePromise, rejectPromise) => {
    parse(buffer, { columns: true, skip_empty_lines: true }, (err, records) => {
      if (err) rejectPromise(err);
      else resolvePromise(records);
    });
  });
}

function stringifyCsv(records, headers) {
  return new Promise((resolvePromise, rejectPromise) => {
    stringify(records, { header: true, columns: headers }, (err, output) => {
      if (err) rejectPromise(err);
      else resolvePromise(output);
    });
  });
}

const RENAME_MAP = new Map([
  ["Athletic Director Name", "Name"],
  ["Athletic Director Email", "Email"],
  ["Athletic Director Phone", "Phone"],
]);

const REMOVE_SET = new Set(["Boys Soccer Coach Name", "Boys Soccer Coach Email", "Girls Soccer Coach Name", "Girls Soccer Coach Email"]);

function transform(records, headers) {
  const outputHeaders = [];
  const headerMap = headers.reduce((acc, header) => {
    if (REMOVE_SET.has(header)) return acc;
    const renamed = RENAME_MAP.get(header) ?? header;
    if (!outputHeaders.includes(renamed)) outputHeaders.push(renamed);
    acc.set(header, renamed);
    return acc;
  }, new Map());

  const transformedRecords = records.map((record) => {
    const next = {};
    headerMap.forEach((renamed, original) => {
      next[renamed] = record[original] ?? "";
    });
    return next;
  });

  return { transformedRecords, outputHeaders };
}

async function main() {
  const input = readFileSync(SRC, "utf8");
  const records = await parseCsv(input);

  if (!records.length) {
    console.log("No records found. Nothing to do.");
    return;
  }

  const headers = Object.keys(records[0]);
  const { transformedRecords, outputHeaders } = transform(records, headers);

  copyFileSync(SRC, BACKUP);
  console.log("Backup created at", BACKUP);

  const output = await stringifyCsv(transformedRecords, outputHeaders);
  writeFileSync(SRC, output, "utf8");
  console.log(`Updated CSV headers (${headers.length} -> ${outputHeaders.length}) and wrote ${transformedRecords.length} records to`, SRC);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
