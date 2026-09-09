import { Router } from "express";
import {
  appendEvents,
  completeMatch,
  getMatch,
  listMatches,
  saveState,
} from "../controllers/matchController.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

export function matchRoutes(io) {
  const router = Router();
  router.get("/", optionalAuth, listMatches);
  router.get("/:id", getMatch);
  router.put("/:id/state", requireAuth, (req, res) => saveState(req, res, io));
  router.post("/:id/events", requireAuth, (req, res) =>
    appendEvents(req, res, io),
  );
  router.post("/:id/complete", requireAuth, (req, res) =>
    completeMatch(req, res, io),
  );
  return router;
}
