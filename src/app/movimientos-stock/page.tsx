import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { MovimientosStockClient } from "./movimientos-stock-client";

/**
 * Página /movimientos-stock (RF-P6): listado general con filtros.
 */
export default async function MovimientosStockPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <MovimientosStockClient />
    </AppShell>
  );
}
