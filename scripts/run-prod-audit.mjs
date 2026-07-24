#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";

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

const start = rawOutput.indexOf("{");
const end = rawOutput.lastIndexOf("}");
if (start < 0 || end < start) {
  console.error(rawOutput);
  process.exit(result.status ?? 1);
}

const audit = JSON.parse(rawOutput.slice(start, end + 1));
const advisories = Object.values(audit.advisories ?? {});
const summarizeFinding = (advisory) => {
  const findings = advisory.findings ?? [];
  const direct = findings.some((finding) =>
    (finding.paths ?? []).some((entry) => typeof entry === "string" && entry.startsWith(". > "))
      && (finding.paths ?? []).some((entry) => typeof entry === "string" && entry.split(" > ").length === 2),
  );
  const expoToolchain = findings.some((finding) =>
    (finding.paths ?? []).some((entry) => /expo|react-native|@expo\//i.test(String(entry))),
  );
  const productionPath = findings.some((finding) =>
    (finding.paths ?? []).some((entry) => !/eslint|prettier|typescript|vitest|drizzle-kit/i.test(String(entry))),
  );
  return {
    module: advisory.module_name,
    severity: advisory.severity,
    patched: advisory.patched_versions,
    directDependency: direct,
    expoToolchain,
    affectsProductionRuntime: productionPath,
    title: advisory.title,
  };
};

const summary = advisories.map(summarizeFinding).sort((left, right) => {
  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  return (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9)
    || left.module.localeCompare(right.module);
});

const tableLines = [
  "| Package | Severity | Patched | Direct | Expo/RN toolchain | Production path |",
  "| --- | --- | --- | --- | --- | --- |",
  ...summary.map((item) =>
    `| ${item.module} | ${item.severity} | ${item.patched} | ${item.directDependency ? "yes" : "no"} | ${item.expoToolchain ? "yes" : "no"} | ${item.affectsProductionRuntime ? "yes" : "no"} |`,
  ),
];

const counts = audit.metadata?.vulnerabilities ?? {};
const blocking = summary.filter((item) => item.severity === "critical" || item.severity === "high");
const report = [
  `Production dependency audit summary`,
  ``,
  `Counts: critical=${counts.critical ?? 0}, high=${counts.high ?? 0}, moderate=${counts.moderate ?? 0}, low=${counts.low ?? 0}`,
  ``,
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
