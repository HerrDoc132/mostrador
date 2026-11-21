"use client";

import { useCallback, useEffect, useState } from "react";
import { fieldClasses, parseApiError, type FormErrors } from "@/lib/form";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

interface Movimiento {
  id: number;
  fecha: string;
  tipo: "debito" | "credito";
  importe: number;
  descripcion: string;
  facturaId: number | null;
  pagoId: number | null;
  saldo: number;
}

interface Cuenta {
  cliente: { id: number; nombre: string };
  saldoAnterior: number;
  movimientos: Movimiento[];
  saldo: number;
}

interface Recibo {
  id: number;
  numeroRecibo: string;
  fecha: string;
  importe: number;
  medio: string;
}

/**
 * Cuenta corriente de un cliente (RF-C4) con registro de pagos (RF-C5):
 * movimientos cronológicos, saldo acumulado y recibo numerado.
 */
export function CuentaCorriente({
  clienteId,
  nombre,
  onClose,
}: {
  clienteId: number;
  nombre: string;
  onClose: () => void;
}) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [importe, setImporte] = useState("");
  const [medio, setMedio] = useState("efectivo");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<FormErrors | null>(null);
  const [recibo, setRecibo] = useState<Recibo | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      const response = await fetch(`/api/clientes/${clienteId}/cuenta${suffix}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar la cuenta corriente.");
        return;
      }
      setCuenta(data as Cuenta);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [clienteId, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarPago(event: React.FormEvent) {
    event.preventDefault();
    const pesos = Number(importe);
    if (!importe.trim() || Number.isNaN(pesos) || pesos <= 0) {
      setErrores({
        message: "Ingresá un importe válido.",
        fields: { importe: "Debe ser un número mayor a cero." },
      });
      return;
    }

    setGuardando(true);
    setErrores(null);
    try {
      const response = await fetch(`/api/clientes/${clienteId}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importe: Math.round(pesos * 100),
          medio,
          observacion: observacion.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrores(parseApiError(data));
        return;
      }
      setRecibo(data as Recibo);
      setMostrarForm(false);
      setImporte("");
      setObservacion("");
      await cargar();
    } catch {
      setErrores({ message: "No se pudo conectar con el servidor.", fields: {} });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Cuenta corriente de ${nombre}`}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Cuenta corriente</h2>
            <p className="mt-1 text-sm text-slate-600">{nombre}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMostrarForm((value) => !value);
                setErrores(null);
              }}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Registrar pago
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cerrar
            </button>
          </div>
        </div>

        <form
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void cargar();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="desde" className="block text-xs font-medium text-slate-600">
              Desde
            </label>
            <input
              id="desde"
              type="date"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              className={fieldClasses(false)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="hasta" className="block text-xs font-medium text-slate-600">
              Hasta
            </label>
            <input
              id="hasta"
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              className={fieldClasses(false)}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={() => {
              setDesde("");
              setHasta("");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Limpiar
          </button>
        </form>

        {mostrarForm && (
          <form
            className="mt-4 space-y-3 rounded-lg border border-slate-200 p-4"
            onSubmit={(event) => void guardarPago(event)}
          >
            <h3 className="text-sm font-semibold text-slate-900">Nuevo pago</h3>

            {errores?.message && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {errores.message}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="importe" className="block text-xs font-medium text-slate-600">
                  Importe ($)
                </label>
                <input
                  id="importe"
                  inputMode="decimal"
                  value={importe}
                  onChange={(event) => setImporte(event.target.value)}
                  placeholder="0,00"
                  className={fieldClasses(Boolean(errores?.fields.importe))}
                />
                {errores?.fields.importe && (
                  <p className="text-xs text-red-600">{errores.fields.importe}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="medio" className="block text-xs font-medium text-slate-600">
                  Medio de pago
                </label>
                <select
                  id="medio"
                  value={medio}
                  onChange={(event) => setMedio(event.target.value)}
                  className={fieldClasses(Boolean(errores?.fields.medio))}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta_debito">Tarjeta de débito</option>
                </select>
                {errores?.fields.medio && (
                  <p className="text-xs text-red-600">{errores.fields.medio}</p>
                )}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="observacion" className="block text-xs font-medium text-slate-600">
                  Observación (opcional)
                </label>
                <input
                  id="observacion"
                  value={observacion}
                  onChange={(event) => setObservacion(event.target.value)}
                  className={fieldClasses(Boolean(errores?.fields.observacion))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar pago"}
              </button>
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {recibo && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Recibo {recibo.numeroRecibo}</p>
            <p className="mt-1">
              {formatCurrency(recibo.importe)} · {formatDateTime(recibo.fecha)} · {recibo.medio}
            </p>
            <p className="mt-1 text-xs">
              Reimprimir con <code>GET /api/pagos/{recibo.id}</code>
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading && <p className="mt-4 text-sm text-slate-500">Cargando movimientos…</p>}

        {cuenta && !loading && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Saldo anterior al rango</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatCurrency(cuenta.saldoAnterior)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cantidad de movimientos</p>
                <p className="text-sm font-semibold text-slate-900">
                  {cuenta.movimientos.length}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Saldo final</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatCurrency(cuenta.saldo)}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cuenta.movimientos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        No hay movimientos en el rango seleccionado.
                      </td>
                    </tr>
                  )}
                  {cuenta.movimientos.map((movimiento) => (
                    <tr key={movimiento.id}>
                      <td className="px-3 py-2 text-slate-600">
                        {formatDate(movimiento.fecha)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            movimiento.tipo === "debito"
                              ? "bg-red-50 text-red-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {movimiento.tipo === "debito" ? "Débito" : "Crédito"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {movimiento.descripcion}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {formatCurrency(movimiento.importe)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {formatCurrency(movimiento.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
