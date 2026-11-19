import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

/**
 * Crea una conexión Drizzle/libSQL. Permite inyectar una base distinta en tests.
 */
export function createDb(url: string, authToken?: string): Database {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.TURSO_DATABASE_URL;

const url =
  isProduction && process.env.TURSO_DATABASE_URL
    ? process.env.TURSO_DATABASE_URL
    : process.env.DATABASE_URL || "file:local.db";

export const db = createDb(url, process.env.TURSO_AUTH_TOKEN);
export { schema };
