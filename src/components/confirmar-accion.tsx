"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * TP5-48: confirmación consistente para bajas lógicas, desactivaciones y
 * restablecimientos. Envuelve el `AlertDialog` de shadcn/ui y solo cierra
 * después de que la acción termina; cancelar no muta nada.
 */
export interface ConfirmarAccionProps {
  titulo: string;
  descripcion: string;
  consecuencia?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  onConfirmar: () => void | Promise<void>;
  children: ReactNode;
}

export function ConfirmarAccion({
  titulo,
  descripcion,
  consecuencia,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  onConfirmar,
  children,
}: ConfirmarAccionProps) {
  const [abierto, setAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);

  async function confirmar(event: MouseEvent<HTMLButtonElement>) {
    // Radix cierra el diálogo por defecto: se evita hasta que la acción termine.
    event.preventDefault();
    setProcesando(true);
    try {
      await onConfirmar();
    } finally {
      setProcesando(false);
      setAbierto(false);
    }
  }

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!procesando) setAbierto(valor);
      }}
    >
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p>{descripcion}</p>
              {consecuencia && (
                <p className="mt-2 font-medium text-slate-700">{consecuencia}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={procesando}>{textoCancelar}</AlertDialogCancel>
          <AlertDialogAction disabled={procesando} onClick={(event) => void confirmar(event)}>
            {procesando ? "Procesando…" : textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
