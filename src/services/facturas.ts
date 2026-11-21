import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  clientes,
  facturaItems,
  facturas,
  movimientosCuenta,
  productos,
  usuarios,
} from "@/db/schema";
import { formatInvoiceNumber } from "@/lib/format";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import { assertRole, type PublicUser } from "@/services/auth";
import { saldoSql } from "@/services/clientes";
import { moverStock } from "@/services/stock";

/**
 * Servicio de facturación (RF-V6, Reglas 1, 3, 4, 5, 6 y 7).
 * Toda la emisión ocurre en una única transacción: validación, stock,
 * numeración, factura, ítems, movimientos de stock y débito en cuenta corriente.
 */

const PUNTO_VENTA = 1;

/**
 * SQLite local solo admite un escritor a la vez. Serializar la emisión dentro
 * del proceso evita SQLITE_BUSY y garantiza numeración correlativa; en Turso,
 * la transacción sigue siendo la unidad atómica entre instancias.
 */
let colaEmision: Promise<unknown> = Promise.resolve();

function serializarEmision<T>(fn: () => Promise<T>): Promise<T> {
  const turno = colaEmision.then(fn, fn);
  colaEmision = turno.then(
    () => undefined,
    () => undefined
  );
  return turno;
}

const itemSchema = z
  .object({
    productoId: z.coerce
      .number({ required_error: "El producto es obligatorio." })
      .int("El producto debe ser un id entero.")
      .positive("El producto debe ser un id válido."),
    cantidad: z.coerce
      .number({ required_error: "La cantidad es obligatoria." })
      .int("La cantidad debe ser un número entero.")
      .positive("La cantidad debe ser mayor a cero."),
  })
  .strict();

const tarjetaSchema = z
  .object({
    tipo: z.enum(["debito", "credito"], {
      required_error: "El tipo de tarjeta es obligatorio.",
      invalid_type_error: "El tipo de tarjeta debe ser débito o crédito.",
    }),
    marca: z
      .string({ required_error: "La marca de la tarjeta es obligatoria." })
      .trim()
      .min(1, "La marca de la tarjeta es obligatoria.")
      .max(40, "La marca de la tarjeta es demasiado larga."),
    ultimos4: z
      .string({ required_error: "Los últimos 4 dígitos son obligatorios." })
      .regex(/^\d{4}$/, "Los últimos 4 dígitos deben ser exactamente 4 números."),
  })
  .strict();

const pagoSchema = z.discriminatedUnion("forma", [
  z
    .object({
      forma: z.literal("contado"),
      montoRecibido: z
        .union([z.coerce.number().int("El monto debe ser un entero de centavos.").min(0), z.null()])
        .optional(),
    })
    .strict(),
  z.object({ forma: z.literal("tarjeta"), tarjeta: tarjetaSchema }).strict(),
  z.object({ forma: z.literal("cuenta_corriente") }).strict(),
]);

export const createFacturaSchema = z
  .object({
    clienteId: z
      .union([
        z.coerce.number().int("El cliente debe ser un id entero.").positive("El cliente no es válido."),
        z.null(),
      ])
      .optional(),
    items: z
      .array(itemSchema, { required_error: "Los ítems son obligatorios." })
      .min(1, "La factura debe tener al menos un ítem.")
      .max(100, "La factura no puede tener más de 100 ítems."),
    pago: pagoSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const vistos = new Set<number>();
    data.items.forEach((item, index) => {
      if (vistos.has(item.productoId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El producto está repetido; acumulá la cantidad en un solo renglón.",
          path: ["items", index, "productoId"],
        });
      }
      vistos.add(item.productoId);
    });
  });

type PagoInput = z.infer<typeof pagoSchema>;

function buildPago(pago: PagoInput, total: number, montoRecibido: number | null) {
  if (pago.forma === "contado") {
    return {
      forma: "contado" as const,
      montoRecibido: montoRecibido ?? total,
      vuelto: Math.max(0, (montoRecibido ?? total) - total),
    };
  }
  if (pago.forma === "tarjeta") {
    return {
      forma: "tarjeta" as const,
      tarjeta: {
        tipo: pago.tarjeta.tipo,
        marca: pago.tarjeta.marca,
        ultimos4: pago.tarjeta.ultimos4,
      },
    };
  }
  return { forma: "cuenta_corriente" as const };
}

