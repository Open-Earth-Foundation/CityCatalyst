import createHttpError from "http-errors";

/**
 * Reads an `application/x-www-form-urlencoded` body, which is what the OAuth
 * endpoints accept (RFC 6749 section 3.2, RFC 7009, RFC 7662).
 *
 * @throws a 415 for any other content type.
 */
export async function readForm(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    throw createHttpError.UnsupportedMediaType(
      "Send the request as application/x-www-form-urlencoded.",
    );
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of (await req.formData()).entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}
