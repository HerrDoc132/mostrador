import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import {
  createUsuario,
  listUsuarios,
  resetPassword,
  updateUsuario,
} from "@/services/usuarios";
import { createTestDb } from "@/test/db";

const PASSWORD = "secreto123";

let db: Database;
let adminRow: UserRow;
let admin: PublicUser;

async function seedUser(
  overrides: Partial<typeof usuarios.$inferInsert> = {}
): Promise<UserRow> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "vendedor@test.com",
      nombre: "Vendedor Test",
      passwordHash,
      rol: "vendedor",
      activo: true,
      ...overrides,
    })
    .returning();
  return user;
}

beforeEach(async () => {
  db = await createTestDb();
  adminRow = await seedUser({
    email: "admin@test.com",
    nombre: "Admin Test",
    rol: "admin",
  });
  admin = toPublicUser(adminRow);
});

describe("usuarios service", () => {
  it("lista usuarios paginados sin exponer passwordHash", async () => {
    await seedUser({ email: "v1@test.com", nombre: "Vendedor Uno" });

    const result = await listUsuarios({}, admin, db);

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty("passwordHash");
  });

  it("busca por nombre o email", async () => {
    await seedUser({ email: "laura@test.com", nombre: "Laura Méndez" });

    const result = await listUsuarios({ q: "laura" }, admin, db);

    expect(result.total).toBe(1);
    expect(result.data[0].email).toBe("laura@test.com");
  });

  it("filtra por estado activo", async () => {
    await seedUser({ email: "inactivo@test.com", activo: false });

    const result = await listUsuarios({ activo: "false" }, admin, db);

    expect(result.total).toBe(1);
    expect(result.data[0].email).toBe("inactivo@test.com");
  });

  it("pagina los resultados", async () => {
    await seedUser({ email: "v1@test.com" });
    await seedUser({ email: "v2@test.com" });

    const result = await listUsuarios({ page: "2", pageSize: "2" }, admin, db);

    expect(result.total).toBe(3);
    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
  });

  it("crea un usuario con email normalizado y contraseña hasheada", async () => {
    const created = await createUsuario(
      {
        nombre: "Nuevo Usuario",
        email: "  NUEVO@TEST.COM ",
        rol: "vendedor",
        password: "password123",
      },
      admin,
      db
    );

    expect(created.email).toBe("nuevo@test.com");
    expect(created).not.toHaveProperty("passwordHash");

    const [row] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, created.id));

    expect(await bcrypt.compare("password123", row.passwordHash)).toBe(true);
  });

  it("rechaza email duplicado al crear con 409", async () => {
    await expect(
      createUsuario(
        {
          nombre: "Duplicado",
          email: "admin@test.com",
          rol: "vendedor",
          password: "password123",
        },
        admin,
        db
      )
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_DUPLICADO" });
  });

  it("rechaza operaciones de un vendedor con 403", async () => {
    const vendedor = toPublicUser(
      await seedUser({ email: "v@test.com", rol: "vendedor" })
    );

    await expect(listUsuarios({}, vendedor, db)).rejects.toMatchObject({
      status: 403,
      code: "SIN_PERMISO",
    });
  });

  it("actualiza nombre, rol y estado", async () => {
    const target = await seedUser({ email: "target@test.com" });

    const updated = await updateUsuario(
      target.id,
      { nombre: "Actualizado", rol: "admin" },
      admin,
      db
    );

    expect(updated.nombre).toBe("Actualizado");
    expect(updated.rol).toBe("admin");
  });

  it("impide que un admin se desactive a sí mismo", async () => {
    await expect(
      updateUsuario(admin.id, { activo: false }, admin, db)
    ).rejects.toMatchObject({
      status: 422,
      code: "OPERACION_SOBRE_SI_MISMO",
    });
  });

  it("impide que un admin se cambie el rol a sí mismo", async () => {
    await expect(
      updateUsuario(admin.id, { rol: "vendedor" }, admin, db)
    ).rejects.toMatchObject({
      status: 422,
      code: "OPERACION_SOBRE_SI_MISMO",
    });
  });

  it("rechaza email duplicado al editar con 409", async () => {
    await seedUser({ email: "otro@test.com" });
    const target = await seedUser({ email: "target@test.com" });

    await expect(
      updateUsuario(target.id, { email: "otro@test.com" }, admin, db)
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_DUPLICADO" });
  });

  it("devuelve 404 al editar un usuario inexistente", async () => {
    await expect(
      updateUsuario(9999, { nombre: "Nadie" }, admin, db)
    ).rejects.toMatchObject({ status: 404, code: "NO_ENCONTRADO" });
  });

  it("genera una contraseña temporal válida y la hashea", async () => {
    const target = await seedUser({ email: "target@test.com" });

    const { passwordTemporal } = await resetPassword(target.id, admin, db);

    expect(passwordTemporal).toMatch(/^[A-Za-z0-9_-]{12}$/);

    const [row] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, target.id));

    expect(await bcrypt.compare(passwordTemporal, row.passwordHash)).toBe(true);
  });
});
