/**
 * @swagger
 * /api/v0/user/clients/{client}:
 *   get:
 *     tags:
 *       - User Clients
 *     summary: Get OAuth client authorization for current user
 *     parameters:
 *       - in: path
 *         name: client
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client authorization returned.
 *       401:
 *         description: Not signed in.
 *       404:
 *         description: Authorization not found.
 *       500:
 *         description: OAuth not enabled.
 *   delete:
 *     tags:
 *       - User Clients
 *     summary: Revoke OAuth client authorization for current user
 *     parameters:
 *       - in: path
 *         name: client
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Authorization revoked.
 *       401:
 *         description: Not signed in.
 *       404:
 *         description: Authorization not found.
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
import type { Model } from "sequelize";

/** Return client authorization information for this user */

export const GET = apiHandler(async (_req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  const { client: clientId } = params;

  const authz = await OAuthClientAuthz.findOne({
    where: { userId: session.user.id, clientId },
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

  if (!authz) {
    throw createHttpError.NotFound("No client authorization with that id");
  }

  const client = authz.get("client")! as Model;
  const names = Object.fromEntries(
    (client as any).i18n?.map((r: any) => [r.language, r.name]) ?? [],
  );
  const descriptions = Object.fromEntries(
    (client as any).i18n?.map((r: any) => [r.language, r.description]) ?? [],
  );

  const {
    clientId: ignoreCI,
    userId: ignoreUI,
    ...authzData
  } = authz.get({ plain: true });
  const { i18n: ignoreI18n, ...clientData } = client.get({ plain: true });
  const data = {
    ...authzData,
    client: {
      ...clientData,
      name: names,
      description: descriptions,
    },
  };

  return NextResponse.json({ data });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  const { client: clientId } = params;

  const authz = await OAuthClientAuthz.findOne({
    where: { userId: session.user.id, clientId },
  });

  if (!authz) {
    throw createHttpError.NotFound("No client authorization with that id");
  }

  await authz.destroy();

  return new NextResponse(null, { status: 204 });
});
