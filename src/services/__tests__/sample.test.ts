import { describe, it, expect } from "vitest";
import { formatCurrency, formatInvoiceNumber, formatReceiptNumber } from "../../lib/format";

describe("Formatters Unit Tests", () => {
  it("debe formatear importes en centavos a pesos argentinos ($ 12.345,50)", () => {
    const formatted = formatCurrency(1234550);
    // Normalizar espacios no separables de Intl
    const clean = formatted.replace(/\u00a0/g, " ");
    expect(clean).toContain("$ 12.345,50");
  });

  it("debe formatear correlativo de factura con 4 dígitos de punto de venta y 8 de número", () => {
    expect(formatInvoiceNumber(1, 1234)).toBe("0001-00001234");
  });

  it("debe formatear correlativo de recibo con prefijo R", () => {
    expect(formatReceiptNumber(1, 340)).toBe("R 0001-00000340");
  });
});
