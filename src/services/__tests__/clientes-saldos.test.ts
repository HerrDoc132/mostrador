import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { movimientosCuenta, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { createCliente, listDeudores } from "@/services/clientes";
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

async function seedCliente(nombre: string, nroDoc: string, saldo: number) {
  const cliente = await createCliente(
    { tipoDoc: "DNI", nroDoc, nombre, cuentaCorriente: true },
    vendedor,
    db
  );
  if (saldo > 0) {
    await db.insert(movimientosCuenta).values({
      clienteId: cliente.id,
      tipo: "debito",
      importe: saldo,
      descripcion: "Factura de prueba",
    });
  } else if (saldo < 0) {
    await db.insert(movimientosCuenta).values({
      clienteId: cliente.id,
      tipo: "credito",
      importe: -saldo,
      descripcion: "Crédito sin deuda",
    });
  }
  return cliente;
}

beforeEach(async () => {
  db = await createTestDb();
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Admin", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Vendedor", rol: "vendedor" })
  );

  await seedCliente("Ana Pérez", "10000001", 100000);
  await seedCliente("Beto García", "10000002", 500000);
  await seedCliente("Carla Ruiz", "10000003", 0);
  await seedCliente("Daniela Soto", "10000004", -20000);
});

describe("clientes service · RF-C6 saldos deudores", () => {
  it("incluye solo saldos positivos, ordenados de mayor a menor deuda", async () => {
    const result = await listDeudores({}, vendedor, db);

    expect(result.data.map((c) => c.nombre)).toEqual(["Beto García", "Ana Pérez"]);
    expect(result.total).toBe(2);
    expect(result.totalAdeudado).toBe(600000);
  });

  it("fuerza el orden por saldo aunque se solicite otro", async () => {
    const result = await listDeudores({ orden: "nombre" }, vendedor, db);

    expect(result.data.map((c) => c.nombre)).toEqual(["Beto García", "Ana Pérez"]);
  });

  it("el total general respeta la búsqueda pero no la paginación", async () => {
    const buscado = await listDeudores({ q: "Beto", page: 1, pageSize: 1 }, admin, db);

    expect(buscado.data).toHaveLength(1);
    expect(buscado.total).toBe(1);
    expect(buscado.totalAdeudado).toBe(500000);

    const paginado = await listDeudores({ page: 2, pageSize: 1 }, admin, db);

    expect(paginado.data).toHaveLength(1);
    expect(paginado.data[0].nombre).toBe("Ana Pérez");
    expect(paginado.totalAdeudado).toBe(600000);
  });

  it("devuelve totalAdeudado en cero cuando no hay deudores", async () => {
    const resultado = await listDeudores({ q: "No existe" }, vendedor, db);

    expect(resultado.data).toEqual([]);
    expect(resultado.total).toBe(0);
    expect(resultado.totalAdeudado).toBe(0);
  });
});
