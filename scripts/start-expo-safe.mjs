import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const expoCli = path.join(repoRoot, "node_modules", "expo", "bin", "cli");
const lockDir = path.join(repoRoot, ".expo");
const lockPath = path.join(lockDir, "shenghuobang-expo.lock");
const wrapperPid = process.pid;

let child = null;
let ownsLock = false;
let requestedExitCode = null;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLock() {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function writeLock(childPid = null) {
  writeFileSync(
    lockPath,
    `${JSON.stringify({
      wrapperPid,
      childPid,
      cwd: repoRoot,
      args: process.argv.slice(2),
      startedAt: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
}

function acquireLock() {
  mkdirSync(lockDir, { recursive: true });

  try {
    const descriptor = openSync(lockPath, "wx");
    closeSync(descriptor);
    ownsLock = true;
    writeLock();
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const existing = readLock();
  const activePid = [existing?.wrapperPid, existing?.childPid].find(isProcessAlive);
  if (activePid) {
    throw new Error(
      `Expo is already running for this repository (PID ${activePid}). Stop it in its original terminal before starting another instance.`,
    );
  }

  // A crashed process can leave one stale lock. Remove it once and make one
  // bounded acquisition attempt; contention is reported instead of retried.
  unlinkSync(lockPath);
  const descriptor = openSync(lockPath, "wx");
  closeSync(descriptor);
  ownsLock = true;
  writeLock();
}

function releaseLock() {
  if (!ownsLock) return;

  const current = readLock();
  if (current?.wrapperPid === wrapperPid) {
    try {
      unlinkSync(lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  ownsLock = false;
}

function normalizeArgs(rawArgs) {
  const normalized = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === "--max-workers") {
      index += 1;
      continue;
    }
    if (argument.startsWith("--max-workers=")) continue;
    normalized.push(argument);
  }

  return [...normalized, "--max-workers", "1"];
}

function readPort(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--port") {
      return Number.parseInt(args[index + 1] ?? "", 10);
    }
    if (argument.startsWith("--port=")) {
      return Number.parseInt(argument.slice("--port=".length), 10);
    }
  }
  return 8081;
}

function assertValidPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid Expo port: ${port}`);
  }
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      reject(
        error?.code === "EADDRINUSE"
          ? new Error(`Expo port ${port} is already in use. Stop the existing process; automatic port fallback is disabled.`)
          : error,
      );
    });
    server.listen({ host: "0.0.0.0", port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

function stopChild(exitCode) {
  requestedExitCode ??= exitCode;
  if (child && isProcessAlive(child.pid)) {
    child.kill();
  }
}

async function main() {
  if (!existsSync(expoCli)) {
    throw new Error("Expo CLI is not installed. Run pnpm install in this repository first.");
  }

  const expoArgs = normalizeArgs(process.argv.slice(2));
  const port = readPort(expoArgs);
  assertValidPort(port);

  acquireLock();
  await assertPortAvailable(port);

  child = spawn(process.execPath, [expoCli, "start", ...expoArgs], {
    cwd: repoRoot,
    detached: false,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      EXPO_USE_METRO_WORKSPACE_ROOT: "1",
    },
  });
  writeLock(child.pid);

  process.once("SIGINT", () => stopChild(130));
  process.once("SIGTERM", () => stopChild(143));
  process.once("SIGHUP", () => stopChild(129));

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (requestedExitCode !== null) {
        resolve(requestedExitCode);
      } else if (Number.isInteger(code)) {
        resolve(code);
      } else {
        console.error(`Expo terminated by signal ${signal ?? "unknown"}.`);
        resolve(1);
      }
    });
  });

  releaseLock();
  process.exitCode = exitCode;
}

process.on("exit", () => {
  if (!child || !isProcessAlive(child.pid)) {
    releaseLock();
  }
});

main().catch((error) => {
  console.error(`[expo-safe] ${error instanceof Error ? error.message : String(error)}`);
  if (!child || !isProcessAlive(child.pid)) {
    releaseLock();
  }
  process.exitCode = 1;
});
