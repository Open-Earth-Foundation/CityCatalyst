import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserFileRequset } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// TODO: use these variables to configure file size and format
const MAX_FILE_SIZE = 5000000;
const ACCEPTED_FILE_FORMATS = []; // file formats types to be parsed and refined later

export const GET = apiHandler(
  async (
    _req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const userId = context.params.user;
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const user = await db.models.User.findOne({
      attributes: ["userId"],
      where: {
        userId: userId,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    const userFiles = await db.models.UserFile.findAll({
      where: {
        userId: user.userId,
      },
    });

    if (!userFiles) {
      throw new createHttpError.NotFound("User files not found");
    }

    return NextResponse.json({ data: userFiles });
  },
);

export const POST = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const userId = context.params.user;

    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const user = await db.models.User.findOne({
      attributes: ["userId"],
      where: {
        userId: userId,
      },
    });

    if (!user) {
      throw new createHttpError.NotFound("User not allowed");
    }

    const formData = await req.formData();
    const file = formData.get("data") as unknown as File;
    if (!file) throw new createHttpError.BadRequest("File not found");

    const filename = file.name;

    const fileType = file.name.slice(
      ((filename.lastIndexOf(".") - 1) >>> 0) + 2,
    );

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileData = {
      userId: formData.get("userId"),
      file_reference: formData.get("file_reference"),
      url: formData.get("url"),
      data: buffer,
      file_type: fileType,
      sector: formData.get("sector"),
      status: formData.get("status"),
      gpc_ref_no: formData.get("gpc_ref_no"),
    };

    const body = createUserFileRequset.parse(fileData);

    const userFile = await db.models.UserFile.create({
      id: randomUUID(),
      ...body,
    });

    if (!userFile) {
      throw new createHttpError.NotFound("User files not found");
    }

    return NextResponse.json({ data: userFile });
  },
);
