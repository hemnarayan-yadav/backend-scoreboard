import { Match } from "../models/Match.js";
import { canManageMatch, publicMatch, summaryMatch } from "../utils/match.js";

// Every field a client is allowed to set via PUT /:id/state. Anything else
// in the request body — most importantly `owner` and `_id` — is ignored.
// The previous version spread the raw request body into `new Match({owner:
// request.user.sub, ...incoming})`; because the spread came *after* the
// explicit owner, a client could pass its own `owner` in the body and take
// over (or disown) a match.
const WRITABLE_STATE_FIELDS = [
  "nameA", "nameB", "scoreA", "scoreB",
  "half", "sideSwapped", "endedEarly",
  "halfDurationMs", "raidDurationMs",
  "matchRunning", "matchRemainingMs", "matchEndAt",
  "raidRunning", "raidRemainingMs", "raidEndAt",
  "overlayText", "status",
];

function pickWritableFields(source = {}) {
  const result = {};
  for (const key of WRITABLE_STATE_FIELDS) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  // Completing a match has to go through completeMatch() so the clock gets
  // frozen and `endedEarly` gets computed consistently — never let a plain
  // state save mark a match complete behind that endpoint's back.
  if (result.status === "completed") delete result.status;
  return result;
}

export async function listMatches(request, response) {
  const filter = request.user?.role === "super_admin" ? {} : request.user ? { owner: request.user.sub } : {};
  const matches = await Match.find(filter).sort({ updatedAt: -1 }).lean();
  const list = matches.map(summaryMatch).filter((match) => !request.query.status || match.phase === request.query.status);

  // The public home page polls this endpoint every 5s per browser tab —
  // with several viewers behind one venue wifi IP that adds up fast. A
  // short public cache lets a CDN/shared browser cache absorb duplicate
  // requests instead of every poll reaching Mongo. Never cache a
  // logged-in admin's own-matches view, since that response shape depends
  // on who's asking.
  if (!request.user) response.set("Cache-Control", "public, max-age=3");
  response.json(list);
}

export async function getMatch(request, response) {
  const match = await Match.findById(request.params.id).lean();
  if (!match) return response.status(404).json({ error: "Match not found" });
  response.json(publicMatch(match));
}

export async function saveState(request, response, io) {
  const incoming = pickWritableFields(request.body.state || request.body);
  let match = await Match.findById(request.params.id);

  if (match && !canManageMatch(request.user, match)) {
    return response.status(403).json({ error: "Match belongs to another admin" });
  }

  if (!match) {
    // Mirrors the product rule, not just a hidden button: super admins run
    // the admin roster, admins run matches. Enforced here so it holds even
    // if a super admin's session somehow reaches this endpoint directly.
    if (request.user.role !== "admin") {
      return response.status(403).json({ error: "Only admins can create matches" });
    }
    match = new Match({ _id: request.params.id, owner: request.user.sub, ...incoming });
  } else {
    match.set(incoming);
  }

  // Versioning here is informational (lets a client detect it's looking at
  // stale data), not a concurrency gate. The previous implementation
  // rejected the write outright whenever the client's version wasn't
  // strictly greater than the server's, but still returned 200 with the
  // *old* state — so a score update could silently vanish while looking
  // like it succeeded. Since canManageMatch() already restricts writes to
  // a single owning admin (or a super admin), last-write-wins is the
  // correct and much safer behavior for a live match.
  match.version += 1;
  await match.save();

  const payload = publicMatch(match);
  io.to(`match:${request.params.id}`).emit("state:update", payload);
  response.json(payload);
}

export async function appendEvents(request, response, io) {
  const match = await Match.findById(request.params.id);
  if (!match) {
    return response.status(404).json({ error: "Match not found — save its state before sending events" });
  }
  if (!canManageMatch(request.user, match)) {
    return response.status(403).json({ error: "Match belongs to another admin" });
  }

  const events = Array.isArray(request.body.events) ? request.body.events : [request.body];
  const added = [];
  for (const event of events) {
    if (!event?.clientEventId || !event?.type) continue;
    if (match.appliedEventIds.includes(event.clientEventId)) continue;
    match.events.push(event);
    match.appliedEventIds.push(event.clientEventId);
    added.push(event);
  }

  if (added.length) {
    await match.save();
    io.to(`match:${request.params.id}`).emit("events:new", added);
  }
  response.json({ added });
}

export async function adjustScore(request, response, io) {
  const { team, amount } = request.body || {};
  if (!["A", "B"].includes(team)) return response.status(400).json({ error: "`team` must be A or B" });
  if (!Number.isInteger(amount) || amount < -10 || amount > 10 || amount === 0) {
    return response.status(400).json({ error: "`amount` must be a non-zero integer between -10 and 10" });
  }

  const scoreField = `score${team}`;
  const filter =
    request.user.role === "super_admin"
      ? { _id: request.params.id }
      : { _id: request.params.id, owner: request.user.sub };

  const match = await Match.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          [scoreField]: { $max: [0, { $add: [{ $ifNull: [`$${scoreField}`, 0] }, amount] }] },
          status: { $cond: [{ $eq: ["$status", "upcoming"] }, "live", "$status"] },
          version: { $add: [{ $ifNull: ["$version", 0] }, 1] },
        },
      },
    ],
    { new: true },
  );

  if (!match) {
    const exists = await Match.exists({ _id: request.params.id });
    return response.status(exists ? 403 : 404).json({
      error: exists ? "Match belongs to another admin" : "Match not found",
    });
  }

  const payload = publicMatch(match);
  io.to(`match:${request.params.id}`).emit("state:update", payload);
  response.json(payload);
}

export async function completeMatch(request, response, io) {
  const match = await Match.findById(request.params.id);
  if (!match) return response.status(404).json({ error: "Match not found" });
  if (!canManageMatch(request.user, match)) {
    return response.status(403).json({ error: "Match belongs to another admin" });
  }
  if (match.status === "completed") {
    // Idempotent: a retried network request shouldn't error or re-emit.
    return response.json(publicMatch(match));
  }

  // Freeze whichever clock is still ticking using the match's own stored
  // endAt, rather than trusting a possibly-stale matchRemainingMs that was
  // only last updated the previous time the clock was paused.
  const matchRemainingMs = match.matchRunning ? Math.max(0, match.matchEndAt - Date.now()) : match.matchRemainingMs;
  const raidRemainingMs = match.raidRunning ? Math.max(0, match.raidEndAt - Date.now()) : match.raidRemainingMs;

  match.set({
    status: "completed",
    matchRunning: false, matchEndAt: null, matchRemainingMs,
    raidRunning: false, raidEndAt: null, raidRemainingMs,
    overlayText: "FULL TIME",
    endedEarly: request.body?.endedEarly === true || match.half !== 2 || matchRemainingMs > 0,
  });
  match.version += 1;
  await match.save();

  const payload = publicMatch(match);
  io.to(`match:${request.params.id}`).emit("state:update", payload);
  response.json(payload);
}
