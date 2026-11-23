import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { getCurrentUser } from "@/services/auth";
import { getTablero } from "@/services/tablero";
import { AppShell } from "@/components/app-shell";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await getCurrentUser(session).catch(() => null);
  if (!user) redirect("/login");

  const tablero = await getTablero(user);

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

        <section
          id="indicadores"
          aria-label="Indicadores del tablero"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Indicador
            titulo="Ventas de hoy"
            valor={formatCurrency(tablero.hoy.importe)}
            detalle={`${tablero.hoy.cantidad} comprobantes emitidos`}
          />
          <Indicador
            titulo="Ventas del mes"
            valor={formatCurrency(tablero.mes.importe)}
            detalle={`${tablero.mes.cantidad} comprobantes · ticket promedio ${formatCurrency(
              tablero.mes.ticketPromedio
            )}`}
          />
          <Indicador
            titulo="Cuentas corrientes"
            valor={formatCurrency(tablero.cuentasCorrientes.totalAdeudado)}
            detalle={`${tablero.cuentasCorrientes.clientesConSaldo} clientes con saldo deudor`}
          />
          <Indicador
            titulo="Stock bajo mínimo"
            valor={String(tablero.bajoMinimo.cantidad)}
            detalle="Productos en o por debajo del mínimo"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Modulo
            titulo="Acceso y usuarios"
            detalle="Sesión, roles, alta de usuarios y cambio de contraseña."
            href={user.rol === "admin" ? "/usuarios" : "/perfil"}
          />
          <Modulo
            titulo="Productos y stock"
            detalle="Categorías, precios, existencias y movimientos."
            href="/productos"
          />
          <Modulo
            titulo="Movimientos de stock"
            detalle="Historial de ingresos, egresos y ventas."
            href="/movimientos-stock"
          />
          <Modulo
            titulo="Clientes y cuenta corriente"
            detalle="Alta de clientes, saldos y pagos."
            href="/clientes"
          />
          <Modulo
            titulo="Saldos deudores"
            detalle="Deudores ordenados por deuda y total general adeudado."
            href="/deudores"
          />
          <Modulo
            titulo="Ventas y facturación"
            detalle="Emisión, anulación y comprobantes."
          />
          <Modulo
            titulo="Tablero"
            detalle="Indicadores del día y del mes."
            href="/#indicadores"
          />
        </section>
      </div>
    </AppShell>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-500">{titulo}</h2>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalle}</p>
    </article>
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
