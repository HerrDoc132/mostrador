"use client";

import { useState } from "react";
import { fieldClasses, parseApiError } from "@/lib/form";

/**
 * Formulario de cambio de contraseña propia (RF-U5).
 */
export function PasswordForm() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setOk(null);

    if (nueva !== repetir) {
      setFieldErrors({ repetir: "Las contraseñas no coinciden." });
      setError("La nueva contraseña y su repetición no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva }),
      });

      if (response.status === 204) {
        setOk("Contraseña actualizada correctamente.");
        setActual("");
        setNueva("");
        setRepetir("");
        return;
      }

      const data = await response.json().catch(() => null);
      const parsed = parseApiError(data);
      setFieldErrors(parsed.fields);
      setError(parsed.message);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <Field
        id="actual"
        label="Contraseña actual"
        value={actual}
        error={fieldErrors.actual}
        onChange={(value) => {
          setActual(value);
          clearField("actual");
        }}
      />
      <Field
        id="nueva"
        label="Nueva contraseña (mínimo 8 caracteres)"
        value={nueva}
        error={fieldErrors.nueva}
        onChange={(value) => {
          setNueva(value);
          clearField("nueva");
        }}
      />
      <Field
        id="repetir"
        label="Repetir nueva contraseña"
        value={repetir}
        error={fieldErrors.repetir}
        onChange={(value) => {
          setRepetir(value);
          clearField("repetir");
        }}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {ok}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        minLength={id === "actual" ? 1 : 8}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClasses(Boolean(error))}
      />
      {error && (
        <p className="text-xs font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
