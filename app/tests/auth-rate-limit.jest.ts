import { beforeAll, describe, expect, it, jest } from "@jest/globals";

const findOne = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const compare = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const loggerError = jest.fn();

jest.unstable_mockModule("@/models", () => ({
  db: {
    initialized: true,
    initialize: jest.fn(),
    models: { User: { findOne } },
  },
}));
jest.unstable_mockModule("bcrypt", () => ({
  default: { compare },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: loggerError },
}));
jest.unstable_mockModule("otplib", () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.unstable_mockModule("qrcode", () => ({
  default: { toDataURL: jest.fn() },
}));

let authOptions: typeof import("@/lib/auth").authOptions;

beforeAll(async () => {
  ({ authOptions } = await import("@/lib/auth"));
});

describe("login rate limiting", () => {
  const authorize = () => {
    const provider = authOptions.providers[0] as unknown as {
      options: {
        authorize: (credentials: {
          email: string;
          password: string;
        }) => Promise<unknown>;
      };
    };
    return provider.options.authorize;
  };

  it("throws rate-limited after 5 attempts for the same email within the window", async () => {
    findOne.mockResolvedValue(null);
    const attempt = authorize();

    for (let i = 0; i < 5; i++) {
      await attempt({ email: "victim@example.com", password: "x" });
    }

    await expect(
      attempt({ email: "victim@example.com", password: "x" }),
    ).rejects.toThrow("rate-limited");
  });

  it("does not rate limit a different email", async () => {
    findOne.mockResolvedValue(null);
    const attempt = authorize();

    for (let i = 0; i < 5; i++) {
      await attempt({ email: "attacker@example.com", password: "x" });
    }

    await expect(
      attempt({ email: "someone-else@example.com", password: "x" }),
    ).resolves.toBeNull();
  });
});
