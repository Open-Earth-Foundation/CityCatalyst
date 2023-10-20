/** Extract data from a nested object using a string path or array
 * Source: https://stackoverflow.com/a/22129960
 * @param path: string separated by . or an array of keys for each nested object
 * @param obj: object to be searched
 * @param separator: key separator for path (. by default)
 */
export function resolve(
  path: string | string[],
  obj: Record<string, any>,
  separator: string = "."
) {
  var properties = Array.isArray(path) ? path : path.split(separator);
  return properties.reduce((prev, curr) => prev?.[curr], obj);
}

export function formatPercent(percent: number) {
  return Math.floor(percent * 100);
}
