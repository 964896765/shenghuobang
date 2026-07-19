import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".expo", "node_modules", "dist", "web-dist", "artifacts", "uploads"]);

function markdownFilesFromFilesystem(directory = root) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) result.push(...markdownFilesFromFilesystem(join(directory, entry.name)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) result.push(relative(root, join(directory, entry.name)));
  }
  return result.sort();
}

function trackedMarkdownFiles() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" });
    return execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch {
    return markdownFilesFromFilesystem();
  }
}

const files = trackedMarkdownFiles();
const broken = [];
const checked = [];

for (const file of files) {
  const text = readFileSync(resolve(root, file), "utf8");
  const links = [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1].trim());
  for (const raw of links) {
    const target = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
    if (!target || target.startsWith("#") || /^(https?:|mailto:|tel:)/i.test(target)) continue;
    const pathPart = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (!pathPart) continue;
    const absolute = resolve(root, dirname(file), pathPart);
    checked.push(`${file} -> ${pathPart}`);
    if (!existsSync(absolute)) broken.push(`${file} -> ${pathPart}`);
  }
}

if (broken.length > 0) {
  console.error(`Markdown 相对链接检查失败：${broken.length} 条断链`);
  broken.forEach((item) => console.error(`  ✗ ${item}`));
  process.exit(1);
}
console.log(`Markdown 相对链接检查通过：${files.length} 个文件，${checked.length} 条本地链接`);
