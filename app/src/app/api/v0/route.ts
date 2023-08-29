import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const data = { message: "Hello World" };

export const GET = apiHandler(async () => {
  return NextResponse.json({ data });
});

const setMessageRequest = z.object({
  message: z.string().min(5),
});
type SetMessageRequest = z.infer<typeof setMessageRequest>;

export const POST = apiHandler(async (req: Request) => {
  const body = setMessageRequest.parse(await req.json());
  data.message = body.message;
  return NextResponse.json({ data });
});
