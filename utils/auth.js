import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtTtl },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function authCookie(token) {
  // Max-Age was previously hardcoded to 28800 (8h) regardless of JWT_TTL, so
  // changing the env var desynced the cookie's lifetime from the token's.
  const secure = config.isProduction ? "Secure; " : "";
  const sameSite = config.isProduction ? "None" : "Lax";
  return `kabaddi_token=${encodeURIComponent(token)}; Max-Age=${config.jwtTtlSeconds}; HttpOnly; ${secure}SameSite=${sameSite}; Path=/`;
}

export function clearAuthCookie() {
  return "kabaddi_token=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/";
}