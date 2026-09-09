import { Match } from "../models/Match.js";
import { canManageMatch, getPhase, publicMatch } from "../utils/match.js";

export async function listMatches(request, response) {
  const filter =
    request.user?.role === "super_admin"
      ? {}
      : request.user
        ? { owner: request.user.sub }
        : {};
  const matches = await Match.find(filter).sort({ updatedAt: -1 }).lean();
  const visible = matches
    .map((match) => ({ ...match, phase: getPhase(match) }))
    .filter(
      (match) => !request.query.status || request.query.status === match.phase,
    );
  response.json(visible.map(publicMatch));
}

export async function getMatch(request, response) {
  const match = await Match.findById(request.params.id).lean();
  if (!match) return response.status(404).json({ error: "Match not found" });
  response.json(publicMatch(match));
}

export async function saveState(request, response, io) {
  const incoming = request.body.state || request.body;
  const version = Number(request.body.version ?? incoming.version ?? 0);
  let match = await Match.findById(request.params.id);
  if (match && !canManageMatch(request.user, match))
    return response
      .status(403)
      .json({ error: "Match belongs to another admin" });
  if (!match)
    match = new Match({
      _id: request.params.id,
      owner: request.user.sub,
      ...incoming,
      version,
      status: incoming.status || "upcoming",
      phase: incoming.phase || "upcoming",
    });
  else if (version > match.version) {
    const fields = { ...incoming, version };
    delete fields.events;
    delete fields.appliedEventIds;
    delete fields._id;
    delete fields.owner;
    match.set(fields);
  }
  await match.save();
  const payload = publicMatch(match);
  io.to(`match:${request.params.id}`).emit("state:update", payload);
  response.json(payload);
}

export async function appendEvents(request, response, io) {
  let match = await Match.findById(request.params.id);
  if (match && !canManageMatch(request.user, match))
    return response
      .status(403)
      .json({ error: "Match belongs to another admin" });
  const events = Array.isArray(request.body.events)
    ? request.body.events
    : [request.body];
  if (!match)
    match = new Match({
      _id: request.params.id,
      owner: request.user.sub,
      events: [],
      appliedEventIds: [],
      status: "upcoming",
      phase: "upcoming",
    });
  const added = [];
  for (const event of events)
    if (
      event.clientEventId &&
      !match.appliedEventIds.includes(event.clientEventId)
    ) {
      match.events.push(event);
      match.appliedEventIds.push(event.clientEventId);
      added.push(event);
    }
  await match.save();
  if (added.length)
    io.to(`match:${request.params.id}`).emit("events:new", added);
  response.json({ added });
}

export async function completeMatch(request, response, io) {
  const current = await Match.findById(request.params.id);
  if (!current) return response.status(404).json({ error: "Match not found" });
  if (!canManageMatch(request.user, current))
    return response
      .status(403)
      .json({ error: "Match belongs to another admin" });
  const endedEarly =
    request.body?.endedEarly === true ||
    current.half !== 2 ||
    (current.matchRemainingMs || 0) > 0;
  current.set({
    status: "completed",
    phase: "completed",
    matchRunning: false,
    matchEndAt: null,
    raidRunning: false,
    raidEndAt: null,
    overlayText: "FULL TIME",
    endedEarly,
  });
  await current.save();
  const payload = publicMatch(current);
  io.to(`match:${request.params.id}`).emit("state:update", payload);
  response.json(payload);
}
