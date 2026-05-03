export function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.originalUrl} does not exist`
  });
}

export function errorHandler(err, _req, res, _next) {
  const dbErrorCodes = new Set(["28P01", "3D000", "ECONNREFUSED", "08001", "08006"]);
  const isDbUnavailable = dbErrorCodes.has(err?.code);
  const status = err.status || (isDbUnavailable ? 503 : 500);
  const message = isDbUnavailable
    ? "Database unavailable. Check PostgreSQL status and DATABASE_URL credentials."
    : err.message || "Unexpected error";

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : "Request Error",
    message,
    details: err.details || null
  });
}
