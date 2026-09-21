import { describe, expect, it } from "@jest/globals";

import { resolveFinanceLink } from "@/backend/meed/financeLinks";
import { extractLinkedList } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/types";

describe("resolveFinanceLink", () => {
  it("allows the opportunity and project links feasibility rows carry", () => {
    expect(
      resolveFinanceLink(
        "/api/v1/climate-finance/opportunities?country_code=CL&sector=stationary_energy",
      ),
    ).toBe(
      "/api/v1/climate-finance/opportunities?country_code=CL&sector=stationary_energy",
    );
    expect(
      resolveFinanceLink(
        "/api/v1/climate-finance/projects?country_code=CL&action_id=c40_0010&limit=50",
      ),
    ).toBe(
      "/api/v1/climate-finance/projects?country_code=CL&action_id=c40_0010&limit=50",
    );
  });

  it("allows city detail links and encodes the locode space", () => {
    expect(
      resolveFinanceLink(
        "/api/v1/cities/CL ANF/climate-finance/actions/c40_0010",
      ),
    ).toBe("/api/v1/cities/CL%20ANF/climate-finance/actions/c40_0010");
  });

  it("rejects anything outside the allowed Global API paths", () => {
    for (const link of [
      "",
      "https://evil.example/api/v1/climate-finance/projects",
      "//evil.example/api/v1/climate-finance/projects",
      "/\\evil.example/api/v1/cities/x",
      "/api/v1/cities/../../admin",
      "/api/v1/climate-finance/%2e%2e/%2e%2e/admin",
      "/api/v0/city_attributes/CL",
      "api/v1/climate-finance/projects",
    ]) {
      expect(resolveFinanceLink(link)).toBeNull();
    }
  });
});

describe("extractLinkedList", () => {
  it("reads the total from meta.total, then meta.count, then the rows", () => {
    expect(
      extractLinkedList({ data: [1, 2], meta: { total: 57, count: 50 } }),
    ).toEqual({ rows: [1, 2], total: 57 });
    expect(extractLinkedList({ data: [1, 2], meta: { count: 17 } })).toEqual({
      rows: [1, 2],
      total: 17,
    });
    expect(extractLinkedList({ data: [1] })).toEqual({ rows: [1], total: 1 });
  });

  it("treats a missing upstream payload as empty", () => {
    expect(extractLinkedList(null)).toEqual({ rows: [], total: 0 });
    expect(extractLinkedList({ detail: "No finance projects found" })).toEqual({
      rows: [],
      total: 0,
    });
  });
});
