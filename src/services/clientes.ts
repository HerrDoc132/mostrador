import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import { clientes } from "@/db/schema";
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
function saldoSql() {
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
