import { AppSession, Auth } from "@/lib/auth";
import env from "@next/env";
import { NextRequest } from "next/server";
import { mock } from "node:test";
import stream from "stream";
import { Blob } from "fetch-blob";
import { promisify } from "node:util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const mockUrl = "http://localhost:3000/api/v0";

export function createRequest(url: string, body?: any) {
  const request = new NextRequest(new URL(url));
  request.json = mock.fn(() => Promise.resolve(body));
  return request;
}

export function mockRequest(body?: any) {
  const request = new NextRequest(new URL(mockUrl));
  request.json = mock.fn(() => Promise.resolve(body));
  return request;
}

export function mockRequestFormData(formData: FormData) {
  const request = new NextRequest(new URL(mockUrl));
  request.formData = mock.fn(() => Promise.resolve(formData));
  return request;
}

const finished = promisify(stream.finished);

export async function getFileDataFromStream(filePath: string): Promise<Blob> {
  const fileStream = fs.createReadStream(filePath);
  const chunks: Buffer[] = [];

  fileStream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  await finished(fileStream);

  const blob = new Blob(chunks, { type: "application/octet-stream" });
  return blob;
}

const createTestCsvFile = async (
  fileName: string,
  data: string,
): Promise<string> => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const filePath = path.join(__dirname, fileName);

  await fs.promises.writeFile(filePath, data, "utf8");
  return filePath;
};
export const filePath = async () => {
  const fakeCSVData =
    "id,sector,gpc_ref_no,last_modified,created\n1,Energy Sector, XXXTESTXXX,12/12/2023\n2,Transport, XXXTESTXXX,12/12/2023";
  const filePath = await createTestCsvFile("test.csv", fakeCSVData);
  return filePath;
};

export const testfileBuffer = {
  type: "Buffer",
  data: [
    105, 100, 44, 115, 101, 99, 116, 111, 114, 44, 103, 112, 99, 95, 114, 101,
    102, 95, 110, 111, 44, 108, 97, 115, 116, 95, 109, 111, 100, 105, 102, 105,
    101, 100, 44, 99, 114, 101, 97, 116, 101, 100, 10, 49, 44, 69, 110, 101,
    114, 103, 121, 32, 83, 101, 99, 116, 111, 114, 44, 32, 88, 88, 88, 84, 69,
    83, 84, 88, 88, 88, 44, 49, 50, 47, 49, 50, 47, 50, 48, 50, 51, 10, 50, 44,
    84, 114, 97, 110, 115, 112, 111, 114, 116, 44, 32, 88, 88, 88, 84, 69, 83,
    84, 88, 88, 88, 44, 49, 50, 47, 49, 50, 47, 50, 48, 50, 51,
  ],
};

export const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";

export function setupTests() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  // mock getServerSession from NextAuth, since NextJS headers() isn't available outside of the server context (needs async storage)
  mock.method(Auth, "getServerSession", (): AppSession => {
    const expires = new Date();
    expires.setDate(expires.getDate() + 1);
    return {
      user: {
        id: testUserID,
        name: "Test User",
        email: "test@example.com",
        image: null,
        role: "user",
      },
      expires: expires.toISOString(),
    };
  });
}
