export interface ProblemExtra {
  detail?: string;
  errors?: { path: string; message: string }[];
}

/** A failure with a stable machine-readable `code`, returned as problem details. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly extra: ProblemExtra = {},
  ) {
    super(title);
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found.`);
