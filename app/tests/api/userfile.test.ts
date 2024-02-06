import {
  POST as createUserFile,
  GET as findUserFiles,
} from "@/app/api/v0/user/file/route";

import {
  DELETE as deleteUserfile,
  GET as findUserFile,
} from "@/app/api/v0/user/file/[file]/route";

import { db } from "@/models";
import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import {
  testFileFormat,
  filePath,
  getFileDataFromStream,
  mockRequest,
  mockRequestFormData,
  setupTests,
  testUserID,
} from "../helpers";
import { randomUUID } from "node:crypto";
import fs from "fs";

enum STATUS {
  INPROGRESS = "in progress",
  PENDING = "pending",
}

const fileData = {
  id: randomUUID(),
  userId: testUserID,
  sector: "Energy Sector",
  url: "http://www.acme.com",
  status: STATUS.INPROGRESS,
  data: testFileFormat,
  gpc_ref_no: "XXXTESTXXX",
  file_reference: "XXXTESTXXX",
};

const invalidFileData = {
  id: "1",
  userId: "2",
  sector: "333",
  url: "invalid.com",
  status: "7",
  data: "",
  gpc_ref_no: "43",
  file_reference: "0",
};

describe("UserFile API", () => {
  before(async () => {
    setupTests();
    await db.initialize();
    await db.models.UserFile.destroy({ where: { userId: testUserID } });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
  });
  after(async () => {
    if (db.sequelize) await db.sequelize.close();

    // deletes the file once test are done
    await fs.unlink(await filePath(), (err: any) => {
      if (err) console.error(err);
    });
  });

  it("should create a user file", async () => {
    // stream created file from path
    const path = await filePath();
    const fileStream = await getFileDataFromStream(path);

    const formData = new FormData();
    formData.append("id", randomUUID());
    formData.append("userId", fileData.userId);
    formData.append("sector", fileData.sector);
    formData.append("url", fileData.url);
    formData.append("data", fileStream);
    formData.append("status", fileData.status);
    formData.append("fileReference", fileData.file_reference);
    formData.append("gpcRefNo", fileData.gpc_ref_no);
    const req = mockRequestFormData(formData);
    const res = await createUserFile(req, { params: { user: testUserID } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data?.sector, fileData.sector);
    assert.equal(data?.url, fileData.url);
    assert.equal(data?.status, fileData.status);
    assert.equal(data?.gpcRefNo, fileData.gpc_ref_no);
    assert.equal(fileData.data.fileName, data?.file.fileName);
    assert.equal(fileData.data.size, data?.file.size);
  });

  it("should not create a file if data is invalid", async () => {
    const path = await filePath();
    const fileStream = await getFileDataFromStream(path);
    const formData = new FormData();
    formData.append("id", invalidFileData.id);
    formData.append("userId", invalidFileData.userId);
    formData.append("sector", invalidFileData.sector);
    formData.append("url", invalidFileData.url);
    formData.append("data", fileStream);
    formData.append("status", invalidFileData.status);
    formData.append("fileReference", invalidFileData.file_reference);
    formData.append("gpcRefNo", invalidFileData.gpc_ref_no);
    const req = mockRequestFormData(formData);
    const res = await createUserFile(req, { params: { user: testUserID } });
    assert.equal(res.status, 400);
  });

  it("should find all user files", async () => {
    const req = mockRequest();
    const res = await findUserFiles(req, {
      params: { user: testUserID },
    });
    const { data } = await res.json();

    const userFile = data[0];
    assert.equal(userFile?.sector, fileData.sector);
    assert.equal(userFile?.url, fileData.url);
    assert.equal(userFile?.status, fileData.status);
    assert.equal(userFile?.gpcRefNo, fileData.gpc_ref_no);
  });

  it("should find a user file", async () => {
    const getFilesReq = mockRequest();
    const getFilesRes = await findUserFiles(getFilesReq, {
      params: { user: testUserID },
    });
    const { data: userFilesData } = await getFilesRes.json();

    const userFiles = userFilesData[0];
    const req = mockRequest();
    const res = await findUserFile(req, {
      params: { user: testUserID, file: userFiles.id },
    });
    const { data: userFile } = await res.json();

    assert.equal(userFile?.sector, fileData.sector);
    assert.equal(userFile?.url, fileData.url);
    assert.equal(userFile?.status, fileData.status);
    assert.equal(userFile?.gpcRefNo, fileData.gpc_ref_no);
  });

  it("should not find a user file", async () => {
    const req = mockRequest();
    const res = await findUserFile(req, {
      params: { user: testUserID, file: randomUUID() },
    });

    assert.equal(res.status, 404);
  });

  it("should delete user file", async () => {
    const fileStream = await getFileDataFromStream(await filePath());
    const formData = new FormData();
    formData.append("id", randomUUID());
    formData.append("userId", fileData.userId);
    formData.append("sector", fileData.sector);
    formData.append("url", fileData.url);
    formData.append("data", fileStream);
    formData.append("status", fileData.status);
    formData.append("fileReference", fileData.file_reference);
    formData.append("gpcRefNo", fileData.gpc_ref_no);
    const req = mockRequestFormData(formData);
    const res = await createUserFile(req, { params: { user: testUserID } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    const deletRequest = mockRequest();
    const deleteResponse = await deleteUserfile(deletRequest, {
      params: { user: testUserID, file: data.id },
    });

    const { deleted } = await deleteResponse.json();
    assert.equal(deleted, true);
    assert.equal(deleteResponse.status, 200);
  });

  it("should not delete a non-existent user file", async () => {
    const deletRequest = mockRequest();
    const deleteResponse = await deleteUserfile(deletRequest, {
      params: { user: testUserID, file: randomUUID() },
    });

    assert.equal(deleteResponse.status, 404);
  });
});
