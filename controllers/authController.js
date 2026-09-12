import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Match } from "../models/Match.js";
import { authCookie, clearAuthCookie, signAccessToken } from "../utils/auth.js";
import { config } from "../config.js";

// Syntactically valid bcrypt hash with no corresponding real password. Used
// only so an unknown-email login still pays the cost of a bcrypt compare —
// otherwise "unknown email" returns noticeably faster than "wrong password",
// which is a small but free username-enumeration leak.
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8i4Vy9wLU/hHfrHIGvzTP0mrLR.Wu6";

const safeUser = (user) => ({
  id: String(user._id),
  _id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  createdAt: user.createdAt,
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
  const users = await User.find().sort({ createdAt: -1 }).select("name email role active createdAt").lean();
  const counts = await Match.aggregate([{ $group: { _id: "$owner", total: { $sum: 1 } } }]);
  const matchCountByOwner = new Map(counts.map((row) => [String(row._id), row.total]));
  response.json(users.map((user) => ({ ...safeUser(user), matchCount: matchCountByOwner.get(String(user._id)) || 0 })));
}

// Backs the Super Admin console's detail drawer: a single admin's profile
// plus how many matches they've run, broken down by state. One aggregate
// query rather than three separate countDocuments() round trips.
export async function getUser(request, response) {
  const user = await User.findById(request.params.id).select("name email role active createdAt");
  if (!user) return response.status(404).json({ error: "Admin not found" });

  const [stats] = await Match.aggregate([
    { $match: { owner: user._id } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        live: { $sum: { $cond: [{ $eq: ["$status", "live"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      },
    },
  ]);

  response.json({
    user: safeUser(user),
    stats: { total: stats?.total || 0, live: stats?.live || 0, completed: stats?.completed || 0 },
  });
}

export async function setUserActive(request, response) {
  const { active } = request.body || {};
  if (typeof active !== "boolean") return response.status(400).json({ error: "`active` must be true or false" });
  if (request.params.id === request.user.sub) {
    return response.status(400).json({ error: "You can't deactivate your own account" });
  }

  const user = await User.findByIdAndUpdate(request.params.id, { active }, { new: true }).select(
    "name email role active createdAt",
  );
  if (!user) return response.status(404).json({ error: "Admin not found" });
  response.json({ user: safeUser(user) });
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
