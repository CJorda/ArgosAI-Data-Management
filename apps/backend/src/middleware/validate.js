import { HttpError } from "../utils/httpError.js";

export function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(
        new HttpError(400, "Validation failed", result.error.flatten())
      );
    }

    req[source] = result.data;
    return next();
  };
}
