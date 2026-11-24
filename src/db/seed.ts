import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { cargarDatosDePrueba } from "@/services/seed";
import * as schema from "./schema";

/**
 * Punto de entrada de `pnpm db:seed` (TP5-42).
 * Toda la lógica de carga vive en el servicio; acá solo se arma la conexión,
 * se invoca al servicio y se muestra el resumen por consola.
 */
async function runSeed() {
  console.log("Iniciando carga de datos de prueba...");
  const client = createClient({
    url: process.env.DATABASE_URL || "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  try {
    const resultado = await cargarDatosDePrueba(db);
    console.log("Datos iniciales cargados:", {
      usuarios: 2,
      categorias: resultado.categorias,
      productos: resultado.productos,
      clientes: resultado.clientes,
      facturas: resultado.facturas,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Credenciales de desarrollo: admin@comercio.test / admin123 · vendedor@comercio.test / vendedor123"
      );
    }
  } finally {
    client.close();
  }
}

runSeed().catch((err) => {
  console.error("Error al ejecutar seed:", err);
  process.exit(1);
});
