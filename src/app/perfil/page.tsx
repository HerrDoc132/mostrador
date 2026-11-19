import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { PasswordForm } from "./password-form";

/**
 * Página /perfil (RF-U5): cada usuario cambia su propia contraseña.
 */
export default async function PerfilPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.nombre} · {user.email} · rol {user.rol}
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Cambiar contraseña
          </h2>
          <PasswordForm />
        </section>
      </div>
    </AppShell>
  );
}
