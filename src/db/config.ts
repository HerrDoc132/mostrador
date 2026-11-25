import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * TP5-46: único punto de resolución de la base de datos para la app,
 * las migraciones (drizzle-kit), el seed y los scripts de reset.
 *
 * Prioridad: TURSO_DATABASE_URL (con TURSO_AUTH_TOKEN) → DATABASE_URL →
 * file:local.db. No importa drizzle-orm ni alias '@/': se usa desde tsx,
 * esbuild-register y Vitest por igual.
 * Fuente: docs/07-entregables-y-calidad/specs-entregables-y-calidad.md:15.
 */

export type EntornoDB = Record<string, string | undefined>;

export interface OpcionesConfigDB {
  env?: EntornoDB;
  cwd?: string;
  archivoEnv?: string;
}

export interface ConfigDB {
  url: string;
  authToken?: string;
  esRemoto: boolean;
}

const URL_LOCAL = "file:local.db";

function normalizar(valor: string | undefined): string | undefined {
  const limpio = valor?.trim();
  return limpio || undefined;
}

/** Lee una variable del entorno o, si no está, del archivo `.env`. */
export function leerVariableEntorno(
  clave: string,
  env: EntornoDB,
  rutaEnv: string
): string | undefined {
  const directa = normalizar(env[clave]);
  if (directa !== undefined) return directa;
  if (!existsSync(rutaEnv)) return undefined;

  const linea = readFileSync(rutaEnv, "utf8")
    .split(/\r?\n/)
    .find((valor) => new RegExp(`^\\s*(?:export\\s+)?${clave}\\s*=`).test(valor));
  if (!linea) return undefined;

  const crudo = linea.slice(linea.indexOf("=") + 1).trim();
  const sinComillas = crudo.replace(/^(['"])([\s\S]*)\1$/, "$2");
  return normalizar(sinComillas);
}

export function resolverDatabaseConfig(opciones: OpcionesConfigDB = {}): ConfigDB {
  const env = opciones.env ?? process.env;
  const cwd = opciones.cwd ?? process.cwd();
  const rutaEnv = opciones.archivoEnv ?? path.join(cwd, ".env");
  const valor = (clave: string) => leerVariableEntorno(clave, env, rutaEnv);

  const tursoUrl = valor("TURSO_DATABASE_URL");
  const databaseUrl = valor("DATABASE_URL");
  const nodeEnv = valor("NODE_ENV");
  const authToken = valor("TURSO_AUTH_TOKEN");

  // Misma regla que tenía src/db/index.ts: en producción o con Turso configurado se
  // prioriza la URL remota; si no, se respeta DATABASE_URL y finalmente local.
  const esProduccion = nodeEnv === "production" || tursoUrl !== undefined;
  const url = (esProduccion && tursoUrl ? tursoUrl : databaseUrl) ?? URL_LOCAL;

  return { url, authToken, esRemoto: !url.startsWith("file:") };
}
