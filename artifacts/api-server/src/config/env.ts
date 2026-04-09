function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  SESSION_SECRET: requireEnv("SESSION_SECRET"),
  CORS_ALLOWED_ORIGINS: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
} as const;

if (!Number.isFinite(env.PORT) || env.PORT <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT ?? ""}`);
}
