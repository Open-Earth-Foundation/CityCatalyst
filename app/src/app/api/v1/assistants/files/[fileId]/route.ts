/**
 * @swagger
 * /api/v1/assistants/files/{fileId}:
 *   get:
 *     tags:
 *       - Assistants Files
 *     summary: Retrieve metadata for an Assistant file by ID.
 *     description: Fetches an OpenAI File object by its ID using the Assistant client. Requires a signed-in user; no elevated role is needed. Use this to inspect file metadata referenced by a thread.
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File metadata.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: OpenAI File ID
 *                     object:
 *                       type: string
 *                       description: Object type, always "file"
 *                     filename:
 *                       type: string
 *                       description: Original filename
 *                     bytes:
 *                       type: number
 *                       description: File size in bytes
 *                     created_at:
 *                       type: number
 *                       description: Unix timestamp of file creation
 *                     purpose:
 *                       type: string
 *                       enum: ['assistants', 'vision', 'fine-tune']
 *                       description: Purpose of the file
 *                     status:
 *                       type: string
 *                       enum: ['uploaded', 'processed', 'error']
 *                       description: File processing status
 *             examples:
 *               example:
 *                 value:
 *                   file:
 *                     id: "file_abc123"
 *                     object: "file"
 *                     filename: "document.pdf"
 *                     bytes: 1024
 *                     created_at: 1699061776
 *                     purpose: "assistants"
 *                     status: "processed"
 */
import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params }) => {
  const openai = setupOpenAI();
  const file = await openai.files.retrieve(params.fileId);

  return NextResponse.json({ file: file });
});
