import { and, asc, desc, eq, gte, like, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import { clientes, facturas, movimientosCuenta } from "@/db/schema";
import { formatInvoiceNumber } from "@/lib/format";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import type { PublicUser } from "@/services/auth";

/**
 * Servicio de clientes (RF-C1..RF-C7, Reglas 6, 7 y 8).
 * No conoce HTTP: recibe datos sin validar y devuelve datos públicos.
 */

export const listClientesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  conDeuda: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional(),
  orden: z.enum(["saldo", "nombre"]).optional(),
  activo: z.union([z.literal("true"), z.literal("false"), z.literal("todos")]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Saldo de cuenta corriente: débitos - créditos (Regla 7).
 * Se calcula siempre desde los movimientos, nunca se persiste.
 * Se escriben los nombres SQL a mano porque, dentro de la subconsulta, las
 * columnas sin calificar se resolverían contra `movimientos_cuenta`.
 */
export function saldoSql() {
  return sql<number>`(
    SELECT COALESCE(SUM(CASE WHEN mc.tipo = 'debito' THEN mc.importe ELSE -mc.importe END), 0)
    FROM movimientos_cuenta AS mc
    WHERE mc.cliente_id = clientes.id
  )`;
}

/**
 * Crédito disponible: límite - saldo. Sin límite definido, no hay disponible.
 */
function disponibleSql(saldo: ReturnType<typeof saldoSql>) {
  return sql<number | null>`CASE WHEN ${clientes.limiteCredito} IS NULL
    THEN NULL
    ELSE ${clientes.limiteCredito} - ${saldo} END`;
}

export interface ClienteListItem {
  id: number;
  tipoDoc: "DNI" | "CUIT";
  nroDoc: string;
  nombre: string;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  cuentaCorriente: boolean;
  limiteCredito: number | null;
  saldo: number;
  disponible: number | null;
  activo: boolean;
}

export interface ClienteListado {
  data: ClienteListItem[];
  page: number;
  pageSize: number;
  total: number;
  /** RF-C6: presente solo cuando se pide `conDeuda=true`. */
  totalAdeudado?: number;
}

/** Quita puntos, guiones y espacios para comparar documentos. */
function normalizarDocumento(valor: string): string {
  return valor.replace(/[.\-\s]/g, "");
}

function documentoNormalizadoSql() {
  return sql<string>`replace(replace(replace(${clientes.nroDoc}, '.', ''), '-', ''), ' ', '')`;
}

/**
 * RF-C1: listado paginado con búsqueda por nombre o documento (ignorando
 * puntos y guiones), filtro de deudores y saldo actualizado por cliente.
 * RF-C6: con `conDeuda=true` ordena por deuda y agrega `totalAdeudado`.
 */
export async function listClientes(
  query: unknown,
  actor: PublicUser,
  database: Database = db
): Promise<ClienteListado> {
  const parsed = listClientesQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const { q, conDeuda, orden, activo, page, pageSize } = parsed.data;
  const soloDeudores = conDeuda === "true" || conDeuda === true;
  const saldo = saldoSql();

  const condiciones = [];

  if (q) {
    const term = `%${q}%`;
    const termDoc = `%${normalizarDocumento(q)}%`;
    condiciones.push(or(like(clientes.nombre, term), sql`${documentoNormalizadoSql()} LIKE ${termDoc}`));
  }

  // activo: true por defecto; "todos" solo para admin
  if (activo === "todos") {
    if (actor.rol !== "admin") {
      condiciones.push(eq(clientes.activo, true));
    }
  } else if (activo === "false") {
    condiciones.push(eq(clientes.activo, false));
  } else {
    condiciones.push(eq(clientes.activo, true));
  }

  if (soloDeudores) {
    condiciones.push(sql`${saldo} > 0`);
  }

  const where = and(...condiciones);
  const ordenFinal = orden ?? (soloDeudores ? "saldo" : "nombre");
  const orderBy =
    ordenFinal === "saldo" ? desc(saldo) : asc(clientes.nombre);

  const [{ total }] = await database
    .select({ total: sql<number>`count(*)` })
    .from(clientes)
    .where(where);

  const rows = await database
    .select({
      id: clientes.id,
      tipoDoc: clientes.tipoDoc,
      nroDoc: clientes.nroDoc,
      nombre: clientes.nombre,
      domicilio: clientes.domicilio,
      telefono: clientes.telefono,
      email: clientes.email,
      cuentaCorriente: clientes.cuentaCorriente,
      limiteCredito: clientes.limiteCredito,
      saldo,
      disponible: disponibleSql(saldo),
      activo: clientes.activo,
    })
    .from(clientes)
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((row) => ({
    ...row,
    saldo: Number(row.saldo),
    disponible: row.disponible === null ? null : Number(row.disponible),
  }));

  const base: ClienteListado = { data, page, pageSize, total: Number(total) };

  // RF-C6: total general adeudado de los clientes que cumplen el filtro.
  if (!soloDeudores) return base;

  const [deuda] = await database
    .select({ total: sql<number>`COALESCE(SUM(${saldo}), 0)` })
    .from(clientes)
    .where(where);

  return { ...base, totalAdeudado: Number(deuda?.total ?? 0) };
}

export const createClienteSchema = z.object({
  tipoDoc: z.enum(["DNI", "CUIT"], {
    required_error: "El tipo de documento es obligatorio.",
    invalid_type_error: "El tipo de documento debe ser DNI o CUIT.",
  }),
  nroDoc: z
    .string({ required_error: "El número de documento es obligatorio." })
    .trim()
    .min(1, "El número de documento es obligatorio.")
    .max(20, "El número de documento es demasiado largo."),
  nombre: z
    .string({ required_error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(200, "El nombre es demasiado largo."),
  domicilio: z.string().trim().max(200).optional(),
  telefono: z.string().trim().max(40).optional(),
  email: z
    .string()
    .trim()
    .max(120)
    .email("El email no es válido.")
    .optional()
    .or(z.literal("")),
  cuentaCorriente: z.boolean().optional(),
  limiteCredito: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
});

export const updateClienteSchema = z
  .object({
    tipoDoc: z.enum(["DNI", "CUIT"]).optional(),
    nroDoc: z.string().trim().min(1).max(20).optional(),
    nombre: z.string().trim().min(1).max(200).optional(),
    domicilio: z.union([z.null(), z.string().trim().max(200)]).optional(),
    telefono: z.union([z.null(), z.string().trim().max(40)]).optional(),
    email: z
      .union([z.null(), z.string().trim().max(120).email("El email no es válido.")])
      .optional(),
    cuentaCorriente: z.boolean().optional(),
    limiteCredito: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Enviá al menos un campo para actualizar.",
  });

function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
  }
}

function textoONull(valor: string | undefined | null): string | null {
  if (valor === undefined || valor === null) return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/**
 * Verifica si ya existe otro cliente con el mismo tipo y número de documento,
 * comparando sin puntos, guiones ni espacios.
 */
async function existeDocumento(
  tipoDoc: "DNI" | "CUIT",
  nroDoc: string,
  database: Database,
  exceptoId?: number
): Promise<boolean> {
  const condiciones = [
    eq(clientes.tipoDoc, tipoDoc),
    sql`${documentoNormalizadoSql()} = ${normalizarDocumento(nroDoc)}`,
  ];
  if (exceptoId !== undefined) condiciones.push(ne(clientes.id, exceptoId));

  const [row] = await database
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(...condiciones))
    .limit(1);

  return Boolean(row);
}

/** Saldo actual de un cliente (débitos - créditos). */
async function saldoDeCliente(id: number, database: Database): Promise<number> {
  const [row] = await database
    .select({ saldo: saldoSql() })
    .from(clientes)
    .where(eq(clientes.id, id))
    .limit(1);

  return Number(row?.saldo ?? 0);
}

/**
 * RF-C3: ficha del cliente con saldo, crédito disponible y un resumen de las
 * últimas 6 facturas emitidas (excluye anuladas), de más nueva a más vieja.
 */
export async function getCliente(
  id: number,
  _actor: PublicUser,
  database: Database = db
) {
  assertValidId(id);
  const saldo = saldoSql();

  const [row] = await database
    .select({
      id: clientes.id,
      tipoDoc: clientes.tipoDoc,
      nroDoc: clientes.nroDoc,
      nombre: clientes.nombre,
      domicilio: clientes.domicilio,
      telefono: clientes.telefono,
      email: clientes.email,
      cuentaCorriente: clientes.cuentaCorriente,
      limiteCredito: clientes.limiteCredito,
      saldo,
      disponible: disponibleSql(saldo),
      activo: clientes.activo,
    })
    .from(clientes)
    .where(eq(clientes.id, id))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
  }

  const ultimas = await database
    .select({
      id: facturas.id,
      puntoVenta: facturas.puntoVenta,
      numero: facturas.numero,
      fecha: facturas.fecha,
      total: facturas.total,
      formaPago: facturas.formaPago,
    })
    .from(facturas)
    .where(and(eq(facturas.clienteId, id), eq(facturas.estado, "emitida")))
    .orderBy(desc(facturas.fecha), desc(facturas.id))
    .limit(6);

  return {
    ...row,
    saldo: Number(row.saldo),
    disponible: row.disponible === null ? null : Number(row.disponible),
    ultimasFacturas: ultimas.map((factura) => ({
      id: factura.id,
      numero: factura.numero,
      numeroComprobante: formatInvoiceNumber(factura.puntoVenta, factura.numero),
      fecha: factura.fecha,
      total: factura.total,
      formaPago: factura.formaPago,
    })),
  };
}

/**
 * RF-C2: alta de cliente. Ambos roles pueden registrar clientes.
 * El documento (tipo + número) es único.
 */
export async function createCliente(
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  void actor;
  const parsed = createClienteSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const data = parsed.data;

  if (await existeDocumento(data.tipoDoc, data.nroDoc, database)) {
    throw new ApiError(
      409,
      "DOCUMENTO_DUPLICADO",
      "Ya existe un cliente con ese tipo y número de documento."
    );
  }

  const [created] = await database
    .insert(clientes)
    .values({
      tipoDoc: data.tipoDoc,
      nroDoc: data.nroDoc,
      nombre: data.nombre,
      domicilio: textoONull(data.domicilio),
      telefono: textoONull(data.telefono),
      email: textoONull(data.email),
      cuentaCorriente: data.cuentaCorriente ?? false,
      limiteCredito: data.limiteCredito ?? null,
    })
    .returning({ id: clientes.id });

  return getCliente(created.id, actor, database);
}

/**
 * RF-C2: edición de datos del cliente. Ambos roles.
 * Deshabilitar la cuenta corriente con saldo distinto de cero no está permitido
 * (422 SALDO_PENDIENTE).
 */
export async function updateCliente(
  id: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertValidId(id);

  const parsed = updateClienteSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const [actual] = await database
    .select()
    .from(clientes)
    .where(eq(clientes.id, id))
    .limit(1);

  if (!actual) {
    throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
  }

  const changes = parsed.data;

  const tipoDoc = changes.tipoDoc ?? actual.tipoDoc;
  const nroDoc = changes.nroDoc ?? actual.nroDoc;
  const cambiaDocumento =
    tipoDoc !== actual.tipoDoc || normalizarDocumento(nroDoc) !== normalizarDocumento(actual.nroDoc);

  if (cambiaDocumento && (await existeDocumento(tipoDoc, nroDoc, database, id))) {
    throw new ApiError(
      409,
      "DOCUMENTO_DUPLICADO",
      "Ya existe un cliente con ese tipo y número de documento."
    );
  }

  if (changes.cuentaCorriente === false && actual.cuentaCorriente) {
    const saldo = await saldoDeCliente(id, database);
    if (saldo !== 0) {
      throw new ApiError(
        422,
        "SALDO_PENDIENTE",
        "No se puede deshabilitar la cuenta corriente de un cliente con saldo pendiente.",
        [{ saldoActual: saldo, mensaje: "Regularizá el saldo antes de deshabilitar la cuenta." }]
      );
    }
  }

  const values: Partial<typeof clientes.$inferInsert> = {};
  if (changes.tipoDoc !== undefined) values.tipoDoc = changes.tipoDoc;
  if (changes.nroDoc !== undefined) values.nroDoc = changes.nroDoc;
  if (changes.nombre !== undefined) values.nombre = changes.nombre;
  if (changes.domicilio !== undefined) values.domicilio = textoONull(changes.domicilio);
  if (changes.telefono !== undefined) values.telefono = textoONull(changes.telefono);
  if (changes.email !== undefined) values.email = textoONull(changes.email);
  if (changes.cuentaCorriente !== undefined) values.cuentaCorriente = changes.cuentaCorriente;
  if (changes.limiteCredito !== undefined) values.limiteCredito = changes.limiteCredito;

  await database.update(clientes).set(values).where(eq(clientes.id, id));

  return getCliente(id, actor, database);
}

/** Fechas de filtro `AAAA-MM-DD` (interpretadas en hora de Argentina, UTC-3). */
export const cuentaQuerySchema = z
  .object({
    desde: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "El formato debe ser AAAA-MM-DD.")
      .optional(),
    hasta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "El formato debe ser AAAA-MM-DD.")
      .optional(),
  })
  .refine((data) => !data.desde || !data.hasta || data.desde <= data.hasta, {
    message: "La fecha desde no puede ser mayor que la fecha hasta.",
    path: ["desde"],
  });

