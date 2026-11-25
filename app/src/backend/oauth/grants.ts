import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";

/**
 * Whether a user's authorization of an OAuth client is still in place, and
 * records that it was just used.
 *
 * This is what makes revoking an app take effect on the next request, even
 * though access tokens stay valid until they expire. It reads the grant from
 * this app's own database, so it only works while the grants live here. When
 * the authorization server moves (CC-1280), revocation is bounded by the access
 * token lifetime instead (CC-1277), and this function goes away or becomes a
 * call to the identity service.
 *
 * Deleting an OAuth client deletes its grants (ON DELETE CASCADE), so an
 * active grant also means the client still exists.
 */
export async function isGrantActive(
  clientId: string,
  userId: string,
): Promise<boolean> {
  const grant = await OAuthClientAuthz.findOne({ where: { clientId, userId } });
  if (!grant) return false;
  await grant.update({ lastUsed: new Date() });
  return true;
}
