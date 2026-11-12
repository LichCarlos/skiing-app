export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  traceId: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly traceId: string | null;
  readonly details: readonly ApiErrorDetail[];

  constructor(
    message: string,
    options: {
      status: number;
      code: number | null;
      traceId: string | null;
      details?: readonly ApiErrorDetail[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.details = options.details ?? [];
  }
}
