import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { movimientosCuenta, pagos, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente } from "@/services/clientes";
import { getPago, registrarPago } from "@/services/pagos";
import { createTestDb } from "@/test/db";

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let clienteId: number;

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
    return error as ApiError;
  }
}

beforeEach(async () => {
  db = await createTestDb();
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Admin", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );
  const cliente = await createCliente(
    { tipoDoc: "DNI", nroDoc: "28456123", nombre: "Mariana López", cuentaCorriente: true },
    vendedor,
    db
  );
  clienteId = cliente.id;
  await db.insert(movimientosCuenta).values({
    clienteId,
    tipo: "debito",
    importe: 1440000,
    descripcion: "Factura 0001-00001223",
  });
});

describe("pagos service · RF-C5", () => {
  it("registra pago, recibo correlativo y movimiento de crédito en una transacción", async () => {
    const pago = await registrarPago(
      clienteId,
      { importe: 500000, medio: "transferencia", observacion: "Pago parcial" },
      vendedor,
      db
    );

    expect(pago).toMatchObject({
      numeroRecibo: "R 0001-00000001",
      importe: 500000,
      medio: "transferencia",
      observacion: "Pago parcial",
      cliente: { id: clienteId, nombre: "Mariana López" },
      usuario: { id: vendedor.id, nombre: "Pablo Ruiz" },
      saldoCliente: 940000,
    });

    const movimientos = await db
      .select()
      .from(movimientosCuenta)
      .where(eq(movimientosCuenta.clienteId, clienteId));
    const credito = movimientos.find((m) => m.pagoId === pago.id);
    expect(credito).toMatchObject({
      tipo: "credito",
      importe: 500000,
      descripcion: "Recibo R 0001-00000001",
    });
  });

  it("numera los recibos de forma correlativa e independiente", async () => {
    const primero = await registrarPago(clienteId, { importe: 100000, medio: "efectivo" }, admin, db);
    const segundo = await registrarPago(
      clienteId,
      { importe: 200000, medio: "tarjeta_debito" },
      admin,
      db
    );

    expect(primero.numeroRecibo).toBe("R 0001-00000001");
    expect(segundo.numeroRecibo).toBe("R 0001-00000002");
  });

  it("rechaza pagos si la cuenta corriente no está habilitada (Regla 6)", async () => {
    const sinCuenta = await createCliente(
      { tipoDoc: "DNI", nroDoc: "10000001", nombre: "Contado", cuentaCorriente: false },
      vendedor,
      db
    );

    await expectApiError(
      registrarPago(sinCuenta.id, { importe: 100, medio: "efectivo" }, vendedor, db),
      422,
      "CUENTA_CORRIENTE_NO_HABILITADA"
    );
  });

  it("rechaza pagos que superan la deuda (Regla 8) sin grabar nada", async () => {
    const error = await expectApiError(
      registrarPago(clienteId, { importe: 1440001, medio: "efectivo" }, vendedor, db),
      422,
      "PAGO_SUPERA_DEUDA"
    );

    expect(error.details?.[0]).toMatchObject({
      importe: 1440001,
      saldo: 1440000,
      excedente: 1,
    });
    expect(await db.select().from(pagos)).toHaveLength(0);
    const movimientos = await db
      .select()
      .from(movimientosCuenta)
      .where(eq(movimientosCuenta.clienteId, clienteId));
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].tipo).toBe("debito");
  });

  it("acepta pagar exactamente el saldo y deja saldo cero", async () => {
    const pago = await registrarPago(clienteId, { importe: 1440000, medio: "efectivo" }, vendedor, db);

    expect(pago.saldoCliente).toBe(0);
  });

  it("valida importe y medio con details por campo", async () => {
    const error = await expectApiError(
      registrarPago(clienteId, { importe: 0, medio: "cheque" }, vendedor, db),
      422,
      "VALIDACION"
    );

    const campos = (error.details ?? []).map((detail) => detail.campo);
    expect(campos).toContain("importe");
    expect(campos).toContain("medio");
  });

  it("devuelve 404 si el cliente no existe", async () => {
    await expectApiError(
      registrarPago(999, { importe: 100, medio: "efectivo" }, vendedor, db),
      404,
      "NO_ENCONTRADO"
    );
  });

  it("devuelve el detalle del recibo para reimpresión", async () => {
    const pago = await registrarPago(
      clienteId,
      { importe: 500000, medio: "transferencia", observacion: "Pago parcial" },
      vendedor,
      db
    );

    const detalle = await getPago(pago.id, admin, db);

    expect(detalle).toMatchObject({
      numeroRecibo: "R 0001-00000001",
      importe: 500000,
      medio: "transferencia",
      cliente: {
        id: clienteId,
        nombre: "Mariana López",
        tipoDoc: "DNI",
        nroDoc: "28456123",
      },
      usuario: { id: vendedor.id, nombre: "Pablo Ruiz" },
    });
  });

  it("devuelve 404 si el recibo no existe", async () => {
    await expectApiError(getPago(12345, admin, db), 404, "NO_ENCONTRADO");
  });
});
