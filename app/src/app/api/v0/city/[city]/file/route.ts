import NotificationService from "@/backend/NotificationService";
import AdminNotificationTemplate from "@/lib/emails/AdminNotificationTemplate";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { fileEndingToMIMEType } from "@/util/helpers";
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

  console.log(newFileData.subsectors);

  const result = await service.sendEmail({
    to: "cephaschapa@gmail.com",
    subject: "Hello",
    text: "Hello",
    html: render(
      AdminNotificationTemplate({
        user: { name: user?.name!, email: user?.email!, cityName: city?.name! },
        adminNames: process.env.ADMIN_NAMES!,
        file: newFileData,
      }),
    ),
  });

  console.log(result);

  return NextResponse.json({
    data: newFileData,
  });
});
