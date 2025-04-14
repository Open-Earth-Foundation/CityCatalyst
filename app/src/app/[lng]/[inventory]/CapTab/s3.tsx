import { env } from "next-runtime-env";

import { ACTION_TYPES, LANGUAGES } from "@/app/[lng]/[inventory]/CapTab/types";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CityAttributes } from "@/models/City";

const getClient = () => {
  if (
    !env("NEXT_PUBLIC_AWS_REGION") ||
    !env("NEXT_PUBLIC_AWS_ACCESS_KEY_ID") ||
    !env("NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY")
  )
    throw new Error("missing-credentials");
  return new S3Client({
    region: env("NEXT_PUBLIC_AWS_REGION")!,
    credentials: {
      accessKeyId: env("NEXT_PUBLIC_AWS_ACCESS_KEY_ID")!,
      secretAccessKey: env("NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY")!,
    },
  });
};

const bucketName = env("NEXT_PUBLIC_AWS_S3_BUCKET_ID");

const streamToString = async (stream: any) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let result = "";
  let done = false;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      result += decoder.decode(value, { stream: !done });
    }
  }

  return result;
};

export const readFile = async (
  locode: string,
  type: ACTION_TYPES,
  lang: LANGUAGES,
) => {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: `data/${lang}/${type}/${locode}.json`,
    });
    const response = await getClient().send(command);
    const data = await streamToString(response.Body);
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading file from S3:", err);
    throw err;
  }
};

export async function fetchFromS3(
  city: CityAttributes & {
    populationYear: number;
    population: number;
    project: { projectId: string; name: string; organizationId: string };
  },
  type: ACTION_TYPES,
  language: LANGUAGES,
) {
  if (!city?.locode) {
    throw new Error("missing-city-name");
  }
  return readFile(city.locode, type, language);
}
