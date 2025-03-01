import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import pkg from "../../../../../../package.json";
import { db } from "@/models/index";

export const GET = apiHandler(async () => {
  if (!db.initialized) {
    throw new Error("Database not yet initialized");
  }
  try {
    await db.sequelize?.query('SELECT 1');
    return NextResponse.json({
      message: "healthy",
      version: pkg.version
    });
  } catch (error) {
    throw new Error("Database connection is not working");
  }
});