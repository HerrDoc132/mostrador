import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Primitiva de maquetación propia sobre el estilo de shadcn/ui.
 * Mantiene la API nativa de `<select>` para no duplicar la lógica de los
 * formularios existentes (value/onChange/required/disabled).
 * RF: las pantallas no usan etiquetas HTML sueltas; todo el estilo va por Tailwind.
 */
export type SelectCampoProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectCampo = React.forwardRef<HTMLSelectElement, SelectCampoProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
SelectCampo.displayName = "SelectCampo";

export type SelectOptionProps = React.OptionHTMLAttributes<HTMLOptionElement>;

export function SelectOption({ className, ...props }: SelectOptionProps) {
  return <option className={cn("bg-background text-foreground", className)} {...props} />;
}
