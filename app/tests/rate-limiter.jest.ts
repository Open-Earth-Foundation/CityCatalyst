import {
  describe,
  expect,
  it,
  beforeEach,
  jest,
  afterEach,
} from "@jest/globals";
import { RateLimiter } from "@/util/rate-limiter";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;
  const windowMs = 1000; // 1 second for testing
  const maxRequests = 3;

  beforeEach(() => {
    rateLimiter = new RateLimiter(windowMs, maxRequests);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create a rate limiter with default values", () => {
      const defaultLimiter = new RateLimiter();
      expect(defaultLimiter).toBeDefined();
    });

    it("should create a rate limiter with custom values", () => {
      expect(rateLimiter).toBeDefined();
    });
  });

  describe("checkLimit", () => {
    it("should allow requests within the limit", () => {
      const key = "test-ip";

      // First request should be allowed
      expect(rateLimiter.checkLimit(key)).toBe(true);
      // Second request should be allowed
      expect(rateLimiter.checkLimit(key)).toBe(true);
      // Third request should be allowed (at the limit)
      expect(rateLimiter.checkLimit(key)).toBe(true);
    });

    it("should block requests over the limit", () => {
      const key = "test-ip";

      // Use up all requests
      for (let i = 0; i < maxRequests; i++) {
        expect(rateLimiter.checkLimit(key)).toBe(true);
      }

      // Next request should be blocked
      expect(rateLimiter.checkLimit(key)).toBe(false);
    });

    it("should allow different keys independently", () => {
      const key1 = "ip-1";
      const key2 = "ip-2";

      // Use up limit for key1
      for (let i = 0; i < maxRequests; i++) {
        expect(rateLimiter.checkLimit(key1)).toBe(true);
      }
      expect(rateLimiter.checkLimit(key1)).toBe(false);

      // key2 should still be allowed
      expect(rateLimiter.checkLimit(key2)).toBe(true);
    });

    it("should reset limit after window expires", () => {
      const key = "test-ip";

      // Use up all requests
      for (let i = 0; i < maxRequests; i++) {
        expect(rateLimiter.checkLimit(key)).toBe(true);
      }
      expect(rateLimiter.checkLimit(key)).toBe(false);

      // Advance time past the window
      jest.advanceTimersByTime(windowMs + 1);

      // Should allow requests again
      expect(rateLimiter.checkLimit(key)).toBe(true);
    });

    it("should handle first request correctly", () => {
      const key = "new-ip";

      // First request should initialize the record and allow
      expect(rateLimiter.checkLimit(key)).toBe(true);

      const stats = rateLimiter.getStats(key);
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("should remove expired records", () => {
      const key1 = "ip-1";
      const key2 = "ip-2";

      // Add records for both keys
      rateLimiter.checkLimit(key1);
      rateLimiter.checkLimit(key2);

      // Advance time for key1 to expire but not key2
      jest.advanceTimersByTime(windowMs + 1);

      // Make key2 active again after the time advance
      rateLimiter.checkLimit(key2);

      // Now key1 should be expired, key2 should be active
      expect(rateLimiter.getStats(key1)).toBeTruthy(); // Still exists but expired
      expect(rateLimiter.getStats(key2)).toBeTruthy(); // Active

      // Cleanup should remove expired records
      rateLimiter.cleanup();

      // key1 should be removed (expired), key2 should remain
      expect(rateLimiter.getStats(key1)).toBeNull();
      expect(rateLimiter.getStats(key2)).toBeTruthy();
    });
  });

  describe("getStats", () => {
    it("should return null for non-existent key", () => {
      expect(rateLimiter.getStats("non-existent")).toBeNull();
    });

    it("should return stats for existing key", () => {
      const key = "test-ip";

      rateLimiter.checkLimit(key);
      const stats = rateLimiter.getStats(key);

      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
      expect(stats!.remainingMs).toBeGreaterThan(0);
      expect(stats!.isExpired).toBe(false);
    });

    it("should show expired status for expired records", () => {
      const key = "test-ip";

      rateLimiter.checkLimit(key);

      // Advance time past expiration
      jest.advanceTimersByTime(windowMs + 1);

      const stats = rateLimiter.getStats(key);
      expect(stats).toBeTruthy();
      expect(stats!.isExpired).toBe(true);
      expect(stats!.remainingMs).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string keys", () => {
      expect(rateLimiter.checkLimit("")).toBe(true);
      expect(rateLimiter.checkLimit("")).toBe(true);
    });

    it("should handle special character keys", () => {
      const specialKey = "192.168.1.1:8080";
      expect(rateLimiter.checkLimit(specialKey)).toBe(true);
      expect(rateLimiter.checkLimit(specialKey)).toBe(true);
    });

    it("should handle concurrent requests simulation", () => {
      const key = "concurrent-ip";

      // Simulate multiple requests
      const results = [];
      for (let i = 0; i < maxRequests + 2; i++) {
        results.push(rateLimiter.checkLimit(key));
      }

      // First maxRequests should be true, rest should be false
      const allowedCount = results.filter(Boolean).length;
      const blockedCount = results.filter((r) => !r).length;

      expect(allowedCount).toBe(maxRequests);
      expect(blockedCount).toBe(2);
    });
  });
});
