/**
 * @swagger
 * /api/v0/assistants/files/{fileId}:
 *   get:
 *     tags:
 *       - Assistants Files
 *     summary: Retrieve assistant file
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The retrieved file metadata.
 */
import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params }) => {
  const openai = setupOpenAI();
  const file = await openai.files.retrieve(params.fileId);

  return NextResponse.json({ file: file });
});
