import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const status = git("status", "--porcelain", "--untracked-files=all");

if (status) {
  throw new Error("拒绝打包：工作树不干净。请先提交或移走所有已跟踪和未跟踪文件。\n" + status);
}

const tracked = git("ls-tree", "-r", "--name-only", "HEAD").split("\n").filter(Boolean);
const forbidden = tracked.filter((path) => {
  if (path === ".env.example" || path === "uploads/.gitkeep") return false;
  return /(^|\/)\.env(?:\.|$)/.test(path)
    || /(^|\/)(node_modules|artifacts|dist|web-dist|\.expo)(\/|$)/.test(path)
    || /\.(apk|aab|jks|keystore|log|zip)$/i.test(path);
});

if (forbidden.length) {
  throw new Error(`拒绝打包：HEAD 包含禁止进入源码包的文件：\n${forbidden.join("\n")}`);
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const commit = git("rev-parse", "--short=12", "HEAD");
const defaultOutput = resolve(root, "artifacts", `shenghuobang-v${packageJson.version}-${commit}-source.zip`);
const output = resolve(root, process.argv[2] ?? defaultOutput);

if (extname(output).toLowerCase() !== ".zip") throw new Error("源码包输出必须是 .zip 文件");
if (existsSync(output)) throw new Error(`拒绝覆盖已有源码包：${output}`);
mkdirSync(dirname(output), { recursive: true });

execFileSync("git", ["archive", "--format=zip", `--prefix=shenghuobang-v${packageJson.version}/`, `--output=${output}`, "HEAD"], {
  cwd: root,
  stdio: "inherit",
});

console.log(`Source archive created from HEAD ${commit}: ${output}`);
