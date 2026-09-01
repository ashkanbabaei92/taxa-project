import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contractCoefficients } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rows = await db
    .select()
    .from(contractCoefficients)
    .where(eq(contractCoefficients.contractId, Number(id)))
    .orderBy(asc(contractCoefficients.sortOrder));
  return Response.json({ coefficients: rows });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      kind?: string;
      title?: string;
      value?: number | string;
      scope?: string;
      chapterNo?: number | null;
      includeInAdjustment?: boolean;
    };
    const value = Number(body.value);
    if (!body.title || !Number.isFinite(value) || value <= 0) {
      return Response.json(
        { error: "عنوان و مقدار ضریب (عدد مثبت) الزامی است" },
        { status: 400 },
      );
    }
    const [created] = await db
      .insert(contractCoefficients)
      .values({
        contractId: Number(id),
        kind: body.kind ?? "custom",
        title: body.title,
        value: value.toFixed(14),
        scope: body.scope === "chapter" ? "chapter" : "all",
        chapterNo: body.scope === "chapter" ? (body.chapterNo ?? null) : null,
        includeInAdjustment: body.includeInAdjustment ?? true,
        sortOrder: 99,
      })
      .returning();
    return Response.json({ coefficient: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      coefficientId: number;
      isActive?: boolean;
      value?: number;
    };
    const patch: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (typeof body.value === "number") patch.value = body.value.toFixed(14);
    await db
      .update(contractCoefficients)
      .set(patch)
      .where(
        and(
          eq(contractCoefficients.id, body.coefficientId),
          eq(contractCoefficients.contractId, Number(id)),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const coefficientId = Number(searchParams.get("coefficientId"));
    await db
      .delete(contractCoefficients)
      .where(
        and(
          eq(contractCoefficients.id, coefficientId),
          eq(contractCoefficients.contractId, Number(id)),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
