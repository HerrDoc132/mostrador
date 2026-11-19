import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { categorias, productos, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import {
  createCategoria,
  listCategorias,
  updateCategoria,
} from "@/services/categorias";
import { createTestDb } from "@/test/db";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;

async function seedUser(overrides: Partial<typeof usuarios.$inferInsert>): Promise<UserRow> {
  const passwordHash = await bcrypt.hash("secreto123", 4);
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "user@test.com",
      nombre: "Usuario",
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
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Admin", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Vendedor", rol: "vendedor" })
  );
});

describe("categorias service (RF-P7)", () => {
  it("lista solo categorías activas ordenadas por nombre", async () => {
    await db.insert(categorias).values([
      { nombre: "Zinc", activa: true },
      { nombre: "Abrasivos", activa: true },
      { nombre: "Inactiva", activa: false },
    ]);

    const result = await listCategorias(admin, db);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.nombre)).toEqual(["Abrasivos", "Zinc"]);
    expect(result[0]).not.toHaveProperty("createdAt");
  });

  it("crea una categoría como admin", async () => {
    const created = await createCategoria({ nombre: "  Electricidad  " }, admin, db);

    expect(created).toMatchObject({ nombre: "Electricidad", activa: true });
    expect(created.id).toBeGreaterThan(0);
  });

  it("rechaza nombre duplicado al crear con 409", async () => {
    await db.insert(categorias).values({ nombre: "Herramientas" });

    await expect(
      createCategoria({ nombre: "Herramientas" }, admin, db)
    ).rejects.toMatchObject({ status: 409, code: "NOMBRE_DUPLICADO" });
  });

  it("rechaza crear categoría si no es admin", async () => {
    await expect(
      createCategoria({ nombre: "Nueva" }, vendedor, db)
    ).rejects.toMatchObject({ status: 403, code: "SIN_PERMISO" });
  });

  it("edita nombre y permite desactivar si no tiene productos activos", async () => {
    const [cat] = await db
      .insert(categorias)
      .values({ nombre: "Vieja" })
      .returning();

    const renamed = await updateCategoria(cat.id, { nombre: "Nueva" }, admin, db);
    expect(renamed.nombre).toBe("Nueva");

    const deactivated = await updateCategoria(cat.id, { activa: false }, admin, db);
    expect(deactivated.activa).toBe(false);
  });

  it("no permite desactivar una categoría con productos activos (409)", async () => {
    const [cat] = await db
      .insert(categorias)
      .values({ nombre: "Con productos" })
      .returning();
    await db.insert(productos).values({
      codigo: "P-1",
      descripcion: "Prod",
      categoriaId: cat.id,
      precio: 1000,
      existencia: 5,
      stockMinimo: 1,
      activo: true,
    });

    await expect(
      updateCategoria(cat.id, { activa: false }, admin, db)
    ).rejects.toMatchObject({ status: 409, code: "CATEGORIA_EN_USO" });
  });

  it("permite desactivar si solo tiene productos inactivos", async () => {
    const [cat] = await db
      .insert(categorias)
      .values({ nombre: "Solo inactivos" })
      .returning();
    await db.insert(productos).values({
      codigo: "P-2",
      descripcion: "Prod inactivo",
      categoriaId: cat.id,
      precio: 1000,
      existencia: 0,
      stockMinimo: 0,
      activo: false,
    });

    const result = await updateCategoria(cat.id, { activa: false }, admin, db);
    expect(result.activa).toBe(false);
  });

  it("devuelve 404 si la categoría no existe", async () => {
    await expect(
      updateCategoria(9999, { nombre: "X" }, admin, db)
    ).rejects.toMatchObject({ status: 404, code: "NO_ENCONTRADO" });
  });
});
