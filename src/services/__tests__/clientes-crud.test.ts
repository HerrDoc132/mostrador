import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { clientes, movimientosCuenta, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente, getCliente, updateCliente } from "@/services/clientes";
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

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error(`Se esperaba ${status} ${code} pero la operación terminó bien.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.code).toBe(code);
    return apiError;
  }
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

describe("clientes service · RF-C2 alta", () => {
  it("crea un cliente con valores por defecto y devuelve saldo 0", async () => {
    const creado = await createCliente(
      {
        tipoDoc: "DNI",
        nroDoc: "28.456.123",
        nombre: "Mariana López",
        domicilio: "Las Heras 455",
        telefono: "381 455-2210",
        email: "mariana.lopez@correo.test",
      },
      vendedor,
      db
    );

    expect(creado).toMatchObject({
      tipoDoc: "DNI",
      nroDoc: "28.456.123",
      nombre: "Mariana López",
      domicilio: "Las Heras 455",
      telefono: "381 455-2210",
      email: "mariana.lopez@correo.test",
      cuentaCorriente: false,
      limiteCredito: null,
      saldo: 0,
      disponible: null,
      activo: true,
    });
  });

  it("acepta cuenta corriente y límite de crédito en centavos", async () => {
    const creado = await createCliente(
      {
        tipoDoc: "CUIT",
        nroDoc: "20-11111111-9",
        nombre: "Comercio Ejemplo SRL",
        cuentaCorriente: true,
        limiteCredito: 40000000,
      },
      admin,
      db
    );

    expect(creado.cuentaCorriente).toBe(true);
    expect(creado.limiteCredito).toBe(40000000);
    expect(creado.disponible).toBe(40000000);
  });

  it("rechaza documento duplicado ignorando puntos, guiones y espacios", async () => {
    await createCliente({ tipoDoc: "DNI", nroDoc: "28.456.123", nombre: "Uno" }, vendedor, db);

    await expectApiError(
      createCliente({ tipoDoc: "DNI", nroDoc: "28456123", nombre: "Dos" }, vendedor, db),
      409,
      "DOCUMENTO_DUPLICADO"
    );
  });

  it("permite alta con CUIT válido aunque ya exista un DNI", async () => {
    await createCliente({ tipoDoc: "DNI", nroDoc: "30000000", nombre: "Uno" }, vendedor, db);

    const creado = await createCliente(
      { tipoDoc: "CUIT", nroDoc: "20-30000000-4", nombre: "Dos" },
      vendedor,
      db
    );

    expect(creado.tipoDoc).toBe("CUIT");
    expect(creado.nroDoc).toBe("20-30000000-4");
  });

  it("rechaza documentos con longitud inválida (PR #12) con 422 VALIDACION", async () => {
    const casos = [
      { tipoDoc: "DNI" as const, nroDoc: "12", mensaje: "El DNI debe tener 7 u 8 dígitos." },
      { tipoDoc: "DNI" as const, nroDoc: "123456789", mensaje: "El DNI debe tener 7 u 8 dígitos." },
      { tipoDoc: "DNI" as const, nroDoc: "ABC12345", mensaje: "El documento debe contener solo números, puntos o guiones." },
      { tipoDoc: "CUIT" as const, nroDoc: "30111222", mensaje: "El CUIT debe tener 11 dígitos." },
    ];

    for (const caso of casos) {
      const error = await expectApiError(
        createCliente({ ...caso, nombre: "Mariana López" }, vendedor, db),
        422,
        "VALIDACION"
      );
      expect(error.details).toEqual([{ campo: "nroDoc", mensaje: caso.mensaje }]);
    }
  });

  it("acepta DNI con puntos y CUIT con guiones, y valida también al editar", async () => {
    const cliente = await createCliente(
      { tipoDoc: "DNI", nroDoc: "28.456.123", nombre: "Mariana López" },
      vendedor,
      db
    );
    expect(cliente.nroDoc).toBe("28.456.123");

    await expectApiError(
      updateCliente(cliente.id, { tipoDoc: "CUIT", nroDoc: "12" }, vendedor, db),
      422,
      "VALIDACION"
    );
  });

  it("valida campos obligatorios y formatos con details por campo", async () => {
    const error = await expectApiError(
      createCliente(
        { tipoDoc: " passport", nroDoc: "", nombre: "  ", email: "no-es-email", limiteCredito: -1 },
        vendedor,
        db
      ),
      422,
      "VALIDACION"
    );

    const campos = (error.details ?? []).map((detail) => detail.campo);
    expect(campos).toContain("tipoDoc");
    expect(campos).toContain("nroDoc");
    expect(campos).toContain("nombre");
    expect(campos).toContain("email");
    expect(campos).toContain("limiteCredito");
  });
});

describe("clientes service · RF-C2 edición", () => {
  it("actualiza datos sin alterar el saldo", async () => {
    const cliente = await createCliente(
      { tipoDoc: "DNI", nroDoc: "30000000", nombre: "Nombre original" },
      vendedor,
      db
    );
    await db.insert(movimientosCuenta).values({
      clienteId: cliente.id,
      tipo: "debito",
      importe: 250000,
      descripcion: "Factura de prueba",
    });

    const actualizado = await updateCliente(
      cliente.id,
      { nombre: "Nombre nuevo", telefono: "381 111-2222", limiteCredito: 100000000 },
      vendedor,
      db
    );

    expect(actualizado).toMatchObject({
      nombre: "Nombre nuevo",
      telefono: "381 111-2222",
      limiteCredito: 100000000,
      saldo: 250000,
      disponible: 99750000,
    });
  });

  it("rechaza cambios de documento a uno ya existente", async () => {
    const uno = await createCliente({ tipoDoc: "DNI", nroDoc: "11111111", nombre: "Uno" }, vendedor, db);
    await createCliente({ tipoDoc: "DNI", nroDoc: "22222222", nombre: "Dos" }, vendedor, db);

    await expectApiError(
      updateCliente(uno.id, { nroDoc: "22.222.222" }, vendedor, db),
      409,
      "DOCUMENTO_DUPLICADO"
    );
  });

  it("no deshabilita la cuenta corriente si hay saldo pendiente", async () => {
    const cliente = await createCliente(
      { tipoDoc: "DNI", nroDoc: "33333333", nombre: "Deudor", cuentaCorriente: true },
      vendedor,
      db
    );
    await db.insert(movimientosCuenta).values({
      clienteId: cliente.id,
      tipo: "debito",
      importe: 9900,
      descripcion: "Factura impaga",
    });

    const error = await expectApiError(
      updateCliente(cliente.id, { cuentaCorriente: false }, vendedor, db),
      422,
      "SALDO_PENDIENTE"
    );

    expect(error.details?.[0]).toMatchObject({ saldoActual: 9900 });
    expect((await getCliente(cliente.id, vendedor, db)).cuentaCorriente).toBe(true);
  });

  it("permite deshabilitar la cuenta corriente cuando el saldo está cancelado", async () => {
    const cliente = await createCliente(
      { tipoDoc: "DNI", nroDoc: "44444444", nombre: "Cancelado", cuentaCorriente: true },
      vendedor,
      db
    );
    await db.insert(movimientosCuenta).values([
      { clienteId: cliente.id, tipo: "debito", importe: 50000, descripcion: "Factura" },
      { clienteId: cliente.id, tipo: "credito", importe: 50000, descripcion: "Pago" },
    ]);

    const actualizado = await updateCliente(
      cliente.id,
      { cuentaCorriente: false },
      vendedor,
      db
    );

    expect(actualizado.cuentaCorriente).toBe(false);
    expect(actualizado.saldo).toBe(0);
  });

  it("devuelve 404 si el cliente no existe", async () => {
    await expectApiError(
      updateCliente(999, { nombre: "Nadie" }, vendedor, db),
      404,
      "NO_ENCONTRADO"
    );
  });
});
