#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const outputDir = path.resolve(process.cwd(), process.env.ANDROID_EXPORT_DIR ?? "artifacts/android-export");
const configuredApiUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
const require = createRequire(import.meta.url);

if (!configuredApiUrl) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is required for android export validation");
}
if (/localhost|127\.0\.0\.1/i.test(configuredApiUrl)) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL must not point to localhost for android export validation");
}
if (!fs.existsSync(outputDir)) {
  throw new Error(`android export output is missing: ${outputDir}`);
}

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else files.push(fullPath);
  }
}
walk(outputDir);

const metadataPath = path.join(outputDir, "metadata.json");
const metadata = fs.existsSync(metadataPath)
  ? JSON.parse(fs.readFileSync(metadataPath, "utf8"))
  : null;
const bundleRelativePath = metadata?.fileMetadata?.android?.bundle;
const bundleFile = bundleRelativePath
  ? path.join(outputDir, bundleRelativePath)
  : files.find((filePath) => /(?:index\.android\.(bundle|js)|entry-.*\.(hbc|js))$/i.test(path.basename(filePath)));

if (!bundleFile || !fs.existsSync(bundleFile)) {
  throw new Error("Android bundle was not generated");
}

const bundleContent = fs.readFileSync(bundleFile);
const configuredApiBytes = Buffer.from(configuredApiUrl);
const bundleIncludesConfiguredApi = bundleContent.includes(configuredApiBytes);
if (
  bundleContent.includes(Buffer.from("http://localhost:3000"))
  || bundleContent.includes(Buffer.from("127.0.0.1:3000"))
) {
  throw new Error("Android bundle fell back to localhost configuration");
}

const appConfig = require(path.resolve(process.cwd(), "app.config.js"));
const configApiUrl = appConfig?.extra?.build?.apiBaseUrl?.trim?.() ?? "";
if (configApiUrl !== configuredApiUrl && !bundleIncludesConfiguredApi) {
  throw new Error("configured API base URL was not propagated to the Android export config");
}

console.log(JSON.stringify({
  status: "PASSED",
  bundleFile: path.relative(process.cwd(), bundleFile),
  configuredApiUrl,
  configApiUrl,
  bundleIncludesConfiguredApi,
}, null, 2));
