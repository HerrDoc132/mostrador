import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "session_token";
const SECRET_KEY = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default_development_secret_key_at_least_32_bytes_long"
);

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
    .sign(SECRET_KEY);
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
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      rol: payload.rol as "admin" | "vendedor",
    };
  } catch {
    return null;
  }
}
