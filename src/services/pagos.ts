import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import { clientes, movimientosCuenta, pagos, usuarios } from "@/db/schema";
import { aIsoUtcTexto } from "@/lib/fechas";
import { formatReceiptNumber } from "@/lib/format";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import { saldoSql } from "@/services/clientes";
import type { PublicUser } from "@/services/auth";

/**
 * Servicio de pagos de cuenta corriente (RF-C5, Reglas 6, 7 y 8).
 * Un pago genera, en UNA SOLA transacción, el recibo numerado y el movimiento
 * de crédito en la cuenta del cliente.
 */

export const registrarPagoSchema = z.object({
  importe: z.coerce
    .number({ required_error: "El importe es obligatorio." })
    .int("El importe debe ser un número entero de centavos.")
    .positive("El importe debe ser mayor a cero."),
  medio: z.enum(["efectivo", "transferencia", "tarjeta_debito"], {
    required_error: "El medio de pago es obligatorio.",
    invalid_type_error: "El medio de pago no es válido.",
  }),
  observacion: z.string().trim().max(500).optional().nullable(),
});

function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
  }
}

/**
 * RF-C5: registra un pago. Regla 8: el importe nunca puede superar la deuda;
 * Regla 6: requiere cuenta corriente habilitada.
 */
export async function registrarPago(
  clienteId: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertValidId(clienteId);

  const parsed = registrarPagoSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { importe, medio, observacion } = parsed.data;

  return database.transaction(async (tx) => {
    const [cliente] = await tx
      .select({ id: clientes.id, nombre: clientes.nombre, cuentaCorriente: clientes.cuentaCorriente })
      .from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1);

    if (!cliente) {
      throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
    }
    if (!cliente.cuentaCorriente) {
      throw new ApiError(
        422,
        "CUENTA_CORRIENTE_NO_HABILITADA",
        "El cliente no tiene la cuenta corriente habilitada."
      );
    }

    const [saldoRow] = await tx
      .select({ saldo: saldoSql() })
      .from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1);
    const saldo = Number(saldoRow?.saldo ?? 0);

    if (importe > saldo) {
      throw new ApiError(
        422,
        "PAGO_SUPERA_DEUDA",
        "El importe del pago supera la deuda actual del cliente.",
        [{ importe, saldo, excedente: importe - saldo }]
      );
    }

    // Numeración correlativa independiente de la de facturas (Regla 4).
    const [numeroRow] = await tx
      .select({ numero: sql<number>`COALESCE(MAX(${pagos.id}), 0) + 1` })
      .from(pagos);
    const numeroRecibo = formatReceiptNumber(1, Number(numeroRow?.numero ?? 1));

    const [pago] = await tx
      .insert(pagos)
      .values({
        numeroRecibo,
        importe,
        medio,
        observacion: observacion ?? null,
        clienteId,
        usuarioId: actor.id,
      })
      .returning({ id: pagos.id, numeroRecibo: pagos.numeroRecibo, fecha: pagos.fecha });

    await tx.insert(movimientosCuenta).values({
      clienteId,
      tipo: "credito",
      importe,
      descripcion: `Recibo ${pago.numeroRecibo}`,
      pagoId: pago.id,
    });

    return {
      id: pago.id,
      numeroRecibo: pago.numeroRecibo,
      fecha: aIsoUtcTexto(pago.fecha),
      cliente: { id: cliente.id, nombre: cliente.nombre },
      importe,
      medio,
      observacion: observacion ?? null,
      usuario: { id: actor.id, nombre: actor.nombre },
      saldoCliente: saldo - importe,
    };
  });
}

/**
 * RF-C5: detalle del recibo para impresión o reimpresión.
 */
export async function getPago(id: number, _actor: PublicUser, database: Database = db) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", "El recibo no existe.");
  }

  const [row] = await database
    .select({
      id: pagos.id,
      numeroRecibo: pagos.numeroRecibo,
      fecha: pagos.fecha,
      importe: pagos.importe,
      medio: pagos.medio,
      observacion: pagos.observacion,
      cliente: {
        id: clientes.id,
        nombre: clientes.nombre,
        tipoDoc: clientes.tipoDoc,
        nroDoc: clientes.nroDoc,
      },
      usuario: { id: usuarios.id, nombre: usuarios.nombre },
    })
    .from(pagos)
    .innerJoin(clientes, eq(pagos.clienteId, clientes.id))
    .innerJoin(usuarios, eq(pagos.usuarioId, usuarios.id))
    .where(and(eq(pagos.id, id)))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "NO_ENCONTRADO", "El recibo no existe.");
  }

  return { ...row, fecha: aIsoUtcTexto(row.fecha) };
}
