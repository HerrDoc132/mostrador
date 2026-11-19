import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { UsuariosClient } from "./usuarios-client";

/**
 * Página /usuarios (RF-U4): solo administradores.
 * El servicio vuelve a verificar el rol en cada endpoint (defensa en profundidad).
 */
export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");
  if (user.rol !== "admin") redirect("/");

  return (
    <AppShell>
      <UsuariosClient />
    </AppShell>
  );
}
