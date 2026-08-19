/**
 * @swagger
 * /api/v1/user/clients:
 *   get:
 *     tags:
 *       - user
 *       - clients
 *     operationId: getUserClients
 *     summary: List OAuth client authorizations for current user
 *     description: Retrieves all OAuth client authorizations for the current user. Returns a list of authorized clients with their metadata, scopes, and internationalized names and descriptions. Requires authentication and OAuth feature flag to be enabled.
 *     responses:
 *       200:
 *         description: Client authorizations returned.
 *       401:
 *         description: Not signed in.
 *       500:
 *         description: OAuth not enabled.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientI18N } from "@/models/OAuthClientI18N";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";

type OAuthClientWithI18n = OAuthClient & { i18n?: OAuthClientI18N[] };

/** Return client authorization information for this user */

export const GET = apiHandler(async (_req, { session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  const rows = await OAuthClientAuthz.findAll({
    where: { userId: session.user.id },
    include: [
      {
        model: OAuthClient,
        as: "client",
        required: true,
        include: [
          {
            model: OAuthClientI18N,
            as: "i18n",
            // keep it lightweight
            attributes: ["language", "name"],
            required: false,
          },
        ],
      },
    ],
    subQuery: false,
  });

  // Collapse i18n rows into a language->name object
  const data = rows.map((authz) => {
    const client = authz.get("client")! as OAuthClientWithI18n;
    const names = Object.fromEntries(
      client.i18n?.map((r) => [r.language, r.name]) ?? [],
    );
    const descriptions = Object.fromEntries(
      client.i18n?.map((r) => [r.language, r.description]) ?? [],
    );

    /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to omit clientId/userId/i18n from the returned objects */
    const {
      clientId: ignoreCI,
      userId: ignoreUI,
      ...authzData
    } = authz.get({ plain: true });
    const { i18n: ignoreI18n, ...clientData } = client.get({
      plain: true,
    }) as ReturnType<typeof client.get> & { i18n?: unknown };
    /* eslint-enable @typescript-eslint/no-unused-vars */

    return {
      ...authzData,
      client: {
        ...clientData,
        name: names,
        description: descriptions,
      },
    };
  });

  return NextResponse.json({ data });
});
