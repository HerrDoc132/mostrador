import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * TP5-46: drizzle-kit debe usar la misma resolución que la app y el seed.
 * Se intercepta `defineConfig` para inspeccionar el objeto sin invocar la CLI.
 */

vi.mock("drizzle-kit", () => ({ defineConfig: (config: unknown) => config }));

interface ConfigInspeccionada {
  schema: string;
  out: string;
  dialect: string;
  dbCredentials: { url: string; authToken?: string };
}

async function cargarConfig() {
  vi.resetModules();
  const modulo = await import("../../../drizzle.config");
  return modulo.default as ConfigInspeccionada;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("drizzle.config.ts (TP5-46)", () => {
  it("usa TURSO_DATABASE_URL y TURSO_AUTH_TOKEN cuando están definidas", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://db.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "token-de-prueba");

    const config = await cargarConfig();

    expect(config.dbCredentials).toEqual({
      url: "libsql://db.turso.io",
      authToken: "token-de-prueba",
    });
  });

  it("conserva el esquema, la carpeta de migraciones y el dialecto", async () => {
    vi.stubEnv("DATABASE_URL", "file:local.db");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    const config = await cargarConfig();

    expect(config.schema).toBe("./src/db/schema.ts");
    expect(config.out).toBe("./drizzle");
    expect(config.dialect).toBe("turso");
    expect(config.dbCredentials.url).toBe("file:local.db");
  });
});
