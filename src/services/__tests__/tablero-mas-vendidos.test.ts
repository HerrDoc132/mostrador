import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import {
  categorias,
  facturaItems,
  facturas,
  productos,
  usuarios,
} from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { getMasVendidos, getTablero } from "@/services/tablero";
import { createTestDb } from "@/test/db";

/**
 * RF-T3 (TP5-36): ranking de los 5 productos más vendidos del mes.
 * TDD: estos tests se escriben antes de extender el servicio.
 */

const AHORA = new Date("2026-11-21T15:00:00Z"); // 21/11/2026 en Buenos Aires

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let categoriaId: number;
let correlativo: number;
let correlativoProducto: number;

async function seedUser(overrides: Partial<typeof usuarios.$inferInsert>): Promise<UserRow> {
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "user@test.com",
      nombre: "Usuario",
      passwordHash: await bcrypt.hash("secreto123", 4),
      rol: "vendedor",
      activo: true,
      ...overrides,
    })
    .returning();
  return user;
}

async function seedProducto(
  codigo: string,
  descripcion: string,
  precio: number
): Promise<number> {
  correlativoProducto += 1;
  const [producto] = await db
    .insert(productos)
    .values({
      codigo,
      descripcion,
      categoriaId,
      precio,
      existencia: 100,
      stockMinimo: 5,
      activo: true,
    })
    .returning();
  return producto.id;
}

async function seedFactura(
  fecha: string,
  estado: "emitida" | "anulada" = "emitida"
): Promise<number> {
  correlativo += 1;
  const [factura] = await db
    .insert(facturas)
    .values({
      numero: correlativo,
      fecha,
      total: 0,
      formaPago: "contado",
      estado,
      usuarioId: vendedor.id,
    })
    .returning();
  return factura.id;
}

async function seedItem(
  facturaId: number,
  productoId: number,
  cantidad: number,
  precioUnitario: number
) {
  await db.insert(facturaItems).values({
    facturaId,
    productoId,
    cantidad,
    precioUnitario,
    subtotal: cantidad * precioUnitario,
    descripcion: `Ítem ${productoId}`,
  });
}

beforeEach(async () => {
  db = await createTestDb();
  correlativo = 0;
  correlativoProducto = 0;
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Laura Méndez", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );
  const [categoria] = await db
    .insert(categorias)
    .values({ nombre: "Iluminación" })
    .returning();
  categoriaId = categoria.id;
});

describe("RF-T3 · top 5 productos más vendidos (TP5-36)", () => {
  it("ordena por unidades vendidas del mes y expone importe acumulado en centavos", async () => {
    const productoC = await seedProducto("EL-003", "Lámpara LED 12 W", 320000);
    const productoA = await seedProducto("EL-001", "Ampolleta LED 9 W", 250000);
    const productoB = await seedProducto("EL-002", "Cinta LED 5 m", 150000);

    const f1 = await seedFactura("2026-11-21 12:00:00");
    await seedItem(f1, productoC, 5, 320000);
    await seedItem(f1, productoA, 2, 250000);

    const f2 = await seedFactura("2026-11-05 12:00:00");
    await seedItem(f2, productoA, 9, 250000);
    await seedItem(f2, productoB, 7, 150000);

    const ranking = await getMasVendidos(vendedor, db, AHORA);

    expect(ranking).toEqual([
      {
        productoId: productoA,
        codigo: "EL-001",
        descripcion: "Ampolleta LED 9 W",
        unidades: 11,
        importe: 11 * 250000,
      },
      {
        productoId: productoB,
        codigo: "EL-002",
        descripcion: "Cinta LED 5 m",
        unidades: 7,
        importe: 7 * 150000,
      },
      {
        productoId: productoC,
        codigo: "EL-003",
        descripcion: "Lámpara LED 12 W",
        unidades: 5,
        importe: 5 * 320000,
      },
    ]);
  });

  it("limita el ranking a 5 elementos", async () => {
    const productos = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        seedProducto(`P-${i + 1}`, `Producto ${i + 1}`, 100000 + i)
      )
    );
    const factura = await seedFactura("2026-11-21 12:00:00");
    for (const [indice, productoId] of productos.entries()) {
      await seedItem(factura, productoId, 7 - indice, 100000);
    }

    const ranking = await getMasVendidos(vendedor, db, AHORA);

    expect(ranking).toHaveLength(5);
    expect(ranking.map((p) => p.unidades)).toEqual([7, 6, 5, 4, 3]);
  });

  it("excluye facturas anuladas y de otros meses", async () => {
    const vigente = await seedProducto("V-1", "Vigente", 100000);
    const otroMes = await seedProducto("V-2", "Otro mes", 100000);
    const anulado = await seedProducto("V-3", "Anulado", 100000);

    const fHoy = await seedFactura("2026-11-21 12:00:00");
    await seedItem(fHoy, vigente, 4, 100000);

    const fAyerLocal = await seedFactura("2026-11-21 02:30:00"); // 20/11 local, sigue siendo mes
    await seedItem(fAyerLocal, vigente, 3, 100000);

    const fAnterior = await seedFactura("2026-10-31 23:00:00"); // 31/10 local
    await seedItem(fAnterior, otroMes, 99, 100000);

    const fAnulada = await seedFactura("2026-11-21 13:00:00", "anulada");
    await seedItem(fAnulada, anulado, 88, 100000);

    const ranking = await getMasVendidos(vendedor, db, AHORA);

    expect(ranking).toEqual([
      {
        productoId: vigente,
        codigo: "V-1",
        descripcion: "Vigente",
        unidades: 7,
        importe: 700000,
      },
    ]);
  });

  it("devuelve un arreglo vacío cuando no hay ventas en el mes", async () => {
    const producto = await seedProducto("P-1", "Producto", 100000);
    const factura = await seedFactura("2026-10-15 12:00:00");
    await seedItem(factura, producto, 10, 100000);

    expect(await getMasVendidos(vendedor, db, AHORA)).toEqual([]);
  });

  it("da el mismo ranking a ambos roles y lo expone en getTablero", async () => {
    const producto = await seedProducto("P-1", "Producto", 100000);
    const factura = await seedFactura("2026-11-21 12:00:00");
    await seedItem(factura, producto, 3, 100000);

    const rankingAdmin = await getMasVendidos(admin, db, AHORA);
    const rankingVendedor = await getMasVendidos(vendedor, db, AHORA);
    const tablero = await getTablero(vendedor, db, AHORA);

    expect(rankingVendedor).toEqual(rankingAdmin);
    expect(tablero.masVendidos).toEqual(rankingAdmin);
  });
});
