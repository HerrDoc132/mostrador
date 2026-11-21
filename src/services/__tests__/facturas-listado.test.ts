import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { categorias, facturas, productos, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente } from "@/services/clientes";
import { createFactura, listFacturas } from "@/services/facturas";
import { createTestDb } from "@/test/db";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let productoId: number;
let clienteUnoId: number;
let clienteDosId: number;

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

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error(`Se esperaba ${status} ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).code).toBe(code);
  }
}

beforeEach(async () => {
  db = await createTestDb();
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Laura Méndez", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );

  const [categoria] = await db.insert(categorias).values({ nombre: "Herramientas" }).returning();
  const [producto] = await db
    .insert(productos)
    .values({
      codigo: "EL-001",
      descripcion: "Cinta aisladora 20 m",
      categoriaId: categoria.id,
      precio: 190000,
      existencia: 50,
      stockMinimo: 1,
      activo: true,
    })
    .returning();
  productoId = producto.id;

  const clienteUno = await createCliente(
    { tipoDoc: "DNI", nroDoc: "28456123", nombre: "Mariana López", cuentaCorriente: true },
    vendedor,
    db
  );
  clienteUnoId = clienteUno.id;
  const clienteDos = await createCliente(
    { tipoDoc: "DNI", nroDoc: "30111222", nombre: "Carlos García" },
    vendedor,
    db
  );
  clienteDosId = clienteDos.id;

  const items = [{ productoId, cantidad: 1 }];

  const contado = await createFactura(
    { clienteId: clienteUnoId, items, pago: { forma: "contado", montoRecibido: 190000 } },
    vendedor,
    db
  );
  await db
    .update(facturas)
    .set({ fecha: "2026-11-20 10:00:00" })
    .where(eq(facturas.id, contado.id));

  const cuenta = await createFactura(
    { clienteId: clienteDosId, items, pago: { forma: "contado" } },
    admin,
    db
  );
  await db
    .update(facturas)
    .set({ fecha: "2026-11-21 10:00:00", estado: "anulada", motivoAnulacion: "Error" })
    .where(eq(facturas.id, cuenta.id));

  const consumidorFinal = await createFactura(
    { items, pago: { forma: "contado" } },
    vendedor,
    db
  );
  await db
    .update(facturas)
    .set({ fecha: "2026-11-19 10:00:00" })
    .where(eq(facturas.id, consumidorFinal.id));
});

describe("listFacturas · RF-V8", () => {
  it("lista de más reciente a más antiguo sin array de ítems y con totalEmitido", async () => {
    const listado = await listFacturas({}, admin, db);

    expect(listado.data).toHaveLength(3);
    expect(listado.data.map((f) => f.numero)).toEqual([3, 2, 1]);
    expect(listado.data[0]).not.toHaveProperty("items");
    expect(listado.data[0]).toMatchObject({
      numeroFormateado: "0001-00000003",
      estado: "emitida",
      cliente: null,
      vendedor: { nombre: "Pablo Ruiz" },
    });
    expect(listado.total).toBe(3);
    expect(listado.page).toBe(1);
    expect(listado.pageSize).toBe(20);
    expect(listado.totalEmitido).toBe(380000);
  });

  it("filtra por estado y por forma de pago", async () => {
    const anuladas = await listFacturas({ estado: "anulada" }, admin, db);
    expect(anuladas.data).toHaveLength(1);
    expect(anuladas.data[0].numero).toBe(2);
    expect(anuladas.totalEmitido).toBe(0);

    const contado = await listFacturas({ forma: "contado" }, admin, db);
    expect(contado.data).toHaveLength(3);
  });

  it("filtra por cliente, vendedor, rango de fechas y búsqueda", async () => {
    const porCliente = await listFacturas({ clienteId: clienteUnoId }, admin, db);
    expect(porCliente.data.map((f) => f.numero)).toEqual([1]);

    const porVendedor = await listFacturas({ vendedorId: vendedor.id }, admin, db);
    expect(porVendedor.data.map((f) => f.numero)).toEqual([3, 1]);

    const porFecha = await listFacturas({ desde: "2026-11-21", hasta: "2026-11-21" }, admin, db);
    expect(porFecha.data.map((f) => f.numero)).toEqual([2]);

    const porNumero = await listFacturas({ q: "0001-00000001" }, admin, db);
    expect(porNumero.data.map((f) => f.numero)).toEqual([1]);

    const porNombre = await listFacturas({ q: "Carlos" }, admin, db);
    expect(porNombre.data.map((f) => f.numero)).toEqual([2]);
  });

  it("paginea maintaining el total y el totalEmitido global del filtro", async () => {
    const primera = await listFacturas({ pageSize: 2 }, admin, db);
    expect(primera.data.map((f) => f.numero)).toEqual([3, 2]);
    expect(primera.total).toBe(3);
    expect(primera.totalEmitido).toBe(380000);

    const segunda = await listFacturas({ pageSize: 2, page: 2 }, admin, db);
    expect(segunda.data.map((f) => f.numero)).toEqual([1]);
    expect(segunda.total).toBe(3);
  });

  it("valida los parámetros de consulta", async () => {
    await expectApiError(listFacturas({ pageSize: 101 }, admin, db), 422, "VALIDACION");
    await expectApiError(listFacturas({ estado: "otro" }, admin, db), 422, "VALIDACION");
  });
});
