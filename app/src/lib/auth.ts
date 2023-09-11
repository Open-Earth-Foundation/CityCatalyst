import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { User } from "@/models/User";
import { db } from "@/models";

export enum Roles {
  User = "user",
  Admin = "admin",
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
          user = await db.models.User.findOne({
            where: { email: credentials.email },
          });
        } catch (err: any) {
          console.error("Failed to login:", err);
          return null;
        }

        if (!user || !user.passwordHash) {
          console.error("No user found!");
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          console.log("Invalid password!");
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
    session: ({ session, token }) => {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id,
          role: token.role,
        },
      };
    },
  },
};
