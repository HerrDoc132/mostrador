import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { clientes, movimientosCuenta, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { listClientes } from "@/services/clientes";
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

async function seedCliente(overrides: Partial<typeof clientes.$inferInsert> = {}) {
  const [cliente] = await db
    .insert(clientes)
    .values({
      tipoDoc: "DNI",
      nroDoc: "30000000",
      nombre: "Cliente Base",
      cuentaCorriente: true,
      activo: true,
      ...overrides,
    })
    .returning();
  return cliente;
}

async function seedMovimiento(
  clienteId: number,
  tipo: "debito" | "credito",
  importe: number,
  descripcion = "Movimiento de prueba"
) {
  await db.insert(movimientosCuenta).values({
    clienteId,
    tipo,
    importe,
    descripcion,
  });
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

describe("clientes service · RF-C1 listado", () => {
  it("calcula saldo (débitos - créditos) y crédito disponible", async () => {
    const cliente = await seedCliente({ limiteCredito: 40000000 });
    await seedMovimiento(cliente.id, "debito", 1440000);
    await seedMovimiento(cliente.id, "credito", 440000);

    const result = await listClientes({}, vendedor, db);

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: cliente.id,
      nombre: "Cliente Base",
      saldo: 1000000,
      disponible: 39000000,
      cuentaCorriente: true,
    });
  });

  it("deja el disponible en null cuando el cliente no tiene límite", async () => {
    const cliente = await seedCliente({ limiteCredito: null });
    await seedMovimiento(cliente.id, "debito", 50000);

    const result = await listClientes({}, vendedor, db);

    expect(result.data[0].saldo).toBe(50000);
    expect(result.data[0].disponible).toBeNull();
  });

  it("busca por documento ignorando puntos y guiones", async () => {
    await seedCliente({ nombre: "Mariana López", nroDoc: "28.456.123" });
    await seedCliente({ nombre: "Otro Cliente", nroDoc: "20-11111111-9" });

    const porPuntos = await listClientes({ q: "28456123" }, vendedor, db);
    expect(porPuntos.total).toBe(1);
    expect(porPuntos.data[0].nombre).toBe("Mariana López");

    const porGuiones = await listClientes({ q: "2011111111 9" }, vendedor, db);
    expect(porGuiones.total).toBe(1);
    expect(porGuiones.data[0].nombre).toBe("Otro Cliente");
  });

  it("busca por nombre", async () => {
    await seedCliente({ nombre: "Mariana López", nroDoc: "1" });
    await seedCliente({ nombre: "Carlos Paz", nroDoc: "2" });

    const result = await listClientes({ q: "mariana" }, vendedor, db);

    expect(result.total).toBe(1);
    expect(result.data[0].nombre).toBe("Mariana López");
  });

  it("filtra deudores, ordena de mayor a menor y devuelve totalAdeudado", async () => {
    const conDeuda = await seedCliente({ nombre: "Con Deuda", nroDoc: "1" });
    const masDeuda = await seedCliente({ nombre: "Más Deuda", nroDoc: "2" });
    const sinDeuda = await seedCliente({ nombre: "Sin Deuda", nroDoc: "3" });
    await seedMovimiento(conDeuda.id, "debito", 100000);
    await seedMovimiento(masDeuda.id, "debito", 500000);
    await seedMovimiento(sinDeuda.id, "debito", 90000);
    await seedMovimiento(sinDeuda.id, "credito", 90000);

    const result = await listClientes({ conDeuda: "true" }, vendedor, db);

    expect(result.total).toBe(2);
    expect(result.data.map((c) => c.nombre)).toEqual(["Más Deuda", "Con Deuda"]);
    expect(result.totalAdeudado).toBe(600000);
  });

  it("ordena alfabéticamente por nombre con orden=nombre", async () => {
    await seedCliente({ nombre: "Zulema", nroDoc: "1" });
    await seedCliente({ nombre: "Ana", nroDoc: "2" });

    const result = await listClientes({ orden: "nombre" }, vendedor, db);

    expect(result.data.map((c) => c.nombre)).toEqual(["Ana", "Zulema"]);
  });

  it("excluye inactivos por defecto y permite verlos al admin con activo=todos", async () => {
    await seedCliente({ nombre: "Activo", nroDoc: "1" });
    await seedCliente({ nombre: "Inactivo", nroDoc: "2", activo: false });

    const porDefecto = await listClientes({}, vendedor, db);
    expect(porDefecto.total).toBe(1);

    const vendedorTodos = await listClientes({ activo: "todos" }, vendedor, db);
    expect(vendedorTodos.total).toBe(1);

    const adminTodos = await listClientes({ activo: "todos" }, admin, db);
    expect(adminTodos.total).toBe(2);
  });

  it("pagina resultados", async () => {
    for (let i = 1; i <= 5; i += 1) {
      await seedCliente({ nombre: `Cliente ${i}`, nroDoc: String(i) });
    }

    const primera = await listClientes({ page: 1, pageSize: 2 }, vendedor, db);
    const segunda = await listClientes({ page: 2, pageSize: 2 }, vendedor, db);

    expect(primera.data).toHaveLength(2);
    expect(primera.total).toBe(5);
    expect(segunda.data).toHaveLength(2);
    expect(segunda.data[0].nombre).not.toBe(primera.data[0].nombre);
  });
});
