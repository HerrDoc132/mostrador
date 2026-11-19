import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { Database } from "@/db";
import * as schema from "@/db/schema";

/**
 * Crea una base SQLite temporal con las migraciones aplicadas.
 * Se usa en los tests unitarios de servicios.
 *
 * Se usa un archivo temporal por llamada para aislar tests y evitar que un
 * rollback de transacción deje inaccesible el esquema (comportamiento observado
 * con `:memory:` en libSQL).
 */
export async function createTestDb(): Promise<Database> {
  const filePath = join(tmpdir(), `tp-test-${randomUUID()}.db`);
  const client = createClient({ url: `file:${filePath.replace(/\\/g, "/")}` });
  const db = drizzle(client, { schema });

  const sqlText = readFileSync("drizzle/0000_gigantic_argent.sql", "utf8");
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  return db;
}
