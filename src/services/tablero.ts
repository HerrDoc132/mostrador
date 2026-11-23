import { eq } from "drizzle-orm";
import { db, type Database } from "@/db";
import { facturas } from "@/db/schema";
import type { PublicUser } from "@/services/auth";
import { listDeudores } from "@/services/clientes";
import { listProductos } from "@/services/productos";

/**
 * Servicio del tablero de inicio (RF-T1 a RF-T3, TP5-34 a TP5-36).
 * No conoce HTTP: recibe el usuario autenticado y devuelve datos públicos.
 * Los importes siempre se devuelven en centavos enteros.
 */

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const FORMAS_PAGO = ["contado", "tarjeta", "cuenta_corriente"] as const;

type FormaPago = (typeof FORMAS_PAGO)[number];

interface FacturaResumen {
  fecha: string;
  total: number;
  formaPago: FormaPago;
}

const formateadorDiaLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha calendario de Buenos Aires en formato aaaa-mm-dd (RF-T1, Regla 4). */
export function fechaLocal(fecha: Date): string {
  const partes = Object.fromEntries(
    formateadorDiaLocal.formatToParts(fecha).map((parte) => [parte.type, parte.value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Acepta tanto ISO con zona (`...Z`) como el formato SQLite (`... ...`). */
function fechaUtc(valor: string): Date {
  const conZona = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(valor);
  return new Date(conZona ? valor : `${valor.replace(" ", "T")}Z`);
}

/** Ticket promedio en centavos: se trunca, sin redondeos flotantes. */
function ticketPromedio(importe: number, cantidad: number): number {
  if (cantidad === 0) return 0;
  return Math.floor(importe / cantidad);
}

/** Últimos 30 días calendario locales, de más antiguo a más reciente. */
function ultimos30Dias(ahora: Date): string[] {
  const [anio, mes, dia] = fechaLocal(ahora).split("-").map(Number);
  const baseUtc = Date.UTC(anio, mes - 1, dia);
  return Array.from({ length: 30 }, (_, indice) =>
    new Date(baseUtc - (29 - indice) * 86_400_000).toISOString().slice(0, 10)
  );
}

async function leerFacturasEmitidas(database: Database): Promise<FacturaResumen[]> {
  // Todas las métricas de ventas excluyen facturas anuladas (RF-T1, CA 6).
  return database
    .select({
      fecha: facturas.fecha,
      total: facturas.total,
      formaPago: facturas.formaPago,
    })
    .from(facturas)
    .where(eq(facturas.estado, "emitida"));
}

function calcularIndicadores(
  emitidas: FacturaResumen[],
  ahora: Date,
  deudores: { total: number; totalAdeudado?: number },
  stockBajoMinimo: { total: number }
) {
  const diaDeHoy = fechaLocal(ahora);
  const mesActual = diaDeHoy.slice(0, 7);

  let hoyCantidad = 0;
  let hoyImporte = 0;
  let mesCantidad = 0;
  let mesImporte = 0;

  for (const factura of emitidas) {
    const dia = fechaLocal(fechaUtc(factura.fecha));
    if (dia === diaDeHoy) {
      hoyCantidad += 1;
      hoyImporte += factura.total;
    }
    if (dia.startsWith(`${mesActual}-`)) {
      mesCantidad += 1;
      mesImporte += factura.total;
    }
  }

  return {
    hoy: { cantidad: hoyCantidad, importe: hoyImporte },
    mes: {
      cantidad: mesCantidad,
      importe: mesImporte,
      ticketPromedio: ticketPromedio(mesImporte, mesCantidad),
    },
    cuentasCorrientes: {
      totalAdeudado: Number(deudores.totalAdeudado ?? 0),
      clientesConSaldo: deudores.total,
    },
    bajoMinimo: { cantidad: stockBajoMinimo.total },
  };
}

/** RF-T2 (TP5-35): serie continua de 30 días para el gráfico de líneas. */
function calcularVentasDiarias(emitidas: FacturaResumen[], ahora: Date) {
  const dias = ultimos30Dias(ahora);
  const importes = new Map(dias.map((dia) => [dia, 0]));

  for (const factura of emitidas) {
    const dia = fechaLocal(fechaUtc(factura.fecha));
    const acumulado = importes.get(dia);
    if (acumulado !== undefined) importes.set(dia, acumulado + factura.total);
  }

  return dias.map((fecha) => ({ fecha, importe: importes.get(fecha) ?? 0 }));
}

/** RF-T2 (TP5-35): totales del mes por forma de pago para el gráfico de torta. */
function calcularPorFormaDePago(emitidas: FacturaResumen[], ahora: Date) {
  const mesActual = fechaLocal(ahora).slice(0, 7);
  const importes: Record<FormaPago, number> = {
    contado: 0,
    tarjeta: 0,
    cuenta_corriente: 0,
  };

  for (const factura of emitidas) {
    if (fechaLocal(fechaUtc(factura.fecha)).startsWith(`${mesActual}-`)) {
      importes[factura.formaPago] += factura.total;
    }
  }

  return FORMAS_PAGO.map((forma) => ({ forma, importe: importes[forma] }));
}

/**
 * Única fuente de datos del tablero: una sola lectura de facturas emitidas
 * para todas las secciones. Los getters públicos devuelven cada proyección.
 */
async function construirTablero(actor: PublicUser, database: Database, ahora: Date) {
  const emitidas = await leerFacturasEmitidas(database);
  // Reutiliza las mismas reglas que los listados de clientes y productos.
  const [deudores, stockBajoMinimo] = await Promise.all([
    listDeudores({ pageSize: 1 }, actor, database),
    listProductos({ bajoMinimo: "true", pageSize: 1 }, actor, database),
  ]);

  return {
    ...calcularIndicadores(emitidas, ahora, deudores, stockBajoMinimo),
    ventasDiarias: calcularVentasDiarias(emitidas, ahora),
    porFormaDePago: calcularPorFormaDePago(emitidas, ahora),
  };
}

/** RF-T1 (TP5-34): tarjetas resumen. `ahora` se inyecta en los tests. */
export async function getIndicadores(
  actor: PublicUser,
  database: Database = db,
  ahora: Date = new Date()
) {
  const { hoy, mes, cuentasCorrientes, bajoMinimo } = await construirTablero(
    actor,
    database,
    ahora
  );
  return { hoy, mes, cuentasCorrientes, bajoMinimo };
}

/** RF-T2 (TP5-35): serie de 30 días corridos, sin huecos. */
export async function getVentasDiarias(
  actor: PublicUser,
  database: Database = db,
  ahora: Date = new Date()
) {
  return (await construirTablero(actor, database, ahora)).ventasDiarias;
}

/** RF-T2 (TP5-35): desglose del mes por forma de pago. */
export async function getPorFormaDePago(
  actor: PublicUser,
  database: Database = db,
  ahora: Date = new Date()
) {
  return (await construirTablero(actor, database, ahora)).porFormaDePago;
}

/** Respuesta consolidada de `GET /api/tablero`. */
export async function getTablero(
  actor: PublicUser,
  database: Database = db,
  ahora: Date = new Date()
) {
  return construirTablero(actor, database, ahora);
}
