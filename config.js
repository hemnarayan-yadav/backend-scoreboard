import "dotenv/config";

const REQUIRED_IN_PRODUCTION = ["MONGODB_URI", "JWT_SECRET"];

function parseDurationToSeconds(input, fallbackSeconds) {
  if (!input) return fallbackSeconds;
  if (/^\d+$/.test(input)) return Number(input);
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(String(input).trim());
  if (!match) return fallbackSeconds;
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2].toLowerCase()];
  return Number(match[1]) * multiplier;
}

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length) {
    // Fail fast at boot rather than limping along with an insecure default
    // secret in production.
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

const jwtTtl = process.env.JWT_TTL || "8h";
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean) || [];

if (isProduction && corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGIN cannot be * when NODE_ENV=production");
}

export const config = {
  isProduction,
  port: Number(process.env.PORT || 3001),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || (isProduction ? undefined : "dev-only-insecure-secret"),
  jwtTtl,
  jwtTtlSeconds: parseDurationToSeconds(jwtTtl, 8 * 3600),
  corsOrigins,
  // A `null` Origin header comes from file:// pages or sandboxed iframes.
  // Handy for testing a control panel locally; never trust it in production.
  allowNullOrigin: !isProduction,
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || "Super Admin",
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
};
