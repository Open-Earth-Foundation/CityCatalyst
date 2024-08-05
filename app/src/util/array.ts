// use with filter to exclude null-ish values from the type as well as contents of an array
// for example `const cleanList = list.filter(notEmpty);`
export function notEmpty<TValue>(
  value: TValue | null | undefined,
): value is TValue {
  return value !== null && value !== undefined;
}
