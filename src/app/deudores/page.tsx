import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { DeudoresClient } from "./deudores-client";

/**
 * Página /deudores (RF-C6).
 * Ambos roles pueden consultar los saldos deudores.
 */
export default async function DeudoresPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <DeudoresClient rol={user.rol} />
    </AppShell>
  );
}
