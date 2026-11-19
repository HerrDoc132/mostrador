import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";
import { ProductoDetalleClient } from "./producto-detalle-client";

/**
 * Página /productos/{id} (RF-P1 detalle, RF-P4, RF-P5, RF-P6).
 */
export default async function ProductoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  const { id } = await params;

  return (
    <AppShell>
      <ProductoDetalleClient productoId={Number(id)} rol={user.rol} />
    </AppShell>
  );
}
