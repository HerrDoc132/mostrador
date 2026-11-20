import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { ClientesClient } from "./clientes-client";

/**
 * Página /clientes (RF-C1, RF-C6).
 * Ambos roles consultan el listado y los saldos.
 */
export default async function ClientesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <ClientesClient rol={user.rol} />
    </AppShell>
  );
}
