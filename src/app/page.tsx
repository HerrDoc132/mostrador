import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/services/auth";
import { AppShell } from "@/components/app-shell";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Hola, {user.nombre}
          </h1>
          <p className="mt-2 text-slate-600">
            Sistema de Gestión Comercial · Segundo parcial de Programación IV
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Modulo
            titulo="Acceso y usuarios"
            detalle="Sesión, roles, alta de usuarios y cambio de contraseña."
            href={user.rol === "admin" ? "/usuarios" : "/perfil"}
          />
          <Modulo
            titulo="Productos y stock"
            detalle="Categorías, precios, existencias y movimientos."
          />
          <Modulo
            titulo="Clientes y cuenta corriente"
            detalle="Alta de clientes, saldos y pagos."
          />
          <Modulo
            titulo="Ventas y facturación"
            detalle="Emisión, anulación y comprobantes."
          />
          <Modulo titulo="Tablero" detalle="Indicadores del día y del mes." />
        </section>
      </div>
    </AppShell>
  );
}

function Modulo({
  titulo,
  detalle,
  href,
}: {
  titulo: string;
  detalle: string;
  href?: string;
}) {
  const contenido = (
    <>
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      <p className="mt-1 text-sm text-slate-600">{detalle}</p>
      {!href && (
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          Próximamente
        </p>
      )}
    </>
  );

  const clases =
    "block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition";

  if (href) {
    return (
      <a href={href} className={`${clases} hover:border-slate-300 hover:shadow`}>
        {contenido}
      </a>
    );
  }

  return <div className={clases}>{contenido}</div>;
}
