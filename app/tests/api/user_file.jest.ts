import {
  POST as createUserFile,
  GET as findUserFiles,
} from "@/app/api/v0/city/[city]/file/route";

import {
  DELETE as deleteUserfile,
  GET as findUserFile,
} from "@/app/api/v0/city/[city]/file/[file]/route";

import { db } from "@/models";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  testFileFormat,
  filePath,
  getFileDataFromStream,
  mockRequest,
  mockRequestFormData,
  setupTests,
  testUserID,
  testCityID,
  expectStatusCode,
} from "../helpers";
import { randomUUID } from "node:crypto";
import fs from "fs";
import NotificationService from "@/backend/NotificationService";

enum STATUS {
  INPROGRESS = "in progress",
  PENDING = "pending",
}

const fileId = "9218f7d2-383c-43ab-8c05-867bc783e672";

const fileData = {
  id: fileId,
  userId: testUserID,
  cityId: testCityID,
  sector: "Energy Sector",
  url: "http://www.acme.com",
  status: STATUS.INPROGRESS,
  data: {
    ...testFileFormat,
    fileName: "test.csv",
    fileType: "csv",
  },
  subsectors: "test1, test2, test3",
  scopes: "1,2,3",
  gpc_ref_no: "XXXTESTXXX",
  file_reference: "XXXTESTXXX",
  file_type: "csv",
};

const invalidFileData = {
  id: "1",
  userId: "2",
  sector: "333",
  subsectors: "INVALID_SUBSECTOR",
  scopes: "INVALID_SCOPE",
  url: "invalid.com",
  cityId: "XXINVALID_ID",
  status: "7",
  data: {
    ...testFileFormat,
    fileType: "csv",
  },
  gpc_ref_no: "43",
  file_reference: "0",
  file_type: "csv",
};

describe("UserFile API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
    await db.models.UserFile.destroy({ where: { userId: testUserID } });
    const [user] = await db.models.User.upsert({
      userId: testUserID,
      name: "TEST_USER",
    });
    const [city] = await db.models.City.upsert({
      cityId: testCityID,
      name: "TEST_CITY",
    });
    await user.addCity(city);
  });
  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();

    // deletes the file once test are done
    fs.unlink(await filePath(), (err: any) => {
      if (err) console.error(err);
    });
  });

  beforeEach(() => {
    jest
      .spyOn(NotificationService, "sendNotificationEmail")
      .mockImplementation(() => Promise.resolve());
  });

  it("should create a user file", async () => {
    // stream created file from path
    const path = await filePath();
    const fileStream = await getFileDataFromStream(path);

    const formData = new FormData();
    formData.append("id", fileData.id);
    formData.append("userId", fileData.userId);
    formData.append("cityId", fileData.cityId);
    formData.append("sector", fileData.sector);
    formData.append("subsectors", fileData.subsectors);
    formData.append("scopes", fileData.scopes);
    formData.append("url", fileData.url);
    formData.append("data", fileStream);
    formData.append("status", fileData.status);
    formData.append("fileReference", fileData.file_reference);
    formData.append("gpcRefNo", fileData.gpc_ref_no);
    formData.append("fileType", fileData.file_type);
    const req = mockRequestFormData(formData);
    const res = await createUserFile(req, {
      params: { city: testCityID },
    });
    await expectStatusCode(res, 200);
    const { data } = await res.json();
    expect(data?.sector).toBe(fileData?.sector);
    expect(data?.url).toBe(fileData.url);
    expect(data?.status).toBe(fileData.status);
    expect(data?.gpcRefNo).toBe(fileData.gpc_ref_no);
    expect(fileData.data.fileName).toBe(data?.file.fileName);
    expect(fileData.data.size).toBe(data?.file.size);
    const calls = (NotificationService.sendNotificationEmail as jest.Mock).mock
      .calls.length;
    expect(calls).toBe(1);
  });

  it("should not create a file if data is invalid", async () => {
    const path = await filePath();
    const fileStream = await getFileDataFromStream(path);
    const formData = new FormData();
    formData.append("id", invalidFileData.id);
    formData.append("userId", invalidFileData.userId);
    formData.append("cityId", invalidFileData.cityId);
    formData.append("sector", invalidFileData.sector);
    formData.append("url", invalidFileData.url);
    formData.append("data", fileStream);
    formData.append("status", invalidFileData.status);
    formData.append("subsectors", invalidFileData.subsectors);
    formData.append("scopes", invalidFileData.scopes);
    formData.append("fileReference", invalidFileData.file_reference);
    formData.append("gpcRefNo", invalidFileData.gpc_ref_no);
    formData.append("fileType", invalidFileData.file_type);
    const req = mockRequestFormData(formData);
    const res = await createUserFile(req, { params: { city: testCityID } });
    expect(res.status).toBe(400);
  });

  it("should find all user files", async () => {
    const req = mockRequest();
    const res = await findUserFiles(req, {
      params: { user: testUserID, city: testCityID },
    });
    const { data } = await res.json();

    const userFile = data[0];
    expect(userFile?.sector).toBe(fileData.sector);
    expect(userFile?.url).toBe(fileData.url);
    expect(userFile?.status).toBe(fileData.status);
    expect(userFile?.gpcRefNo).toBe(fileData.gpc_ref_no);
  });

  it("should find a user file", async () => {
    const getFilesReq = mockRequest();
    const getFilesRes = await findUserFiles(getFilesReq, {
      params: { user: testUserID, file: randomUUID(), city: testCityID },
    });
    const { data: userFilesData } = await getFilesRes.json();

    const userFiles = userFilesData[0];
    const req = mockRequest();
    const res = await findUserFile(req, {
      params: { user: testUserID, file: userFiles.id, city: testCityID },
    });
    const { data: userFile } = await res.json();
    expect(userFile?.sector).toBe(fileData.sector);
    expect(userFile?.url).toBe(fileData.url);
    expect(userFile?.status).toBe(fileData.status);
    expect(userFile?.gpcRefNo).toBe(fileData.gpc_ref_no);
  });

  it("should not find a user file", async () => {
    const req = mockRequest();
    const res = await findUserFile(req, {
      params: { user: testUserID, file: randomUUID(), city: testCityID },
    });

    expect(res.status).toBe(404);
  });

  it("should delete user file", async () => {
    const fileStream = await getFileDataFromStream(await filePath());
    const formData = new FormData();
    formData.append("id", fileData.id);
    formData.append("userId", fileData.userId);
    formData.append("sector", fileData.sector);
    formData.append("subsectors", fileData.subsectors);
    formData.append("scopes", fileData.scopes);
    formData.append("url", fileData.url);
    formData.append("cityId", fileData.cityId);
    formData.append("data", fileStream);
    formData.append("status", fileData.status);
    formData.append("fileReference", fileData.file_reference);
    formData.append("gpcRefNo", fileData.gpc_ref_no);
    formData.append("fileType", fileData.file_type);
    const req = mockRequestFormData(formData);
    const res = await createUserFile(req, {
      params: { user: testUserID, city: testCityID },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const deletRequest = mockRequest();
    const deleteResponse = await deleteUserfile(deletRequest, {
      params: { user: testUserID, file: data.id, city: testCityID },
    });

    const { deleted } = await deleteResponse.json();
    expect(deleted).toBe(true);
    expect(deleteResponse.status).toBe(200);
  });

  it("should not delete a non-existent user file", async () => {
    const deletRequest = mockRequest();
    const deleteResponse = await deleteUserfile(deletRequest, {
      params: { user: testUserID, file: randomUUID(), city: testCityID },
    });

    expect(deleteResponse.status).toBe(404);
  });
});
