"use client";

import { useCallback, useEffect, useState } from "react";
import { fieldClasses } from "@/lib/form";
import { formatCurrency } from "@/lib/format";

interface Cliente {
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

interface Listado {
  data: Cliente[];
  page: number;
  pageSize: number;
  total: number;
  totalAdeudado?: number;
}

const pageSize = 20;

/**
 * Listado de clientes con saldo y filtro de deudores (RF-C1, RF-C6).
 */
export function ClientesClient({ rol }: { rol: "admin" | "vendedor" }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAdeudado, setTotalAdeudado] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [conDeuda, setConDeuda] = useState(false);
  const [orden, setOrden] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (conDeuda) params.set("conDeuda", "true");
      if (orden) params.set("orden", orden);
      if (rol === "admin") params.set("activo", "todos");

      const response = await fetch(`/api/clientes?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar el listado.");
        return;
      }
      const listado = data as Listado;
      setClientes(listado.data);
      setTotal(listado.total);
      setTotalAdeudado(listado.totalAdeudado ?? null);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [page, q, conDeuda, orden, rol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Búsqueda por nombre o documento, con el saldo actualizado de cada cuenta
          corriente.
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

        <div className="space-y-1">
          <label htmlFor="orden" className="block text-xs font-medium text-slate-600">
            Orden
          </label>
          <select
            id="orden"
            value={orden}
            onChange={(event) => setOrden(event.target.value)}
            className={fieldClasses(false)}
          >
            <option value="">Predeterminado</option>
            <option value="nombre">Nombre</option>
            <option value="saldo">Mayor saldo</option>
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={conDeuda}
            onChange={(event) => {
              setConDeuda(event.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Solo con deuda
        </label>

        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Buscar
        </button>
      </form>

      {totalAdeudado !== null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Total adeudado:{" "}
          <span className="font-semibold">{formatCurrency(totalAdeudado)}</span>
        </div>
      )}

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
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Cuenta corriente</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-right">Disponible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && clientes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No hay clientes que coincidan con la búsqueda.
                </td>
              </tr>
            )}
            {!loading &&
              clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="px-4 py-3 text-slate-600">
                    {cliente.tipoDoc} {cliente.nroDoc}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {cliente.nombre}
                    {!cliente.activo && (
                      <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {cliente.telefono ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {cliente.cuentaCorriente ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Habilitada
                      </span>
                    ) : (
                      <span className="text-slate-400">No</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      cliente.saldo > 0 ? "text-red-700" : "text-slate-700"
                    }`}
                  >
                    {formatCurrency(cliente.saldo)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {cliente.disponible === null
                      ? "Sin límite"
                      : formatCurrency(cliente.disponible)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} cliente{total === 1 ? "" : "s"} · página {page} de {totalPaginas}
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
