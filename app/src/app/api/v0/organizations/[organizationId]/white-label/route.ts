import { whiteLabelSchema } from "@/util/validation";
import { FileUploadService } from "@/backend/FileUploadService";
import { S3FileStorageProvider } from "@/backend/S3FileUploadService";
import { db } from "@/models";
import { Organization } from "@/models/Organization";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const organizationId = params.organizationId;
  const org = await db.models.Organization.findOne({
    where: {
      organizationId,
    },
  });

  if (!org) {
    throw new createHttpError.NotFound("Organization not found");
  }

  const formData = await req.formData();

  const themeId = formData.get("themeId");
  const clearLogo = formData.get("clearLogoUrl");
  const file = formData.get("file") as File | null;

  const fields = {
    themeId: themeId?.toString(),
    clearLogoUrl: clearLogo?.toString() ?? undefined,
  };

  const parsed = whiteLabelSchema.safeParse(fields);
  if (!parsed.success) {
    throw new createHttpError.BadRequest("Validation failed");
  }

  const { themeId: validThemeId, clearLogoUrl: shouldClearLogo } = parsed.data;

  let logoUrl: string | null = org.logoUrl as string;

  if (shouldClearLogo === "true") {
    logoUrl = null;
  } else if (file instanceof File) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploader = new FileUploadService(
      new S3FileStorageProvider(process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID!, {
        region: process.env.AWS_FILE_UPLOAD_REGION!,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      }),
    );

    const uploaded = await uploader.uploadFile({
      filename: file.name,
      mimetype: file.type,
      size: file.size,
      buffer,
    });

    logoUrl = uploaded.url;
  }

  await db.models.Organization.update(
    {
      logoUrl: logoUrl,
      themeId: validThemeId,
    },
    {
      where: { organizationId },
    },
  );

  return NextResponse.json({
    data: {
      logoUrl,
      themeId: validThemeId,
    },
  });
});
