import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import bcrypt from "bcryptjs";

/**
 * Script de datos iniciales mínimos requeridos.
 * Requisitos:
 * - 2 usuarios (admin y vendedor)
 * - 5 categorías
 * - 30 productos
 * - 10 clientes
 * - 50 facturas en los últimos 30 días
 */
async function runSeed() {
  console.log("Iniciando carga de datos de prueba...");
  const client = createClient({
    url: process.env.DATABASE_URL || "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  // 1. Usuarios iniciales (RF-U3)
  const passwordHash = await bcrypt.hash("admin123", 10);
  const vendedorHash = await bcrypt.hash("vendedor123", 10);

  const [admin] = await db
    .insert(schema.usuarios)
    .values({
      email: "admin@comercio.test",
      nombre: "Administrador General",
      passwordHash,
      rol: "admin",
      activo: true,
    })
    .onConflictDoNothing()
    .returning();

  const [vendedor] = await db
    .insert(schema.usuarios)
    .values({
      email: "vendedor@comercio.test",
      nombre: "Vendedor Mostrador",
      passwordHash: vendedorHash,
      rol: "vendedor",
      activo: true,
    })
    .onConflictDoNothing()
    .returning();

  console.log("Usuarios base inicializados:", { admin: admin?.email, vendedor: vendedor?.email });
  client.close();
}

runSeed().catch((err) => {
  console.error("Error al ejecutar seed:", err);
  process.exit(1);
});
