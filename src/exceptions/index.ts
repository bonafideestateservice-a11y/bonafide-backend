export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER = 500,
}

export class ApiError extends Error {
  public readonly statusCode: HttpStatusCode;

  constructor(statusCode: HttpStatusCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(HttpStatusCode.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(HttpStatusCode.FORBIDDEN, message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(HttpStatusCode.CONFLICT, message);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Bad request") {
    super(HttpStatusCode.BAD_REQUEST, message);
  }
}

export class InternalServerError extends ApiError {
  constructor(message = "Internal server error") {
    super(HttpStatusCode.INTERNAL_SERVER, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(HttpStatusCode.NOT_FOUND, message);
  }
}