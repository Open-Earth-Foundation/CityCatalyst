export type ParagraphDiff =
  | { type: "common"; text: string }
  | { type: "change"; before: string; after: string };

/** Presentation only: backend change IDs and atomic approval stay untouched. */
export function paragraphDiff(before: string, after: string): ParagraphDiff[] {
  const old = before.split(/\n\s*\n/);
  const next = after.split(/\n\s*\n/);
  // Bound work for unusually large imported chapters.
  if (old.length > 256 || next.length > 256)
    return [{ type: "change", before, after }];
  const lcs = Array.from(
    { length: old.length + 1 },
    () => new Uint16Array(next.length + 1),
  );
  for (let i = old.length - 1; i >= 0; i--)
    for (let j = next.length - 1; j >= 0; j--)
      lcs[i][j] =
        old[i] === next[j]
          ? 1 + lcs[i + 1][j + 1]
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const result: ParagraphDiff[] = [];
  let removed: string[] = [],
    added: string[] = [],
    common: string[] = [];
  const flushChange = () => {
    if (removed.length || added.length)
      result.push({
        type: "change",
        before: removed.join("\n\n"),
        after: added.join("\n\n"),
      });
    removed = [];
    added = [];
  };
  const flushCommon = () => {
    if (common.length)
      result.push({ type: "common", text: common.join("\n\n") });
    common = [];
  };
  let i = 0,
    j = 0;
  while (i < old.length || j < next.length) {
    if (i < old.length && j < next.length && old[i] === next[j]) {
      flushChange();
      common.push(old[i]);
      i++;
      j++;
    } else {
      flushCommon();
      if (
        i < old.length &&
        (j === next.length || lcs[i + 1][j] >= lcs[i][j + 1])
      )
        removed.push(old[i++]);
      else added.push(next[j++]);
    }
  }
  flushChange();
  flushCommon();
  return result;
}
