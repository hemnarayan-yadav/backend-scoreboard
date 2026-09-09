export function getPhase(match) {
  if (match.status === "completed" || match.phase === "completed")
    return "completed";
  if (match.status === "finished" || match.phase === "finished") return "live";
  if (
    match.status === "break" ||
    match.phase === "break" ||
    match.overlayText === "HALF TIME"
  )
    return "break";
  if (match.status === "live" || match.phase === "live" || match.matchRunning)
    return "live";
  return "upcoming";
}

export function publicMatch(match) {
  if (!match) return null;
  const payload = match.toObject ? match.toObject() : { ...match };
  payload.phase = getPhase(payload);
  delete payload.appliedEventIds;
  return payload;
}

export function canManageMatch(user, match) {
  return (
    user.role === "super_admin" ||
    !match.owner ||
    match.owner.toString() === user.sub
  );
}
