import { Router } from "express";
import rateLimit from "express-rate-limit";
import { appendEvents, completeMatch, getMatch, listMatches, saveState } from "../controllers/matchController.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// 60/min is generous for real scoring pace (each score tap is one state
// save + one event log = 2 requests, so ~30 taps/min) while still bounding
// a runaway client or scripted abuse. Reads aren't behind this — a public
// live-scores site legitimately gets many concurrent viewers polling from
// the same venue IP, and that traffic shouldn't compete with write
// protection for the same budget.
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many updates — slow down a moment." },
});

export function matchRoutes(io) {
  const router = Router();
  router.get("/", optionalAuth, asyncHandler(listMatches));
  router.get("/:id", asyncHandler(getMatch));
  router.put("/:id/state", requireAuth, mutationLimiter, asyncHandler((req, res) => saveState(req, res, io)));
  router.post("/:id/events", requireAuth, mutationLimiter, asyncHandler((req, res) => appendEvents(req, res, io)));
  router.post("/:id/complete", requireAuth, mutationLimiter, asyncHandler((req, res) => completeMatch(req, res, io)));
  return router;
}