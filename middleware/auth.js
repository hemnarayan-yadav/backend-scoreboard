import { verifyAccessToken } from "../utils/auth.js";
import { User } from "../models/User.js";

function tokenFrom(request) {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("kabaddi_token="));
  return cookie?.slice("kabaddi_token=".length);
}

function userPayload(user) {
  return {
    sub: String(user._id),
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export async function requireAuth(request, response, next) {
  try {
    const token = tokenFrom(request);
    if (!token) return response.status(401).json({ error: "Admin login required" });
    const payload = verifyAccessToken(decodeURIComponent(token));
    const user = await User.findById(payload.sub).select("name email role active").lean();
    if (!user || !user.active) return response.status(401).json({ error: "Session expired" });
    request.user = userPayload(user);
    next();
  } catch {
    return response.status(401).json({ error: "Session expired" });
  }
}

export async function optionalAuth(request, _response, next) {
  try {
    const token = tokenFrom(request);
    if (token) {
      const payload = verifyAccessToken(decodeURIComponent(token));
      const user = await User.findById(payload.sub).select("name email role active").lean();
      if (user?.active) request.user = userPayload(user);
    }
  } catch {
    // Public endpoints continue without an invalid optional session.
  }
  next();
}

export function requireRole(...roles) {
  return (request, response, next) =>
    roles.includes(request.user?.role) ? next() : response.status(403).json({ error: "Insufficient permissions" });
}
