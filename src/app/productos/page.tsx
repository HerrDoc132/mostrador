import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { ProductosClient } from "./productos-client";

/**
 * Página /productos (RF-P1, RF-P2, RF-P3, RF-P7).
 * Ambos roles consultan; las acciones de administración se habilitan solo a admin.
 */
export default async function ProductosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <ProductosClient rol={user.rol} />
    </AppShell>
  );
}
