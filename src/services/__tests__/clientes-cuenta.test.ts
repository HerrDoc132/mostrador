import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { movimientosCuenta, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente, getCuentaCliente } from "@/services/clientes";
import { createTestDb } from "@/test/db";

let db: Database;
let vendedor: PublicUser;
let clienteId: number;

async function seedUser(overrides: Partial<typeof usuarios.$inferInsert>): Promise<UserRow> {
  const passwordHash = await bcrypt.hash("secreto123", 4);
  const [user] = await db
    .insert(usuarios)
    .values({
      email: "vend@test.com",
      nombre: "Vendedor",
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
  vendedor = toPublicUser(await seedUser({}));
  const cliente = await createCliente(
    { tipoDoc: "DNI", nroDoc: "28456123", nombre: "Mariana López", cuentaCorriente: true },
    vendedor,
    db
  );
  clienteId = cliente.id;

  await db.insert(movimientosCuenta).values([
    {
      clienteId,
      tipo: "debito",
      importe: 100000,
      fecha: "2026-10-20T12:00:00Z",
      descripcion: "Factura 0001-00000001",
    },
    {
      clienteId,
      tipo: "debito",
      importe: 200000,
      fecha: "2026-10-25T12:00:00Z",
      descripcion: "Factura 0001-00000002",
    },
    {
      clienteId,
      tipo: "credito",
      importe: 50000,
      fecha: "2026-10-26T12:00:00Z",
      descripcion: "Recibo R 0001-00000001",
    },
  ]);
});

describe("clientes service · RF-C4 cuenta corriente", () => {
  it("ordena cronológicamente y calcula el saldo acumulado renglón por renglón", async () => {
    const cuenta = await getCuentaCliente(clienteId, {}, vendedor, db);

    expect(cuenta.cliente).toEqual({ id: clienteId, nombre: "Mariana López" });
    expect(cuenta.saldoAnterior).toBe(0);
    expect(cuenta.movimientos.map((m) => m.saldo)).toEqual([100000, 300000, 250000]);
    expect(cuenta.movimientos.map((m) => m.tipo)).toEqual(["debito", "debito", "credito"]);
    expect(cuenta.saldo).toBe(250000);
  });

  it("calcula el saldo anterior al rango desde y mantiene el saldo final", async () => {
    const cuenta = await getCuentaCliente(clienteId, { desde: "2026-10-25" }, vendedor, db);

    expect(cuenta.saldoAnterior).toBe(100000);
    expect(cuenta.movimientos).toHaveLength(2);
    expect(cuenta.movimientos.map((m) => m.saldo)).toEqual([300000, 250000]);
    expect(cuenta.saldo).toBe(250000);
  });

  it("aplica el filtro hasta con límite exclusivo del día siguiente", async () => {
    const cuenta = await getCuentaCliente(clienteId, { hasta: "2026-10-25" }, vendedor, db);

    expect(cuenta.movimientos).toHaveLength(2);
    expect(cuenta.saldo).toBe(300000);
  });

  it("combina desde y hasta", async () => {
    const cuenta = await getCuentaCliente(
      clienteId,
      { desde: "2026-10-25", hasta: "2026-10-25" },
      vendedor,
      db
    );

    expect(cuenta.saldoAnterior).toBe(100000);
    expect(cuenta.movimientos).toHaveLength(1);
    expect(cuenta.movimientos[0].descripcion).toBe("Factura 0001-00000002");
    expect(cuenta.saldo).toBe(300000);
  });

  it("rechaza fechas con formato inválido y rangos invertidos", async () => {
    await expectApiError(
      getCuentaCliente(clienteId, { desde: "25-10-2026" }, vendedor, db),
      422,
      "VALIDACION"
    );
    await expectApiError(
      getCuentaCliente(clienteId, { desde: "2026-10-26", hasta: "2026-10-25" }, vendedor, db),
      422,
      "VALIDACION"
    );
  });

  it("devuelve 404 para un cliente inexistente", async () => {
    await expectApiError(getCuentaCliente(999, {}, vendedor, db), 404, "NO_ENCONTRADO");
  });
});
