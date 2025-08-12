import "@/util/big_int_json";

import { AppSession, Auth } from "@/lib/auth";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { StreamingTextResponse } from "ai";
import OpenAI from "openai";

import { db } from "@/models";
import { ValidationError } from "sequelize";
import { ManualInputValidationError } from "@/lib/custom-errors/manual-input-error";
import { logger } from "@/services/logger";
import { Organization } from "@/models/Organization";
import { Roles } from "@/util/types";
import jwt from "jsonwebtoken";
import { FeatureFlags, hasFeatureFlag } from "./feature-flags";
import { OAuthClient } from "@/models/OAuthClient";

export type ApiResponse = NextResponse | StreamingTextResponse;

export type NextHandler = (
  req: NextRequest,
  props: {
    params: Record<string, string>;
    session: AppSession | null;
    searchParams: URLSearchParams;
  },
) => Promise<ApiResponse>;

// TODO extend this to other endpoints that need to skip the frozen check
const shouldSkipFrozenCheckForPublicInventory = async (
  req: NextRequest,
  urlPath: string,
): Promise<boolean> => {
  if (req.method !== "PATCH") return false;
  if (!urlPath.startsWith("/api/v0/inventory/")) return false;

  try {
    const clonedReq = req.clone();
    const body = await clonedReq.json();
    const allowedKeys = ["isPublic"];
    const keys = Object.keys(body);

    // Only allow if it's strictly a PATCH with { isPublic: true/false }
    return (
      keys.length === 1 &&
      allowedKeys.includes(keys[0]) &&
      typeof body[keys[0]] === "boolean"
    );
  } catch {
    return false;
  }
};

const organizationContextCheck = async ({
  req,
  session,
  props,
}: {
  req: NextRequest;
  props: { params: Promise<Record<string, string>> };
  session: AppSession | null;
}) => {
  const urlPath = new URL(req.url).pathname.toLowerCase();
  const skipFrozenCheck =
    urlPath.includes("invites") ||
    urlPath.includes("invitations") ||
    (await shouldSkipFrozenCheckForPublicInventory(req, urlPath));
  let userIsOEFAdmin = session?.user.role === Roles.Admin;
  const isEditMethod = ["PUT", "PATCH", "DELETE", "POST"].includes(req.method);

  let organizationData: Organization | null | undefined = null;

  if (!skipFrozenCheck && isEditMethod && !userIsOEFAdmin) {
    let organization: string | null = null;
    let project: string | null = null;
    let city: string | null = null;
    let inventory: string | null = null;

    const params = await props.params;

    if (params) {
      organization = params.organization || null;
      project = params.project || null;
      city = params.city || null;
      inventory = params.inventory || null;
    }

    if (organization) {
      organizationData = await Organization.findByPk(organization, {
        include: [{ model: db.models.Theme, as: "theme" }],
      });
      if (!organizationData) {
        throw new createHttpError.NotFound("organization-not-found");
      }
    } else if (project) {
      // If project is provided, we can still fetch the organization
      const projectData = await db.models.Project.findByPk(project, {
        include: [{ model: Organization, as: "organization" }],
      });
      if (!projectData || !projectData.organization) {
        throw new createHttpError.NotFound("project-or-organization-not-found");
      }
      organizationData = projectData?.organization;
    } else if (city) {
      // If city is provided, we can still fetch the organization
      const cityData = await db.models.City.findByPk(city, {
        include: [
          {
            model: db.models.Project,
            as: "project",
            include: [
              {
                model: db.models.Organization,
                as: "organization",
              },
            ],
          },
        ],
      });
      organizationData = cityData?.project?.organization;
    } else if (inventory) {
      const inventoryData = await db.models.Inventory.findByPk(inventory, {
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                include: [
                  {
                    model: db.models.Organization,
                    as: "organization",
                  },
                ],
              },
            ],
          },
        ],
      });
      organizationData = inventoryData?.city?.project?.organization;
    }
  }

  if (organizationData?.active === false && !userIsOEFAdmin && isEditMethod) {
    return NextResponse.json(
      { message: "Organization is frozen" },
      { status: 403 },
    );
  }
};

function getBearerToken(header: string): any {
  const match = header.match(/^Bearer\s+(.*)$/);
  if (!match) {
    throw new createHttpError.BadRequest(`Malformed Authorization header`);
  }
  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }
  return jwt.verify(match[1], process.env.VERIFICATION_TOKEN_SECRET);
}

