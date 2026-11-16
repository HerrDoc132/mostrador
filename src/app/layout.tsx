import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mostrador · Sistema de Gestión Comercial",
  description: "Facturación, control de existencias y cuenta corriente",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
