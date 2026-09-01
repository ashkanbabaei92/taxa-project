import { db } from "@/db";
import { projects } from "@/db/schema";
import { getProjectTree } from "@/server/project-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ tree: await getProjectTree() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      code?: string;
      parentId?: number | null;
      nodeType?: string;
    };
    if (!body.title || !body.code) {
      return Response.json(
        { error: "عنوان و کد پروژه الزامی است" },
        { status: 400 },
      );
    }
    const [created] = await db
      .insert(projects)
      .values({
        title: body.title,
        code: body.code,
        parentId: body.parentId ?? null,
        nodeType: body.nodeType ?? "project",
      })
      .returning();
    return Response.json({ project: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
