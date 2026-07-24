type BootPhase =
  | "native entry"
  | "root layout"
  | "theme ready"
  | "query ready"
  | "trpc ready"
  | "role provider mounted"
  | "location provider mounted"
  | "push lifecycle mounted"
  | "router mounted"
  | "tabs rendered"
  | "home rendered";

let currentPhase: BootPhase = "native entry";

export function markBootPhase(phase: BootPhase) {
  currentPhase = phase;
  console.info(`[BOOT] ${phase}`);
}

export function getBootPhase() {
  return currentPhase;
}

markBootPhase("native entry");
