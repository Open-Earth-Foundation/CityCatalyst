import { NextRequest } from "next/server";
import { mock } from "node:test";

export function createRequest(url: string, body?: any) {
  const request = new NextRequest(new URL(url));
  request.json = mock.fn(() => Promise.resolve(body));
  return request;
}
