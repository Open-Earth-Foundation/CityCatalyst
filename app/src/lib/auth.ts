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
    credentials: {} as any,
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
      },
      async authorize(credentials): Promise<any> {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        let user: User | null = null;
        try {
          if (!db.initialized) {
            await db.initialize();
          }
          const users = await db.models.User.findAll();
          user = await db.models.User.findOne({
            where: { email: credentials.email },
          });
        } catch (err: any) {
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
        token.csrfSecret = crypto.randomBytes(32).toString('hex');
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
        csrfSecret: token.csrfSecret
      };
    },
  },
};
