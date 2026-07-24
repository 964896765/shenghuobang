#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

const activeDocs = [
  "README.md",
  "todo.md",
  "SECURITY.md",
  "docs/restructure/RUNNABLE_PROTOTYPE_EXECUTION.md",
  "docs/execution/DEVELOPMENT_EXECUTION_INDEX.md",
  "docs/architecture/CORE_DOMAIN_INTEGRATION_BLUEPRINT.md",
  "docs/architecture/IDENTITY_ORGANIZATION_PERMISSION_ARCHITECTURE.md",
  "docs/releases/V4_ALPHA_BASELINE.md",
];

function read(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing_file:${relPath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function pushMatchFailures(relPath, text, checks) {
  for (const [name, regex] of checks) {
    if (regex.test(text)) failures.push(`${name}:${relPath}`);
  }
}

for (const relPath of activeDocs) {
  const text = read(relPath);
  if (!text) continue;

  pushMatchFailures(relPath, text, [
    ["private_lan_ip", /\b(?:192\.168|10\.\d+|172\.(?:1[6-9]|2\d|3[0-1]))\.\d{1,3}\.\d{1,3}\b/],
    ["file_url", /file:\/\/\//i],
    ["windows_abs_path", /\b[A-Za-z]:\\[^\s`]+/],
    ["unix_abs_path", /(^|[\s`])\/(?:Users|home|var|tmp)\/[^\s`]+/],
    ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["github_token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
    ["database_url_literal", /DATABASE_URL\s*=\s*(?!\$\{\{ secrets\.)/i],
    ["jwt_secret_literal", /JWT_SECRET\s*=\s*(?!\$\{\{ secrets\.)/i],
    ["file_signing_secret_literal", /FILE_SIGNING_SECRET\s*=\s*(?!\$\{\{ secrets\.)/i],
  ]);
}

const output = {
  status: failures.length ? "FAILED" : "PASSED",
  activeDocs,
  failureCount: failures.length,
  failures,
};

console.log(JSON.stringify(output, null, 2));
process.exitCode = failures.length ? 1 : 0;
