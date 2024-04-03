import NotificationService from "@/backend/NotificationService";
import AdminNotificationTemplate from "@/lib/emails/AdminNotificationTemplate";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { bytesToMB, fileEndingToMIMEType } from "@/util/helpers";
import { createUserFileRequset } from "@/util/validation";
import { render } from "@react-email/components";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import session from "redux-persist/lib/storage/session";

// TODO: use these variables to configure file size and format
const MAX_FILE_SIZE = 5000000;
const ACCEPTED_FILE_FORMATS = []; // file formats types to be parsed and refined later

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

export const POST = apiHandler(async (req: NextRequest, context) => {
  const userId = context.session?.user.id;
  const service = new NotificationService();
  const user = context.session?.user;
  const cityId = context.params.city;

  const city = await db.models.City.findOne({
    where: {
      cityId,
    },
  });

  if (!city) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const formData = await req.formData();
  const file = formData?.get("data") as unknown as File;

  if (!file)
    throw new createHttpError.BadRequest("File not found, Please add a file");

  const filename = file.name;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const fileType = filename.split(".").pop();
  const subsectors = formData.get("subsectors") as string;
  const scopes = formData.get("scopes") as string;

  const fileData = {
    userId: userId,
    cityId: context.params.city,
    fileReference: formData.get("fileReference"),
    url: formData.get("url"),
    data: buffer,
    fileType: fileType,
    fileName: filename,
    sector: formData.get("sector"),
    subsectors: subsectors.split(","),
    scopes: scopes.split(","),
    status: formData.get("status"),
    gpcRefNo: formData.get("gpcRefNo"),
  };

  const body = createUserFileRequset.parse(fileData);

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
  const host = process.env.HOST ?? "http://localhost:3000";

  const emailTemplate = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Notification</title>
  </head>
  <body style="background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif; margin: 0; padding: 20px;">
    <div style="margin: 0 auto; max-width: 580px; padding: 20px 0 48px;">
      <!-- SVG Placeholder for ExcelFileIcon -->
      <!-- Make sure to replace with actual SVG or an <img> tag pointing to the icon -->
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><!-- SVG content --></svg>
      <h1 style="color: #2351DC; font-size: 20px; line-height: 1.5; font-weight: 700;">CityCatalyst</h1>
      <h2 style="color: #484848; font-size: 24px; line-height: 1.3; font-weight: 700; margin-top: 50px;">${user?.name} From ${city.name} Uploaded New Files For Review</h2>
      <p style="font-size: 14px; line-height: 1.4; color: #484848;">Hi ${process.env.ADMIN_NAMES},</p>
      <p style="font-size: 14px; line-height: 1.4; color: #484848;">${user?.name} (${user?.email}) has uploaded files in CityCatalyst for revision and to upload to their inventories.</p>
      <!-- Example for file link; adjust href as needed -->
      <a href="${host}/api/v0/user/file/${newFileData.id}/download-file" style="text-decoration: none; color: #2351DC;"><div>
        <div style="flex-direction: column; padding-left: 16px; align-items: center; gap: 16px; height: 100px; border-radius: 8px; border: 1px solid #E6E7FF; margin-top: 0px"><div>${file.name}</div><br /><div style="color:a6a6a6">${bytesToMB(file.size)}</div><div style="margin-top: 20px">${newFileData.subsectors.map((item: string) => `<span key=${item} style="background-color: #e8eafb; color: #2351dc; padding: 6px 8px; border-radius: 30px; margin-right: 8px; font-size: 14px; margin-top: 20px">${item}</span>`)}</div></div>
      </div></a>
      <!-- Placeholder for tags; repeat this structure for each tag as needed -->
      <a href="${host}"><button style="font-size: 14px; padding: 16px; background-color: #2351DC; border-radius: 100px; line-height:1.5; color: #FFFFFF; margin-top: 20px; border:none">GOTO REVIEW</button></a>
      <!-- Footer -->
      <hr style="height: 2px; background: #EBEBEC; margin-top: 36px;" />
      <p style="font-size: 12px; line-height: 16px; color: #79797A; font-weight: 400;">Open Earth Foundation is a nonprofit public benefit corporation from California, USA. EIN: 85-3261449</p>
    </div>
  </body>
  </html>
  
`;

  if (process.env.NODE_ENV !== "test") {
    await service.sendEmail({
      to: process.env.ADMIN_EMAILS!,
      subject: "CityCatalyst File Upload",
      text: "City Catalyst",
      html: emailTemplate,
    });
  }

  return NextResponse.json({
    data: newFileData,
  });
});
