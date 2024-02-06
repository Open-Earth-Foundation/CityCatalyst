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
    return "";
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
  return name
    .replaceAll(/[^\w\s-]/gi, "")
    .replaceAll(" ", "-")
    .toLowerCase();
}

export const fileEndingToMIMEType: Record<string, string> = {
  csv: "text/csv",
  json: "application/json",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.ms-excel",
  default: "application/x-binary",
};

export function base64ToFile(base64String: any, filename: string) {
  const arr = base64String.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  const fileBlob = new Blob([u8arr], { type: mime });
  const file = new File([fileBlob], filename, { type: mime });
  return file;
}

export function appendFileToFormData(base64String: string, filename: string) {
  return base64ToFile(base64String, filename);
}

export function bytesToMB(bytes: number): string {
  return (bytes / 1048576).toFixed(2) + " MB";
}
export function groupBy<T>(
  list: T[],
  lambda: (elem: T) => string,
): Record<string, T[]> {
  return list.reduce(
    (acc, elem) => {
      const key = lambda(elem);
      acc[key] = acc[key] || [];
      acc[key].push(elem);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}
