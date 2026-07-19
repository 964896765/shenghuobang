type LogFields = Record<string, unknown>;

function scrub(fields: LogFields): LogFields {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => {
    if (/token|secret|password|authorization|signature/i.test(key)) return [key, "[redacted]"];
    return [key, value instanceof Error ? value.message : value];
  }));
}

function write(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...scrub(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
