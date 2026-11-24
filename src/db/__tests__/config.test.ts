import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolverDatabaseConfig, type EntornoDB } from "@/db/config";

/**
 * TP5-46: una única resolución de URL/credenciales para app, migraciones,
 * seed y reset. Los tests son puros: inyectan `env` y `cwd`, sin tocar `process.env`
 * salvo el caso explícito de la llamada sin argumentos.
 */

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), "db-config-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function resolver(env: EntornoDB, conArchivo = false) {
  return resolverDatabaseConfig({
    env,
    cwd,
    archivoEnv: conArchivo ? path.join(cwd, ".env") : path.join(cwd, "sin-env"),
  });
}

describe("resolverDatabaseConfig (TP5-46)", () => {
  it("cae en file:local.db sin variables ni .env", () => {
    expect(resolver({})).toEqual({
      url: "file:local.db",
      authToken: undefined,
      esRemoto: false,
    });
  });

  it("usa DATABASE_URL en desarrollo", () => {
    expect(resolver({ DATABASE_URL: "file:otra.db", NODE_ENV: "development" })).toEqual({
      url: "file:otra.db",
      authToken: undefined,
      esRemoto: false,
    });
  });

  it("prioriza TURSO_DATABASE_URL aunque falte NODE_ENV", () => {
    expect(resolver({ TURSO_DATABASE_URL: "libsql://db.turso.io" })).toEqual({
      url: "libsql://db.turso.io",
      authToken: undefined,
      esRemoto: true,
    });
  });

  it("incluye el token en producción", () => {
    expect(
      resolver({
        NODE_ENV: "production",
        TURSO_DATABASE_URL: "libsql://db.turso.io",
        TURSO_AUTH_TOKEN: "token-secreto",
      })
    ).toEqual({
      url: "libsql://db.turso.io",
      authToken: "token-secreto",
      esRemoto: true,
    });
  });

  it("mantiene el fallback a DATABASE_URL en producción sin Turso", () => {
    expect(
      resolver({ NODE_ENV: "production", DATABASE_URL: "file:produccion.db" })
    ).toMatchObject({ url: "file:produccion.db", esRemoto: false });
  });

  it("Turso gana sobre DATABASE_URL incluso en development", () => {
    expect(
      resolver({
        NODE_ENV: "development",
        DATABASE_URL: "file:local.db",
        TURSO_DATABASE_URL: "libsql://db.turso.io",
      }).url
    ).toBe("libsql://db.turso.io");
  });

  it("lee el .env y da prioridad a la variable del proceso", () => {
    writeFileSync(path.join(cwd, ".env"), 'DATABASE_URL="file:desde-env.db"\n');
    expect(resolver({}, true).url).toBe("file:desde-env.db");
    expect(resolver({ DATABASE_URL: "file:del-process.db" }, true).url).toBe(
      "file:del-process.db"
    );
  });

  it("lee TURSO_DATABASE_URL y el token desde el .env", () => {
    writeFileSync(
      path.join(cwd, ".env"),
      "TURSO_DATABASE_URL=libsql://db.turso.io\nTURSO_AUTH_TOKEN='token-del-env'\n"
    );
    expect(resolver({}, true)).toEqual({
      url: "libsql://db.turso.io",
      authToken: "token-del-env",
      esRemoto: true,
    });
  });

  it("admite la forma legacy de pasar libSQL por DATABASE_URL", () => {
    expect(
      resolver({ DATABASE_URL: "libsql://db.turso.io", TURSO_AUTH_TOKEN: "token" })
    ).toMatchObject({ url: "libsql://db.turso.io", authToken: "token", esRemoto: true });
  });

  it("normaliza espacios, comillas y el prefijo export", () => {
    writeFileSync(
      path.join(cwd, ".env"),
      "export DATABASE_URL = '  file:con-espacios.db  '\n"
    );
    expect(resolver({}, true).url).toBe("file:con-espacios.db");
  });

  it("trata valores vacíos como ausentes (token nunca es cadena vacía)", () => {
    expect(resolver({ DATABASE_URL: "   ", TURSO_AUTH_TOKEN: "  " })).toEqual({
      url: "file:local.db",
      authToken: undefined,
      esRemoto: false,
    });
  });

  it.each([
    ["file:./datos/qa.db", false],
    ["libsql://db.turso.io", true],
    ["https://ejemplo.com/base", true],
    [":memory:", true],
  ])("clasifica %s como remoto=%s", (url, esRemoto) => {
    expect(resolver({ DATABASE_URL: url }).esRemoto).toBe(esRemoto);
  });

  it("no muta el objeto env que recibe", () => {
    const env = { DATABASE_URL: "file:local.db" };
    const copia = { ...env };
    resolver(env);
    expect(env).toEqual(copia);
  });
});
