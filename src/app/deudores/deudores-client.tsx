"use client";

import { useCallback, useEffect, useState } from "react";
import { fieldClasses } from "@/lib/form";
import { formatCurrency } from "@/lib/format";

interface Deudor {
  id: number;
  tipoDoc: "DNI" | "CUIT";
  nroDoc: string;
  nombre: string;
  saldo: number;
  disponible: number | null;
  cuentaCorriente: boolean;
}

interface Listado {
  data: Deudor[];
  page: number;
  pageSize: number;
  total: number;
  totalAdeudado: number;
}

const pageSize = 20;

/**
 * Listado de clientes con saldo deudor, de mayor a menor deuda y con el total
 * general adeudado (RF-C6).
 */
export function DeudoresClient({ rol }: { rol: "admin" | "vendedor" }) {
  const [deudores, setDeudores] = useState<Deudor[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAdeudado, setTotalAdeudado] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        conDeuda: "true",
        orden: "saldo",
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (rol === "admin") params.set("activo", "todos");

      const response = await fetch(`/api/clientes?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar el listado.");
        return;
      }
      const listado = data as Listado;
      setDeudores(listado.data);
      setTotal(listado.total);
      setTotalAdeudado(listado.totalAdeudado ?? 0);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [page, q, rol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Saldos deudores</h1>
        <p className="mt-1 text-sm text-slate-600">
          Clientes con saldo pendiente, ordenados de mayor a menor deuda.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
          Total general adeudado
        </p>
        <p className="mt-1 text-3xl font-bold text-amber-900">
          {formatCurrency(totalAdeudado)}
        </p>
        <p className="mt-1 text-sm text-amber-800">
          {total} cliente{total === 1 ? "" : "s"} con deuda
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void cargar();
        }}
      >
        <div className="min-w-[220px] flex-1 space-y-1">
          <label htmlFor="q" className="block text-xs font-medium text-slate-600">
            Nombre o documento
          </label>
          <input
            id="q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Ej.: Mariana o 28.456.123"
            className={fieldClasses(false)}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Buscar
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Cuenta corriente</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-right">Disponible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && deudores.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No hay clientes con deuda.
                </td>
              </tr>
            )}
            {!loading &&
              deudores.map((deudor) => (
                <tr key={deudor.id}>
                  <td className="px-4 py-3 text-slate-600">
                    {deudor.tipoDoc} {deudor.nroDoc}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{deudor.nombre}</td>
                  <td className="px-4 py-3">
                    {deudor.cuentaCorriente ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Habilitada
                      </span>
                    ) : (
                      <span className="text-slate-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-700">
                    {formatCurrency(deudor.saldo)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {deudor.disponible === null
                      ? "Sin límite"
                      : formatCurrency(deudor.disponible)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} deudor{total === 1 ? "" : "es"} · página {page} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPaginas}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
