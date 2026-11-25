import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { secretoSesionDesdeEntorno } from "@/lib/env";

const COOKIE_NAME = "session_token";

// TP5-49: el secreto se resuelve de forma diferida. Así `next build` no exige
// variables de entorno, pero el primer uso real de la sesión falla con un
// mensaje claro si no se configuró SESSION_SECRET.
let claveSecreta: Uint8Array | undefined;

function obtenerClaveSecreta(): Uint8Array {
  if (!claveSecreta) {
    claveSecreta = new TextEncoder().encode(secretoSesionDesdeEntorno());
  }
  return claveSecreta;
}

export interface SessionPayload {
  userId: number;
  email: string;
  rol: "admin" | "vendedor";
}

/**
 * Crea y firma un JWT de sesión para el usuario.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(obtenerClaveSecreta());
}

/**
 * Establece la cookie de sesión en la respuesta HTTP (httpOnly, SameSite=Lax).
 */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 horas
  });
}

/**
 * Elimina la cookie de sesión (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Lee y verifica el token de sesión desde la cookie.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, obtenerClaveSecreta());
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      rol: payload.rol as "admin" | "vendedor",
    };
  } catch {
    return null;
  }
}
