import { LANGUAGES, ACTION_TYPES } from "@/util/types";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const getClient = (() => {
  let client: S3Client | null = null;

  return () => {
    if (client) return client;

    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucketId = process.env.AWS_S3_BUCKET_ID;

    if (!region || !accessKeyId || !secretAccessKey || !bucketId) {
      logger.error("Missing AWS credentials:", {
        region: !!region,
        accessKeyId: !!accessKeyId,
        secretAccessKey: !!secretAccessKey,
        bucketId: !!bucketId,
      });
      throw new Error("Missing AWS credentials");
    }

    client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: false,
    });

    return client;
  };
})();

const streamToString = async (stream: Readable): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
};

export const readFile = async (
  locode: string,
  type: ACTION_TYPES,
  lang: LANGUAGES,
) => {
  try {
    if (!locode || !type || !lang) {
      throw new Error("Missing required parameters");
    }
    const bucketName = process.env.AWS_S3_BUCKET_ID;
    if (!bucketName) {
      throw new Error("Missing S3 bucket name");
    }
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: `data/${lang}/${type}/${locode}.json`,
    });
    const response = await getClient().send(command);
    if (!response.Body) {
      logger.error('S3 response body is empty', { locode, type, lang });
      throw new Error("No data returned from S3");
    }

    const data = await streamToString(response.Body as Readable);
    return JSON.parse(data);
  } catch (err) {
    logger.error({ err: err }, "Error reading file from S3:");
    throw err;
  }
};