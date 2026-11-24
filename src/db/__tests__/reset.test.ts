import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  archivosDatabase,
  dropearDatabase,
  leerDatabaseUrl,
} from "@/db/reset";

/**
 * TP5-38: utilidad para dropear y regenerar la base local desde cero.
 * Estos tests fijan las reglas de seguridad antes de implementar el script.
 */

let cwd: string;
let databaseUrlOriginal: string | undefined;

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), "db-reset-"));
  databaseUrlOriginal = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  if (databaseUrlOriginal === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrlOriginal;
  rmSync(cwd, { recursive: true, force: true });
});

describe("db:reset (TP5-38)", () => {
  it("usa DATABASE_URL del entorno por encima del .env", () => {
    writeFileSync(path.join(cwd, ".env"), 'DATABASE_URL="file:del-env.db"\n');
    process.env.DATABASE_URL = "file:del-process.db";

    expect(leerDatabaseUrl(cwd)).toBe("file:del-process.db");
  });

  it("lee DATABASE_URL del .env sin las comillas", () => {
    writeFileSync(
      path.join(cwd, ".env"),
      "# Base de datos\nDATABASE_URL = \"file:desde-env.db\"\nSESSION_SECRET=\"otro\"\n"
    );

    expect(leerDatabaseUrl(cwd)).toBe("file:desde-env.db");
  });

  it("cae en file:local.db cuando no hay .env ni variable", () => {
    expect(leerDatabaseUrl(cwd)).toBe("file:local.db");
  });

  it("resuelve el archivo y sus acompañantes WAL/SHM dentro del proyecto", () => {
    expect(archivosDatabase("file:local.db", cwd)).toEqual({
      principal: path.join(cwd, "local.db"),
      wal: path.join(cwd, "local.db-wal"),
      shm: path.join(cwd, "local.db-shm"),
    });
  });

  it("acepta rutas relativas con subdirectorio", () => {
    expect(archivosDatabase("file:./datos/qa.db", cwd)).toEqual({
      principal: path.join(cwd, "datos", "qa.db"),
      wal: path.join(cwd, "datos", "qa.db-wal"),
      shm: path.join(cwd, "datos", "qa.db-shm"),
    });
  });

  it.each(["libsql://mi-base.turso.io", "https://ejemplo.com/base", ":memory:"])(
    "rechaza destino no local: %s",
    (url) => {
      expect(() => archivosDatabase(url, cwd)).toThrow(/SQLite local/);
    }
  );

  it("rechaza un destino vacío", () => {
    expect(() => archivosDatabase("file:", cwd)).toThrow(/SQLite local/);
  });

  it("borra la base y sus acompañantes, y es idempotente", () => {
    const { principal, wal, shm } = archivosDatabase("file:local.db", cwd);
    writeFileSync(principal, "bd");
    writeFileSync(wal, "wal");
    writeFileSync(shm, "shm");

    expect(dropearDatabase("file:local.db", cwd)).toEqual([principal, wal, shm]);
    expect(existsSync(principal)).toBe(false);
    expect(existsSync(wal)).toBe(false);
    expect(existsSync(shm)).toBe(false);
    expect(dropearDatabase("file:local.db", cwd)).toEqual([]);
  });

  it("no borra nada cuando el destino es remoto", () => {
    const local = path.join(cwd, "local.db");
    writeFileSync(local, "bd");

    expect(() => dropearDatabase("libsql://mi-base.turso.io", cwd)).toThrow(
      /SQLite local/
    );
    expect(existsSync(local)).toBe(true);
  });
});
