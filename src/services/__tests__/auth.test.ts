import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import {
  assertRole,
  changeOwnPassword,
  getCurrentUser,
  login,
  toPublicUser,
} from "@/services/auth";
import { createTestDb } from "@/test/db";

const PASSWORD = "secreto123";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function seedUser(
  overrides: Partial<typeof usuarios.$inferInsert> = {}
): Promise<typeof usuarios.$inferSelect> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "admin@test.com",
      nombre: "Admin Test",
      passwordHash,
      rol: "admin",
      activo: true,
      ...overrides,
    })
    .returning();
  return user;
}

describe("auth service", () => {
  it("devuelve el usuario público y la identidad de sesión con credenciales válidas", async () => {
    const user = await seedUser();

    const result = await login(
      { email: "admin@test.com", password: PASSWORD },
      db
    );

    expect(result.user).toEqual({
      id: user.id,
      nombre: "Admin Test",
      email: "admin@test.com",
      rol: "admin",
    });
    expect(result.session).toEqual({
      userId: user.id,
      email: "admin@test.com",
      rol: "admin",
    });
  });

  it("normaliza el email (trim + minúsculas) antes de buscar", async () => {
    await seedUser();

    const result = await login(
      { email: "  ADMIN@TEST.COM  ", password: PASSWORD },
      db
    );

    expect(result.user.email).toBe("admin@test.com");
  });

  it("rechaza contraseña incorrecta con 401 CREDENCIALES_INVALIDAS", async () => {
    await seedUser();

    await expect(
      login({ email: "admin@test.com", password: "incorrecta" }, db)
    ).rejects.toMatchObject({
      status: 401,
      code: "CREDENCIALES_INVALIDAS",
    });
  });

  it("rechaza un usuario inactivo con el mismo 401", async () => {
    await seedUser({ activo: false });

    await expect(
      login({ email: "admin@test.com", password: PASSWORD }, db)
    ).rejects.toMatchObject({
      status: 401,
      code: "CREDENCIALES_INVALIDAS",
    });
  });

  it("rechaza un email inexistente con 401", async () => {
    await expect(
      login({ email: "nadie@test.com", password: PASSWORD }, db)
    ).rejects.toMatchObject({
      status: 401,
      code: "CREDENCIALES_INVALIDAS",
    });
  });

  it("devuelve 422 VALIDACION si el email no es válido", async () => {
    await expect(
      login({ email: "no-es-email", password: PASSWORD }, db)
    ).rejects.toMatchObject({
      status: 422,
      code: "VALIDACION",
    });
  });

  it("revalida la sesión contra la base y devuelve el rol actual", async () => {
    const user = await seedUser();
    await db
      .update(usuarios)
      .set({ rol: "vendedor" })
      .where(eq(usuarios.id, user.id));

    const current = await getCurrentUser({ userId: user.id }, db);

    expect(current.rol).toBe("vendedor");
  });

  it("invalida la sesión si el usuario fue desactivado", async () => {
    const user = await seedUser();
    await db
      .update(usuarios)
      .set({ activo: false })
      .where(eq(usuarios.id, user.id));

    await expect(getCurrentUser({ userId: user.id }, db)).rejects.toMatchObject({
      status: 401,
      code: "NO_AUTENTICADO",
    });
  });

  it("invalida la sesión si el usuario no existe", async () => {
    await expect(getCurrentUser({ userId: 9999 }, db)).rejects.toBeInstanceOf(
      ApiError
    );
  });

  it("assertRole permite el rol correcto y rechaza el incorrecto con 403", () => {
    expect(() =>
      assertRole({ id: 1, nombre: "A", email: "a@a.com", rol: "admin" }, "admin")
    ).not.toThrow();

    expect(() =>
      assertRole(
        { id: 2, nombre: "V", email: "v@v.com", rol: "vendedor" },
        "admin"
      )
    ).toThrowError(
      expect.objectContaining({ status: 403, code: "SIN_PERMISO" })
    );
  });

  it("cambia la contraseña propia si la actual es correcta", async () => {
    const user = await seedUser();
    const actor = toPublicUser(user);

    await changeOwnPassword(
      { actual: PASSWORD, nueva: "nuevaClave123" },
      actor,
      db
    );

    const result = await login(
      { email: "admin@test.com", password: "nuevaClave123" },
      db
    );
    expect(result.user.id).toBe(user.id);
  });

  it("rechaza el cambio si la contraseña actual es incorrecta", async () => {
    const user = await seedUser();

    await expect(
      changeOwnPassword(
        { actual: "incorrecta", nueva: "nuevaClave123" },
        toPublicUser(user),
        db
      )
    ).rejects.toMatchObject({
      status: 422,
      code: "CONTRASENA_ACTUAL_INCORRECTA",
    });
  });

  it("rechaza una nueva contraseña de menos de 8 caracteres", async () => {
    const user = await seedUser();

    await expect(
      changeOwnPassword({ actual: PASSWORD, nueva: "corta" }, toPublicUser(user), db)
    ).rejects.toMatchObject({ status: 422, code: "VALIDACION" });
  });
});
