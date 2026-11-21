"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fieldClasses, parseApiError, type FormErrors } from "@/lib/form";
import { formatCurrency } from "@/lib/format";

interface Producto {
  id: number;
  codigo: string;
  descripcion: string;
  precio: number;
  existencia: number;
}

interface Renglon {
  productoId: number;
  codigo: string;
  descripcion: string;
  precioUnitario: number;
  cantidad: number;
  existencia: number;
}

type FormaPago = "contado" | "tarjeta" | "cuenta_corriente";

interface ClienteBusqueda {
  id: number;
  tipoDoc: "DNI" | "CUIT";
  nroDoc: string;
  nombre: string;
  domicilio: string | null;
  cuentaCorriente: boolean;
  limiteCredito: number | null;
  saldo: number;
  disponible: number | null;
  activo: boolean;
}

interface FormularioCliente {
  tipoDoc: "DNI" | "CUIT";
  nroDoc: string;
  nombre: string;
  domicilio: string;
  telefono: string;
  cuentaCorriente: boolean;
}

const formularioClienteVacio: FormularioCliente = {
  tipoDoc: "DNI",
  nroDoc: "",
  nombre: "",
  domicilio: "",
  telefono: "",
  cuentaCorriente: false,
};

interface FacturaEmitida {
  id: number;
  numeroFormateado: string;
  total: number;
}

/**
 * Pantalla de nueva venta (RF-V1).
 * Tres secciones integradas: comprador, ítems y forma de pago.
 * El total se recalcula con cada cambio y el servidor lo vuelve a calcular.
 */