/** Medianoche local de Argentina expresada en UTC. */
function inicioDiaUtc(fecha: string): string {
  return `${fecha}T03:00:00Z`;
}

/** Medianoche local del día siguiente (límite exclusivo). */
function finDiaUtc(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + 1);
  return inicioDiaUtc(dia.toISOString().slice(0, 10));
}

/**
 * RF-C4: cuenta corriente con movimientos en orden cronológico y saldo
 * acumulado renglón por renglón. El saldo anterior al rango se calcula aparte
 * para que el saldo final sea siempre débitos − créditos (Regla 7).
 */
export async function getCuentaCliente(
  id: number,
  query: unknown,
  _actor: PublicUser,
  database: Database = db
) {
  assertValidId(id);

  const parsed = cuentaQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const [cliente] = await database
    .select({ id: clientes.id, nombre: clientes.nombre })
    .from(clientes)
    .where(eq(clientes.id, id))
    .limit(1);

  if (!cliente) {
    throw new ApiError(404, "NO_ENCONTRADO", "El cliente no existe.");
  }

  const desdeUtc = parsed.data.desde ? inicioDiaUtc(parsed.data.desde) : null;
  const hastaUtc = parsed.data.hasta ? finDiaUtc(parsed.data.hasta) : null;

  const condiciones = [eq(movimientosCuenta.clienteId, id)];
  if (desdeUtc) condiciones.push(gte(movimientosCuenta.fecha, desdeUtc));
  if (hastaUtc) condiciones.push(lt(movimientosCuenta.fecha, hastaUtc));

  const filas = await database
    .select({
      id: movimientosCuenta.id,
      fecha: movimientosCuenta.fecha,
      tipo: movimientosCuenta.tipo,
      importe: movimientosCuenta.importe,
      descripcion: movimientosCuenta.descripcion,
      facturaId: movimientosCuenta.facturaId,
      pagoId: movimientosCuenta.pagoId,
    })
    .from(movimientosCuenta)
    .where(and(...condiciones))
    .orderBy(asc(movimientosCuenta.fecha), asc(movimientosCuenta.id));

  let saldoAnterior = 0;
  if (desdeUtc) {
    const [anterior] = await database
      .select({
        total: sql<number>`COALESCE(SUM(CASE WHEN ${movimientosCuenta.tipo} = 'debito'
          THEN ${movimientosCuenta.importe}
          ELSE -${movimientosCuenta.importe} END), 0)`,
      })
      .from(movimientosCuenta)
      .where(and(eq(movimientosCuenta.clienteId, id), lt(movimientosCuenta.fecha, desdeUtc)));
    saldoAnterior = Number(anterior?.total ?? 0);
  }

  let acumulado = saldoAnterior;
  const movimientos = filas.map((fila) => {
    acumulado += fila.tipo === "debito" ? fila.importe : -fila.importe;
    return { ...fila, saldo: acumulado };
  });

  return {
    cliente,
    saldoAnterior,
    movimientos,
    saldo: acumulado,
  };
}
