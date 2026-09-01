import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contracts,
  customItems,
  detailQuantities,
  locations,
  priceItems,
  statements,
} from "@/db/schema";

export const dynamic = "force-dynamic";

/** فهرست انتخاب‌های لازم برای ورود ریزمتره */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const statementId = Number(id);
    const [stmt] = await db
      .select()
      .from(statements)
      .where(eq(statements.id, statementId));
    if (!stmt) {
      return Response.json({ error: "صورت وضعیت یافت نشد" }, { status: 404 });
    }
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, stmt.contractId));
    const [items, locs, customs, rows] = await Promise.all([
      contract?.priceBookId
        ? db
            .select()
            .from(priceItems)
            .where(eq(priceItems.priceBookId, contract.priceBookId))
            .orderBy(asc(priceItems.code))
        : Promise.resolve([]),
      db
        .select()
        .from(locations)
        .where(eq(locations.contractId, stmt.contractId)),
      db.select().from(customItems).where(eq(customItems.statementId, statementId)),
      db
        .select()
        .from(detailQuantities)
        .where(eq(detailQuantities.statementId, statementId))
        .orderBy(asc(detailQuantities.id)),
    ]);
    return Response.json({
      statement: stmt,
      contract,
      priceItems: items,
      locations: locs,
      customItems: customs,
      rows,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** افزودن سطر ریزمتره */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const statementId = Number(id);
    const body = (await request.json()) as {
      priceItemId?: number | null;
      customItemId?: number | null;
      locationId?: number | null;
      description?: string;
      countQty?: number;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      weight?: number | null;
      sign?: number;
    };
    if (!body.priceItemId && !body.customItemId) {
      return Response.json(
        { error: "انتخاب ردیف فهرست بها یا آیتم دلخواه الزامی است" },
        { status: 400 },
      );
    }
    const numOrNull = (v: unknown) =>
      v === null || v === undefined || v === "" ? null : String(Number(v));
    const [created] = await db
      .insert(detailQuantities)
      .values({
        statementId,
        priceItemId: body.priceItemId ?? null,
        customItemId: body.customItemId ?? null,
        locationId: body.locationId ?? null,
        description: body.description ?? "",
        countQty: String(Number(body.countQty ?? 1)),
        length: numOrNull(body.length),
        width: numOrNull(body.width),
        height: numOrNull(body.height),
        weight: numOrNull(body.weight),
        sign: body.sign === -1 ? -1 : 1,
      })
      .returning();
    return Response.json({ row: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** حذف سطر ریزمتره */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const rowId = Number(searchParams.get("rowId"));
    if (!Number.isInteger(rowId)) {
      return Response.json({ error: "شناسه سطر نامعتبر است" }, { status: 400 });
    }
    await db
      .delete(detailQuantities)
      .where(
        and(
          eq(detailQuantities.id, rowId),
          eq(detailQuantities.statementId, Number(id)),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
