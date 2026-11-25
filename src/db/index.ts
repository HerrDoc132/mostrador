import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { resolverDatabaseConfig } from "./config";
import * as schema from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

/**
 * Crea una conexión Drizzle/libSQL. Permite inyectar una base distinta en tests.
 */
export function createDb(url: string, authToken?: string): Database {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

const { url, authToken } = resolverDatabaseConfig();

export const db = createDb(url, authToken);
export { schema };
