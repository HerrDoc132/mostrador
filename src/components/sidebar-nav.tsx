"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  Menu,
  Package,
  PlusCircle,
  Shield,
  ShoppingCart,
  UserRound,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogoutButton } from "@/app/logout-button";
import {
  esModuloActivo,
  modulosVisibles,
  SUBENLACES_NAV,
  type EnlaceModulo,
  type RolNav,
} from "@/lib/navegacion";
import { cn } from "@/lib/utils";

/**
 * RF-U2 (requerimientos.md:60,72,171-172): panel lateral fijo en escritorio,
 * resaltado del módulo activo y menú colapsable desde 360 px.
 * `usePathname` solo vive acá; `AppShell` sigue siendo Server Component.
 */

const ICONOS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/productos": Package,
  "/clientes": Users,
  "/ventas": ShoppingCart,
  "/usuarios": Shield,
  "/ventas/nueva": PlusCircle,
  "/movimientos-stock": ClipboardList,
  "/deudores": WalletCards,
  "/perfil": UserRound,
};

function enlaceClase(activo: boolean): string {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    activo
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  );
}

function ListaEnlaces({
  enlaces,
  pathname,
  onNavigate,
}: {
  enlaces: readonly EnlaceModulo[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {enlaces.map((enlace) => {
        const activo = esModuloActivo(pathname, enlace.href);
        const Icono = ICONOS[enlace.href] ?? LayoutDashboard;
        return (
          <li key={enlace.href}>
            <Link
              href={enlace.href}
              onClick={onNavigate}
              aria-current={activo ? "page" : undefined}
              className={enlaceClase(activo)}
            >
              <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
              {enlace.etiqueta}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ContenidoNav({
  rol,
  nombre,
  pathname,
  onNavigate,
}: {
  rol: RolNav;
  nombre: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <nav aria-label="Módulos" className="flex-1 space-y-5 overflow-y-auto p-3">
        <ListaEnlaces
          enlaces={modulosVisibles(rol)}
          pathname={pathname}
          onNavigate={onNavigate}
        />
        <div>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Accesos rápidos
          </p>
          <ListaEnlaces
            enlaces={SUBENLACES_NAV}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        </div>
      </nav>
      <div className="border-t p-3">
        <p className="truncate text-xs text-muted-foreground">
          {nombre} · {rol}
        </p>
        <div className="mt-2">
          <LogoutButton />
        </div>
      </div>
    </>
  );
}

export function SidebarNav({ rol, nombre }: { rol: RolNav; nombre: string }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);

  return (
    <>
      <aside
        aria-label="Navegación principal"
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card md:flex"
      >
        <div className="flex h-16 shrink-0 items-center border-b px-5">
          <Link href="/" className="text-base font-bold" onClick={cerrar}>
            Mostrador
          </Link>
        </div>
        <ContenidoNav rol={rol} nombre={nombre} pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-3 md:hidden">
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menú">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex w-[18rem] max-w-[calc(100vw-2rem)] flex-col p-0"
          >
            <SheetHeader className="h-16 shrink-0 justify-center border-b px-5">
              <SheetTitle>Mostrador</SheetTitle>
            </SheetHeader>
            <ContenidoNav
              rol={rol}
              nombre={nombre}
              pathname={pathname}
              onNavigate={cerrar}
            />
          </SheetContent>
        </Sheet>
        <span className="font-semibold">Mostrador</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {nombre}
        </span>
      </header>
    </>
  );
}
