import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: config.jwtTtl },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function cookieOptions() {
  return `HttpOnly; SameSite=${process.env.NODE_ENV === "production" ? "None; Secure" : "Lax"}; Path=/`;
}
