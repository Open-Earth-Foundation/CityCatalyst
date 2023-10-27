import { AppSession, Auth } from "@/lib/auth";
import env from "@next/env";
import { NextRequest } from "next/server";
import { mock } from "node:test";

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
