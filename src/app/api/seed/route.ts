import { isSeeded, seedDatabase } from "@/server/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ seeded: await isSeeded() });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const result = await seedDatabase();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: `خطا در ایجاد داده نمونه: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
