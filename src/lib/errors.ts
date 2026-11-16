/**
 * Clase estándar para errores de la API REST y capa de servicios.
 * Fuente: docs/06-api-rest/specs-api-rest.md
 */

export interface ErrorDetail {
  campo?: string;
  productoId?: number;
  solicitado?: number;
  disponible?: number;
  saldoActual?: number;
  limite?: number | null;
  excedente?: number;
  mensaje?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: ErrorDetail[];

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
