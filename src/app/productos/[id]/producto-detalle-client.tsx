"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fieldClasses, parseApiError } from "@/lib/form";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface Producto {
  id: number;
  codigo: string;
  descripcion: string;
  precio: number;
  existencia: number;
  stockMinimo: number;
  activo: boolean;
  bajoMinimo: boolean;
  categoria: { id: number; nombre: string };
}

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
}

interface ListadoMovimientos {
  data: Movimiento[];
  page: number;
  pageSize: number;
  total: number;
}

const pageSize = 10;

const MOTIVOS: Record<"ingreso" | "egreso", string[]> = {
  ingreso: ["Reposición", "Stock inicial", "Devolución de cliente"],
  egreso: ["Rotura", "Vencimiento", "Ajuste de inventario", "Uso interno"],
};

const TIPO_LABEL: Record<string, string> = {
  venta: "Venta",
  anulacion: "Anulación",
  ingreso: "Ingreso",
  egreso: "Egreso",
};

export function ProductoDetalleClient({
  productoId,
  rol,
}: {
  productoId: number;
  rol: "admin" | "vendedor";
}) {
  const esAdmin = rol === "admin";

  const [producto, setProducto] = useState<Producto | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarProducto = useCallback(async () => {
    const response = await fetch(`/api/productos/${productoId}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error?.message ?? "No se pudo cargar el producto.");
      setProducto(null);
      return null;
    }
    setProducto(data as Producto);
    return data as Producto;
  }, [productoId]);

  const cargarMovimientos = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await fetch(
      `/api/productos/${productoId}/movimientos?${params.toString()}`
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error?.message ?? "No se pudo cargar el historial.");
      return;
    }
    const listado = data as ListadoMovimientos;
    setMovimientos(listado.data);
    setTotal(listado.total);
  }, [productoId, page]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([cargarProducto(), cargarMovimientos()]);
    setLoading(false);
  }, [cargarProducto, cargarMovimientos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return <p className="text-sm text-slate-600">Cargando…</p>;
  }

  if (!producto) {
    return (
      <div className="space-y-3">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Link href="/productos" className="text-sm font-medium text-slate-700 underline">
          Volver al catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/productos" className="hover:underline">
              Productos
            </Link>{" "}
            / {producto.codigo}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {producto.descripcion}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {producto.categoria.nombre} · {formatCurrency(producto.precio)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Existencia actual</p>
          <p className="text-2xl font-bold text-slate-900">{producto.existencia}</p>
          <p className="text-xs text-slate-500">Mínimo: {producto.stockMinimo}</p>
          {producto.bajoMinimo && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Bajo stock mínimo
            </span>
          )}
          {!producto.activo && (
            <span className="mt-1 ml-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Inactivo
            </span>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {aviso}
        </p>
      )}

      {esAdmin && (
        <MovimientoManualForm
          productoId={productoId}
          onSaved={async (mensaje) => {
            setAviso(mensaje);
            setPage(1);
            await cargar();
          }}
          onError={setError}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Historial de movimientos</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Existencia resultante</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Referencia</th>
                <th className="px-4 py-3">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No hay movimientos registrados.
                  </td>
                </tr>
              )}
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(m.fecha)}</td>
                  <td className="px-4 py-3">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                  <td className="px-4 py-3 font-medium">
                    <span className={m.cantidad >= 0 ? "text-emerald-700" : "text-red-700"}>
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </span>
                  </td>
                  <td className="px-4 py-3">{m.existenciaResultante}</td>
                  <td className="px-4 py-3">
                    <div>{m.motivo}</div>
                    {m.observacion && (
                      <div className="text-xs text-slate-500">{m.observacion}</div>
                    )}
                  </td>
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
      </section>
    </div>
  );
}

function MovimientoManualForm({
  productoId,
  onSaved,
  onError,
}: {
  productoId: number;
  onSaved: (mensaje: string) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("ingreso");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS.ingreso[0]);
  const [observacion, setObservacion] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function cambiarTipo(nuevoTipo: "ingreso" | "egreso") {
    setTipo(nuevoTipo);
    setMotivo(MOTIVOS[nuevoTipo][0]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/productos/${productoId}/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          cantidad: Number(cantidad),
          motivo,
          observacion: observacion.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = parseApiError(data);
        setFieldErrors(parsed.fields);
        onError(parsed.message);
        return;
      }
      setCantidad("");
      setObservacion("");
      await onSaved(
        `${tipo === "ingreso" ? "Ingreso" : "Egreso"} registrado. Existencia resultante: ${data.existenciaResultante}.`
      );
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Registrar movimiento manual</h2>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="space-y-1">
          <label htmlFor="mov-tipo" className="block text-xs font-medium text-slate-600">
            Tipo
          </label>
          <select
            id="mov-tipo"
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as "ingreso" | "egreso")}
            className={fieldClasses(Boolean(fieldErrors.tipo))}
          >
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="mov-cantidad" className="block text-xs font-medium text-slate-600">
            Cantidad
          </label>
          <input
            id="mov-cantidad"
            type="number"
            min={1}
            step={1}
            value={cantidad}
            aria-invalid={Boolean(fieldErrors.cantidad)}
            onChange={(e) => {
              setCantidad(e.target.value);
              setFieldErrors((c) => ({ ...c, cantidad: "" }));
            }}
            className={fieldClasses(Boolean(fieldErrors.cantidad))}
          />
          {fieldErrors.cantidad && (
            <p className="text-xs font-medium text-red-600">{fieldErrors.cantidad}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="mov-motivo" className="block text-xs font-medium text-slate-600">
            Motivo
          </label>
          <select
            id="mov-motivo"
            value={motivo}
            aria-invalid={Boolean(fieldErrors.motivo)}
            onChange={(e) => {
              setMotivo(e.target.value);
              setFieldErrors((c) => ({ ...c, motivo: "" }));
            }}
            className={fieldClasses(Boolean(fieldErrors.motivo))}
          >
            {MOTIVOS[tipo].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {fieldErrors.motivo && (
            <p className="text-xs font-medium text-red-600">{fieldErrors.motivo}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="mov-obs" className="block text-xs font-medium text-slate-600">
            Observación (opcional)
          </label>
          <input
            id="mov-obs"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            className={fieldClasses(false)}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Registrando…" : "Registrar movimiento"}
          </button>
        </div>
      </form>
    </section>
  );
}
