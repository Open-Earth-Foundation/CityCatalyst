import { User } from "@/models/User";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

const handler = NextAuth({
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
        if (!credentials) {
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
});

export { handler as GET, handler as POST };
