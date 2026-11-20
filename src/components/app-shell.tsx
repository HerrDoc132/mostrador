import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { LogoutButton } from "@/app/logout-button";

/**
 * Layout de las páginas autenticadas (RF-U2).
 * Revalida la sesión contra la base en cada render.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session ? await getCurrentUser(session).catch(() => null) : null;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-slate-600">
          La sesión no es válida.{" "}
          <Link href="/login" className="font-semibold underline">
            Volver a ingresar
          </Link>
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold text-slate-900">
              Mostrador
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-slate-900">
                Inicio
              </Link>
              {user.rol === "admin" && (
                <Link href="/usuarios" className="hover:text-slate-900">
                  Usuarios
                </Link>
              )}
              <Link href="/productos" className="hover:text-slate-900">
                Productos
              </Link>
              <Link href="/movimientos-stock" className="hover:text-slate-900">
                Movimientos
              </Link>
              <Link href="/perfil" className="hover:text-slate-900">
                Mi perfil
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {user.nombre} · {user.rol}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