export function VentaClient() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBusqueda[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);
  const [formCliente, setFormCliente] = useState<FormularioCliente>(formularioClienteVacio);
  const [erroresCliente, setErroresCliente] = useState<FormErrors | null>(null);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [cantidad, setCantidad] = useState("1");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState<Producto[]>([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);
  const [formaPago, setFormaPago] = useState<FormaPago>("contado");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [proximoNumero, setProximoNumero] = useState<string | null>(null);
  const [errores, setErrores] = useState<FormErrors | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [emitida, setEmitida] = useState<FacturaEmitida | null>(null);

  const cargarProductos = useCallback(async () => {
    try {
      const response = await fetch("/api/productos?activo=true&pageSize=100");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorCarga(data?.error?.message ?? "No se pudo cargar el catálogo.");
        return;
      }
      setProductos(data.data as Producto[]);
    } catch {
      setErrorCarga("No se pudo conectar con el servidor.");
    }
  }, []);

  const cargarProximoNumero = useCallback(async () => {
    try {
      const response = await fetch("/api/facturas/proximo-numero");
      const data = await response.json().catch(() => null);
      if (response.ok) setProximoNumero(data.numeroFormateado);
    } catch {
      // El número es informativo: si falla, la venta se puede confirmar igual.
    }
  }, []);

  // RF-V2: búsqueda de cliente registrado por nombre o documento.
  async function buscarCliente() {
    const texto = busquedaCliente.trim();
    if (!texto) {
      setResultadosCliente([]);
      return;
    }
    setBuscandoCliente(true);
    try {
      const params = new URLSearchParams({ q: texto, pageSize: "8", activo: "true" });
      const response = await fetch(`/api/clientes?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrores({ message: data?.error?.message ?? "No se pudo buscar clientes.", fields: {} });
        return;
      }
      setResultadosCliente(data.data as ClienteBusqueda[]);
    } catch {
      setErrores({ message: "No se pudo conectar con el servidor.", fields: {} });
    } finally {
      setBuscandoCliente(false);
    }
  }

  // RF-V2: alta inmediata sin perder la venta en curso.
  async function crearClienteRapido() {
    setErroresCliente(null);
    setGuardandoCliente(true);
    try {
      const response = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoDoc: formCliente.tipoDoc,
          nroDoc: formCliente.nroDoc,
          nombre: formCliente.nombre,
          domicilio: formCliente.domicilio || undefined,
          telefono: formCliente.telefono || undefined,
          cuentaCorriente: formCliente.cuentaCorriente,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErroresCliente(parseApiError(data));
        return;
      }
      setCliente(data as ClienteBusqueda);
      setModalCliente(false);
      setFormCliente(formularioClienteVacio);
      setBusquedaCliente("");
      setResultadosCliente([]);
    } catch {
      setErroresCliente({ message: "No se pudo conectar con el servidor.", fields: {} });
    } finally {
      setGuardandoCliente(false);
    }
  }

  useEffect(() => {
    void cargarProductos();
    void cargarProximoNumero();
  }, [cargarProductos, cargarProximoNumero]);

  const total = useMemo(
    () => renglones.reduce((acc, renglon) => acc + renglon.precioUnitario * renglon.cantidad, 0),
    [renglones]
  );

  const vuelto = useMemo(() => {
    const recibido = montoRecibido.trim() === "" ? total : Math.round(Number(montoRecibido) * 100);
    if (!Number.isFinite(recibido)) return 0;
    return Math.max(0, recibido - total);
  }, [montoRecibido, total]);

  // Con el buscador vacío se muestran sugerencias del catálogo activo.
  const sugerencias = busquedaProducto.trim() === "" ? productos.slice(0, 6) : resultadosProducto;

  // RF-V3: búsqueda de productos por código o descripción.
  async function buscarProducto() {
    const texto = busquedaProducto.trim();
    if (!texto) {
      setResultadosProducto([]);
      return;
    }
    setBuscandoProducto(true);
    try {
      const params = new URLSearchParams({ q: texto, activo: "true", pageSize: "8" });
      const response = await fetch(`/api/productos?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrores({ message: data?.error?.message ?? "No se pudo buscar productos.", fields: {} });
        return;
      }
      setResultadosProducto(data.data as Producto[]);
    } catch {
      setErrores({ message: "No se pudo conectar con el servidor.", fields: {} });
    } finally {
      setBuscandoProducto(false);
    }
  }

  function agregarProducto(producto: Producto) {
    const cantidadNumero = Number(cantidad);

    if (!Number.isInteger(cantidadNumero) || cantidadNumero <= 0) {
      setErrores({
        message: "La cantidad debe ser un entero mayor a cero.",
        fields: { cantidad: "Cantidad inválida." },
      });
      return;
    }
    if (cantidadNumero > producto.existencia) {
      setErrores({
        message: `Solo hay ${producto.existencia} unidades de ${producto.descripcion}.`,
        fields: { cantidad: "Cantidad mayor a la existencia." },
      });
      return;
    }

    setErrores(null);
    setRenglones((actuales) => {
      // RF-V3: un producto repetido acumula la cantidad en el renglón existente.
      const existente = actuales.find((renglon) => renglon.productoId === producto.id);
      if (existente) {
        return actuales.map((renglon) =>
          renglon.productoId === producto.id
            ? { ...renglon, cantidad: renglon.cantidad + cantidadNumero }
            : renglon
        );
      }
      return [
        ...actuales,
        {
          productoId: producto.id,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          precioUnitario: producto.precio,
          cantidad: cantidadNumero,
          existencia: producto.existencia,
        },
      ];
    });
    setBusquedaProducto("");
    setResultadosProducto([]);
    setCantidad("1");
  }

  // RF-V3: modificación de la cantidad de un renglón ya cargado.
  function cambiarCantidad(productoIdCambiar: number, valor: string) {
    const cantidadNumero = Number(valor);
    setRenglones((actuales) =>
      actuales.map((renglon) =>
        renglon.productoId === productoIdCambiar
          ? {
              ...renglon,
              cantidad: Number.isFinite(cantidadNumero) ? cantidadNumero : 0,
            }
          : renglon
      )
    );
  }

  function quitarRenglon(productoIdQuitar: number) {
    setRenglones((actuales) => actuales.filter((renglon) => renglon.productoId !== productoIdQuitar));
  }

  async function confirmar() {
    setErrores(null);
    setEmitida(null);

    if (renglones.length === 0) {
      setErrores({ message: "Agregá al menos un producto.", fields: { items: "La venta está vacía." } });
      return;
    }

    setGuardando(true);
    try {
      const pago =
        formaPago === "contado"
          ? {
              forma: "contado" as const,
              ...(montoRecibido.trim() === ""
                ? {}
                : { montoRecibido: Math.round(Number(montoRecibido) * 100) }),
            }
          : { forma: formaPago };

      const response = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: cliente?.id ?? null,
          items: renglones.map((renglon) => ({
            productoId: renglon.productoId,
            cantidad: renglon.cantidad,
          })),
          pago,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setErrores(parseApiError(data));
        return;
      }

      setEmitida({
        id: data.id,
        numeroFormateado: data.numeroFormateado,
        total: data.total,
      });
      setRenglones([]);
      setMontoRecibido("");
      void cargarProximoNumero();
      void cargarProductos();
    } catch {
      setErrores({ message: "No se pudo conectar con el servidor.", fields: {} });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nueva venta</h1>
          <p className="mt-1 text-sm text-slate-600">
            Próximo comprobante: <span className="font-mono font-semibold">{proximoNumero ?? "—"}</span>
          </p>
        </div>
        <p className="text-sm text-slate-600">
          Total: <span className="text-xl font-bold text-slate-900">{formatCurrency(total)}</span>
        </p>
      </div>

      {errorCarga && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorCarga}</p>
      )}

      {emitida && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Factura <span className="font-mono font-semibold">{emitida.numeroFormateado}</span> emitida por{" "}
          {formatCurrency(emitida.total)}.
        </div>
      )}

      {errores && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errores.message}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">1. Comprador</h2>

        {cliente ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-sm">
              <p className="font-semibold text-slate-900">{cliente.nombre}</p>
              <p className="text-xs text-slate-600">
                {cliente.tipoDoc} {cliente.nroDoc}
                {cliente.cuentaCorriente ? " · cuenta corriente habilitada" : " · sin cuenta corriente"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCliente(null)}
              className="text-xs font-semibold text-slate-600 hover:underline"
            >
              Volver a Consumidor final
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Por defecto <span className="font-semibold">Consumidor final</span> (sin datos requeridos).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex-1 text-xs text-slate-600">
                Buscar cliente por nombre o documento
                <input
                  className={`${fieldClasses()} mt-1`}
                  value={busquedaCliente}
                  onChange={(event) => setBusquedaCliente(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void buscarCliente();
                    }
                  }}
                  placeholder="Ej. Mariana o 28456123"
                />
              </label>
              <button
                type="button"
                onClick={() => void buscarCliente()}
                disabled={buscandoCliente}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
              >
                {buscandoCliente ? "Buscando…" : "Buscar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormCliente(formularioClienteVacio);
                  setErroresCliente(null);
                  setModalCliente(true);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Nuevo cliente
              </button>
            </div>

            {resultadosCliente.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {resultadosCliente.map((resultado) => (
                  <li key={resultado.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCliente(resultado);
                        setResultadosCliente([]);
                        setBusquedaCliente("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>
                        <span className="font-semibold text-slate-900">{resultado.nombre}</span>{" "}
                        <span className="text-xs text-slate-500">
                          {resultado.tipoDoc} {resultado.nroDoc}
                        </span>
                      </span>
                      <span className="text-xs text-slate-600">{formatCurrency(resultado.saldo)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">2. Ítems</h2>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 text-xs text-slate-600">
            Buscar por código o descripción
            <input
              className={`${fieldClasses(Boolean(errores?.fields.productoId))} mt-1`}
              value={busquedaProducto}
              onChange={(event) => setBusquedaProducto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void buscarProducto();
                }
              }}
              placeholder="Ej. HE-001 o martillo"
            />
          </label>
          <label className="w-28 text-xs text-slate-600">
            Cantidad
            <input
              type="number"
              min={1}
              className={`${fieldClasses(Boolean(errores?.fields.cantidad))} mt-1`}
              value={cantidad}
              onChange={(event) => setCantidad(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void buscarProducto()}
            disabled={buscandoProducto}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            {buscandoProducto ? "Buscando…" : "Buscar"}
          </button>
        </div>

        {sugerencias.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sugerencias.map((producto) => (
              <li key={producto.id}>
                <button
                  type="button"
                  onClick={() => agregarProducto(producto)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-mono text-xs text-slate-500">{producto.codigo}</span>{" "}
                    <span className="font-semibold text-slate-900">{producto.descripcion}</span>
                  </span>
                  <span className="text-xs text-slate-600">
                    {formatCurrency(producto.precio)} · existencia {producto.existencia} ·{" "}
                    <span className="font-semibold text-slate-900">Agregar</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Descripción</th>
                <th className="py-2">Cantidad</th>
                <th className="py-2">Precio unitario</th>
                <th className="py-2">Subtotal</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {renglones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    Todavía no agregaste productos.
                  </td>
                </tr>
              ) : (
                renglones.map((renglon) => (
                  <tr key={renglon.productoId} className="border-t border-slate-100">
                    <td className="py-2">
                      <span className="font-mono text-xs text-slate-500">{renglon.codigo}</span>{" "}
                      {renglon.descripcion}
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={1}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={renglon.cantidad}
                        onChange={(event) => cambiarCantidad(renglon.productoId, event.target.value)}
                      />
                    </td>
                    <td className="py-2">{formatCurrency(renglon.precioUnitario)}</td>
                    <td className="py-2 font-semibold">
                      {formatCurrency(renglon.precioUnitario * renglon.cantidad)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => quitarRenglon(renglon.productoId)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={3} className="py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                  Total
                </td>
                <td className="py-2 text-base font-bold text-slate-900">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">3. Forma de pago</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["contado", "Contado"],
              ["tarjeta", "Tarjeta"],
              ["cuenta_corriente", "Cuenta corriente"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFormaPago(valor)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                formaPago === valor
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {formaPago === "contado" && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="w-48 text-xs text-slate-600">
              Monto recibido ($)
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Igual al total"
                className={`${fieldClasses()} mt-1`}
                value={montoRecibido}
                onChange={(event) => setMontoRecibido(event.target.value)}
              />
            </label>
            <p className="pb-2 text-sm text-slate-600">
              Vuelto: <span className="font-semibold text-slate-900">{formatCurrency(vuelto)}</span>
            </p>
          </div>
        )}

        {formaPago !== "contado" && (
          <p className="mt-4 text-sm text-slate-500">
            Los datos de esta forma de pago se completan en el próximo paso del módulo.
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={guardando || renglones.length === 0}
            onClick={() => void confirmar()}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Confirmando…" : "Confirmar venta"}
          </button>
        </div>
      </section>

      {modalCliente && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="mt-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nuevo cliente</h2>
                <p className="text-xs text-slate-500">La venta en curso no se pierde.</p>
              </div>
              <button
                type="button"
                onClick={() => setModalCliente(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Cerrar
              </button>
            </div>

            {erroresCliente && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {erroresCliente.message}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-600">
                Tipo de documento
                <select
                  className={`${fieldClasses(Boolean(erroresCliente?.fields.tipoDoc))} mt-1`}
                  value={formCliente.tipoDoc}
                  onChange={(event) =>
                    setFormCliente((actual) => ({
                      ...actual,
                      tipoDoc: event.target.value as "DNI" | "CUIT",
                    }))
                  }
                >
                  <option value="DNI">DNI</option>
                  <option value="CUIT">CUIT</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Número
                <input
                  className={`${fieldClasses(Boolean(erroresCliente?.fields.nroDoc))} mt-1`}
                  value={formCliente.nroDoc}
                  onChange={(event) =>
                    setFormCliente((actual) => ({ ...actual, nroDoc: event.target.value }))
                  }
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Nombre y apellido / razón social
                <input
                  className={`${fieldClasses(Boolean(erroresCliente?.fields.nombre))} mt-1`}
                  value={formCliente.nombre}
                  onChange={(event) =>
                    setFormCliente((actual) => ({ ...actual, nombre: event.target.value }))
                  }
                />
              </label>
              <label className="text-xs text-slate-600">
                Domicilio (opcional)
                <input
                  className={`${fieldClasses()} mt-1`}
                  value={formCliente.domicilio}
                  onChange={(event) =>
                    setFormCliente((actual) => ({ ...actual, domicilio: event.target.value }))
                  }
                />
              </label>
              <label className="text-xs text-slate-600">
                Teléfono (opcional)
                <input
                  className={`${fieldClasses()} mt-1`}
                  value={formCliente.telefono}
                  onChange={(event) =>
                    setFormCliente((actual) => ({ ...actual, telefono: event.target.value }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={formCliente.cuentaCorriente}
                  onChange={(event) =>
                    setFormCliente((actual) => ({
                      ...actual,
                      cuentaCorriente: event.target.checked,
                    }))
                  }
                />
                Habilitar cuenta corriente
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalCliente(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoCliente}
                onClick={() => void crearClienteRapido()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {guardandoCliente ? "Guardando…" : "Guardar y usar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
