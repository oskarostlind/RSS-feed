export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function formatErrorCause(error: unknown): string | null {
  if (!(error instanceof Error) || !("cause" in error)) {
    return null;
  }

  const { cause } = error;

  if (cause === undefined || cause === null) {
    return null;
  }

  return formatErrorMessage(cause);
}
