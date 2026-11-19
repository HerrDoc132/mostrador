"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fieldClasses } from "@/lib/form";
import { formatDateTime } from "@/lib/format";

interface Movimiento {
  id: number;
  tipo: string;
  cantidad: number;
  existenciaResultante: number;
  motivo: string;
  observacion: string | null;
  referencia: { facturaId: number; numero: string } | null;
  usuario: { id: number; nombre: string };
  fecha: string;
  producto?: { id: number; codigo: string };
}

interface Listado {
  data: Movimiento[];
  page: number;
  pageSize: number;
  total: number;
}

const pageSize = 20;

const TIPO_LABEL: Record<string, string> = {
  venta: "Venta",
  anulacion: "Anulación",
  ingreso: "Ingreso",
  egreso: "Egreso",
};

export function MovimientosStockClient() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
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
      if (tipo) params.set("tipo", tipo);
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);

      const response = await fetch(`/api/movimientos-stock?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar el listado.");
        return;
      }
      const listado = data as Listado;
      setMovimientos(listado.data);
      setTotal(listado.total);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [page, tipo, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Movimientos de stock</h1>
        <p className="mt-1 text-sm text-slate-600">
          Historial general de ingresos, egresos, ventas y anulaciones.
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
        <div className="space-y-1">
          <label htmlFor="tipo" className="block text-xs font-medium text-slate-600">
            Tipo
          </label>
          <select
            id="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={fieldClasses(false)}
          >
            <option value="">Todos</option>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
            <option value="venta">Venta</option>
            <option value="anulacion">Anulación</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="desde" className="block text-xs font-medium text-slate-600">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
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
            onChange={(e) => setHasta(e.target.value)}
            className={fieldClasses(false)}
          />
        </div>

        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Filtrar
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
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Cantidad</th>
              <th className="px-4 py-3">Existencia resultante</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && movimientos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No hay movimientos que coincidan con el filtro.
                </td>
              </tr>
            )}
            {!loading &&
              movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(m.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {m.producto ? (
                      <Link
                        href={`/productos/${m.producto.id}`}
                        className="underline hover:text-slate-700"
                      >
                        {m.producto.codigo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                  <td className="px-4 py-3 font-medium">
                    <span className={m.cantidad >= 0 ? "text-emerald-700" : "text-red-700"}>
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </span>
                  </td>
                  <td className="px-4 py-3">{m.existenciaResultante}</td>
                  <td className="px-4 py-3">{m.motivo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {m.referencia ? m.referencia.numero : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.usuario.nombre}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} movimiento{total === 1 ? "" : "s"} · página {page} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((v) => Math.max(1, v - 1))}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPaginas}
            onClick={() => setPage((v) => v + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
