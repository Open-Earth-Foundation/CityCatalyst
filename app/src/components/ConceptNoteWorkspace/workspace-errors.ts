/** Distinguish unavailable evidence from a retryable revision conflict. */
export function documentWorkspaceErrorKind(
  error: unknown,
): "source_unavailable" | "stale" | "other" {
  if (!error || typeof error !== "object") return "other";
  const strings: string[] = [];
  function read(value: unknown, depth: number) {
    if (typeof value === "string") strings.push(value);
    else if (value && typeof value === "object" && depth < 4) {
      const record = value as Record<string, unknown>;
      for (const key of ["data", "error", "detail", "title", "message", "code"])
        read(record[key], depth + 1);
    }
  }
  read(error, 0);
  if (
    strings.some((value) =>
      /(?:supporting|accepted) source.*(?:unavailable|changed)|source[_ -]unavailable|document[_ -](?:withdrawn|superseded)/i.test(
        value,
      ),
    )
  )
    return "source_unavailable";
  return "status" in error && error.status === 409 ? "stale" : "other";
}
