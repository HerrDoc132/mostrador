import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { facturas, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente, getCliente } from "@/services/clientes";
import { createTestDb } from "@/test/db";

let db: Database;
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

async function seedFactura(
  clienteId: number,
  usuarioId: number,
  numero: number,
  fecha: string,
  estado: "emitida" | "anulada" = "emitida"
) {
  await db.insert(facturas).values({
    clienteId,
    usuarioId,
    numero,
    puntoVenta: 1,
    fecha,
    total: numero * 1000,
    formaPago: "cuenta_corriente",
    estado,
  });
}

beforeEach(async () => {
  db = await createTestDb();
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Vendedor", rol: "vendedor" })
  );
});

describe("clientes service · RF-C3 ficha", () => {
  it("devuelve datos, saldo, disponible y las últimas 6 facturas emitidas", async () => {
    const cliente = await createCliente(
      {
        tipoDoc: "DNI",
        nroDoc: "28.456.123",
        nombre: "Mariana López",
        domicilio: "Las Heras 455",
        telefono: "381 455-2210",
        email: "mariana.lopez@correo.test",
        cuentaCorriente: true,
        limiteCredito: 40000000,
      },
      vendedor,
      db
    );
    for (let numero = 1; numero <= 8; numero += 1) {
      await seedFactura(cliente.id, vendedor.id, numero, `2026-10-${String(numero).padStart(2, "0")}T12:00:00Z`);
    }
    await seedFactura(cliente.id, vendedor.id, 9, "2026-10-09T12:00:00Z", "anulada");
    await db.insert(facturas).values({
      clienteId: null,
      usuarioId: vendedor.id,
      numero: 10,
      fecha: "2026-10-10T12:00:00Z",
      total: 99000,
      formaPago: "contado",
      estado: "emitida",
    });

    const ficha = await getCliente(cliente.id, vendedor, db);

    expect(ficha).toMatchObject({
      nombre: "Mariana López",
      domicilio: "Las Heras 455",
      telefono: "381 455-2210",
      email: "mariana.lopez@correo.test",
      saldo: 0,
      disponible: 40000000,
    });
    expect(ficha.ultimasFacturas).toHaveLength(6);
    expect(ficha.ultimasFacturas.map((f) => f.numero)).toEqual([8, 7, 6, 5, 4, 3]);
    expect(ficha.ultimasFacturas[0]).toMatchObject({
      numeroComprobante: "0001-00000008",
      total: 8000,
    });
  });

  it("devuelve un arreglo vacío si el cliente no tiene facturas", async () => {
    const cliente = await createCliente(
      { tipoDoc: "DNI", nroDoc: "10000002", nombre: "Sin facturas" },
      vendedor,
      db
    );

    const ficha = await getCliente(cliente.id, vendedor, db);

    expect(ficha.ultimasFacturas).toEqual([]);
  });

  it("devuelve 404 NO_ENCONTRADO para un cliente inexistente", async () => {
    try {
      await getCliente(12345, vendedor, db);
      throw new Error("Se esperaba 404 NO_ENCONTRADO.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).code).toBe("NO_ENCONTRADO");
    }
  });
});
