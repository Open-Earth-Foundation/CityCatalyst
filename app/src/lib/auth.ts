import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { User } from "@/models/User";

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/login",
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

        let user: User | null = await User.findOne({
          where: { email: credentials.email },
        });
        if (!user) {
          return null;
        }
        if (
          user.passwordHash !== (await bcrypt.hash(credentials.password, 10))
        ) {
          return null;
        }
        return {
          id: user.userId,
          name: user.name,
          email: user.email,
          pictureUrl: user.pictureUrl,
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
