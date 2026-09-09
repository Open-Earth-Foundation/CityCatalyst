import createHttpError from "http-errors";

import { db } from "@/models";

/** Cached service tokens do not establish that a session's user still exists. */
export async function requireExistingChatUser(userId: string): Promise<void> {
  const user = await db.models.User.findByPk(userId, {
    attributes: ["userId"],
  });
  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }
}
