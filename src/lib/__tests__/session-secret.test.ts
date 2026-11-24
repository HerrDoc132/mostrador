import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * TP5-49: el secreto de sesión debe venir siempre del entorno.
 * Estos tests son puros (validador) o usan un cookie store en memoria;
 * no levantan servidor HTTP ni tocan la base de datos.
 */

const { cookieStore } = vi.hoisted(() => {
  const valores = new Map<string, string>();
  return {
    cookieStore: {
      valores,
      get: (name: string) => {
        const value = valores.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        valores.set(name, value);
      },
      delete: (name: string) => {
        valores.delete(name);
      },
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { secretoSesionDesdeEntorno, validarSecretoSesion } from "@/lib/env";

const secretoValido = "secreto_de_prueba_de_al_menos_32_caracteres";
const payload = { userId: 7, email: "admin@comercio.test", rol: "admin" as const };

async function cargarAuth() {
  vi.resetModules();
  return await import("@/lib/auth");
}

afterEach(() => {
  vi.unstubAllEnvs();
  cookieStore.valores.clear();
});

describe("validarSecretoSesion (TP5-49)", () => {
  it("rechaza un secreto ausente con un mensaje que nombra la variable", () => {
    expect(() => validarSecretoSesion(undefined)).toThrow(/SESSION_SECRET/);
  });

  it("rechaza secretos vacíos, de espacios y de menos de 32 caracteres", () => {
    expect(() => validarSecretoSesion("")).toThrow(/SESSION_SECRET/);
    expect(() => validarSecretoSesion("   ")).toThrow(/SESSION_SECRET/);
    expect(() => validarSecretoSesion("a".repeat(31))).toThrow(/SESSION_SECRET/);
  });

  it("devuelve el secreto recortado cuando tiene al menos 32 caracteres", () => {
    expect(validarSecretoSesion(`  ${secretoValido}  `)).toBe(secretoValido);
  });

  it("lee el valor de process.env sin recurrir a un literal del código", () => {
    vi.stubEnv("SESSION_SECRET", secretoValido);
    expect(secretoSesionDesdeEntorno()).toBe(secretoValido);
  });
});

describe("firma de cookies con el secreto del entorno (TP5-49)", () => {
  it("falla al crear un token si no está definido SESSION_SECRET", async () => {
    vi.stubEnv("SESSION_SECRET", undefined);
    const auth = await cargarAuth();

    await expect(auth.createSessionToken(payload)).rejects.toThrow(/SESSION_SECRET/);
  });

  it("firma y verifica un token usando el secreto del entorno", async () => {
    vi.stubEnv("SESSION_SECRET", secretoValido);
    const auth = await cargarAuth();

    await auth.setSessionCookie(payload);
    await expect(auth.getSession()).resolves.toEqual(payload);
  });

  it("rechaza un token firmado con otro secreto", async () => {
    vi.stubEnv("SESSION_SECRET", secretoValido);
    const firmador = await cargarAuth();
    const token = await firmador.createSessionToken(payload);

    vi.stubEnv("SESSION_SECRET", "otro_secreto_de_prueba_de_al_menos_32_caracteres");
    const verificador = await cargarAuth();
    cookieStore.valores.set("session_token", token);

    await expect(verificador.getSession()).resolves.toBeNull();
  });
});
