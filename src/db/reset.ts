import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolverDatabaseConfig } from "./config";

/**
 * TP5-38: utilidad para dropear la base SQLite local y regenerarla desde cero.
 *
 * - `pnpm db:drop`  → solo borra el archivo (y sus acompañantes -wal/-shm).
 * - `pnpm db:reset` → borra, aplica migraciones y ejecuta el seed.
 *
 * Por seguridad solo opera sobre URLs `file:`; nunca toca una base remota
 * (Turso/libSQL) ni `:memory:`.
 */

const PREFIJO_FILE = "file:";

export interface ArchivosDatabase {
  principal: string;
  wal: string;
  shm: string;
}

/**
 * Compatibilidad con los tests de TP5-38: delega en la resolución unificada,
 * que también detecta TURSO_DATABASE_URL para no borrar una base remota.
 */
export function leerDatabaseUrl(cwd: string = process.cwd()): string {
  return resolverDatabaseConfig({ cwd }).url;
}

/** Resuelve la ruta local y los archivos WAL/SHM que SQLite puede dejar. */
export function archivosDatabase(
  url: string,
  cwd: string = process.cwd()
): ArchivosDatabase {
  const destino = url.startsWith(PREFIJO_FILE) ? url.slice(PREFIJO_FILE.length) : "";
  if (!destino || destino === ":memory:" || !url.startsWith(PREFIJO_FILE)) {
    throw new Error(
      `db:drop/db:reset solo trabajan con SQLite local (file:...). Destino recibido: ${url}`
    );
  }

  const principal = path.resolve(cwd, destino.replace(/^\.\//, ""));
  if (principal === path.resolve(cwd)) {
    throw new Error("Ruta de base inválida: no se puede borrar el directorio del proyecto.");
  }

  return {
    principal,
    wal: `${principal}-wal`,
    shm: `${principal}-shm`,
  };
}

/** Borra los archivos existentes y devuelve la lista de lo que borró. */
export function dropearDatabase(url: string, cwd: string = process.cwd()): string[] {
  const { principal, wal, shm } = archivosDatabase(url, cwd);
  const borrados: string[] = [];

  for (const archivo of [principal, wal, shm]) {
    if (!existsSync(archivo)) continue;
    rmSync(archivo, { force: true });
    borrados.push(archivo);
  }

  return borrados;
}

function ejecutarScript(script: string, env: NodeJS.ProcessEnv): void {
  // `script` siempre es un nombre interno (db:migrate/db:seed), nunca entrada del usuario.
  const resultado = spawnSync(`pnpm run ${script}`, {
    stdio: "inherit",
    shell: true,
    env,
  });

  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) {
    throw new Error(`pnpm ${script} terminó con código ${resultado.status}.`);
  }
}

/** Punto de entrada de los scripts `db:drop` y `db:reset`. */
export function main(argv: string[] = process.argv.slice(2)): void {
  const modo = argv[0] ?? "reset";
  if (modo !== "drop" && modo !== "reset") {
    throw new Error("Uso: pnpm db:drop | pnpm db:reset");
  }

  const config = resolverDatabaseConfig();
  const borrados = dropearDatabase(config.url);
  console.log(
    borrados.length > 0
      ? `Base eliminada: ${borrados.join(", ")}`
      : "No había archivos de base para eliminar."
  );

  if (modo === "drop") return;

  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: config.url };
  // Los hijos deben trabajar sobre la misma base local recién resuelta.
  delete env.TURSO_DATABASE_URL;
  delete env.TURSO_AUTH_TOKEN;
  ejecutarScript("db:migrate", env);
  ejecutarScript("db:seed", env);
  console.log("Listo: migraciones aplicadas y seed cargado.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[db:reset] ${(error as Error).message}`);
    process.exit(1);
  }
}
