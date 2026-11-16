import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const isProduction = process.env.NODE_ENV === "production" || !!process.env.TURSO_DATABASE_URL;

const client = createClient({
  url: isProduction && process.env.TURSO_DATABASE_URL 
    ? process.env.TURSO_DATABASE_URL 
    : (process.env.DATABASE_URL || "file:local.db"),
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
