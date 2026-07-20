const LOCAL_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "mysql",
  "db",
]);

const FORBIDDEN_DATABASE_MARKERS = /(^|[_-])(production|prod|main|live)([_-]|$)/i;
const SYSTEM_DATABASES = new Set(["mysql", "information_schema", "performance_schema", "sys"]);

function fail(message, consumerName) {
  throw new Error(`${consumerName}: ${message}`);
}

function normalizePort(value, consumerName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    fail(`invalid MySQL port: ${value}`, consumerName);
  }
  return parsed;
}

function decodePathnameDatabaseName(parsed) {
  return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}

export function maskMysqlUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.password) {
    parsed.password = "*****";
  }
  return parsed.toString();
}

export function summarizeMysqlUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    database: decodePathnameDatabaseName(parsed),
    user: decodeURIComponent(parsed.username || ""),
  };
}

export function buildMysqlUrlFromEnv(env = process.env, consumerName = "mysql script") {
  const explicitUrl = env.DATABASE_URL?.trim();
  if (explicitUrl) {
    return { rawUrl: explicitUrl, source: "DATABASE_URL" };
  }

  const mysqlKeys = ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
  const providedKeys = mysqlKeys.filter((key) => env[key] != null && String(env[key]).trim() !== "");
  if (providedKeys.length === 0) {
    fail(
      "DATABASE_URL or the full MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE set must be provided; refusing implicit localhost defaults",
      consumerName,
    );
  }

  if (providedKeys.length !== mysqlKeys.length) {
    fail(
      `incomplete MYSQL_* configuration; received ${providedKeys.join(", ")}`,
      consumerName,
    );
  }

  const host = String(env.MYSQL_HOST).trim();
  const port = normalizePort(String(env.MYSQL_PORT).trim(), consumerName);
  const user = encodeURIComponent(String(env.MYSQL_USER));
  const password = encodeURIComponent(String(env.MYSQL_PASSWORD));
  const database = String(env.MYSQL_DATABASE).trim();

  if (!host) fail("MYSQL_HOST must not be empty", consumerName);
  if (!database) fail("MYSQL_DATABASE must not be empty", consumerName);

  return {
    rawUrl: `mysql://${user}:${password}@${host}:${port}/${encodeURIComponent(database)}`,
    source: "MYSQL_*",
  };
}

export function resolveMysqlUrlFromEnv({
  env = process.env,
  consumerName = "mysql script",
  requireDatabase = true,
} = {}) {
  const { rawUrl, source } = buildMysqlUrlFromEnv(env, consumerName);
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("DATABASE_URL is not a valid URL", consumerName);
  }

  if (!/^mysql:$/i.test(parsed.protocol)) {
    fail("DATABASE_URL must use the mysql protocol", consumerName);
  }

  const databaseName = decodePathnameDatabaseName(parsed);
  if (requireDatabase && !databaseName) {
    fail("DATABASE_URL must include a non-empty database name", consumerName);
  }

  if (!parsed.username) {
    fail("DATABASE_URL must include a MySQL username", consumerName);
  }

  const port = Number(parsed.port || 3306);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`invalid MySQL port: ${parsed.port}`, consumerName);
  }

  return {
    rawUrl: parsed.toString(),
    source,
    parsed,
    databaseName,
    summary: summarizeMysqlUrl(parsed.toString()),
    maskedUrl: maskMysqlUrl(parsed.toString()),
  };
}

export function resolveMysqlAdminUrlFromEnv({
  env = process.env,
  consumerName = "mysql script",
} = {}) {
  const explicitAdminUrl = env.MYSQL_INTEGRATION_URL?.trim();
  if (explicitAdminUrl) {
    return resolveMysqlUrlFromEnv({
      env: { DATABASE_URL: explicitAdminUrl },
      consumerName: `${consumerName} admin`,
      requireDatabase: true,
    });
  }

  return resolveMysqlUrlFromEnv({
    env,
    consumerName: `${consumerName} admin`,
    requireDatabase: true,
  });
}

export function createMysqlConnectionOptions(rawUrl, { multipleStatements = false, includeDatabase = false } = {}) {
  const parsed = new URL(rawUrl);
  const options = {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    multipleStatements,
  };

  if (includeDatabase) {
    const databaseName = decodePathnameDatabaseName(parsed);
    if (databaseName) {
      options.database = databaseName;
    }
  }

  return options;
}

export function replaceMysqlDatabaseName(rawUrl, databaseName) {
  if (!databaseName) {
    throw new Error("databaseName must not be empty");
  }
  const parsed = new URL(rawUrl);
  parsed.pathname = `/${encodeURIComponent(databaseName)}`;
  return parsed.toString();
}

export function assertSafeLocalTestDatabaseServer(rawUrl, { consumerName = "mysql script" } = {}) {
  const { parsed, databaseName, summary } = resolveMysqlUrlFromEnv({
    env: { DATABASE_URL: rawUrl },
    consumerName,
    requireDatabase: true,
  });

  const hostname = parsed.hostname.toLowerCase();
  const localLike =
    LOCAL_TEST_HOSTS.has(hostname) ||
    hostname.endsWith(".docker.internal") ||
    /^(mysql|db|mariadb|test|docker)([-_.][a-z0-9]+)*$/i.test(hostname);

  if (!localLike) {
    fail(`refusing non-local MySQL host ${parsed.hostname}`, consumerName);
  }

  if (
    databaseName &&
    !SYSTEM_DATABASES.has(databaseName.toLowerCase()) &&
    FORBIDDEN_DATABASE_MARKERS.test(databaseName)
  ) {
    fail(`refusing production-like database name ${databaseName}`, consumerName);
  }

  return { parsed, databaseName, summary };
}

export function assertSafeNamedLocalTestDatabase(
  rawUrl,
  {
    consumerName = "mysql script",
    databaseNamePatterns = [],
  } = {},
) {
  const { parsed, databaseName, summary } = assertSafeLocalTestDatabaseServer(rawUrl, {
    consumerName,
  });
  const lowerDatabaseName = databaseName.toLowerCase();

  if (databaseNamePatterns.length > 0) {
    const allowed = databaseNamePatterns.some((pattern) => pattern.test(lowerDatabaseName));
    if (!allowed) {
      fail(`unsafe test database name ${databaseName}`, consumerName);
    }
  }

  return {
    parsed,
    databaseName,
    summary,
  };
}
