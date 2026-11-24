import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { getFactura } from "@/services/facturas";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { ApiError } from "@/lib/errors";

/**
 * Página /ventas/{id} (RF-V7): comprobante imprimible.
 * Ambos roles pueden consultarlo.
 */
export default async function ComprobantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  const { id } = await params;
  let factura;
  try {
    factura = await getFactura(Number(id), user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const pago = factura.pago;
  const detallePago =
    pago.forma === "contado"
      ? `Contado · recibido ${formatCurrency(pago.montoRecibido)} · vuelto ${formatCurrency(pago.vuelto)}`
      : pago.forma === "tarjeta"
        ? `Tarjeta ${pago.tarjeta.marca} ${pago.tarjeta.tipo} · terminada en ${pago.tarjeta.ultimos4}`
        : `Cuenta corriente${factura.saldoCliente !== undefined ? ` · saldo ${formatCurrency(factura.saldoCliente)}` : ""}`;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Comprobante</h1>
            <p className="text-sm text-slate-600">Factura {factura.numeroFormateado}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/ventas/nueva"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Nueva venta
            </Link>
            <PrintButton />
          </div>
        </div>

        <article className="rounded-xl border border-slate-300 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{factura.comercio.nombre}</h2>
              <p className="text-xs text-slate-600">{factura.comercio.direccion}</p>
              <p className="text-xs text-slate-600">CUIT {factura.comercio.cuit}</p>
              <p className="text-xs text-slate-600">{factura.comercio.telefono}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Factura</p>
              <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                {factura.numeroFormateado}
              </p>
              <p className="text-xs text-slate-600">
                {formatDateTime(factura.fecha)} · {factura.estado}
              </p>
              {factura.estado === "anulada" && (
                <span className="mt-2 inline-block rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  ANULADA
                </span>
              )}
            </div>
          </header>

          <section className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500">Vendedor</h3>
              <p className="font-semibold text-slate-900">{factura.vendedor.nombre}</p>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500">Comprador</h3>
              {factura.cliente ? (
                <>
                  <p className="font-semibold text-slate-900">{factura.cliente.nombre}</p>
                  <p className="text-xs text-slate-600">
                    {factura.cliente.tipoDoc} {factura.cliente.nroDoc}
                  </p>
                  {factura.cliente.domicilio && (
                    <p className="text-xs text-slate-600">{factura.cliente.domicilio}</p>
                  )}
                </>
              ) : (
                <p className="font-semibold text-slate-900">Consumidor final</p>
              )}
            </div>
          </section>

          <Table className="mt-8 w-full text-sm">
            <TableHeader className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <TableRow>
                <TableHead className="pb-2">Código</TableHead>
                <TableHead className="pb-2">Descripción</TableHead>
                <TableHead className="pb-2 text-right">Cant.</TableHead>
                <TableHead className="pb-2 text-right">P. unitario</TableHead>
                <TableHead className="pb-2 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {factura.items.map((item, index) => (
                <TableRow key={`${item.productoId}-${index}`}>
                  <TableCell className="py-2 font-mono text-xs text-slate-500">{item.codigo}</TableCell>
                  <TableCell className="py-2">{item.descripcion}</TableCell>
                  <TableCell className="py-2 text-right">{item.cantidad}</TableCell>
                  <TableCell className="py-2 text-right">{formatCurrency(item.precioUnitario)}</TableCell>
                  <TableCell className="py-2 text-right">{formatCurrency(item.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="border-t border-slate-300">
              <TableRow>
                <TableCell colSpan={4} className="pt-3 text-right text-sm font-semibold text-slate-700">
                  Total
                </TableCell>
                <TableCell className="pt-3 text-right text-lg font-bold text-slate-900">
                  {formatCurrency(factura.total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <section className="mt-8 border-t border-slate-300 pt-5 text-sm">
            <h3 className="text-xs uppercase tracking-wide text-slate-500">Forma de pago</h3>
            <p className="mt-1 font-semibold text-slate-900">{detallePago}</p>
          </section>

          {factura.anulacion && (
            <section className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">Anulada</p>
              <p>Motivo: {factura.anulacion.motivo}</p>
              <p>
                {factura.anulacion.usuario} ·{" "}
                {factura.anulacion.fecha ? formatDateTime(factura.anulacion.fecha) : "—"}
              </p>
            </section>
          )}

          <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            Comprobante generado por Mostrador · {formatDateTime(factura.fecha)}
          </footer>
        </article>
      </div>
    </AppShell>
  );
}
