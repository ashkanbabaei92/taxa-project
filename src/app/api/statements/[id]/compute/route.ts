import { computeStatement } from "@/server/statement-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const statementId = Number(id);
    if (!Number.isInteger(statementId)) {
      return Response.json(
        { error: "شناسه صورت وضعیت نامعتبر است" },
        { status: 400 },
      );
    }
    const result = await computeStatement(statementId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
