import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatInvoiceNumber,
  formatReceiptNumber,
} from "@/lib/format";

/**
 * Casos de presentación de los PR #10, #11 y #16 (importes en centavos,
 * correlativos y fecha/hora local del comprobante).
 */

function clean(valor: string): string {
  return valor.replace(/\u00a0/g, " ");
}

describe("formatCurrency · PR #11 (vuelto y totales)", () => {
  it("formatea cero, un centavo y montos grandes sin perder centavos", () => {
    expect(clean(formatCurrency(0))).toContain("$ 0,00");
    expect(clean(formatCurrency(1))).toContain("$ 0,01");
    expect(clean(formatCurrency(123456789))).toContain("$ 1.234.567,89");
  });

  it("mantiene el signo en importes negativos", () => {
    expect(clean(formatCurrency(-1234550))).toContain("-$ 12.345,50");
  });
});

describe("formatInvoiceNumber · PR #10 y #16", () => {
  it("rellena punto de venta y número con ceros", () => {
    expect(formatInvoiceNumber(1, 1)).toBe("0001-00000001");
    expect(formatInvoiceNumber(12, 98765432)).toBe("0012-98765432");
  });

  it("no trunca números más largos que ocho dígitos", () => {
    expect(formatInvoiceNumber(1, 123456789)).toBe("0001-123456789");
  });

  it("el correlativo de recibo usa el mismo prefijo y relleno", () => {
    expect(formatReceiptNumber(1, 1)).toBe("R 0001-00000001");
    expect(formatReceiptNumber(7, 340)).toBe("R 0007-00000340");
  });
});

describe("formatDate / formatDateTime · PR #16 (zona horaria local)", () => {
  it("convierte UTC al día local de Buenos Aires", () => {
    expect(formatDate("2026-11-21T03:00:00Z")).toBe("21/11/2026");
    expect(formatDate("2026-11-21T02:30:00Z")).toBe("20/11/2026");
  });

  it("muestra la hora local en el comprobante", () => {
    const medianoche = formatDateTime("2026-11-21T03:00:00Z");
    expect(medianoche).toContain("21/11/2026");
    expect(medianoche).toContain("12:00");

    const nocheAnterior = formatDateTime("2026-11-21T02:30:00Z");
    expect(nocheAnterior).toContain("20/11/2026");
    expect(nocheAnterior).toContain("11:30");
  });

  it("acepta objetos Date además de strings ISO", () => {
    expect(formatDate(new Date("2026-11-21T03:00:00Z"))).toBe("21/11/2026");
  });
});
