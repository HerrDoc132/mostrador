import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Database } from "@/db";
import { facturas, usuarios } from "@/db/schema";
import { toPublicUser, type PublicUser, type UserRow } from "@/services/auth";
import { getPorFormaDePago, getTablero, getVentasDiarias } from "@/services/tablero";
import { createTestDb } from "@/test/db";

/**
 * RF-T2 (TP5-35): series para Chart.js. TDD: se escriben antes de extender
 * el servicio; el reloj se inyecta para fijar la ventana de 30 días.
 */

const AHORA = new Date("2026-11-21T15:00:00Z"); // 21/11/2026 en Buenos Aires

let db: Database;
let admin: PublicUser;
let vendedor: PublicUser;
let correlativo: number;

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

async function seedFactura(overrides: Partial<typeof facturas.$inferInsert> = {}) {
  correlativo += 1;
  const [factura] = await db
    .insert(facturas)
    .values({
      numero: correlativo,
      fecha: "2026-11-21 12:00:00",
      total: 190000,
      formaPago: "contado",
      estado: "emitida",
      usuarioId: vendedor.id,
      ...overrides,
    })
    .returning();
  return factura;
}

beforeEach(async () => {
  db = await createTestDb();
  correlativo = 0;
  admin = toPublicUser(
    await seedUser({ email: "admin@test.com", nombre: "Laura Méndez", rol: "admin" })
  );
  vendedor = toPublicUser(
    await seedUser({ email: "vend@test.com", nombre: "Pablo Ruiz", rol: "vendedor" })
  );
});

describe("RF-T2 · series de gráficos (TP5-35)", () => {
  it("devuelve exactamente 30 días correlativos, con 0 en los días sin ventas", async () => {
    await seedFactura({ fecha: "2026-11-21 12:00:00", total: 190000 });
    await seedFactura({ fecha: "2026-11-19 12:00:00", total: 250000 });
    await seedFactura({ fecha: "2026-10-22 12:00:00", total: 999999 }); // fuera de ventana

    const serie = await getVentasDiarias(vendedor, db, AHORA);

    expect(serie).toHaveLength(30);
    expect(serie[0]).toEqual({ fecha: "2026-10-23", importe: 0 });
    expect(serie[29]).toEqual({ fecha: "2026-11-21", importe: 190000 });
    expect(serie[27]).toEqual({ fecha: "2026-11-19", importe: 250000 });
    expect(serie.map((p) => p.fecha)).toEqual(
      Array.from({ length: 30 }, (_, i) => {
        const dia = new Date(Date.UTC(2026, 9, 23 + i));
        return dia.toISOString().slice(0, 10);
      })
    );
    expect(serie.some((p) => p.importe === 999999)).toBe(false);
  });

  it("aplica el corte local de Buenos Aires y excluye anuladas", async () => {
    // 02:30Z del 21 es 20/11 local; 03:00Z del 21 es 21/11 local.
    await seedFactura({ fecha: "2026-11-21 02:30:00", total: 100000 });
    await seedFactura({ fecha: "2026-11-21 03:00:00", total: 200000 });
    await seedFactura({
      fecha: "2026-11-21 13:00:00",
      total: 900000,
      estado: "anulada",
      motivoAnulacion: "Prueba",
    });

    const serie = await getVentasDiarias(vendedor, db, AHORA);

    expect(serie[28]).toEqual({ fecha: "2026-11-20", importe: 100000 });
    expect(serie[29]).toEqual({ fecha: "2026-11-21", importe: 200000 });
  });

  it("consolida las 3 formas de pago del mes, con 0 en las que no hubo ventas", async () => {
    await seedFactura({ fecha: "2026-11-21 12:00:00", total: 190000, formaPago: "contado" });
    await seedFactura({ fecha: "2026-11-21 02:30:00", total: 100000, formaPago: "contado" });
    await seedFactura({ fecha: "2026-11-05 12:00:00", total: 300000, formaPago: "tarjeta" });
    await seedFactura({
      fecha: "2026-11-10 12:00:00",
      total: 125000,
      formaPago: "cuenta_corriente",
    });
    await seedFactura({
      fecha: "2026-11-21 13:00:00",
      total: 900000,
      formaPago: "tarjeta",
      estado: "anulada",
      motivoAnulacion: "Prueba",
    });
    await seedFactura({
      fecha: "2026-10-31 23:00:00",
      total: 777777,
      formaPago: "contado",
    });

    const desglose = await getPorFormaDePago(vendedor, db, AHORA);

    expect(desglose).toEqual([
      { forma: "contado", importe: 290000 },
      { forma: "tarjeta", importe: 300000 },
      { forma: "cuenta_corriente", importe: 125000 },
    ]);
  });

  it("rellena con 0 cuando no hay ventas en el mes", async () => {
    await seedFactura({ fecha: "2026-10-15 12:00:00", total: 500000 });

    const [serie, desglose] = await Promise.all([
      getVentasDiarias(vendedor, db, AHORA),
      getPorFormaDePago(vendedor, db, AHORA),
    ]);

    expect(serie).toHaveLength(30);
    expect(serie.every((p) => p.importe === 0)).toBe(true);
    expect(desglose.every((p) => p.importe === 0)).toBe(true);
  });

  it("da las mismas series a ambos roles y las expone en getTablero", async () => {
    await seedFactura({ formaPago: "tarjeta", total: 125000 });

    const serieAdmin = await getVentasDiarias(admin, db, AHORA);
    const serieVendedor = await getVentasDiarias(vendedor, db, AHORA);
    const desglose = await getPorFormaDePago(vendedor, db, AHORA);
    const tablero = await getTablero(vendedor, db, AHORA);

    expect(serieVendedor).toEqual(serieAdmin);
    expect(tablero.ventasDiarias).toEqual(serieAdmin);
    expect(tablero.porFormaDePago).toEqual(desglose);
  });
});
