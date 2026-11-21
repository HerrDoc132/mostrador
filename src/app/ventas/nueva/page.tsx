import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { VentaClient } from "./venta-client";

/**
 * Página /ventas/nueva (RF-V1).
 * Ambos roles pueden emitir facturas.
 */
export default async function NuevaVentaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <VentaClient />
    </AppShell>
  );
}
