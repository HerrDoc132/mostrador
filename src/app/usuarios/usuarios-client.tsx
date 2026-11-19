"use client";

import { useCallback, useEffect, useState } from "react";
import { fieldClasses, parseApiError } from "@/lib/form";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: "admin" | "vendedor";
}

interface Listado {
  data: Usuario[];
  page: number;
  pageSize: number;
  total: number;
}

interface UsuarioConEstado extends Usuario {
  activo: boolean;
}

/**
 * Gestión de usuarios (RF-U4, RF-U5). Solo se monta para administradores.
 */
export function UsuariosClient() {
  const [usuarios, setUsuarios] = useState<UsuarioConEstado[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState<"" | "true" | "false">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [editando, setEditando] = useState<UsuarioConEstado | null>(null);

  const pageSize = 10;

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("q", q.trim());
      if (activo) params.set("activo", activo);

      const response = await fetch(`/api/usuarios?${params.toString()}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error?.message ?? "No se pudo cargar el listado.");
        return;
      }

      const listado = data as Listado & { data: UsuarioConEstado[] };
      setUsuarios(listado.data);
      setTotal(listado.total);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [page, q, activo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  async function alternarActivo(usuario: UsuarioConEstado) {
    setError(null);
    setAviso(null);
    const response = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !usuario.activo }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.error?.message ?? "No se pudo actualizar el usuario.");
      return;
    }
    setAviso(
      `Usuario ${usuario.email} ${usuario.activo ? "desactivado" : "activado"}.`
    );
    await cargar();
  }

  async function restablecer(usuario: UsuarioConEstado) {
    setError(null);
    setAviso(null);
    const response = await fetch(`/api/usuarios/${usuario.id}/reset-password`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.error?.message ?? "No se pudo restablecer la contraseña.");
      return;
    }
    setAviso(
      `Contraseña temporal de ${usuario.email}: ${data.passwordTemporal} (mostrala una sola vez).`
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
          <p className="mt-1 text-sm text-slate-600">
            Alta, edición, estado y contraseñas del personal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMostrarAlta((value) => !value)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {mostrarAlta ? "Cancelar" : "Nuevo usuario"}
        </button>
      </div>

      {mostrarAlta && (
        <AltaUsuario
          onCreated={async () => {
            setMostrarAlta(false);
            setAviso("Usuario creado correctamente.");
            await cargar();
          }}
          onError={setError}
        />
      )}

      {editando && (
        <EdicionUsuario
          usuario={editando}
          onClose={() => setEditando(null)}
          onSaved={async () => {
            setEditando(null);
            setAviso("Usuario actualizado.");
            await cargar();
          }}
          onError={setError}
        />
      )}

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void cargar();
        }}
      >
        <div className="space-y-1">
          <label htmlFor="q" className="block text-xs font-medium text-slate-600">
            Buscar por nombre o email
          </label>
          <input
            id="q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="activo" className="block text-xs font-medium text-slate-600">
            Estado
          </label>
          <select
            id="activo"
            value={activo}
            onChange={(event) => setActivo(event.target.value as "" | "true" | "false")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
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
      {aviso && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {aviso}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
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
            {!loading && usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No hay usuarios que coincidan con el filtro.
                </td>
              </tr>
            )}
            {!loading &&
              usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {usuario.nombre}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{usuario.email}</td>
                  <td className="px-4 py-3 text-slate-600">{usuario.rol}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        usuario.activo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {usuario.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditando(usuario)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void alternarActivo(usuario)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {usuario.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void restablecer(usuario)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Restablecer clave
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} usuario{total === 1 ? "" : "s"} · página {page} de {totalPaginas}
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

function AltaUsuario({
  onCreated,
  onError,
}: {
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"admin" | "vendedor">("vendedor");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    try {
      const response = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, rol, password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = parseApiError(data);
        setFieldErrors(parsed.fields);
        onError(parsed.message);
        return;
      }
      await onCreated();
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
      <div className="space-y-1">
        <label htmlFor="nuevo-nombre" className="block text-xs font-medium text-slate-600">
          Nombre
        </label>
        <input
          id="nuevo-nombre"
          required
          value={nombre}
          aria-invalid={Boolean(fieldErrors.nombre)}
          onChange={(event) => {
            setNombre(event.target.value);
            clearField("nombre");
          }}
          className={fieldClasses(Boolean(fieldErrors.nombre))}
        />
        {fieldErrors.nombre && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.nombre}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="nuevo-email" className="block text-xs font-medium text-slate-600">
          Email
        </label>
        <input
          id="nuevo-email"
          type="email"
          required
          value={email}
          aria-invalid={Boolean(fieldErrors.email)}
          onChange={(event) => {
            setEmail(event.target.value);
            clearField("email");
          }}
          className={fieldClasses(Boolean(fieldErrors.email))}
        />
        {fieldErrors.email && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.email}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="nuevo-rol" className="block text-xs font-medium text-slate-600">
          Rol
        </label>
        <select
          id="nuevo-rol"
          value={rol}
          aria-invalid={Boolean(fieldErrors.rol)}
          onChange={(event) => {
            setRol(event.target.value as "admin" | "vendedor");
            clearField("rol");
          }}
          className={fieldClasses(Boolean(fieldErrors.rol))}
        >
          <option value="vendedor">Vendedor</option>
          <option value="admin">Administrador</option>
        </select>
        {fieldErrors.rol && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.rol}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="nuevo-password" className="block text-xs font-medium text-slate-600">
          Contraseña (mínimo 8 caracteres)
        </label>
        <input
          id="nuevo-password"
          type="password"
          required
          minLength={8}
          value={password}
          aria-invalid={Boolean(fieldErrors.password)}
          onChange={(event) => {
            setPassword(event.target.value);
            clearField("password");
          }}
          className={fieldClasses(Boolean(fieldErrors.password))}
        />
        {fieldErrors.password && (
          <p className="text-xs font-medium text-red-600">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

function EdicionUsuario({
  usuario,
  onClose,
  onSaved,
  onError,
}: {
  usuario: UsuarioConEstado;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [email, setEmail] = useState(usuario.email);
  const [rol, setRol] = useState<"admin" | "vendedor">(usuario.rol);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, rol }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = parseApiError(data);
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
      className="grid gap-3 rounded-xl border border-slate-300 bg-slate-50 p-4 sm:grid-cols-2"
    >
      <div className="space-y-1">
        <label htmlFor="edit-nombre" className="block text-xs font-medium text-slate-600">
          Nombre
        </label>
        <input
          id="edit-nombre"
          required
          value={nombre}
          aria-invalid={Boolean(fieldErrors.nombre)}
          onChange={(event) => {
            setNombre(event.target.value);
            clearField("nombre");
          }}
          className={fieldClasses(Boolean(fieldErrors.nombre))}
        />
        {fieldErrors.nombre && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.nombre}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="edit-email" className="block text-xs font-medium text-slate-600">
          Email
        </label>
        <input
          id="edit-email"
          type="email"
          required
          value={email}
          aria-invalid={Boolean(fieldErrors.email)}
          onChange={(event) => {
            setEmail(event.target.value);
            clearField("email");
          }}
          className={fieldClasses(Boolean(fieldErrors.email))}
        />
        {fieldErrors.email && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.email}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="edit-rol" className="block text-xs font-medium text-slate-600">
          Rol
        </label>
        <select
          id="edit-rol"
          value={rol}
          aria-invalid={Boolean(fieldErrors.rol)}
          onChange={(event) => {
            setRol(event.target.value as "admin" | "vendedor");
            clearField("rol");
          }}
          className={fieldClasses(Boolean(fieldErrors.rol))}
        >
          <option value="vendedor">Vendedor</option>
          <option value="admin">Administrador</option>
        </select>
        {fieldErrors.rol && (
          <p className="text-xs font-medium text-red-600">{fieldErrors.rol}</p>
        )}
      </div>

      <div className="flex items-end gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
