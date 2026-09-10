import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createUser, listUsers, login, logout, me } from "../controllers/authController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// The original login route had no rate limiting at all — an open door for
// credential stuffing / brute force against admin accounts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

const router = Router();
router.post("/login", loginLimiter, asyncHandler(login));
router.get("/me", requireAuth, me);
router.post("/logout", logout);
router.get("/users", requireAuth, requireRole("super_admin"), asyncHandler(listUsers));
router.post("/users", requireAuth, requireRole("super_admin"), asyncHandler(createUser));
export default router;