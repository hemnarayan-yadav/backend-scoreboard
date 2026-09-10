// A match only ever has one of three *stored* statuses. "break" (half-time)
// and "finished" (full time, not yet marked complete) are presentation
// states derived from status + overlayText, computed fresh on every read so
// they can never drift out of sync with the stored status the way two
// parallel stored fields could.
export function derivePhase(match) {
  if (match.status === "completed") return "completed";
  if (match.status !== "live") return "upcoming";
  if (match.overlayText === "HALF TIME") return "break";
  if (match.overlayText === "FULL TIME") return "finished";
  return "live";
}

// Full match payload for a single-match view (e.g. the live match page),
// including its event log.
export function publicMatch(match) {
  if (!match) return null;
  const payload = match.toObject ? match.toObject() : { ...match };
  payload.phase = derivePhase(payload);
  delete payload.appliedEventIds;
  return payload;
}

// Trimmed payload for match *listings*. The public site and display screen
// never need the raid-by-raid event log or the owning admin's ObjectId, and
// the event log is exactly the field most likely to grow large.
export function summaryMatch(match) {
  const payload = publicMatch(match);
  delete payload.events;
  delete payload.owner;
  delete payload.__v;
  return payload;
}

export function canManageMatch(user, match) {
  return user.role === "super_admin" || match.owner?.toString() === user.sub;
}