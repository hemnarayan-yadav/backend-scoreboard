import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { cookieOptions, signAccessToken } from "../utils/auth.js";

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
});

export async function ensureSuperAdmin() {
  const email = "veeryadu57@gmail.com";
  const existing = await User.findOne({ email });
  if (existing) return;
  await User.create({
    name: "Super Admin",
    email,
    passwordHash: await bcrypt.hash("Veer#1423", 12),
    role: "super_admin",
  });
  console.log(`Created initial super admin: ${email}`);
}

export async function login(request, response) {
  const { email, password } = request.body || {};
  const user = await User.findOne({
    email: String(email || "").toLowerCase(),
  }).select("+passwordHash");
  if (
    !user ||
    !user.active ||
    !(await bcrypt.compare(password || "", user.passwordHash))
  )
    return response.status(401).json({ error: "Invalid email or password" });
  const token = signAccessToken(user);
  response.setHeader(
    "Set-Cookie",
    `kabaddi_token=${encodeURIComponent(token)}; Max-Age=28800; ${cookieOptions()}`,
  );
  response.json({ user: safeUser(user), token });
}

export function me(request, response) {
  response.json({ user: request.user });
}

export function logout(_request, response) {
  response.setHeader(
    "Set-Cookie",
    `kabaddi_token=; Max-Age=0; ${cookieOptions()}`,
  );
  response.json({ ok: true });
}

export async function listUsers(_request, response) {
  response.json(
    await User.find()
      .sort({ createdAt: -1 })
      .select("name email role active createdAt"),
  );
}

export async function createUser(request, response) {
  const { name, email, password, role = "admin" } = request.body || {};
  if (!name || !email || !password)
    return response
      .status(400)
      .json({ error: "Name, email and password are required" });
  if (!["admin", "super_admin"].includes(role))
    return response.status(400).json({ error: "Invalid role" });
  try {
    const user = await User.create({
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 12),
    });
    response.status(201).json({ user: safeUser(user) });
  } catch (error) {
    response
      .status(error.code === 11000 ? 409 : 400)
      .json({
        error:
          error.code === 11000
            ? "Email already exists"
            : "Unable to create admin",
      });
  }
}
