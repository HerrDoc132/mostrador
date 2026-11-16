/**
 * Formateadores estándar según especificación local (Argentina).
 * Fuente: docs/00-general/01-arquitectura-y-pautas.md (Regla 4 y 10)
 */

/**
 * Formatea importes en centavos a formato de moneda argentino ($ 12.345,50).
 */
export function formatCurrency(centavos: number): string {
  const pesos = centavos / 100;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pesos);
}

/**
 * Formatea número correlativo de factura: 0001-00000001
 */
export function formatInvoiceNumber(puntoVenta: number, numero: number): string {
  const pv = puntoVenta.toString().padStart(4, "0");
  const num = numero.toString().padStart(8, "0");
  return `${pv}-${num}`;
}

/**
 * Formatea número correlativo de recibo: R 0001-00000001
 */
export function formatReceiptNumber(puntoVenta: number, numero: number): string {
  const pv = puntoVenta.toString().padStart(4, "0");
  const num = numero.toString().padStart(8, "0");
  return `R ${pv}-${num}`;
}

/**
 * Formatea fecha ISO a formato local argentino: dd/mm/aaaa
 */
export function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

/**
 * Formatea fecha y hora local: dd/mm/aaaa HH:mm
 */
export function formatDateTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}
