/**
 * Copy invite URLs to the clipboard (best-effort).
 * Used when email delivery fails so admins can share the link manually.
 */
export async function copyInviteUrlsToClipboard(
  inviteUrls: Record<string, string> | undefined | null,
): Promise<boolean> {
  if (!inviteUrls) return false;
  const urls = Object.values(inviteUrls).filter(Boolean);
  if (urls.length === 0) return false;
  try {
    await navigator.clipboard.writeText(urls.join("\n"));
    return true;
  } catch {
    console.warn("Failed to copy invite URL(s) to clipboard");
    return false;
  }
}
