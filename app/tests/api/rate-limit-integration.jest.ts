import { GET as getRootMessage } from "@/app/api/v1/route";
import { db } from "@/models";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { mockRequest, setupTests } from "../helpers";

describe("Rate Limit Integration Tests", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    await db.sequelize?.close();
  });

  describe("API Rate Limiting", () => {
    it("should allow requests within rate limit", async () => {
      // Create a mock request with a specific IP
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "192.168.1.100");

      // Make 60 requests (our limit)
      const results = [];
      for (let i = 0; i < 60; i++) {
        const res = await getRootMessage(req, { params: Promise.resolve({}) });
        results.push(res.status);
      }

      // All should be 200 (OK)
      expect(results.every(status => status === 200)).toBe(true);
    });

    it("should block requests over rate limit", async () => {
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "192.168.1.101");

      // First make 60 requests (up to the limit)
      for (let i = 0; i < 60; i++) {
        const res = await getRootMessage(req, { params: Promise.resolve({}) });
        expect(res.status).toBe(200);
      }

      // The 61st request should be rate limited
      const limitedRes = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(limitedRes.status).toBe(429);

      const limitedData = await limitedRes.json();
      expect(limitedData.error.message).toBe("Too many requests, please try again later.");
    });

    it("should handle different IP addresses independently", async () => {
      const req1 = mockRequest();
      req1.headers.set("x-forwarded-for", "10.0.0.1");

      const req2 = mockRequest();
      req2.headers.set("x-forwarded-for", "10.0.0.2");

      // Exhaust limit for IP 1
      for (let i = 0; i < 60; i++) {
        const res = await getRootMessage(req1, { params: Promise.resolve({}) });
        expect(res.status).toBe(200);
      }

      // IP 1 should now be rate limited
      const limitedRes1 = await getRootMessage(req1, { params: Promise.resolve({}) });
      expect(limitedRes1.status).toBe(429);

      // But IP 2 should still work
      const res2 = await getRootMessage(req2, { params: Promise.resolve({}) });
      expect(res2.status).toBe(200);
    });

    it("should handle missing IP headers gracefully", async () => {
      const req = mockRequest();
      // Don't set any IP headers - should use "unknown" as fallback

      // Should still work normally
      const res = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.message).toBe("Welcome to the CityCatalyst backend API!");
    });

    it("should handle x-real-ip header", async () => {
      const req = mockRequest();
      req.headers.set("x-real-ip", "203.0.113.195");

      const res = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
    });

    it("should prioritize x-forwarded-for over x-real-ip", async () => {
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "192.168.1.50");
      req.headers.set("x-real-ip", "203.0.113.195");

      // Should use x-forwarded-for (first in chain)
      const res = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
    });

    it("should handle comma-separated x-forwarded-for", async () => {
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "192.168.1.1, 10.0.0.1, 203.0.113.195");

      // Should extract the first IP (192.168.1.1)
      const res = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
    });

    it("should handle IPv6 addresses", async () => {
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "2001:db8::1");

      const res = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
    });

    it("should return proper JSON error response when rate limited", async () => {
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "192.168.1.102");

      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        await getRootMessage(req, { params: Promise.resolve({}) });
      }

      // Next request should be rate limited
      const limitedRes = await getRootMessage(req, { params: Promise.resolve({}) });

      expect(limitedRes.status).toBe(429);
      expect(limitedRes.headers.get("content-type")).toContain("application/json");

      const errorData = await limitedRes.json();
      expect(errorData).toHaveProperty("error");
      expect(errorData.error).toHaveProperty("message");
      expect(errorData.error.message).toBe("Too many requests, please try again later.");
    });
  });

  describe("Rate Limit Window Behavior", () => {
    it("should reset rate limit after window expires", async () => {
      const req = mockRequest();
      req.headers.set("x-forwarded-for", "192.168.1.103");

      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        const res = await getRootMessage(req, { params: Promise.resolve({}) });
        expect(res.status).toBe(200);
      }

      // Should be rate limited
      const limitedRes = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(limitedRes.status).toBe(429);

      // Fast-forward time by more than 1 minute (our window)
      jest.advanceTimersByTime(61 * 1000);

      // Should work again
      const resetRes = await getRootMessage(req, { params: Promise.resolve({}) });
      expect(resetRes.status).toBe(200);
    });
  });
});
