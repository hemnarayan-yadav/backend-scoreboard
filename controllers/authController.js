import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { authCookie, clearAuthCookie, signAccessToken } from "../utils/auth.js";
import { config } from "../config.js";

// Syntactically valid bcrypt hash with no corresponding real password. Used
// only so an unknown-email login still pays the cost of a bcrypt compare —
// otherwise "unknown email" returns noticeably faster than "wrong password",
// which is a small but free username-enumeration leak.
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8i4Vy9wLU/hHfrHIGvzTP0mrLR.Wu6";

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
});

export async function ensureSuperAdmin() {
  const { email, password, name } = config.superAdmin;
  if (!email || !password) {
    console.warn("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping initial admin creation.");
    return;
  }
  const existing = await User.findOne({ email });
  if (existing) return;
  await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: "super_admin" });
  console.log(`Created initial super admin: ${email}`);
}

export async function login(request, response) {
  const { email, password } = request.body || {};
  const user = await User.findOne({ email: String(email || "").toLowerCase() }).select("+passwordHash");

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password || "", user?.passwordHash || DUMMY_HASH);
  } catch {
    passwordMatches = false;
  }

  if (!user || !user.active || !passwordMatches) {
    return response.status(401).json({ error: "Invalid email or password" });
  }

  const token = signAccessToken(user);
  response.setHeader("Set-Cookie", authCookie(token));
  response.json({ user: safeUser(user), token });
}

export function me(request, response) {
  response.json({ user: request.user });
}

export function logout(_request, response) {
  response.setHeader("Set-Cookie", clearAuthCookie());
  response.json({ ok: true });
}

export async function listUsers(_request, response) {
  response.json(await User.find().sort({ createdAt: -1 }).select("name email role active createdAt"));
}

export async function createUser(request, response) {
  const { name, email, password, role = "admin" } = request.body || {};
  if (!name || !email || !password) {
    return response.status(400).json({ error: "Name, email and password are required" });
  }
  if (password.length < 8) {
    return response.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!["admin", "super_admin"].includes(role)) {
    return response.status(400).json({ error: "Invalid role" });
  }

  try {
    const user = await User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 12) });
    response.status(201).json({ user: safeUser(user) });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "Email already exists" });
    throw error; // unexpected — let the central error handler log it
  }
}