import { NextRequest, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { z } from "zod";
import { apiHandler } from "@/util/api";
import { db } from "@/models";
import { Roles } from "@/util/types";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";
import { FileUploadService } from "@/backend/FileUploadService";
import { S3FileStorageProvider } from "@/backend/S3FileUploadService";
import type { HiapDemoScreenshot } from "@/models/HiapDemoFeedback";

const MAX_FILES = 6;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

const commentSchema = z.object({
  screenId: z.string().max(40).optional().default(""),
  section: z.string().max(200).optional().default(""),
  category: z.string().max(40).optional().default(""),
  priority: z.string().max(40).optional().default(""),
  comment: z.string().max(5000).optional().default(""),
  suggestion: z.string().max(5000).optional().default(""),
});

const submissionSchema = z.object({
  reviewerName: z.string().max(120).optional().default(""),
  organisation: z.string().max(120).optional().default(""),
  lang: z.string().max(5).optional().default("en"),
  answers: z.record(z.string(), z.string().max(5000)).optional().default({}),
  comments: z.array(commentSchema).max(50).optional().default([]),
});

function uploader() {
  return new FileUploadService(
    new S3FileStorageProvider(process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID!, {
      region: process.env.AWS_FILE_UPLOAD_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    }),
  );
}

/**
 * Public submission endpoint for the Brazil Phase 3 demo's feedback form.
 * Reviewers are external and have no CityCatalyst account, so this route
 * takes no session; it exists only where the demo itself does (dev, behind
 * the HIAP_BR_DEMO flag), accepts one multipart body per submission and
 * stores one row per remark plus one row for the questionnaire answers.
 * Screenshots go to the existing upload bucket.
 */
export async function POST(req: NextRequest) {
  if (!hasServerFeatureFlag(FeatureFlags.HIAP_BR_DEMO)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = submissionSchema.safeParse(
    JSON.parse(String(form.get("payload") ?? "{}")),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const data = parsed.data;
  const hasAnswers = Object.values(data.answers).some((v) => v.trim());
  const comments = data.comments.filter(
    (c) => c.comment.trim() || c.suggestion.trim(),
  );
  if (!hasAnswers && comments.length === 0) {
    return NextResponse.json({ error: "Nothing to submit" }, { status: 400 });
  }

  // Files are named `shot-<commentIndex>-<n>`; validate before storing anything.
  const files: { index: number; file: File }[] = [];
  for (const [name, value] of form.entries()) {
    const m = /^shot-(\d+)-\d+$/.exec(name);
    if (!m || !(value instanceof File)) continue;
    if (!ALLOWED_MIMES.includes(value.type) || value.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Screenshot type or size not allowed" },
        { status: 400 },
      );
    }
    files.push({ index: Number(m[1]), file: value });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: "Too many screenshots" },
      { status: 400 },
    );
  }

  const shotsByComment = new Map<number, HiapDemoScreenshot[]>();
  if (files.length > 0) {
    const up = uploader();
    for (const { index, file } of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await up.uploadFile({
        filename: `hiap-demo-feedback/${file.name.replace(/[^\w.-]+/g, "_")}`,
        mimetype: file.type,
        size: file.size,
        buffer,
      });
      const list = shotsByComment.get(index) ?? [];
      list.push({
        url: stored.url,
        key: stored.key ?? "",
        filename: file.name,
        size: file.size,
      });
      shotsByComment.set(index, list);
    }
  }

  const base = {
    reviewerName: data.reviewerName || null,
    organisation: data.organisation || null,
    lang: data.lang,
  };
  const rows = [
    ...(hasAnswers
      ? [{ ...base, kind: "answers", answers: data.answers }]
      : []),
    ...data.comments
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.comment.trim() || c.suggestion.trim())
      .map(({ c, i }) => ({
        ...base,
        kind: "comment",
        screenId: c.screenId || null,
        section: c.section || null,
        category: c.category || null,
        priority: c.priority || null,
        comment: c.comment || null,
        suggestion: c.suggestion || null,
        screenshots: shotsByComment.get(i) ?? [],
      })),
  ];
  const created = await db.models.HiapDemoFeedback.bulkCreate(rows);
  return NextResponse.json({ ids: created.map((r) => r.id) }, { status: 201 });
}

/** Admin-only listing of everything reviewers sent, newest first. */
export const GET = apiHandler(async (_req, { session }) => {
  if (session?.user.role !== Roles.Admin) {
    throw new createHttpError.Forbidden("Admins only");
  }
  const rows = await db.models.HiapDemoFeedback.findAll({
    order: [["created", "DESC"]],
    limit: 1000,
  });
  return NextResponse.json({ data: rows });
});
