"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fieldClasses } from "@/lib/form";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface FacturaResumen {
  id: number;
  numero: number;
  numeroFormateado: string;
  fecha: string;
  estado: "emitida" | "anulada";
  total: number;
  formaPago: "contado" | "tarjeta" | "cuenta_corriente";
  cliente: { id: number; nombre: string; tipoDoc: string; nroDoc: string } | null;
  vendedor: { id: number; nombre: string };
}

interface Listado {
  data: FacturaResumen[];
  page: number;
  pageSize: number;
  total: number;
  totalEmitido: number;
}

interface Filtros {
  q: string;
  desde: string;
  hasta: string;
  clienteId: string;
  vendedorId: string;
  forma: string;
  estado: string;
}

const filtrosVacios: Filtros = {
  q: "",
  desde: "",
  hasta: "",
  clienteId: "",
  vendedorId: "",
  forma: "",
  estado: "",
};

const pageSize = 20;

const formaLabels: Record<string, string> = {
  contado: "Contado",
  tarjeta: "Tarjeta",
  cuenta_corriente: "Cuenta corriente",
};

/**
 * Listado de facturas con filtros y total emitido (RF-V8).
 * No calcula importes: todo viene del servicio en el servidor.
 */
export function VentasClient({ rol }: { rol: "admin" | "vendedor" }) {
  const [facturas, setFacturas] = useState<FacturaResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [totalEmitido, setTotalEmitido] = useState(0);
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState<Filtros>(filtrosVacios);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientes, setClientes] = useState<Array<{ id: number; nombre: string }>>([]);
  const [vendedores, setVendedores] = useState<Array<{ id: number; nombre: string }>>([]);

  useEffect(() => {
    void (async () => {
      const [clientesResponse, usuariosResponse] = await Promise.allSettled([
        fetch("/api/clientes?pageSize=100"),
        fetch("/api/usuarios?pageSize=100"),
      ]);
      if (clientesResponse.status === "fulfilled" && clientesResponse.value.ok) {
        const data = await clientesResponse.value.json().catch(() => null);
        setClientes(
          (data?.data ?? []).map((cliente: { id: number; nombre: string }) => ({
            id: cliente.id,
            nombre: cliente.nombre,
          }))
        );
      }
      if (usuariosResponse.status === "fulfilled" && usuariosResponse.value.ok) {
        const data = await usuariosResponse.value.json().catch(() => null);
        setVendedores(
          (data?.data ?? []).map((usuario: { id: number; nombre: string }) => ({
            id: usuario.id,
            nombre: usuario.nombre,
          }))
        );
      }
    })();
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (filtros.q.trim()) params.set("q", filtros.q.trim());
      if (filtros.desde) params.set("desde", filtros.desde);
      if (filtros.hasta) params.set("hasta", filtros.hasta);
      if (filtros.clienteId) params.set("clienteId", filtros.clienteId);
      if (filtros.vendedorId) params.set("vendedorId", filtros.vendedorId);
      if (filtros.forma) params.set("forma", filtros.forma);
      if (filtros.estado) params.set("estado", filtros.estado);

      const response = await fetch(`/api/facturas?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar el listado.");
        return;
      }
      const listado = data as Listado;
      setFacturas(listado.data);
      setTotal(listado.total);
      setTotalEmitido(listado.totalEmitido);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [page, filtros]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function aplicarFiltros(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    void cargar();
  }

  function limpiar() {
    setFiltros(filtrosVacios);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Facturas emitidas con filtros por fecha, cliente, vendedor, forma de pago y estado.
          </p>
        </div>
        <Link
          href="/ventas/nueva"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nueva venta
        </Link>
      </div>

      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={aplicarFiltros}
      >
        <div className="space-y-1 lg:col-span-2">
          <label htmlFor="q" className="block text-xs font-medium text-slate-600">
            Número o cliente
          </label>
          <input
            id="q"
            value={filtros.q}
            onChange={(event) => setFiltros({ ...filtros, q: event.target.value })}
            placeholder="Ej.: 0001-00000001 o Mariana"
            className={fieldClasses(false)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="desde" className="block text-xs font-medium text-slate-600">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={filtros.desde}
            onChange={(event) => setFiltros({ ...filtros, desde: event.target.value })}
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
            value={filtros.hasta}
            onChange={(event) => setFiltros({ ...filtros, hasta: event.target.value })}
            className={fieldClasses(false)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="clienteId" className="block text-xs font-medium text-slate-600">
            Cliente
          </label>
          <select
            id="clienteId"
            value={filtros.clienteId}
            onChange={(event) => setFiltros({ ...filtros, clienteId: event.target.value })}
            className={fieldClasses(false)}
          >
            <option value="">Todos</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="vendedorId" className="block text-xs font-medium text-slate-600">
            Vendedor
          </label>
          <select
            id="vendedorId"
            value={filtros.vendedorId}
            onChange={(event) => setFiltros({ ...filtros, vendedorId: event.target.value })}
            className={fieldClasses(false)}
          >
            <option value="">Todos</option>
            {vendedores.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="forma" className="block text-xs font-medium text-slate-600">
            Forma de pago
          </label>
          <select
            id="forma"
            value={filtros.forma}
            onChange={(event) => setFiltros({ ...filtros, forma: event.target.value })}
            className={fieldClasses(false)}
          >
            <option value="">Todas</option>
            <option value="contado">Contado</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="cuenta_corriente">Cuenta corriente</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="estado" className="block text-xs font-medium text-slate-600">
            Estado
          </label>
          <select
            id="estado"
            value={filtros.estado}
            onChange={(event) => setFiltros({ ...filtros, estado: event.target.value })}
            className={fieldClasses(false)}
          >
            <option value="">Todos</option>
            <option value="emitida">Emitida</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>

        <div className="flex items-end gap-2 lg:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={limpiar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Limpiar
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Total emitido (facturas emitidas del filtro):{" "}
        <span className="font-semibold">{formatCurrency(totalEmitido)}</span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Factura</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Pago</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Acciones</th>
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
            {!loading && facturas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No hay facturas que coincidan con los filtros.
                </td>
              </tr>
            )}
            {!loading &&
              facturas.map((factura) => (
                <tr key={factura.id}>
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">
                    {factura.numeroFormateado}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(factura.fecha)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {factura.cliente ? (
                      <>
                        {factura.cliente.nombre}
                        <span className="block text-xs text-slate-500">
                          {factura.cliente.tipoDoc} {factura.cliente.nroDoc}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">Consumidor final</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{factura.vendedor.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formaLabels[factura.formaPago] ?? factura.formaPago}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        factura.estado === "emitida"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {factura.estado === "emitida" ? "Emitida" : "Anulada"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCurrency(factura.total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/ventas/${factura.id}`}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Ver comprobante
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} factura{total === 1 ? "" : "s"} · página {page} de {totalPaginas}
          {rol === "admin" && " · vista de administrador"}
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
