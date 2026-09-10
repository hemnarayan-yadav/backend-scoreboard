// Wrap an async Express handler so a rejected promise is forwarded to
// next(error) instead of becoming an unhandled rejection. None of the
// original controllers had this, so a thrown ValidationError/CastError
// from Mongoose (or any other unexpected error) would hang the request or
// surface Express's default HTML error page to a JSON API client.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);