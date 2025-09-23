/**
 * @swagger
 * /api/auth/{nextauth}:
 *   get:
 *     tags:
 *       - Auth
 *     summary: NextAuth.js catch-all GET endpoint
 *     description: |
 *       Handles NextAuth routes such as:
 *       - `/api/auth/signin`
 *       - `/api/auth/signout`
 *       - `/api/auth/session`
 *       - `/api/auth/csrf`
 *       - `/api/auth/providers`
 *       - `/api/auth/callback/{provider}`
 *       This endpoint is managed by NextAuth and typically used by the frontend SDK.
 *     parameters:
 *       - in: path
 *         name: nextauth
 *         required: true
 *         schema:
 *           type: string
 *         description: Catch-all path segment for NextAuth routes.
 *     responses:
 *       200:
 *         description: Response varies by sub-route (HTML/JSON/redirect).
 *   post:
 *     tags:
 *       - Auth
 *     summary: NextAuth.js catch-all POST endpoint
 *     description: |
 *       Handles POST actions for NextAuth, including signing in/out and callback exchanges.
 *     parameters:
 *       - in: path
 *         name: nextauth
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response varies by sub-route (JSON/redirect).
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
