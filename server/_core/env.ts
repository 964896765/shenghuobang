import path from "node:path";

export type RuntimeEnvironment = ReturnType<typeof readEnvironment>;

export function readEnvironment(source: Readonly<Record<string, string | undefined>> = process.env) {
  const storageProvider = source.STORAGE_PROVIDER === "s3" ? "s3" : "local";
  return {
    nodeEnv: source.NODE_ENV ?? "development",
    port: Number(source.PORT ?? 3000),
    cookieSecret: source.JWT_SECRET ?? "",
    fileSigningSecret: source.FILE_SIGNING_SECRET ?? "",
    databaseUrl: source.DATABASE_URL ?? "",
    isProduction: source.NODE_ENV === "production",
    aiApiUrl: source.AI_API_URL ?? "https://api.deepseek.com",
    aiApiKey: source.AI_API_KEY ?? "",
    aiModel: source.AI_MODEL ?? "deepseek-chat",
    uploadDir: source.LOCAL_UPLOAD_DIR ?? source.UPLOAD_DIR ?? "./uploads",
    storageProvider: storageProvider as "local" | "s3",
    s3Endpoint: source.S3_ENDPOINT ?? "",
    s3Region: source.S3_REGION ?? "",
    s3Bucket: source.S3_BUCKET ?? "",
    s3AccessKeyId: source.S3_ACCESS_KEY_ID ?? "",
    s3SecretAccessKey: source.S3_SECRET_ACCESS_KEY ?? "",
    s3ForcePathStyle: source.S3_FORCE_PATH_STYLE === "true",
    maxUploadBytes: Number(source.MAX_UPLOAD_BYTES ?? 8388608),
    maxFilesPerEntity: Number(source.MAX_FILES_PER_ENTITY ?? 20),
    publicBaseUrl: source.PUBLIC_BASE_URL ?? "",
    pushProvider: source.PUSH_PROVIDER ?? "log",
    expoPushAccessToken: source.EXPO_PUSH_ACCESS_TOKEN ?? "",
    allowNativeWsWithoutOrigin: source.WS_ALLOW_NATIVE_WITHOUT_ORIGIN === "true",
    wsMaxConnectionsPerUser: Number(source.WS_MAX_CONNECTIONS_PER_USER ?? 3),
    wsMaxSubscriptions: Number(source.WS_MAX_SUBSCRIPTIONS ?? 20),
    wsMaxMessageBytes: Number(source.WS_MAX_MESSAGE_BYTES ?? 16384),
    corsOrigins: (source.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  };
}

export type ConfigurationCheck = { ok: boolean; missing: string[]; invalid: string[] };

export function validateConfiguration(env: RuntimeEnvironment, options: { production?: boolean } = {}): ConfigurationCheck {
  const production = options.production ?? env.isProduction;
  const missing: string[] = [];
  const invalid: string[] = [];
  const requireValue = (name: string, value: string) => { if (!value.trim()) missing.push(name); };

  requireValue("DATABASE_URL", env.databaseUrl);
  requireValue("JWT_SECRET", env.cookieSecret);
  requireValue("FILE_SIGNING_SECRET", env.fileSigningSecret);
  if (production) requireValue("CORS_ORIGINS", env.corsOrigins.join(","));
  if (production && env.cookieSecret.length < 32) invalid.push("JWT_SECRET");
  if (production && env.fileSigningSecret.length < 32) invalid.push("FILE_SIGNING_SECRET");
  if (!Number.isSafeInteger(env.maxUploadBytes) || env.maxUploadBytes <= 0) invalid.push("MAX_UPLOAD_BYTES");
  if (!new Set(["log", "expo"]).has(env.pushProvider)) invalid.push("PUSH_PROVIDER");
  if (env.corsOrigins.some((origin) => {
    try { const url = new URL(origin); return !["http:", "https:"].includes(url.protocol) || url.origin !== origin; }
    catch { return true; }
  })) invalid.push("CORS_ORIGINS");

  if (env.storageProvider === "s3") {
    requireValue("S3_ENDPOINT", env.s3Endpoint);
    requireValue("S3_REGION", env.s3Region);
    requireValue("S3_BUCKET", env.s3Bucket);
    requireValue("S3_ACCESS_KEY_ID", env.s3AccessKeyId);
    requireValue("S3_SECRET_ACCESS_KEY", env.s3SecretAccessKey);
  } else {
    requireValue("LOCAL_UPLOAD_DIR", env.uploadDir);
    const resolved = path.resolve(env.uploadDir);
    const publicRoots = ["assets", "public", "web-dist"].map((dir) => path.resolve(process.cwd(), dir));
    if (publicRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) invalid.push("LOCAL_UPLOAD_DIR");
  }
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function assertProductionConfiguration(env: RuntimeEnvironment = ENV) {
  if (!env.isProduction) return;
  const result = validateConfiguration(env, { production: true });
  if (!result.ok) {
    const fields = [...new Set([...result.missing, ...result.invalid])].join(", ");
    throw new Error(`Production configuration is incomplete or invalid: ${fields}`);
  }
}

export const ENV = readEnvironment();
