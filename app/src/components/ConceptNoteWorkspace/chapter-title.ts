/** Preserve the funder's section references when a form supplies its own. */
export function chapterDisplayTitle(title: string, index: number): string {
  const hasReference =
    /^(?:\d+(?:\.\d+)*[.)]?\s+|Annex\s+[A-Z0-9](?:[.\s]|$))/i;
  return hasReference.test(title) ? title : `${index + 1}. ${title}`;
}
