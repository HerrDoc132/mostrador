import Link from "next/link";
import { SidebarNav } from "@/components/sidebar-nav";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";

/**
 * Layout de las páginas autenticadas (RF-U2).
 * Revalida la sesión contra la base en cada render; la navegación y el
 * resaltado del módulo activo viven en `SidebarNav`.
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
      <SidebarNav rol={user.rol} nombre={user.nombre} />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
