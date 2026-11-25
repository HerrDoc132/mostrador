"use client";
import { ConfirmarAccion } from "@/components/confirmar-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectCampo, SelectOption } from "@/components/ui/select-campo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  actualizarCategoriaAccion,
  crearCategoriaAccion,
} from "@/app/actions/categorias";
import {
  actualizarProductoAccion,
  alternarActivoProductoAccion,
  crearProductoAccion,
} from "@/app/actions/productos";
import { fieldClasses, parseActionError } from "@/lib/form";
import { formatCurrency } from "@/lib/format";

interface Categoria {
  id: number;
  nombre: string;
  activa: boolean;
}

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

interface ListadoProductos {
  data: Producto[];
  page: number;
  pageSize: number;
  total: number;
}

const pageSize = 10;

function pesosACentavos(valor: string): number {
  const normalizado = valor.replace(/\./g, "").replace(",", ".").trim();
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return NaN;
  return Math.round(numero * 100);
}

export function ProductosClient({ rol }: { rol: "admin" | "vendedor" }) {
  const esAdmin = rol === "admin";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [bajoMinimo, setBajoMinimo] = useState(false);
  const [activoFiltro, setActivoFiltro] = useState<"true" | "false" | "todos">("true");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [mostrarCategorias, setMostrarCategorias] = useState(false);

  const cargarCategorias = useCallback(async () => {
    const response = await fetch("/api/categorias");
    const data = await response.json().catch(() => null);
    if (response.ok && Array.isArray(data)) {
      setCategorias(data as Categoria[]);
    }
  }, []);

  const cargarProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (categoriaId) params.set("categoriaId", categoriaId);
      if (bajoMinimo) params.set("bajoMinimo", "true");
      if (esAdmin && activoFiltro !== "true") params.set("activo", activoFiltro);

      const response = await fetch(`/api/productos?${params.toString()}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar el catálogo.");
        return;
      }

      const listado = data as ListadoProductos;
      setProductos(listado.data);
      setTotal(listado.total);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [page, q, categoriaId, bajoMinimo, activoFiltro, esAdmin]);

  useEffect(() => {
    void cargarCategorias();
  }, [cargarCategorias]);

  useEffect(() => {
    void cargarProductos();
  }, [cargarProductos]);

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  async function alternarActivo(producto: Producto) {
    setError(null);
    setAviso(null);
    const resultado = await alternarActivoProductoAccion(producto.id, !producto.activo);
    if (!resultado.ok) {
      setError(resultado.error.message);
      return;
    }
    setAviso(
      `Producto ${producto.codigo} ${producto.activo ? "dado de baja" : "reactivado"}.`
    );
    await cargarProductos();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Catálogo, existencias y categorías.
          </p>
        </div>
        {esAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => setMostrarCategorias((v) => !v)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {mostrarCategorias ? "Ocultar categorías" : "Categorías"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditando(null);
                setMostrarCrear((v) => !v);
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {mostrarCrear ? "Cancelar" : "Nuevo producto"}
            </Button>
          </div>
        )}
      </div>

      {esAdmin && mostrarCategorias && (
        <CategoriasPanel
          categorias={categorias}
          onChange={async (mensaje) => {
            setAviso(mensaje);
            await cargarCategorias();
            await cargarProductos();
          }}
          onError={setError}
        />
      )}

      {esAdmin && mostrarCrear && (
        <ProductoForm
          modo="crear"
          categorias={categorias}
          onCancel={() => setMostrarCrear(false)}
          onSaved={async () => {
            setMostrarCrear(false);
            setAviso("Producto creado correctamente.");
            await cargarProductos();
            await cargarCategorias();
          }}
          onError={setError}
        />
      )}

      {esAdmin && editando && (
        <ProductoForm
          modo="editar"
          producto={editando}
          categorias={categorias}
          onCancel={() => setEditando(null)}
          onSaved={async () => {
            setEditando(null);
            setAviso("Producto actualizado.");
            await cargarProductos();
          }}
          onError={setError}
        />
      )}

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void cargarProductos();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="q" className="block text-xs font-medium text-slate-600">
            Buscar por código o descripción
          </Label>
          <Input
            id="q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={fieldClasses(false)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="categoria" className="block text-xs font-medium text-slate-600">
            Categoría
          </Label>
          <SelectCampo
            id="categoria"
            value={categoriaId}
            onChange={(event) => setCategoriaId(event.target.value)}
            className={fieldClasses(false)}
          >
            <SelectOption value="">Todas</SelectOption>
            {categorias.map((c) => (
              <SelectOption key={c.id} value={String(c.id)}>
                {c.nombre}
              </SelectOption>
            ))}
          </SelectCampo>
        </div>

        {esAdmin && (
          <div className="space-y-1">
            <Label htmlFor="activo" className="block text-xs font-medium text-slate-600">
              Estado
            </Label>
            <SelectCampo
              id="activo"
              value={activoFiltro}
              onChange={(event) =>
                setActivoFiltro(event.target.value as "true" | "false" | "todos")
              }
              className={fieldClasses(false)}
            >
              <SelectOption value="true">Activos</SelectOption>
              <SelectOption value="false">Inactivos</SelectOption>
              <SelectOption value="todos">Todos</SelectOption>
            </SelectCampo>
          </div>
        )}

        <Label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <Input
            type="checkbox"
            checked={bajoMinimo}
            onChange={(event) => setBajoMinimo(event.target.checked)}
          />
          Solo bajo stock mínimo
        </Label>

        <Button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Filtrar
        </Button>
      </form>

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="w-full text-left text-sm">
          <TableHeader className="bg-slate-50 text-xs uppercase text-slate-500">
            <TableRow>
              <TableHead className="px-4 py-3">Código</TableHead>
              <TableHead className="px-4 py-3">Descripción</TableHead>
              <TableHead className="px-4 py-3">Categoría</TableHead>
              <TableHead className="px-4 py-3">Precio</TableHead>
              <TableHead className="px-4 py-3">Existencia</TableHead>
              <TableHead className="px-4 py-3">Estado</TableHead>
              <TableHead className="px-4 py-3">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && productos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No hay productos que coincidan con el filtro.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              productos.map((p) => (
                <TableRow key={p.id} className={!p.activo ? "bg-slate-50 text-slate-500" : ""}>
                  <TableCell className="px-4 py-3 font-medium text-slate-900">{p.codigo}</TableCell>
                  <TableCell className="px-4 py-3">{p.descripcion}</TableCell>
                  <TableCell className="px-4 py-3">{p.categoria.nombre}</TableCell>
                  <TableCell className="px-4 py-3">{formatCurrency(p.precio)}</TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      {p.existencia}
                      {p.bajoMinimo && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Bajo mínimo
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.activo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/productos/${p.id}`}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Ver / movimientos
                      </Link>
                      {esAdmin && (
                        <>
                          <Button
                            type="button"
                            onClick={() => {
                              setMostrarCrear(false);
                              setEditando(p);
                            }}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Editar
                          </Button>
                          <ConfirmarAccion
                            titulo={
                              p.activo ? "Dar de baja producto" : "Reactivar producto"
                            }
                            descripcion={`Vas a ${
                              p.activo ? "dar de baja" : "reactivar"
                            } ${p.codigo} · ${p.descripcion}.`}
                            consecuencia={
                              p.activo
                                ? "Dejará de aparecer en el catálogo y no se podrá vender."
                                : "Volverá a estar disponible para la venta."
                            }
                            textoConfirmar={p.activo ? "Dar de baja" : "Reactivar"}
                            onConfirmar={() => alternarActivo(p)}
                          >
                            <Button
                              type="button"
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {p.activo ? "Dar de baja" : "Reactivar"}
                            </Button>
                          </ConfirmarAccion>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} producto{total === 1 ? "" : "s"} · página {page} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((v) => Math.max(1, v - 1))}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Anterior
          </Button>
          <Button
            type="button"
            disabled={page >= totalPaginas}
            onClick={() => setPage((v) => v + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductoForm({
  modo,
  producto,
  categorias,
  onCancel,
  onSaved,
  onError,
}: {
  modo: "crear" | "editar";
  producto?: Producto;
  categorias: Categoria[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [codigo, setCodigo] = useState(producto?.codigo ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [categoriaSel, setCategoriaSel] = useState(
    producto ? String(producto.categoria.id) : ""
  );
  const [precio, setPrecio] = useState(
    producto ? (producto.precio / 100).toFixed(2).replace(".", ",") : ""
  );
  const [stockMinimo, setStockMinimo] = useState(
    producto ? String(producto.stockMinimo) : "0"
  );
  const [stockInicial, setStockInicial] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function clearField(field: string) {
    setFieldErrors((c) => ({ ...c, [field]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    try {
      const precioCentavos = pesosACentavos(precio);
      if (!Number.isInteger(precioCentavos) || precioCentavos < 0) {
        setFieldErrors({ precio: "Ingresá un precio válido (ej. 12500,00)." });
        onError("Hay campos con errores.");
        return;
      }

      const body: Record<string, unknown> = {
        codigo,
        descripcion,
        categoriaId: Number(categoriaSel),
        precio: precioCentavos,
        stockMinimo: Number(stockMinimo),
      };

      const resultado =
        modo === "editar" && producto
          ? await actualizarProductoAccion(producto.id, body)
          : await crearProductoAccion(
              stockInicial.trim() === ""
                ? body
                : { ...body, stockInicial: Number(stockInicial) }
            );

      if (!resultado.ok) {
        const parsed = parseActionError(resultado.error);
        setFieldErrors(parsed.fields);
        onError(parsed.message);
        return;
      }
      await onSaved();
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2">
        {modo === "crear" ? "Nuevo producto" : `Editar ${producto?.codigo}`}
      </h2>

      <div className="space-y-1">
        <Label htmlFor="prod-codigo" className="block text-xs font-medium text-slate-600">
          Código
        </Label>
        <Input
          id="prod-codigo"
          value={codigo}
          aria-invalid={Boolean(fieldErrors.codigo)}
          onChange={(e) => {
            setCodigo(e.target.value);
            clearField("codigo");
          }}
          className={fieldClasses(Boolean(fieldErrors.codigo))}
        />
        {fieldErrors.codigo && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.codigo}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="prod-descripcion" className="block text-xs font-medium text-slate-600">
          Descripción
        </Label>
        <Input
          id="prod-descripcion"
          value={descripcion}
          aria-invalid={Boolean(fieldErrors.descripcion)}
          onChange={(e) => {
            setDescripcion(e.target.value);
            clearField("descripcion");
          }}
          className={fieldClasses(Boolean(fieldErrors.descripcion))}
        />
        {fieldErrors.descripcion && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.descripcion}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="prod-categoria" className="block text-xs font-medium text-slate-600">
          Categoría
        </Label>
        <SelectCampo
          id="prod-categoria"
          value={categoriaSel}
          aria-invalid={Boolean(fieldErrors.categoriaId)}
          onChange={(e) => {
            setCategoriaSel(e.target.value);
            clearField("categoriaId");
          }}
          className={fieldClasses(Boolean(fieldErrors.categoriaId))}
        >
          <SelectOption value="">Seleccionar…</SelectOption>
          {categorias.map((c) => (
            <SelectOption key={c.id} value={String(c.id)}>
              {c.nombre}
            </SelectOption>
          ))}
        </SelectCampo>
        {fieldErrors.categoriaId && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.categoriaId}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="prod-precio" className="block text-xs font-medium text-slate-600">
          Precio de venta (pesos)
        </Label>
        <Input
          id="prod-precio"
          inputMode="decimal"
          placeholder="0,00"
          value={precio}
          aria-invalid={Boolean(fieldErrors.precio)}
          onChange={(e) => {
            setPrecio(e.target.value);
            clearField("precio");
          }}
          className={fieldClasses(Boolean(fieldErrors.precio))}
        />
        {fieldErrors.precio && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.precio}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="prod-stock-min" className="block text-xs font-medium text-slate-600">
          Stock mínimo
        </Label>
        <Input
          id="prod-stock-min"
          type="number"
          min={0}
          step={1}
          value={stockMinimo}
          aria-invalid={Boolean(fieldErrors.stockMinimo)}
          onChange={(e) => {
            setStockMinimo(e.target.value);
            clearField("stockMinimo");
          }}
          className={fieldClasses(Boolean(fieldErrors.stockMinimo))}
        />
        {fieldErrors.stockMinimo && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.stockMinimo}</p>
        )}
      </div>

      {modo === "crear" && (
        <div className="space-y-1">
          <Label htmlFor="prod-stock-inicial" className="block text-xs font-medium text-slate-600">
            Stock inicial (opcional)
          </Label>
          <Input
            id="prod-stock-inicial"
            type="number"
            min={0}
            step={1}
            value={stockInicial}
            aria-invalid={Boolean(fieldErrors.stockInicial)}
            onChange={(e) => {
              setStockInicial(e.target.value);
              clearField("stockInicial");
            }}
            className={fieldClasses(Boolean(fieldErrors.stockInicial))}
          />
          {fieldErrors.stockInicial && (
            <p className="text-xs font-medium text-red-600">{fieldErrors.stockInicial}</p>
          )}
          <p className="text-xs text-slate-500">
            Si se informa, se registra un ingreso con motivo “Stock inicial”.
          </p>
        </div>
      )}

      <div className="flex items-end gap-2 sm:col-span-2">
        <Button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Guardando…" : modo === "crear" ? "Crear producto" : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function CategoriasPanel({
  categorias,
  onChange,
  onError,
}: {
  categorias: Categoria[];
  onChange: (mensaje: string) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");

  async function crear(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    try {
      const resultado = await crearCategoriaAccion({ nombre });
      if (!resultado.ok) {
        const parsed = parseActionError(resultado.error);
        setFieldErrors(parsed.fields);
        onError(parsed.message);
        return;
      }
      setNombre("");
      await onChange("Categoría creada.");
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function guardarEdicion(id: number) {
    setFieldErrors({});
    const resultado = await actualizarCategoriaAccion(id, { nombre: editNombre });
    if (!resultado.ok) {
      const parsed = parseActionError(resultado.error);
      setFieldErrors(parsed.fields);
      onError(parsed.message);
      return;
    }
    setEditId(null);
    await onChange("Categoría actualizada.");
  }

  async function desactivar(id: number) {
    const resultado = await actualizarCategoriaAccion(id, { activa: false });
    if (!resultado.ok) {
      onError(resultado.error.message);
      return;
    }
    await onChange("Categoría desactivada.");
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Categorías</h2>

      <form onSubmit={crear} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="cat-nombre" className="block text-xs font-medium text-slate-600">
            Nueva categoría
          </Label>
          <Input
            id="cat-nombre"
            value={nombre}
            aria-invalid={Boolean(fieldErrors.nombre)}
            onChange={(e) => {
              setNombre(e.target.value);
              setFieldErrors((c) => ({ ...c, nombre: "" }));
            }}
            className={fieldClasses(Boolean(fieldErrors.nombre))}
          />
          {fieldErrors.nombre && (
            <p className="text-xs font-medium text-red-600">{fieldErrors.nombre}</p>
          )}
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Creando…" : "Crear"}
        </Button>
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {categorias.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-500">No hay categorías activas.</li>
        )}
        {categorias.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            {editId === c.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className={fieldClasses(false)}
                />
                <Button
                  type="button"
                  onClick={() => void guardarEdicion(c.id)}
                  className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                >
                  Guardar
                </Button>
                <Button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <>
                <span className="text-sm text-slate-800">{c.nombre}</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setEditId(c.id);
                      setEditNombre(c.nombre);
                    }}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Editar
                  </Button>
                  <ConfirmarAccion
                    titulo="Desactivar categoría"
                    descripcion={`Vas a desactivar la categoría ${c.nombre}.`}
                    consecuencia="No podrá usarse en nuevos productos. Si tiene productos activos, la operación se rechazará."
                    textoConfirmar="Desactivar"
                    onConfirmar={() => desactivar(c.id)}
                  >
                    <Button
                      type="button"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Desactivar
                    </Button>
                  </ConfirmarAccion>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        No se puede desactivar una categoría que tenga productos activos asociados.
      </p>
    </section>
  );
}
