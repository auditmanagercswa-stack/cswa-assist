export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_VERIFIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "AUCTION_ENDED"
  | "AUCTION_NOT_STARTED"
  | "BID_TOO_LOW"
  | "ALREADY_SOLD"
  | "RATE_LIMITED"
  | "PAYMENT_FAILED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_VERIFIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  AUCTION_ENDED: 409,
  AUCTION_NOT_STARTED: 409,
  BID_TOO_LOW: 422,
  ALREADY_SOLD: 409,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 402,
  INTERNAL: 500,
};

/** An error whose message is safe to show to end users. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError("BAD_REQUEST", m, d);
export const unauthenticated = (m = "Please sign in to continue.") => new AppError("UNAUTHENTICATED", m);
export const forbidden = (m = "You don't have permission to do that.") => new AppError("FORBIDDEN", m);
export const notFound = (m = "Not found.") => new AppError("NOT_FOUND", m);
export const conflict = (m: string, d?: unknown) => new AppError("CONFLICT", m, d);
export const notVerified = (m = "Your account is not verified yet. Complete KYC to continue.") =>
  new AppError("NOT_VERIFIED", m);
