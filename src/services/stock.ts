import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import { facturas, movimientosStock, productos, usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import { assertRole, type PublicUser } from "@/services/auth";

/**
 * Servicio de movimientos de stock (RF-P4, RF-P5, RF-P6).
 * Centraliza el invariante de existencia: ningún otro código modifica
 * `productos.existencia` directamente.
 */

// RF-P4: motivos válidos para ingresos manuales
export const MOTIVOS_INGRESO = [
  "Reposición",
  "Stock inicial",
  "Devolución de cliente",
] as const;

// RF-P5: motivos válidos para egresos manuales
export const MOTIVOS_EGRESO = [
  "Rotura",
  "Vencimiento",
  "Ajuste de inventario",
  "Uso interno",
] as const;

export type MotivoIngreso = (typeof MOTIVOS_INGRESO)[number];
export type MotivoEgreso = (typeof MOTIVOS_EGRESO)[number];
export type TipoMovimientoStock = "venta" | "anulacion" | "ingreso" | "egreso";

export const registrarMovimientoManualSchema = z.object({
  tipo: z.enum(["ingreso", "egreso"], {
    required_error: "El tipo es obligatorio.",
    invalid_type_error: "El tipo debe ser ingreso o egreso.",
  }),
  cantidad: z.coerce
    .number({ required_error: "La cantidad es obligatoria." })
    .int("La cantidad debe ser un número entero.")
    .positive("La cantidad debe ser mayor a cero."),
  motivo: z
    .string({ required_error: "El motivo es obligatorio." })
    .trim()
    .min(1, "El motivo es obligatorio."),
  observacion: z.string().trim().max(500).optional().nullable(),
});

export const listMovimientosProductoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listMovimientosStockQuerySchema = z.object({
  productoId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(["venta", "anulacion", "ingreso", "egreso"]).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface MoverStockInput {
  productoId: number;
  tipo: TipoMovimientoStock;
  /** Cantidad con signo: positivo para ingreso/anulación, negativo para venta/egreso. */
  cantidad: number;
  motivo: string;
  observacion?: string | null;
  facturaId?: number | null;
  usuarioId: number;
}

type DbClient = Pick<Database, "select" | "insert" | "update">;

function assertValidId(id: number, message: string): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", message);
  }
}

/**
 * Regla 1 y 2: única función autorizada a modificar `productos.existencia`.
 * Actualiza con condición atómica y registra el movimiento en la misma transacción.
 * Debe ejecutarse dentro de `db.transaction()` o recibir la conexión transaccional.
 */
export async function moverStock(
  input: MoverStockInput,
  tx: DbClient
): Promise<{
  movimientoId: number;
  existenciaResultante: number;
}> {
  const { productoId, tipo, cantidad, motivo, observacion, facturaId, usuarioId } = input;

  if (!Number.isInteger(cantidad) || cantidad === 0) {
    throw new ApiError(
      422,
      "VALIDACION",
      "La cantidad del movimiento debe ser un entero distinto de cero."
    );
  }

  // Update atómico: rechaza si la existencia quedaría negativa.
  const updated = await tx
    .update(productos)
    .set({
      existencia: sql`${productos.existencia} + ${cantidad}`,
    })
    .where(
      and(
        eq(productos.id, productoId),
        sql`${productos.existencia} + ${cantidad} >= 0`
      )
    )
    .returning({ existencia: productos.existencia });

  if (updated.length === 0) {
    // Puede ser producto inexistente o stock insuficiente.
    const [producto] = await tx
      .select({ id: productos.id, existencia: productos.existencia })
      .from(productos)
      .where(eq(productos.id, productoId))
      .limit(1);

    if (!producto) {
      throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
    }

    // RF-P5 / Regla 1
    throw new ApiError(
      409,
      "STOCK_INSUFICIENTE",
      "La operación dejaría la existencia en negativo."
    );
  }

  const existenciaResultante = updated[0].existencia;

  const [movimiento] = await tx
    .insert(movimientosStock)
    .values({
      productoId,
      tipo,
      cantidad,
      existenciaResultante,
      motivo,
      observacion: observacion ?? null,
      facturaId: facturaId ?? null,
      usuarioId,
    })
    .returning({ id: movimientosStock.id });

  return { movimientoId: movimiento.id, existenciaResultante };
}

function validateMotivoManual(tipo: "ingreso" | "egreso", motivo: string): void {
  const validos = tipo === "ingreso" ? MOTIVOS_INGRESO : MOTIVOS_EGRESO;
  if (!(validos as readonly string[]).includes(motivo)) {
    throw new ApiError(
      422,
      "VALIDACION",
      `El motivo no es válido para un ${tipo}.`,
      [{ campo: "motivo", mensaje: `Motivos permitidos: ${validos.join(", ")}.` }]
    );
  }
}

/**
 * RF-P4, RF-P5: registra ingreso o egreso manual de stock. Solo admin.
 */
export async function registrarMovimientoManual(
  productoId: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertRole(actor, "admin");
  assertValidId(productoId, "El producto no existe.");

  const parsed = registrarMovimientoManualSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { tipo, cantidad, motivo, observacion } = parsed.data;
  validateMotivoManual(tipo, motivo);

  return database.transaction(async (tx) => {
    const [producto] = await tx
      .select({ id: productos.id, codigo: productos.codigo })
      .from(productos)
      .where(eq(productos.id, productoId))
      .limit(1);

    if (!producto) {
      throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
    }

    const signedCantidad = tipo === "egreso" ? -cantidad : cantidad;
    const { movimientoId, existenciaResultante } = await moverStock(
      {
        productoId,
        tipo,
        cantidad: signedCantidad,
        motivo,
        observacion: observacion ?? null,
        usuarioId: actor.id,
      },
      tx
    );

    const [movimiento] = await tx
      .select({
        id: movimientosStock.id,
        tipo: movimientosStock.tipo,
        cantidad: movimientosStock.cantidad,
        existenciaResultante: movimientosStock.existenciaResultante,
        motivo: movimientosStock.motivo,
        fecha: movimientosStock.fecha,
      })
      .from(movimientosStock)
      .where(eq(movimientosStock.id, movimientoId))
      .limit(1);

    return {
      id: movimiento.id,
      producto: { id: producto.id, codigo: producto.codigo },
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      existenciaResultante: movimiento.existenciaResultante,
      motivo: movimiento.motivo,
      referencia: null,
      usuario: { id: actor.id, nombre: actor.nombre },
      fecha: movimiento.fecha,
    };
  });
}

/**
 * RF-P6: historial paginado de movimientos de un producto (más reciente primero).
 */
export async function listMovimientosPorProducto(
  productoId: number,
  query: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertValidId(productoId, "El producto no existe.");

  const parsed = listMovimientosProductoQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const { page, pageSize } = parsed.data;

  const [producto] = await database
    .select({ id: productos.id })
    .from(productos)
    .where(eq(productos.id, productoId))
    .limit(1);

  if (!producto) {
    throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
  }

  const where = eq(movimientosStock.productoId, productoId);

  const [{ total }] = await database
    .select({ total: sql<number>`count(*)` })
    .from(movimientosStock)
    .where(where);

  const rows = await database
    .select({
      id: movimientosStock.id,
      tipo: movimientosStock.tipo,
      cantidad: movimientosStock.cantidad,
      existenciaResultante: movimientosStock.existenciaResultante,
      motivo: movimientosStock.motivo,
      observacion: movimientosStock.observacion,
      fecha: movimientosStock.fecha,
      facturaId: movimientosStock.facturaId,
      puntoVenta: facturas.puntoVenta,
      numeroFactura: facturas.numero,
      usuarioId: usuarios.id,
      usuarioNombre: usuarios.nombre,
      productoCodigo: productos.codigo,
    })
    .from(movimientosStock)
    .innerJoin(usuarios, eq(movimientosStock.usuarioId, usuarios.id))
    .innerJoin(productos, eq(movimientosStock.productoId, productos.id))
    .leftJoin(facturas, eq(movimientosStock.facturaId, facturas.id))
    .where(where)
    .orderBy(desc(movimientosStock.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    data: rows.map(formatMovimientoRow),
    page,
    pageSize,
    total: Number(total),
  };
}

/**
 * RF-P6: listado general de movimientos de stock con filtros.
 */
export async function listMovimientosStock(
  query: unknown,
  actor: PublicUser,
  database: Database = db
) {
  const parsed = listMovimientosStockQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const { productoId, tipo, desde, hasta, page, pageSize } = parsed.data;

  const condiciones = [];
  if (productoId !== undefined) {
    condiciones.push(eq(movimientosStock.productoId, productoId));
  }
  if (tipo !== undefined) {
    condiciones.push(eq(movimientosStock.tipo, tipo));
  }
  if (desde) {
    condiciones.push(gte(movimientosStock.fecha, `${desde}T00:00:00.000Z`));
  }
  if (hasta) {
    condiciones.push(lte(movimientosStock.fecha, `${hasta}T23:59:59.999Z`));
  }

  const where = condiciones.length > 0 ? and(...condiciones) : undefined;

  const [{ total }] = await database
    .select({ total: sql<number>`count(*)` })
    .from(movimientosStock)
    .where(where);

  const rows = await database
    .select({
      id: movimientosStock.id,
      tipo: movimientosStock.tipo,
      cantidad: movimientosStock.cantidad,
      existenciaResultante: movimientosStock.existenciaResultante,
      motivo: movimientosStock.motivo,
      observacion: movimientosStock.observacion,
      fecha: movimientosStock.fecha,
      facturaId: movimientosStock.facturaId,
      puntoVenta: facturas.puntoVenta,
      numeroFactura: facturas.numero,
      usuarioId: usuarios.id,
      usuarioNombre: usuarios.nombre,
      productoId: productos.id,
      productoCodigo: productos.codigo,
    })
    .from(movimientosStock)
    .innerJoin(usuarios, eq(movimientosStock.usuarioId, usuarios.id))
    .innerJoin(productos, eq(movimientosStock.productoId, productos.id))
    .leftJoin(facturas, eq(movimientosStock.facturaId, facturas.id))
    .where(where)
    .orderBy(desc(movimientosStock.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    data: rows.map((row) => ({
      ...formatMovimientoRow(row),
      producto: { id: row.productoId, codigo: row.productoCodigo },
    })),
    page,
    pageSize,
    total: Number(total),
  };
}

function formatMovimientoRow(row: {
  id: number;
  tipo: string;
  cantidad: number;
  existenciaResultante: number;
  motivo: string;
  observacion?: string | null;
  fecha: string;
  facturaId: number | null;
  puntoVenta: number | null;
  numeroFactura: number | null;
  usuarioId: number;
  usuarioNombre: string;
}) {
  const referencia =
    row.facturaId !== null && row.puntoVenta !== null && row.numeroFactura !== null
      ? {
          facturaId: row.facturaId,
          numero: `${String(row.puntoVenta).padStart(4, "0")}-${String(row.numeroFactura).padStart(8, "0")}`,
        }
      : null;

  return {
    id: row.id,
    tipo: row.tipo,
    cantidad: row.cantidad,
    existenciaResultante: row.existenciaResultante,
    motivo: row.motivo,
    observacion: row.observacion ?? null,
    referencia,
    usuario: { id: row.usuarioId, nombre: row.usuarioNombre },
    fecha: row.fecha,
  };
}
