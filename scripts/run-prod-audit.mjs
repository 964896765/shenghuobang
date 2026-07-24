#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";

const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
const toolchainPattern = /expo|react-native|@expo\//i;
const devOnlyPattern = /eslint|prettier|typescript|vitest|drizzle-kit/i;
const infrastructureErrorCodes = new Set([
  "ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS",
  "ERR_PNPM_META_FETCH_FAIL",
  "ERR_PNPM_FETCH_",
]);

function extractJsonPayload(rawOutput) {
  const start = rawOutput.indexOf("{");
  const end = rawOutput.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }
  return rawOutput.slice(start, end + 1);
}

function summarizeResolvePath(entry) {
  return String(entry ?? "").replaceAll(">", " > ").replace(/\s+/g, " ").trim();
}

function resolutionInfo(action) {
  const resolve = Array.isArray(action?.resolves) ? action.resolves[0] : null;
  const path = summarizeResolvePath(resolve?.path);
  return {
    path,
    directDependency: Boolean(path && path.startsWith(". > ") && path.split(" > ").length === 2),
    expoToolchain: toolchainPattern.test(path),
    affectsProductionRuntime: resolve?.dev === false || (path && !devOnlyPattern.test(path)),
  };
}

function summarizeAdvisory(audit, advisory) {
  const findings = Array.isArray(advisory.findings) ? advisory.findings : [];
  const action = Array.isArray(audit.actions)
    ? audit.actions.find((candidate) => candidate?.module === advisory.module_name)
    : null;
  const resolution = resolutionInfo(action);

  return {
    id: advisory.id,
    module: advisory.module_name,
    installedVersion: findings[0]?.version ?? "unknown",
    severity: advisory.severity ?? "unknown",
    patched: advisory.patched_versions || advisory.recommendation || "unavailable",
    path: resolution.path || findings.flatMap((finding) => finding?.paths ?? []).map(summarizeResolvePath).find(Boolean) || "unavailable",
    directDependency: resolution.directDependency,
    expoToolchain: resolution.expoToolchain,
    affectsProductionRuntime: resolution.affectsProductionRuntime,
    title: advisory.title ?? "unknown",
  };
}

const result = spawnSync(
  process.platform === "win32" ? "pnpm" : "pnpm",
  ["audit", "--prod", "--json", "--registry=https://registry.npmjs.org"],
  { cwd: process.cwd(), encoding: "utf8", shell: true },
);

const rawOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
if (!rawOutput) {
  console.error("pnpm audit did not return JSON output");
  process.exit(1);
}

const payload = extractJsonPayload(rawOutput);
if (!payload) {
  console.error("pnpm audit did not return parseable JSON");
  console.error(rawOutput);
  process.exit(result.status ?? 1);
}

let audit;
try {
  audit = JSON.parse(payload);
} catch (error) {
  console.error(`Failed to parse pnpm audit JSON: ${error instanceof Error ? error.message : String(error)}`);
  console.error(payload);
  process.exit(result.status ?? 1);
}

if (audit?.error) {
  const code = String(audit.error.code ?? "UNKNOWN_AUDIT_ERROR");
  const message = String(audit.error.message ?? "pnpm audit failed");
  const isInfrastructureError = Array.from(infrastructureErrorCodes).some((prefix) => code === prefix || code.startsWith(prefix));
  console.error(isInfrastructureError ? "Production dependency audit infrastructure failure" : "Production dependency audit failed");
  console.error(`code=${code}`);
  console.error(`message=${message}`);
  process.exit(result.status ?? 1);
}

const advisories = Object.values(audit.advisories ?? {});
const summary = advisories.map((advisory) => summarizeAdvisory(audit, advisory)).sort((left, right) => {
  return (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9)
    || left.module.localeCompare(right.module);
});

const tableLines = [
  "| Package | Installed | Severity | Patched | Path | Direct | Expo/RN toolchain | Production path |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...summary.map((item) =>
    `| ${item.module} | ${item.installedVersion} | ${item.severity} | ${item.patched} | ${item.path} | ${item.directDependency ? "yes" : "no"} | ${item.expoToolchain ? "yes" : "no"} | ${item.affectsProductionRuntime ? "yes" : "no"} |`,
  ),
];

const counts = audit.metadata?.vulnerabilities ?? {};
const blocking = summary.filter((item) => item.severity === "critical" || item.severity === "high");
const report = [
  "Production dependency audit summary",
  "",
  `Counts: critical=${counts.critical ?? 0}, high=${counts.high ?? 0}, moderate=${counts.moderate ?? 0}, low=${counts.low ?? 0}`,
  "",
  ...tableLines,
  "",
  blocking.length
    ? `Blocking vulnerabilities: ${blocking.map((item) => `${item.module}(${item.severity})`).join(", ")}`
    : "No blocking high/critical vulnerabilities.",
].join("\n");

console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

process.exit(blocking.length ? 1 : 0);
