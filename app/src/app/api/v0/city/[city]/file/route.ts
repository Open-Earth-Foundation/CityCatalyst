/**
 * @swagger
 * /api/v0/city/{city}/file:
 *   get:
 *     tags:
 *       - City Files
 *     summary: List files for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of files returned.
 *       401:
 *         description: Unauthorized.
 *   post:
 *     tags:
 *       - City Files
 *     summary: Upload a file for a city
 *     description: Accepts multipart form data to upload and register a file for the city.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: string
 *                 format: binary
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               sector:
 *                 type: string
 *               subsectors:
 *                 type: string
 *               scopes:
 *                 type: string
 *               fileReference:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               status:
 *                 type: string
 *               gpcRefNo:
 *                 type: string
 *     responses:
 *       200:
 *         description: File uploaded and metadata returned.
 *       400:
 *         description: Invalid file or payload.
 *       503:
 *         description: Feature disabled.
 */
import NotificationService from "@/backend/NotificationService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { bytesToMB, fileEndingToMIMEType } from "@/util/helpers";
import { createUserFileRequset } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { LANGUAGES } from "@/util/types";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

// TODO: use these variables to configure file size and format
const MAX_FILE_SIZE = 5000000;
const ACCEPTED_FILE_FORMATS = ["csv", "xlsx", "json"]; // file formats types to be parsed and refined later

export const GET = apiHandler(async (_req: Request, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const userFiles = await db.models.UserFile.findAll({
    where: {
      cityId: context.params.city,
    },
  });

  if (!userFiles) {
    throw new createHttpError.NotFound("User files not found");
  }

  const userFilesTransformed = userFiles.map((userFile) => {
    const byteValues = userFile?.data;
    const uint8Array = new Uint8Array(byteValues!);
    const blob = new Blob([uint8Array], {
      type: fileEndingToMIMEType[userFile.fileType!],
    });
    const file = new File([blob], userFile.fileName!, {
      type: fileEndingToMIMEType[userFile.fileType!],
    });
    return {
      id: userFile.id,
      userId: userFile.userId,
      cityId: userFile.cityId,
      fileReference: userFile.fileReference,
      url: userFile.url,
      sector: userFile.sector,
      status: userFile.status,
      gpcRefNo: userFile.gpcRefNo,
      lastUpdated: userFile.lastUpdated,
      file: {
        fileName: file.name,
        size: file.size,
        fileType: userFile.fileType,
      },
    };
  });

  return NextResponse.json({ data: userFilesTransformed });
});

export const POST = apiHandler(
  async (req: NextRequest, { params, session }) => {
    if (!hasServerFeatureFlag(FeatureFlags.UPLOAD_OWN_DATA_ENABLED)) {
      throw new createHttpError.ServiceUnavailable(
        "Feature flag UPLOAD_OWN_DATA_ENABLED is not enabled on this service",
      );
    }

    const user = session?.user;
    const cityId = params.city;

    const city = await UserService.findUserCity(cityId, session);

    const formData = await req.formData();
    const file = formData?.get("data") as unknown as File;

    if (!file) {
      throw new createHttpError.BadRequest("File not found, Please add a file");
    }

    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    if (!fileExtension || !ACCEPTED_FILE_FORMATS.includes(fileExtension)) {
      throw new createHttpError.BadRequest(
        `Invalid file type. Accepted formats are: ${ACCEPTED_FILE_FORMATS.join(", ")}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new createHttpError.BadRequest(
        `File too large. Maximum allowed size is ${bytesToMB(MAX_FILE_SIZE)}MB.`,
      );
    }

    const filename = file.name;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileType = filename.split(".").pop();
    const subsectors = formData.get("subsectors") as string;
    const scopes = formData.get("scopes") as string;

    const fileData = {
      userId: session?.user.id,
      cityId: params.city,
      fileReference: formData.get("fileReference"),
      url: formData.get("url"),
      data: buffer,
      fileType: fileType === "blob" ? "csv" : fileType,
      fileName: filename,
      sector: formData.get("sector"),
      subsectors: subsectors.split(","),
      scopes: scopes.split(","),
      status: formData.get("status"),
      gpcRefNo: formData.get("gpcRefNo"),
    };

    const body = createUserFileRequset.parse(fileData);
    const inventoryId = formData.get("inventoryId") as string;

    const userFile = await db.models.UserFile.create({
      id: randomUUID(),
      ...body,
    });

    if (!userFile) {
      throw new createHttpError.NotFound("User files not found");
    }

    const newFileData = {
      id: userFile.id,
      userId: userFile.userId!,
      cityId: userFile.cityId!,
      fileReference: userFile.fileReference!,
      url: userFile.url!,
      sector: userFile.sector!,
      subsectors: userFile.subsectors!,
      scopes: userFile.scopes!,
      fileName: userFile.fileName!,
      lastUpdated: userFile.lastUpdated!,
      status: userFile.status!,
      gpcRefNo: userFile.gpcRefNo!,
      file: {
        fileName: file.name,
        size: file.size,
        fileType: userFile.fileType!,
      },
    };

    await NotificationService.sendNotificationEmail({
      user: {
        email: user?.email!,
        name: user?.name!,
        // default to english since the email goes to admins
        preferredLanguage: LANGUAGES.en,
      },
      fileData: newFileData,
      city,
      inventoryId,
    });

    return NextResponse.json({
      data: newFileData,
    });
  },
);
