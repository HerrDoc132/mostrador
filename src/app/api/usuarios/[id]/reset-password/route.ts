import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api";
import { resetPassword } from "@/services/usuarios";

/**
 * POST /api/usuarios/{id}/reset-password (RF-U5, solo admin)
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await requireSession();
    const { id } = await context.params;
    const result = await resetPassword(Number(id), actor);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
