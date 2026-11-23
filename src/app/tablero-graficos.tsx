"use client";

import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { formatCurrency } from "@/lib/format";

/**
 * Gráficos del tablero (RF-T2). Componente de presentación: recibe las series
 * ya calculadas por el servicio; no contiene reglas de negocio.
 */
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export interface VentaDiaria {
  fecha: string;
  importe: number;
}

export interface FormaDePago {
  forma: string;
  importe: number;
}

const ETIQUETAS_FORMA: Record<string, string> = {
  contado: "Contado",
  tarjeta: "Tarjeta",
  cuenta_corriente: "Cuenta corriente",
};

const COLORES_FORMA = ["#2563eb", "#16a34a", "#f59e0b"];

export function TableroGraficos({
  ventasDiarias,
  porFormaDePago,
}: {
  ventasDiarias: VentaDiaria[];
  porFormaDePago: FormaDePago[];
}) {
  const datosLinea = {
    labels: ventasDiarias.map((punto) => punto.fecha.slice(5)),
    datasets: [
      {
        label: "Ventas emitidas",
        data: ventasDiarias.map((punto) => punto.importe / 100),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.15)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  const opcionesLinea: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (item) =>
            ` ${formatCurrency(Math.round((item.parsed.y ?? 0) * 100))}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (valor) => formatCurrency(Math.round(Number(valor) * 100)),
        },
      },
    },
  };

  const datosTorta = {
    labels: porFormaDePago.map((punto) => ETIQUETAS_FORMA[punto.forma] ?? punto.forma),
    datasets: [
      {
        data: porFormaDePago.map((punto) => punto.importe),
        backgroundColor: COLORES_FORMA,
      },
    ],
  };

  const opcionesTorta: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: {
        callbacks: {
          label: (item) => ` ${item.label}: ${formatCurrency(item.parsed)}`,
        },
      },
    },
  };

  return (
    <section id="graficos" aria-label="Gráficos de ventas" className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Ventas de los últimos 30 días
        </h2>
        <p className="mt-1 text-xs text-slate-500">Importes en pesos argentinos.</p>
        <div className="mt-4 h-64">
          <Line data={datosLinea} options={opcionesLinea} />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Ventas del mes por forma de pago
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Solo facturas emitidas del mes en curso.
        </p>
        <div className="mt-4 h-64">
          <Doughnut data={datosTorta} options={opcionesTorta} />
        </div>
      </article>
    </section>
  );
}
