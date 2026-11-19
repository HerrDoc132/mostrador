import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { categorias, movimientosStock, productos, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import {
  createProducto,
  getProducto,
  listProductos,
  updateProducto,
} from "@/services/productos";
import { createTestDb } from "@/test/db";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let categoriaId: number;

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

async function seedProducto(overrides: Partial<typeof productos.$inferInsert> = {}) {
  const [p] = await db
    .insert(productos)
    .values({
      codigo: "P-BASE",
      descripcion: "Producto base",
      categoriaId,
      precio: 1000,
      existencia: 0,
      stockMinimo: 0,
      activo: true,
      ...overrides,
    })
    .returning();
  return p;
}

beforeEach(async () => {
  db = await createTestDb();
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Admin", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Vendedor", rol: "vendedor" })
  );
  const [cat] = await db.insert(categorias).values({ nombre: "Herramientas" }).returning();
  categoriaId = cat.id;
});

describe("productos service", () => {
  it("lista productos activos con flag bajoMinimo y categoría", async () => {
    await seedProducto({ codigo: "A1", descripcion: "Alto stock", existencia: 10, stockMinimo: 2 });
    await seedProducto({ codigo: "B1", descripcion: "Bajo stock", existencia: 1, stockMinimo: 5 });
    await seedProducto({ codigo: "C1", descripcion: "Inactivo", activo: false });

    const result = await listProductos({}, vendedor, db);

    expect(result.total).toBe(2);
    const bajo = result.data.find((p) => p.codigo === "B1")!;
    expect(bajo.bajoMinimo).toBe(true);
    expect(bajo.categoria).toEqual({ id: categoriaId, nombre: "Herramientas" });
  });

  it("filtra por búsqueda q (código o descripción)", async () => {
    await seedProducto({ codigo: "HE-001", descripcion: "Martillo" });
    await seedProducto({ codigo: "HE-002", descripcion: "Destornillador" });

    const porCodigo = await listProductos({ q: "HE-001" }, admin, db);
    expect(porCodigo.total).toBe(1);

    const porDesc = await listProductos({ q: "destor" }, admin, db);
    expect(porDesc.total).toBe(1);
    expect(porDesc.data[0].codigo).toBe("HE-002");
  });

  it("filtra por categoriaId y bajoMinimo", async () => {
    const [cat2] = await db.insert(categorias).values({ nombre: "Pinturas" }).returning();
    await seedProducto({ codigo: "A", existencia: 1, stockMinimo: 5, categoriaId });
    await seedProducto({ codigo: "B", existencia: 10, stockMinimo: 2, categoriaId: cat2.id });

    const soloCat1 = await listProductos({ categoriaId: String(categoriaId) }, admin, db);
    expect(soloCat1.total).toBe(1);

    const bajos = await listProductos({ bajoMinimo: "true" }, admin, db);
    expect(bajos.total).toBe(1);
    expect(bajos.data[0].codigo).toBe("A");
  });

  it("activo='todos' solo es visible para admin; vendedor ve solo activos", async () => {
    await seedProducto({ codigo: "ACT", activo: true });
    await seedProducto({ codigo: "INA", activo: false });

    const comoAdmin = await listProductos({ activo: "todos" }, admin, db);
    expect(comoAdmin.total).toBe(2);

    const comoVendedor = await listProductos({ activo: "todos" }, vendedor, db);
    expect(comoVendedor.total).toBe(1);
    expect(comoVendedor.data[0].codigo).toBe("ACT");
  });

  it("obtiene detalle de producto con categoría", async () => {
    const p = await seedProducto({ codigo: "DET-1" });

    const result = await getProducto(p.id, vendedor, db);
    expect(result.codigo).toBe("DET-1");
    expect(result.categoria.nombre).toBe("Herramientas");
  });

  it("devuelve 404 al obtener producto inexistente", async () => {
    await expect(getProducto(9999, admin, db)).rejects.toMatchObject({
      status: 404,
      code: "NO_ENCONTRADO",
    });
  });

  it("crea producto sin stock inicial (existencia 0)", async () => {
    const created = await createProducto(
      {
        codigo: "NUEVO-1",
        descripcion: "Nuevo",
        categoriaId,
        precio: 250000,
        stockMinimo: 3,
      },
      admin,
      db
    );

    expect(created).toMatchObject({
      codigo: "NUEVO-1",
      precio: 250000,
      existencia: 0,
      stockMinimo: 3,
      activo: true,
    });

    const movs = await db.select().from(movimientosStock);
    expect(movs).toHaveLength(0);
  });

  it("crea producto con stock inicial y registra movimiento de ingreso", async () => {
    const created = await createProducto(
      {
        codigo: "NUEVO-2",
        descripcion: "Con stock",
        categoriaId,
        precio: 1000,
        stockMinimo: 1,
        stockInicial: 15,
      },
      admin,
      db
    );

    expect(created.existencia).toBe(15);

    const movs = await db
      .select()
      .from(movimientosStock)
      .where(eq(movimientosStock.productoId, created.id));
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({
      tipo: "ingreso",
      cantidad: 15,
      motivo: "Stock inicial",
      existenciaResultante: 15,
      usuarioId: admin.id,
    });
  });

  it("rechaza código duplicado al crear (409)", async () => {
    await seedProducto({ codigo: "DUP-1" });

    await expect(
      createProducto(
        { codigo: "DUP-1", descripcion: "Otro", categoriaId, precio: 100, stockMinimo: 0 },
        admin,
        db
      )
    ).rejects.toMatchObject({ status: 409, code: "CODIGO_DUPLICADO" });
  });

  it("rechaza crear producto si no es admin", async () => {
    await expect(
      createProducto(
        { codigo: "X", descripcion: "X", categoriaId, precio: 100, stockMinimo: 0 },
        vendedor,
        db
      )
    ).rejects.toMatchObject({ status: 403, code: "SIN_PERMISO" });
  });

  it("actualiza datos del producto", async () => {
    const p = await seedProducto({ codigo: "UPD-1", descripcion: "Viejo", precio: 100 });

    const updated = await updateProducto(
      p.id,
      { descripcion: "Nuevo", precio: 200, stockMinimo: 5 },
      admin,
      db
    );

    expect(updated.descripcion).toBe("Nuevo");
    expect(updated.precio).toBe(200);
    expect(updated.stockMinimo).toBe(5);
  });

  it("rechaza edición directa de existencia (422)", async () => {
    const p = await seedProducto({ codigo: "EX-1" });

    await expect(
      updateProducto(p.id, { existencia: 99 } as unknown, admin, db)
    ).rejects.toMatchObject({ status: 422, code: "VALIDACION" });

    const [fresh] = await db.select({ existencia: productos.existencia }).from(productos).where(eq(productos.id, p.id));
    expect(fresh.existencia).toBe(0);
  });

  it("aplica baja lógica (activo=false) conservando historial implícito", async () => {
    const p = await seedProducto({ codigo: "BAJA-1", activo: true });

    const updated = await updateProducto(p.id, { activo: false }, admin, db);
    expect(updated.activo).toBe(false);

    const listado = await listProductos({}, vendedor, db);
    expect(listado.data.find((x) => x.id === p.id)).toBeUndefined();
  });
});