/**
 * RF-V1: número informativo para la cabecera de la pantalla de venta.
 * El número definitivo se asigna dentro de la transacción de confirmación.
 */
export async function getProximoNumero(_actor: PublicUser, database: Database = db) {
  const [row] = await database
    .select({ numero: sql<number>`COALESCE(MAX(${facturas.numero}), 0) + 1` })
    .from(facturas)
    .where(eq(facturas.puntoVenta, PUNTO_VENTA));

  const numero = Number(row?.numero ?? 1);
  return {
    puntoVenta: PUNTO_VENTA,
    numero,
    numeroFormateado: formatInvoiceNumber(PUNTO_VENTA, numero),
  };
}

/**
 * RF-V6: confirmación atómica de factura (9 pasos).
 * Ambos roles pueden emitir. Cualquier falla revierte toda la transacción.
 */
export async function createFactura(
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  const parsed = createFacturaSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { clienteId, items, pago } = parsed.data;
  const forma = pago.forma;

  return serializarEmision(() =>
    database.transaction(async (tx) => {
      // Paso 1: productos existentes y activos.
      const ids = [...new Set(items.map((item) => item.productoId))];
      const productosRows = await tx
        .select({
          id: productos.id,
          codigo: productos.codigo,
          descripcion: productos.descripcion,
          precio: productos.precio,
          existencia: productos.existencia,
          activo: productos.activo,
        })
        .from(productos)
        .where(inArray(productos.id, ids));

      const porId = new Map(productosRows.map((producto) => [producto.id, producto]));

      const faltantes = ids.filter((id) => !porId.has(id));
      if (faltantes.length > 0) {
        throw new ApiError(
          404,
          "NO_ENCONTRADO",
          "Uno o más productos no existen.",
          faltantes.map((productoId) => ({ productoId, mensaje: "El producto no existe." }))
        );
      }

      const inactivos = productosRows.filter((producto) => !producto.activo);
      if (inactivos.length > 0) {
        throw new ApiError(
          422,
          "PRODUCTO_INACTIVO",
          "Uno o más productos están dados de baja.",
          inactivos.map((producto) => ({
            productoId: producto.id,
            mensaje: `El producto ${producto.codigo} está inactivo.`,
          }))
        );
      }

      // Paso 2: cliente activo y, para cuenta corriente, habilitado.
      const cliente =
        clienteId === null || clienteId === undefined
          ? null
          : await (async () => {
              const [row] = await tx
                .select({
                  id: clientes.id,
                  nombre: clientes.nombre,
                  tipoDoc: clientes.tipoDoc,
                  nroDoc: clientes.nroDoc,
                  domicilio: clientes.domicilio,
                  cuentaCorriente: clientes.cuentaCorriente,
                  limiteCredito: clientes.limiteCredito,
                  activo: clientes.activo,
                })
                .from(clientes)
                .where(eq(clientes.id, clienteId))
                .limit(1);

              if (!row) {
                throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
              }
              if (!row.activo) {
                throw new ApiError(422, "VALIDACION", "El cliente está inactivo.", [
                  { campo: "clienteId", mensaje: "El cliente está inactivo." },
                ]);
              }
              return row;
            })();

      if (forma === "cuenta_corriente" && (!cliente || !cliente.cuentaCorriente)) {
        throw new ApiError(
          422,
          "CUENTA_CORRIENTE_NO_HABILITADA",
          "El pago a cuenta corriente requiere un cliente con la cuenta habilitada."
        );
      }

      // Paso 3: control de stock atómico (el descuento real lo hace moverStock).
      const sinStock = items
        .map((item) => {
          const producto = porId.get(item.productoId)!;
          return { producto, cantidad: item.cantidad };
        })
        .filter(({ producto, cantidad }) => producto.existencia < cantidad);

      if (sinStock.length > 0) {
        throw new ApiError(
          409,
          "STOCK_INSUFICIENTE",
          "No hay existencia suficiente para uno o más productos.",
          sinStock.map(({ producto, cantidad }) => ({
            productoId: producto.id,
            solicitado: cantidad,
            disponible: producto.existencia,
          }))
        );
      }

      // Paso 4: precios oficiales del catálogo y total en centavos.
      const lineas = items.map((item) => {
        const producto = porId.get(item.productoId)!;
        return {
          productoId: producto.id,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          cantidad: item.cantidad,
          precioUnitario: producto.precio,
          subtotal: producto.precio * item.cantidad,
        };
      });
      const total = lineas.reduce((acc, linea) => acc + linea.subtotal, 0);

      // Paso 5: validación financiera.
      let montoRecibido: number | null = null;
      if (forma === "contado") {
        montoRecibido = pago.montoRecibido ?? total;
        if (montoRecibido < total) {
          throw new ApiError(
            422,
            "MONTO_INSUFICIENTE",
            "El monto recibido no cubre el total de la venta.",
            [{ total, montoRecibido, faltante: total - montoRecibido }]
          );
        }
      }

      let saldoAnterior = 0;
      if (forma === "cuenta_corriente" && cliente) {
        const [saldoRow] = await tx
          .select({ saldo: saldoSql() })
          .from(clientes)
          .where(eq(clientes.id, cliente.id))
          .limit(1);
        saldoAnterior = Number(saldoRow?.saldo ?? 0);

        if (cliente.limiteCredito !== null && saldoAnterior + total > cliente.limiteCredito) {
          throw new ApiError(
            422,
            "LIMITE_CREDITO_EXCEDIDO",
            "La venta supera el límite de crédito del cliente.",
            [
              {
                saldoActual: saldoAnterior,
                limite: cliente.limiteCredito,
                excedente: saldoAnterior + total - cliente.limiteCredito,
              },
            ]
          );
        }
      }

      // Paso 6: numeración correlativa por punto de venta, dentro de la transacción.
      const [numeroRow] = await tx
        .select({ numero: sql<number>`COALESCE(MAX(${facturas.numero}), 0) + 1` })
        .from(facturas)
        .where(eq(facturas.puntoVenta, PUNTO_VENTA));
      const numero = Number(numeroRow?.numero ?? 1);
      const numeroFormateado = formatInvoiceNumber(PUNTO_VENTA, numero);

      // Paso 7: cabecera e ítems con descripción y precio congelados.
      const [factura] = await tx
        .insert(facturas)
        .values({
          puntoVenta: PUNTO_VENTA,
          numero,
          total,
          formaPago: forma,
          montoRecibido,
          tarjetaTipo: forma === "tarjeta" ? pago.tarjeta.tipo : null,
          tarjetaMarca: forma === "tarjeta" ? pago.tarjeta.marca : null,
          tarjetaUltimos4: forma === "tarjeta" ? pago.tarjeta.ultimos4 : null,
          estado: "emitida",
          clienteId: cliente?.id ?? null,
          usuarioId: actor.id,
        })
        .returning({
          id: facturas.id,
          fecha: facturas.fecha,
          estado: facturas.estado,
        });

      await tx.insert(facturaItems).values(
        lineas.map((linea) => ({
          facturaId: factura.id,
          productoId: linea.productoId,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
          subtotal: linea.subtotal,
          descripcion: linea.descripcion,
        }))
      );

      // Paso 8: descuento de stock con movimiento de venta (Regla 1 y 2).
      for (const linea of lineas) {
        await moverStock(
          {
            productoId: linea.productoId,
            tipo: "venta",
            cantidad: -linea.cantidad,
            motivo: `Venta ${numeroFormateado}`,
            facturaId: factura.id,
            usuarioId: actor.id,
          },
          tx
        );
      }

      // Paso 9: débito en cuenta corriente (Regla 7).
      if (forma === "cuenta_corriente" && cliente) {
        await tx.insert(movimientosCuenta).values({
          clienteId: cliente.id,
          tipo: "debito",
          importe: total,
          descripcion: `Factura ${numeroFormateado}`,
          facturaId: factura.id,
        });
      }

      return {
        id: factura.id,
        puntoVenta: PUNTO_VENTA,
        numero,
        numeroFormateado,
        fecha: factura.fecha,
        estado: factura.estado,
        cliente: cliente
          ? {
              id: cliente.id,
              nombre: cliente.nombre,
              tipoDoc: cliente.tipoDoc,
              nroDoc: cliente.nroDoc,
              domicilio: cliente.domicilio,
            }
          : null,
        vendedor: { id: actor.id, nombre: actor.nombre },
        items: lineas.map((linea) => ({
          productoId: linea.productoId,
          codigo: linea.codigo,
          descripcion: linea.descripcion,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
          subtotal: linea.subtotal,
        })),
        total,
        pago: buildPago(pago, total, montoRecibido),
        ...(forma === "cuenta_corriente" ? { saldoCliente: saldoAnterior + total } : {}),
      };
    })
  );
}

