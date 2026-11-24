"use client";
import { Button } from "@/components/ui/button";


/** Botón de impresión del comprobante (RF-V7). No contiene lógica de negocio. */
export function PrintButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 print:hidden"
    >
      Imprimir
    </Button>
  );
}
