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
