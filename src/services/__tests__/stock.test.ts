import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq, sum } from "drizzle-orm";
import type { Database } from "@/db";
import { categorias, movimientosStock, productos, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import {
  listMovimientosPorProducto,
  listMovimientosStock,
  moverStock,
  registrarMovimientoManual,
} from "@/services/stock";
import { createTestDb } from "@/test/db";
import { ISO_UTC } from "@/test/iso";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let categoriaId: number;
let productoId: number;

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

  const [cat] = await db.insert(categorias).values({ nombre: "General" }).returning();
  categoriaId = cat.id;

  const [prod] = await db
    .insert(productos)
    .values({
      codigo: "P-1",
      descripcion: "Producto 1",
      categoriaId,
      precio: 150000,
      existencia: 10,
      stockMinimo: 2,
      activo: true,
    })
    .returning();
  productoId = prod.id;
});

describe("moverStock (Regla 1 y 2)", () => {
  it("actualiza existencia y registra movimiento en la misma transacción", async () => {
    const result = await db.transaction(async (tx) =>
      moverStock(
        {
          productoId,
          tipo: "ingreso",
          cantidad: 5,
          motivo: "Reposición",
          usuarioId: admin.id,
        },
        tx
      )
    );

    expect(result.existenciaResultante).toBe(15);

    const [prod] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, productoId));
    expect(prod.existencia).toBe(15);

    const movs = await db
      .select()
      .from(movimientosStock)
      .where(eq(movimientosStock.productoId, productoId));
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({
      tipo: "ingreso",
      cantidad: 5,
      existenciaResultante: 15,
      motivo: "Reposición",
    });
  });

  it("rechaza egreso que dejaría existencia negativa (409 STOCK_INSUFICIENTE)", async () => {
    await expect(
      db.transaction(async (tx) =>
        moverStock(
          {
            productoId,
            tipo: "egreso",
            cantidad: -11,
            motivo: "Rotura",
            usuarioId: admin.id,
          },
          tx
        )
      )
    ).rejects.toMatchObject({ status: 409, code: "STOCK_INSUFICIENTE" });

    const [prod] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, productoId));
    expect(prod.existencia).toBe(10);

    const movs = await db.select().from(movimientosStock);
    expect(movs).toHaveLength(0);
  });

  it("permite dejar la existencia en cero (límite válido)", async () => {
    const result = await db.transaction(async (tx) =>
      moverStock(
        {
          productoId,
          tipo: "egreso",
          cantidad: -10,
          motivo: "Ajuste de inventario",
          usuarioId: admin.id,
        },
        tx
      )
    );

    expect(result.existenciaResultante).toBe(0);
  });

  it("devuelve 404 si el producto no existe", async () => {
    await expect(
      db.transaction(async (tx) =>
        moverStock(
          { productoId: 9999, tipo: "ingreso", cantidad: 1, motivo: "Reposición", usuarioId: admin.id },
          tx
        )
      )
    ).rejects.toMatchObject({ status: 404, code: "NO_ENCONTRADO" });
  });
});

describe("registrarMovimientoManual (RF-P4, RF-P5)", () => {
  it("registra un ingreso manual con motivo válido", async () => {
    const result = await registrarMovimientoManual(
      productoId,
      { tipo: "ingreso", cantidad: 4, motivo: "Reposición", observacion: "Lote nuevo" },
      admin,
      db
    );

    expect(result).toMatchObject({
      tipo: "ingreso",
      cantidad: 4,
      existenciaResultante: 14,
      motivo: "Reposición",
      referencia: null,
      usuario: { id: admin.id, nombre: admin.nombre },
      producto: { id: productoId, codigo: "P-1" },
    });
    expect(result.fecha).toMatch(ISO_UTC);
  });

  it("registra un egreso manual (cantidad se guarda con signo negativo)", async () => {
    const result = await registrarMovimientoManual(
      productoId,
      { tipo: "egreso", cantidad: 3, motivo: "Rotura" },
      admin,
      db
    );

    expect(result.cantidad).toBe(-3);
    expect(result.existenciaResultante).toBe(7);
  });

  it("rechaza motivo inválido para el tipo", async () => {
    await expect(
      registrarMovimientoManual(
        productoId,
        { tipo: "ingreso", cantidad: 1, motivo: "Rotura" },
        admin,
        db
      )
    ).rejects.toMatchObject({ status: 422, code: "VALIDACION" });
  });

  it("rechaza vendedor (403)", async () => {
    await expect(
      registrarMovimientoManual(
        productoId,
        { tipo: "ingreso", cantidad: 1, motivo: "Reposición" },
        vendedor,
        db
      )
    ).rejects.toMatchObject({ status: 403, code: "SIN_PERMISO" });
  });

  it("mantiene invariante: existencia == suma de movimientos", async () => {
    await registrarMovimientoManual(productoId, { tipo: "ingreso", cantidad: 5, motivo: "Reposición" }, admin, db);
    await registrarMovimientoManual(productoId, { tipo: "egreso", cantidad: 2, motivo: "Rotura" }, admin, db);
    await registrarMovimientoManual(productoId, { tipo: "egreso", cantidad: 1, motivo: "Uso interno" }, admin, db);

    const [prod] = await db
      .select({ existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, productoId));

    const [agg] = await db
      .select({ total: sum(movimientosStock.cantidad) })
      .from(movimientosStock)
      .where(eq(movimientosStock.productoId, productoId));

    // existencia base 10 + (5 - 2 - 1) = 12; suma movimientos = 2
    expect(prod.existencia).toBe(12);
    expect(Number(agg.total)).toBe(2);
    expect(10 + Number(agg.total)).toBe(prod.existencia);
  });
});

describe("listados de movimientos (RF-P6)", () => {
  it("lista movimientos de un producto paginados, más reciente primero", async () => {
    await registrarMovimientoManual(productoId, { tipo: "ingreso", cantidad: 1, motivo: "Reposición" }, admin, db);
    await registrarMovimientoManual(productoId, { tipo: "egreso", cantidad: 1, motivo: "Rotura" }, admin, db);

    const result = await listMovimientosPorProducto(productoId, { page: 1, pageSize: 10 }, vendedor, db);

    expect(result.total).toBe(2);
    expect(result.data[0].tipo).toBe("egreso");
    expect(result.data[0].fecha).toMatch(ISO_UTC);
    expect(result.data[1].tipo).toBe("ingreso");
  });

  it("filtra movimientos generales por tipo", async () => {
    await registrarMovimientoManual(productoId, { tipo: "ingreso", cantidad: 1, motivo: "Reposición" }, admin, db);
    await registrarMovimientoManual(productoId, { tipo: "egreso", cantidad: 1, motivo: "Rotura" }, admin, db);

    const ingresos = await listMovimientosStock({ tipo: "ingreso" }, vendedor, db);
    expect(ingresos.total).toBe(1);
    expect(ingresos.data[0].tipo).toBe("ingreso");
    expect(ingresos.data[0].fecha).toMatch(ISO_UTC);
    expect(ingresos.data[0].producto).toMatchObject({ id: productoId, codigo: "P-1" });
  });

  it("devuelve 404 al listar movimientos de producto inexistente", async () => {
    await expect(
      listMovimientosPorProducto(9999, {}, admin, db)
    ).rejects.toMatchObject({ status: 404, code: "NO_ENCONTRADO" });
  });
});