async function makeOAuthUserSession(token: any): Promise<AppSession> {
  const userId = token.sub;
  const user = await db.models.User.findOne({ where: { userId } });
  if (!user) {
    throw new createHttpError.BadRequest(`Malformed Authorization header`);
  }
  return {
    expires: token.iat,
    user: {
      id: user.userId,
      name: user.name,
      email: user.email,
      image: user.pictureUrl,
      role: user.role || Roles.User,
    },
  };
}

export function apiHandler(handler: NextHandler) {
  return async (
    req: NextRequest,
    props: { params: Promise<Record<string, string>> },
  ) => {
    const startTime = Date.now();
    let result: ApiResponse;
    let session: AppSession | null = null;
    let error: Error | null = null;
    try {
      if (!db.initialized) {
        await db.initialize();
      }

      const authorization = req.headers.get("Authorization");

      if (authorization && hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
        const token = getBearerToken(authorization);
        if (!token) {
          throw new createHttpError.Unauthorized(
            "Invalid or expired access token",
          );
        }
        if (token.aud !== new URL(req.url).origin) {
          throw new createHttpError.Unauthorized("Wrong server for token");
        }
        const client = await OAuthClient.findByPk(token.client_id);
        if (!client) {
          throw new createHttpError.Unauthorized("Invalid client");
        }
        const scopes = token.scope.split(" ");
        if (req.method in ["GET", "HEAD"] && !("read" in scopes)) {
          throw new createHttpError.Unauthorized("No read scope available");
        }
        if (
          req.method in ["PUT", "PATCH", "POST", "DELETE"] &&
          !("write" in scopes)
        ) {
          throw new createHttpError.Unauthorized("No write scope available");
        }
        session = await makeOAuthUserSession(token);
      } else {
        session = await Auth.getServerSession();
      }

      const orgContextCheckResult = await organizationContextCheck({
        req,
        session,
        props,
      });

      if (orgContextCheckResult) {
        return orgContextCheckResult;
      }

      const { searchParams } = new URL(req.url);
      const context = {
        params: await props.params,
        searchParams,
        session,
      };

      result = await handler(req, context);
    } catch (err) {
      error = err as Error;
      result = errorHandler(err, req);
    }

    const record = {
      method: req.method,
      path: new URL(req.url).pathname,
      status: result.status,
      user: session?.user?.email,
      duration: Date.now() - startTime,
      error: error ? error.message : undefined,
    };

    if (result.status >= 500) {
      logger.error(record);
    } else if (result.status >= 400) {
      logger.warn(record);
    } else {
      logger.info(record);
    }

    return result;
  };
}

function errorHandler(err: unknown, _req: NextRequest) {
  // TODO log structured request info like route here
  logger.error(err);
  if (err instanceof ManualInputValidationError) {
    return NextResponse.json(
      {
        error: {
          type: "ManualInputValidationError",
          message: "Manual Input Validation Error",
          issues: err.details,
        },
      },
      { status: 400 },
    );
  } else if (createHttpError.isHttpError(err) && err.expose) {
    return NextResponse.json(
      {
        error: {
          message: err.message,
          code: (err as any).code || undefined,
          data: (err as any).data || undefined,
        },
      },
      { status: err.statusCode },
    );
  } else if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { message: "Invalid request", issues: err.issues } },
      { status: 400 },
    );
  } else if (err instanceof SyntaxError) {
    return NextResponse.json(
      { error: { message: "Invalid request - " + err.message } },
      { status: 400 },
    );
  } else if (
    err instanceof ValidationError &&
    err.name === "SequelizeUniqueConstraintError"
  ) {
    return NextResponse.json(
      { error: { message: "Entity exists already.", issues: err.errors } },
      { status: 400 },
    );
  } else if (err instanceof OpenAI.APIError) {
    const { name, status, headers, message } = err;
    return NextResponse.json({ name, status, headers, message }, { status });
  } else {
    let errorMessage = "Unknown error";
    if ((err as Object).hasOwnProperty("message")) {
      errorMessage = (err as Error).message;
    } else if (err instanceof Error) {
      errorMessage = (err as Object).toString();
    }
    return NextResponse.json(
      { error: { message: "Internal server error", error: errorMessage } },
      { status: 500 },
    );
  }
}
