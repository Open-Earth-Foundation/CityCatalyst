import { db } from "@/models";
import { User } from "@/models/User";
import bcrypt from "bcrypt";
import { DefaultSession, getServerSession, NextAuthOptions } from "next-auth";
import {
  CredentialInput,
  CredentialsConfig,
} from "next-auth/providers/credentials";
import { Roles } from "@/util/types";
import { logger } from "@/services/logger";
import crypto from "node:crypto";
import {
  recoveryTokenLength as recoveryTokenMinLength,
  verifyRecoveryCode,
  verifyToken,
} from "./2fa";
import { RateLimiter } from "@/util/rate-limiter";

const isPlaywrightTest = process.env.PLAYWRIGHT_TEST === "1";
// 5 attempts/15 minutes per email — brute-force throttle for the login path.
// A 1-minute window barely slows an attacker (just wait it out between
// bursts); 15 minutes is a standard OWASP-aligned balance between blocking
// sustained guessing and not locking out a real user for long.
// Per-email keying only (per CC-875): an attacker who knows a victim's email
// could transiently lock out that victim's real logins by repeatedly guessing
// their password. Combining with IP is a reasonable follow-up but out of
// scope here — the ticket is explicit about per-email.
const loginLimiter = isPlaywrightTest
  ? null
  : new RateLimiter(15 * 60 * 1000, 5);

// extracted from next-auth/providers/credentials
// added here since the node test runner/ tsx wouldn't properly import ESM modules
// error was: Credentials is not a function
type UserCredentialsConfig<C extends Record<string, CredentialInput>> = Partial<
  Omit<CredentialsConfig<C>, "options">
> &
  Pick<CredentialsConfig<C>, "authorize" | "credentials">;

export default function Credentials<
  C extends Record<string, CredentialInput> = Record<string, CredentialInput>,
>(options: UserCredentialsConfig<C>): CredentialsConfig<C> {
  return {
    id: "credentials",
    name: "Credentials",
    type: "credentials",
    credentials: {} as C,
    authorize: () => null,
    options,
  };
}

export type AppSession = DefaultSession & {
  user: {
    id: string;
    role: Roles;
  };
  csrfSecret?: string;
};

export class Auth {
  static async getServerSession(): Promise<AppSession | null> {
    return await getServerSession(authOptions);
  }
}

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "yourname@city.example",
        },
        password: { label: "Password", type: "password" },
        securityToken: { label: "Security token", type: "securityToken" },
      },
      async authorize(credentials): Promise<{
        id: string;
        name?: string;
        email?: string;
        image?: string | null;
        role?: Roles;
      } | null> {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase();

        if (loginLimiter && !loginLimiter.checkLimit(email)) {
          logger.error({ email }, "Login rate limit exceeded");
          throw new Error("rate-limited");
        }

        let user: User | null = null;
        try {
          if (!db.initialized) {
            await db.initialize();
          }
          user = await db.models.User.findOne({
            where: { email },
          });
        } catch (err: unknown) {
          logger.error({ err: err }, "Failed to login:");
          return null;
        }

        if (!user || !user.passwordHash) {
          logger.error("No user found!");
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );
        if (!isValid) {
          logger.error("Invalid password!");
          return null;
        }

        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (!credentials.securityToken) {
            logger.error("No securityToken passed for user with 2FA enabled");
            return null;
          }
          let isValid = false;
          if (credentials.securityToken.length >= recoveryTokenMinLength) {
            // allow using a single-use recovery code and delete it from user record if successful
            isValid = await verifyRecoveryCode(user, credentials.securityToken);
          } else {
            isValid = await verifyToken(
              credentials.securityToken,
              user.twoFactorSecret,
            );
          }
          if (!isValid) {
            logger.error("Invalid securityToken for 2FA");
            return null;
          }
        }

        return {
          id: user.userId,
          name: user.name,
          email: user.email,
          image: user.pictureUrl,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        // user is what's returned from authorize
        token.sub = user.id; // or token.id = user.id;
        token.role = (user as unknown as User).role;
        token.picture = user.image;
        token.name = user.name;
        token.csrfSecret = crypto.randomBytes(32).toString("hex");
      }

      return token;
    },
    session: ({ session, token }) => {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          role: token.role,
        },
        csrfSecret: token.csrfSecret,
      };
    },
  },
};
