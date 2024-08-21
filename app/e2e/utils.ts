export const indexPageRegex =
  /\/[a-z]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//;

export const regexForPath = (path: string) => {
  // Ensure the path does not have leading slashes and ends with a slash
  const normalizedPath = path.replace(/^\/|\/$/g, "") + "/";

  // Combine the indexPageRegex with the normalized path
  const newRegexSource = `${indexPageRegex.source}${normalizedPath}$`;

  return new RegExp(newRegexSource);
};
