import { AppSession, Auth } from "@/lib/auth";
import env from "@next/env";
import { NextRequest } from "next/server";
import { mock } from "node:test";
import stream from "stream";
import { Blob } from "fetch-blob";
import { promisify } from "node:util";
import fs from "fs";
import path from "path";
import { ApiResponse } from "@/util/api";
import { db } from "@/models";
import { Op, WhereOptions } from "sequelize";
import { DataSourceI18nAttributes } from "@/models/DataSourceI18n";

// TODO re-enable when migration to Jest is finished
// import { expect } from "@jest/globals";
import assert from "node:assert";

function expect(received: any) {
  return {
    toBe: (expected: any) => {
      assert.strictEqual(received, expected);
    },
  };
}

const mockUrl = "http://localhost:3000/api/v0";

export function createRequest(url: string, body?: any) {
  const request = new NextRequest(new URL(url));
  request.json = mock.fn(() => Promise.resolve(body));
  return request;
}

export function mockRequest(
  body?: any,
  searchParams?: Record<string, string>,
): NextRequest {
  const request = new NextRequest(new URL(mockUrl));
  request.json = mock.fn(() => Promise.resolve(body));
  for (const param in searchParams) {
    request.nextUrl.searchParams.append(param, searchParams[param]);
  }
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

export const testFileFormat = {
  fileName: "blob",
  size: 116,
  fileType: "",
};

export const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
export const testCityID = "ceb9634a-b68c-4c1b-a20b-2ab0ced5e3cc";

export const testUserData = {
  id: testUserID,
  name: "Test User",
  email: "test@example.com",
  image: null,
  role: "user",
};

export function setupTests() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  // mock getServerSession from NextAuth, since NextJS headers() isn't available outside of the server context (needs async storage)
  mock.method(Auth, "getServerSession", (): AppSession => {
    const expires = new Date();
    expires.setDate(expires.getDate() + 1);
    return {
      user: testUserData,
      expires: expires.toISOString(),
    };
  });
}

export async function expectStatusCode(
  response: ApiResponse,
  statusCode: number,
) {
  try {
    expect(response.status).toBe(statusCode);
  } catch (err: unknown) {
    const apiError = await response.text();
    (err as Error).message =
      `Expected status code ${statusCode}, got ${response.status}.\nAPI error: ${apiError}`;
    throw err;
  }
}

export const expectToBeLooselyEqual = (received: any, expected: any) => {
  const pass = received == expected;
  if (pass) {
    return {
      message: () =>
        `expected ${received} not to be loosely equal to ${expected}`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be loosely equal to ${expected}`,
      pass: false,
    };
  }
};

/** deletes DataSources and their associated InventoryValues **/
export const cascadeDeleteDataSource = async (
  where: WhereOptions<DataSourceI18nAttributes>,
) => {
  const dataSources = await db.models.DataSource.findAll({
    where,
  });

  const dataSourceIds = dataSources.map((ds) => ds.datasourceId);

  if (dataSourceIds.length > 0) {
    await db.models.InventoryValue.destroy({
      where: {
        datasourceId: {
          [Op.in]: dataSourceIds,
        },
      },
    });

    await db.models.DataSource.destroy({
      where: {
        datasourceId: {
          [Op.in]: dataSourceIds,
        },
      },
    });
  }
};
