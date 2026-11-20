import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { clientes, movimientosCuenta, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente, getCliente, listClientes, updateCliente } from "@/services/clientes";
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
    throw new Error(`Se esperaba ${status} ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).code).toBe(code);
    return error as ApiError;
  }
}

async function crearCliente(nroDoc = "28456123") {
  return createCliente(
    { tipoDoc: "DNI", nroDoc, nombre: "Mariana López", cuentaCorriente: true },
    vendedor,
    db
  );
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

describe("clientes service · RF-C7 baja lógica", () => {
  it("da de baja sin borrar el registro y lo oculta del listado habitual", async () => {
    const cliente = await crearCliente();

    const dadoDeBaja = await updateCliente(cliente.id, { activo: false }, admin, db);

    expect(dadoDeBaja.activo).toBe(false);
    const filas = await db.select().from(clientes).where(eq(clientes.id, cliente.id));
    expect(filas).toHaveLength(1);

    const porDefecto = await listClientes({}, vendedor, db);
    expect(porDefecto.total).toBe(0);
    const todos = await listClientes({ activo: "todos" }, admin, db);
    expect(todos.total).toBe(1);
    expect((await getCliente(cliente.id, vendedor, db)).activo).toBe(false);
  });

  it("no permite desactivar a un vendedor", async () => {
    const cliente = await crearCliente();

    await expectApiError(
      updateCliente(cliente.id, { activo: false }, vendedor, db),
      403,
      "SIN_PERMISO"
    );

    expect((await getCliente(cliente.id, vendedor, db)).activo).toBe(true);
  });

  it("no permite desactivar un cliente con saldo pendiente", async () => {
    const cliente = await crearCliente();
    await db.insert(movimientosCuenta).values({
      clienteId: cliente.id,
      tipo: "debito",
      importe: 9900,
      descripcion: "Factura impaga",
    });

    const error = await expectApiError(
      updateCliente(cliente.id, { activo: false }, admin, db),
      422,
      "SALDO_PENDIENTE"
    );

    expect(error.details?.[0]).toMatchObject({ saldoActual: 9900 });
    expect((await getCliente(cliente.id, admin, db)).activo).toBe(true);
  });

  it("permite desactivar cuando el saldo fue cancelado", async () => {
    const cliente = await crearCliente();
    await db.insert(movimientosCuenta).values([
      { clienteId: cliente.id, tipo: "debito", importe: 50000, descripcion: "Factura" },
      { clienteId: cliente.id, tipo: "credito", importe: 50000, descripcion: "Pago" },
    ]);

    const dadoDeBaja = await updateCliente(cliente.id, { activo: false }, admin, db);

    expect(dadoDeBaja.activo).toBe(false);
    expect(dadoDeBaja.saldo).toBe(0);
  });

  it("permite reactivar solo al administrador", async () => {
    const cliente = await crearCliente();
    await updateCliente(cliente.id, { activo: false }, admin, db);

    await expectApiError(
      updateCliente(cliente.id, { activo: true }, vendedor, db),
      403,
      "SIN_PERMISO"
    );

    const reactivado = await updateCliente(cliente.id, { activo: true }, admin, db);
    expect(reactivado.activo).toBe(true);
  });

  it("devuelve 404 si el cliente no existe", async () => {
    await expectApiError(
      updateCliente(999, { activo: false }, admin, db),
      404,
      "NO_ENCONTRADO"
    );
  });
});