export const listFacturasQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha desde debe tener formato aaaa-mm-dd.")
    .optional(),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha hasta debe tener formato aaaa-mm-dd.")
    .optional(),
  clienteId: z.coerce.number().int().positive().optional(),
  vendedorId: z.coerce.number().int().positive().optional(),
  forma: z.enum(["contado", "tarjeta", "cuenta_corriente"]).optional(),
  estado: z.enum(["emitida", "anulada"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * RF-V8: listado paginado con filtros y `totalEmitido` calculado en servidor.
 * No devuelve el array de ítems (solo el comprobante completo lo incluye).
 */
export async function listFacturas(
  input: unknown,
  _actor: PublicUser,
  database: Database = db
) {
  const parsed = listFacturasQuerySchema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const { q, desde, hasta, clienteId, vendedorId, forma, estado, page, pageSize } = parsed.data;

  const conditions = [];
  if (q) {
    // Número suelto o formateado (0001-00000001); si no, nombre del cliente.
    const match = q.match(/^(?:\d{1,4}-)?(\d{1,8})$/);
    if (match) {
      conditions.push(eq(facturas.numero, Number(match[1])));
    } else {
      conditions.push(like(clientes.nombre, `%${q}%`));
    }
  }
  if (desde) conditions.push(sql`substr(${facturas.fecha}, 1, 10) >= ${desde}`);
  if (hasta) conditions.push(sql`substr(${facturas.fecha}, 1, 10) <= ${hasta}`);
  if (clienteId !== undefined) conditions.push(eq(facturas.clienteId, clienteId));
  if (vendedorId !== undefined) conditions.push(eq(facturas.usuarioId, vendedorId));
  if (forma) conditions.push(eq(facturas.formaPago, forma));
  if (estado) conditions.push(eq(facturas.estado, estado));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const baseSelect = database
    .select({
      id: facturas.id,
      puntoVenta: facturas.puntoVenta,
      numero: facturas.numero,
      fecha: facturas.fecha,
      estado: facturas.estado,
      total: facturas.total,
      formaPago: facturas.formaPago,
      clienteId: clientes.id,
      clienteNombre: clientes.nombre,
      clienteTipoDoc: clientes.tipoDoc,
      clienteNroDoc: clientes.nroDoc,
      vendedorId: usuarios.id,
      vendedorNombre: usuarios.nombre,
    })
    .from(facturas)
    .leftJoin(clientes, eq(facturas.clienteId, clientes.id))
    .leftJoin(usuarios, eq(facturas.usuarioId, usuarios.id));

  const rows = await baseSelect
    .where(where)
    .orderBy(desc(facturas.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await database
    .select({ total: sql<number>`COUNT(*)` })
    .from(facturas)
    .leftJoin(clientes, eq(facturas.clienteId, clientes.id))
    .where(where);

  const [emitidoRow] = await database
    .select({ total: sql<number>`COALESCE(SUM(${facturas.total}), 0)` })
    .from(facturas)
    .leftJoin(clientes, eq(facturas.clienteId, clientes.id))
    .where(and(where, eq(facturas.estado, "emitida")));

  return {
    data: rows.map((row) => ({
      id: row.id,
      puntoVenta: row.puntoVenta,
      numero: row.numero,
      numeroFormateado: formatInvoiceNumber(row.puntoVenta, row.numero),
      fecha: row.fecha,
      estado: row.estado,
      total: row.total,
      formaPago: row.formaPago,
      cliente:
        row.clienteId === null
          ? null
          : {
              id: row.clienteId,
              nombre: row.clienteNombre,
              tipoDoc: row.clienteTipoDoc,
              nroDoc: row.clienteNroDoc,
            },
      vendedor: { id: row.vendedorId, nombre: row.vendedorNombre },
    })),
    page,
    pageSize,
    total: Number(totalRow?.total ?? 0),
    totalEmitido: Number(emitidoRow?.total ?? 0),
  };
}

function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(422, "VALIDACION", "El id de la factura no es válido.", [
      { campo: "id", mensaje: "El id debe ser un entero positivo." },
    ]);
  }
}

/** Datos del comercio para la cabecera del comprobante imprimible (RF-V7). */
export const DATOS_COMERCIO = {
  nombre: "Mostrador · Gestión Comercial",
  direccion: "Av. Principal 123, Mendoza",
  cuit: "30-12345678-9",
  telefono: "0261 444-4444",
};

/**
 * RF-V7: factura completa para el comprobante.
 * Ambos roles pueden consultarla. Devuelve ítems, comprador, vendedor, pago,
 * saldo del cliente (cuando corresponde) y datos de la anulación.
 */
export async function getFactura(
  id: number,
  _actor: PublicUser,
  database: Database = db
) {
  assertValidId(id);

  const [factura] = await database
    .select()
    .from(facturas)
    .where(eq(facturas.id, id))
    .limit(1);

  if (!factura) {
    throw new ApiError(404, "NO_ENCONTRADO", "La factura no existe.");
  }

  const items = await database
    .select({
      productoId: facturaItems.productoId,
      codigo: productos.codigo,
      descripcion: facturaItems.descripcion,
      cantidad: facturaItems.cantidad,
      precioUnitario: facturaItems.precioUnitario,
      subtotal: facturaItems.subtotal,
    })
    .from(facturaItems)
    .leftJoin(productos, eq(facturaItems.productoId, productos.id))
    .where(eq(facturaItems.facturaId, id))
    .orderBy(asc(facturaItems.id));

  let cliente: {
    id: number;
    nombre: string;
    tipoDoc: "DNI" | "CUIT";
    nroDoc: string;
    domicilio: string | null;
  } | null = null;
  if (factura.clienteId !== null) {
    const [row] = await database
      .select({
        id: clientes.id,
        nombre: clientes.nombre,
        tipoDoc: clientes.tipoDoc,
        nroDoc: clientes.nroDoc,
        domicilio: clientes.domicilio,
      })
      .from(clientes)
      .where(eq(clientes.id, factura.clienteId))
      .limit(1);
    cliente = row ?? null;
  }

  const [vendedor] = await database
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(eq(usuarios.id, factura.usuarioId))
    .limit(1);

  let saldoCliente: number | undefined;
  if (factura.formaPago === "cuenta_corriente" && factura.clienteId !== null) {
    const [row] = await database
      .select({ saldo: saldoSql() })
      .from(clientes)
      .where(eq(clientes.id, factura.clienteId))
      .limit(1);
    saldoCliente = Number(row?.saldo ?? 0);
  }

  let anulacion: { fecha: string | null; usuario: string | null; motivo: string | null } | null = null;
  if (factura.estado === "anulada") {
    let nombreUsuario: string | null = null;
    if (factura.usuarioAnulacionId !== null) {
      const [row] = await database
        .select({ nombre: usuarios.nombre })
        .from(usuarios)
        .where(eq(usuarios.id, factura.usuarioAnulacionId))
        .limit(1);
      nombreUsuario = row?.nombre ?? null;
    }
    anulacion = {
      fecha: factura.fechaAnulacion,
      usuario: nombreUsuario,
      motivo: factura.motivoAnulacion,
    };
  }

  const pago =
    factura.formaPago === "tarjeta"
      ? {
          forma: "tarjeta" as const,
          tarjeta: {
            tipo: factura.tarjetaTipo as "debito" | "credito",
            marca: factura.tarjetaMarca as string,
            ultimos4: factura.tarjetaUltimos4 as string,
          },
        }
      : factura.formaPago === "contado"
        ? buildPago(
            { forma: "contado", montoRecibido: factura.montoRecibido },
            factura.total,
            factura.montoRecibido
          )
        : { forma: "cuenta_corriente" as const };

  return {
    id: factura.id,
    puntoVenta: factura.puntoVenta,
    numero: factura.numero,
    numeroFormateado: formatInvoiceNumber(factura.puntoVenta, factura.numero),
    fecha: factura.fecha,
    estado: factura.estado,
    comercio: DATOS_COMERCIO,
    cliente,
    vendedor: { id: vendedor?.id ?? factura.usuarioId, nombre: vendedor?.nombre ?? "—" },
    items: items.map((item) => ({ ...item, codigo: item.codigo ?? "" })),
    total: factura.total,
    pago,
    ...(saldoCliente !== undefined ? { saldoCliente } : {}),
    anulacion,
  };
}

/** Motivo de anulación obligatorio (RF-V9). */
export const anularFacturaSchema = z
  .object({
    motivo: z
      .string({ required_error: "El motivo de la anulación es obligatorio." })
      .trim()
      .min(1, "El motivo de la anulación es obligatorio.")
      .max(300, "El motivo es demasiado largo."),
  })
  .strict();

/**
 * RF-V9 (Regla 9): anulación exclusiva de administrador.
 * Una sola transacción: reingresa el stock con movimientos tipo `anulacion`,
 * registra el crédito en cuenta corriente si corresponde y marca la factura
 * como anulada con motivo, usuario y fecha. La factura y sus ítems son inmutables.
 */
export async function anularFactura(
  id: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertRole(actor, "admin"); // RF-V9: solo administrador.
  assertValidId(id);

  const parsed = anularFacturaSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const { motivo } = parsed.data;

  return serializarEmision(() =>
    database.transaction(async (tx) => {
      const [factura] = await tx
        .select()
        .from(facturas)
        .where(eq(facturas.id, id))
        .limit(1);

      if (!factura) {
        throw new ApiError(404, "NO_ENCONTRADO", "La factura no existe.");
      }
      if (factura.estado === "anulada") {
        throw new ApiError(409, "FACTURA_ANULADA", "La factura ya está anulada."); // Regla 9.
      }

      const items = await tx
        .select({ productoId: facturaItems.productoId, cantidad: facturaItems.cantidad })
        .from(facturaItems)
        .where(eq(facturaItems.facturaId, id))
        .orderBy(asc(facturaItems.id));

      const numeroFormateado = formatInvoiceNumber(factura.puntoVenta, factura.numero);
      const fechaAnulacion = new Date().toISOString();

      // Reingreso atómico de stock usando la única función autorizada (Regla 1 y 2).
      for (const item of items) {
        await moverStock(
          {
            productoId: item.productoId,
            tipo: "anulacion",
            cantidad: item.cantidad,
            motivo,
            observacion: `Anulación de factura ${numeroFormateado}`,
            facturaId: id,
            usuarioId: actor.id,
          },
          tx
        );
      }

      // Regla 7: se revierte el débito original con un crédito por el total.
      if (factura.formaPago === "cuenta_corriente" && factura.clienteId !== null) {
        await tx.insert(movimientosCuenta).values({
          clienteId: factura.clienteId,
          tipo: "credito",
          importe: factura.total,
          descripcion: `Anulación de factura ${numeroFormateado}`,
          facturaId: id,
        });
      }

      await tx
        .update(facturas)
        .set({
          estado: "anulada",
          motivoAnulacion: motivo,
          usuarioAnulacionId: actor.id,
          fechaAnulacion,
        })
        .where(eq(facturas.id, id));

      return {
        id: factura.id,
        numeroFormateado,
        estado: "anulada" as const,
        motivoAnulacion: motivo,
        usuarioAnulacionId: actor.id,
        fechaAnulacion,
        itemCount: items.length,
        stockReingresado: items.reduce((total, item) => total + item.cantidad, 0),
      };
    })
  );
}
