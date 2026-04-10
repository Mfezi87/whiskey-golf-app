export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(401, message, details);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, message, details);
  }
}
