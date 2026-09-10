# Backend review — what changed and why

## New dependencies
Two packages are used that weren't in the original code:
```
npm install helmet express-rate-limit
```

## New/renamed environment variables
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` (optional) — replace the hardcoded email/password that used to live in `authController.js`. If unset, the app now just skips creating a super admin and logs a warning instead of silently using a real-looking password from source control.
- `JWT_SECRET` and `MONGODB_URI` are now **required** when `NODE_ENV=production` — the server throws at boot rather than running with the fallback dev secret.

## Live-breaking bugs fixed
1. **`matchEndAt`/`raidEndAt` stored as `Date`.** Over JSON these become ISO strings; the client does `endAt - Date.now()`, which is `NaN` against a string. Every countdown fetched from the API (as opposed to the same-machine BroadcastChannel) would freeze. Now stored as epoch-ms numbers, matching what the control panel already sends.
2. **Mass-assignment on match creation.** `new Match({ owner: request.user.sub, ...incoming })` spread the client's body *after* the explicit `owner`, so a client could pass its own `owner` and hijack a match. Fixed with an explicit whitelist (`WRITABLE_STATE_FIELDS`) applied on both create and update.
3. **Silent version-drop.** If the client's `version` wasn't strictly greater than the server's, the write was skipped but the endpoint still returned `200 OK` with the *old* score — a "successful" score update that never actually landed. Versioning is now server-owned and every authorized write is applied (last-write-wins), which is safe here because `canManageMatch` already limits writers to one owning admin (or a super admin) per match.
4. **`/state` could mark a match `completed`,** bypassing the clock-freeze and `endedEarly` logic in `/complete`. `status: "completed"` is now stripped from plain state saves; completion only happens through `completeMatch()`.
5. **`completeMatch` used a possibly-stale `matchRemainingMs`** if the clock was still running. It now recomputes the remaining time from `matchEndAt` at the moment of completion.

## Data model
- Removed the parallel `status`/`phase` fields (two stored sources of truth that could disagree). `status` is the only stored value now; `phase` (`upcoming` / `live` / `break` / `finished` / `completed`) is derived on every read via `derivePhase()`, so it can never drift.
- Added schema defaults matching the client's own defaults, so a match created via a partial payload doesn't end up with `undefined` fields.
- Added `min` bounds on scores/durations, an index on `owner` (used by `listMatches`) and `updatedAt` (used for sorting).
- Capped the embedded `events` array at 300 entries so a long match day can't grow a document toward MongoDB's 16MB document limit.

## API/response shape
- `GET /api/matches` (listing) now returns `summaryMatch()` — no `events` array, no `owner` ObjectId. Payload for a public listing page shouldn't carry another user's internal ID or a full raid log per match.
- `GET /api/matches/:id` (single match) still returns the full `events` log via `publicMatch()`, for a match detail/ticker page.

## Security
- Login is now rate-limited (10 attempts / 15 min per IP).
- Login runs `bcrypt.compare` even for unknown emails (against a dummy hash) so response timing doesn't reveal whether an email is registered.
- `helmet()` added for standard security headers; `crossOriginResourcePolicy` set to `cross-origin` since the API is intentionally called from a separate frontend origin.
- A general rate limit (120 req/min) added to all of `/api`.
- The CORS "allow `Origin: null`" behavior (needed for testing the control panel from a `file://` page) is now only trusted outside production — allowing it in production would let any local HTML file make authenticated requests using the browser's stored cookie.
- Every route is wrapped so thrown/rejected errors reach one central error handler, instead of some paths returning JSON errors and others crashing with Express's default HTML error page.
- Graceful shutdown on `SIGINT`/`SIGTERM`: closes the Mongo connection and stops accepting new connections before exiting.

## Left as-is, worth knowing about
- The embedded events array is fine for a single match's traffic; if you ever want cross-match analytics or expect a match to run for many hours with heavy event volume, move `events` to its own collection indexed by `matchId`.
- Auth still supports a cookie *and* a Bearer token. If the frontend already sends `Authorization: Bearer <token>` for every state-changing call, the cookie is only a convenience for page reloads — keep it that way rather than relying on the cookie for mutating requests, since cookie-based auth on state-changing endpoints needs CSRF protection that isn't in place here.
