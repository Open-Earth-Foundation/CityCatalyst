/** Extract data from a nested object using a string path or array
 * Source: https://stackoverflow.com/a/22129960
 * @param path: string separated by . or an array of keys for each nested object
 * @param obj: object to be searched
 * @param separator: key separator for path (. by default)
 */
export function resolve(
  path: string | string[],
  obj: Record<string, any>,
  separator: string = ".",
) {
  var properties = Array.isArray(path) ? path : path.split(separator);
  return properties.reduce((prev, curr) => prev?.[curr], obj);
}

export function formatPercent(percent: number) {
  return Math.floor(percent * 100);
}

export function getCurrentVersion(): string {
  const version = process.env.APP_VERSION!;
  return version;
}

export function shortenNumber(number: number): string {
  if (number >= 1e9) {
    return (number / 1e9).toFixed(1); // Billion
  } else if (number >= 1e6) {
    return (number / 1e6).toFixed(1); // Million
  } else if (number >= 1e3) {
    return (number / 1e3).toFixed(1); // Thousand
  } else {
    return number.toString();
  }
}

export function getShortenNumberUnit(number: number): string {
  if (number >= 1e9) {
    return "B"; // Billion
  } else if (number >= 1e6) {
    return "M"; // Million
  } else if (number >= 1e3) {
    return "K"; // Thousand
  } else {
    return number.toString();
  }
}
export async function resolvePromisesSequentially(promises: Promise<any>[]) {
  const results = [];
  for (const promise of promises) {
    results.push(await promise);
  }

  return results;
}

export function nameToI18NKey(name: string): string {
  // remove all special characters and replace spaces with dashes
  return name.replaceAll(/[^\w\s-]/gi, "").replaceAll(" ", "-").toLowerCase();
}

