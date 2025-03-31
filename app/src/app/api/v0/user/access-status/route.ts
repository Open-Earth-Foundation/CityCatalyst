import {apiHandler} from "@/util/api";
import createHttpError from "http-errors";
import { db } from "@/models";
import UserService from "@/backend/UserService";
import {NextResponse} from "next/server";

export const GET = apiHandler(async (_req: Request, context) => {

    if (!context.session) {
        throw new createHttpError.Unauthorized("Unauthorized");
    }

    const userId = context.session.user.id;

    const data = await UserService.findUserAccessStatus(userId)
    if (!data) {
        throw new createHttpError.NotFound("User not found");
    }

    return NextResponse.json({ data });

})