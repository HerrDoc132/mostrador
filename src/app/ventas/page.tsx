import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { VentasClient } from "./ventas-client";

/**
 * Página /ventas (RF-V8). Ambos roles consultan el listado de facturas.
 */
export default async function VentasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <VentasClient rol={user.rol} />
    </AppShell>
  );
}
