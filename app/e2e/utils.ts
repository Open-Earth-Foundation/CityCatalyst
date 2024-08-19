export const indexPageRegex =
  /^\/[a-z]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/;

export const regexForPath = (path: string) => {
  // Create a new regex by replacing the trailing slash in indexPageRegex with the provided path
  const newRegexSource = indexPageRegex.source.replace(/\/$/, path);
  return new RegExp(newRegexSource);
};
