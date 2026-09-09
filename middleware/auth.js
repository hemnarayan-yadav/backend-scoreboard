import { verifyAccessToken } from "../utils/auth.js";

function tokenFrom(request) {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("kabaddi_token="));
  return cookie?.slice("kabaddi_token=".length);
}

export function requireAuth(request, response, next) {
  try {
    const token = tokenFrom(request);
    if (!token)
      return response.status(401).json({ error: "Admin login required" });
    request.user = verifyAccessToken(decodeURIComponent(token));
    next();
  } catch {
    return response.status(401).json({ error: "Session expired" });
  }
}

export function optionalAuth(request, _response, next) {
  try {
    const token = tokenFrom(request);
    if (token) request.user = verifyAccessToken(decodeURIComponent(token));
  } catch {
    // Public endpoints continue without an invalid optional session.
  }
  next();
}

export function requireRole(...roles) {
  return (request, response, next) =>
    roles.includes(request.user.role)
      ? next()
      : response.status(403).json({ error: "Insufficient permissions" });
}
