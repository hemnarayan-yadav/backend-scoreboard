import { Router } from "express";
import {
  createUser,
  listUsers,
  login,
  logout,
  me,
} from "../controllers/authController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/logout", logout);
router.get("/users", requireAuth, requireRole("super_admin"), listUsers);
router.post("/users", requireAuth, requireRole("super_admin"), createUser);
export default router;
