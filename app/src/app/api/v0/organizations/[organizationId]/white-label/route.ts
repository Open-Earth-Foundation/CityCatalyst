import { z } from "zod";
import formidable, { File } from "formidable";

import { FileUploadService } from "@/backend/FileUploadService";
import { S3FileStorageProvider } from "@/backend/S3FileUploadService";
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { whiteLabelSchema } from "@/util/validation";
import { readFile } from "node:fs/promises";
import { Organization } from "@/models/Organization";
import { db } from "@/models";

export async function parseMultipartForm<T extends z.ZodRawShape>(
  req: Request,
  schema: z.ZodObject<T>,
): Promise<{
  fields: z.infer<typeof schema>;
  file: File;
}> {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req as any, (err, fields, files) => {
      if (err) return reject(err);

      const result = schema.safeParse(fields);
      if (!result.success) return reject(result.error);

      const file = (files.file ?? files.upload ?? null) as unknown as File;
      if (!file) return reject(new Error("File is required"));

      resolve({ fields: result.data, file });
    });
  });
}

export const PATCH = apiHandler(async (req, { params, session }) => {
  if (!session) throw new createHttpError.Unauthorized();
  const { organizationId } = params;
  const { fields, file } = await parseMultipartForm(req, whiteLabelSchema);

  const org = await Organization.findByPk(organizationId as string);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }

  const buffer = await readFile(file.filepath);
  const fileUploadService = new FileUploadService(
    new S3FileStorageProvider(process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID!, {
      region: process.env.AWS_FILE_UPLOAD_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    }),
  );

  const uploaded = await fileUploadService.uploadFile({
    filename: file.originalFilename!,
    mimetype: file.mimetype!,
    size: file.size,
    buffer: Buffer.from(buffer),
  });

  await db.models.Organization.update(
    {
      logoUrl: uploaded.url,
      themeId: fields.themeId,
    },
    {
      where: {
        organizationId: organizationId as string,
      },
    },
  );

  return NextResponse.json({ data: uploaded, themeKey: fields.themeId });
});
