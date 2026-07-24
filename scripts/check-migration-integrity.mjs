#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const drizzleDir = path.join(root, "drizzle");
const metaDir = path.join(drizzleDir, "meta");
const journalPath = path.join(metaDir, "_journal.json");
const checksumsPath = path.join(drizzleDir, "migration-checksums.json");

const failures = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const journal = readJson(journalPath);
const checksumManifest = readJson(checksumsPath);
const sqlFiles = fs.readdirSync(drizzleDir)
  .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName))
  .sort();
const expectedFiles = journal.entries.map((entry) => `${entry.tag}.sql`);

if (sqlFiles.length !== expectedFiles.length) {
  failures.push(`file_count_mismatch:${sqlFiles.length}:${expectedFiles.length}`);
}

for (let index = 0; index < expectedFiles.length; index += 1) {
  if (sqlFiles[index] !== expectedFiles[index]) {
    failures.push(`journal_order_mismatch:${index}:${sqlFiles[index] ?? "missing"}:${expectedFiles[index]}`);
  }
}

const seenNumbers = new Set();
for (const fileName of sqlFiles) {
  const number = fileName.slice(0, 4);
  if (seenNumbers.has(number)) failures.push(`duplicate_number:${number}`);
  seenNumbers.add(number);
}

const frozenEntries = checksumManifest.frozen ?? [];
if (frozenEntries.length !== 38) {
  failures.push(`frozen_entry_count_invalid:${frozenEntries.length}`);
}

for (const entry of frozenEntries) {
  const filePath = path.join(drizzleDir, entry.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`missing_frozen_file:${entry.file}`);
    continue;
  }
  const actual = sha256(filePath);
  if (actual !== entry.sha256) {
    failures.push(`checksum_mismatch:${entry.file}`);
  }
  const journalEntry = journal.entries.find((item) => `${item.tag}.sql` === entry.file);
  if (!journalEntry) {
    failures.push(`missing_from_journal:${entry.file}`);
  }
}

for (const entry of journal.entries) {
  const fileName = `${entry.tag}.sql`;
  const filePath = path.join(drizzleDir, fileName);
  if (!fs.existsSync(filePath)) failures.push(`missing_sql_file:${fileName}`);
}

const output = {
  status: failures.length ? "FAILED" : "PASSED",
  journalEntries: journal.entries.length,
  sqlFiles: sqlFiles.length,
  frozenEntries: frozenEntries.length,
  failures,
};

console.log(JSON.stringify(output, null, 2));
process.exitCode = failures.length ? 1 : 0;
