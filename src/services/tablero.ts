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

/**
 * RF-T1 (TP5-34): tarjetas resumen del tablero. `ahora` se inyecta para poder
 * fijar el corte de día/mes en los tests; en producción se usa la hora actual.
 */
export async function getIndicadores(
  actor: PublicUser,
  database: Database = db,
  ahora: Date = new Date()
) {
  const diaDeHoy = fechaLocal(ahora);
  const mesActual = diaDeHoy.slice(0, 7);

  // Todas las métricas de ventas excluyen facturas anuladas (RF-T1, CA 6).
  const emitidas = await database
    .select({ fecha: facturas.fecha, total: facturas.total })
    .from(facturas)
    .where(eq(facturas.estado, "emitida"));

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

  // Reutiliza las mismas reglas que los listados de clientes y productos.
  const [deudores, stockBajoMinimo] = await Promise.all([
    listDeudores({ pageSize: 1 }, actor, database),
    listProductos({ bajoMinimo: "true", pageSize: 1 }, actor, database),
  ]);

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

/**
 * RF-T1: respuesta consolidada de `GET /api/tablero`.
 * Las secciones de gráficos y top 5 se agregan en TP5-35 y TP5-36.
 */
export async function getTablero(
  actor: PublicUser,
  database: Database = db,
  ahora: Date = new Date()
) {
  return getIndicadores(actor, database, ahora);
}
