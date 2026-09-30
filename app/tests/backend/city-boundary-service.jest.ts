/**
 * @jest-environment node
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import CityBoundaryService from "@/backend/CityBoundaryService";

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

describe("CityBoundaryService", () => {
  beforeAll(() => {
    globalThis.fetch = fetchMock;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("encodes spaces in locodes and parses a valid JSON body", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          city_geometry: "POINT(0 0)",
          bbox_west: 1,
          bbox_south: 2,
          bbox_east: 3,
          bbox_north: 4,
          area: 12.5,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await CityBoundaryService.getCityBoundary("CL MAI");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cityboundary/city/CL%20MAI"),
    );
    expect(result.area).toBe(12.5);
    expect(result.boundingBox).toEqual([1, 2, 3, 4]);
  });

  it("turns a Global API Python traceback into a clean BadGateway", async () => {
    fetchMock.mockResolvedValue(
      new Response("Traceback (most recent call last):\n  File ...", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      CityBoundaryService.getCityBoundary("CL MAI"),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("non-JSON"),
    });
  });

  it("maps HTTP 404 to NotFound without attempting JSON parse of HTML", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"detail":"City boundary not found"}', { status: 404 }),
    );

    await expect(
      CityBoundaryService.getCityBoundary("CL XXX"),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
