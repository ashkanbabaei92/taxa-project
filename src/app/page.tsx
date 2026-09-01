import Workspace from "@/components/Workspace";
import { getProjectTree } from "@/server/project-service";
import { isSeeded, seedDatabase } from "@/server/seed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let error: string | null = null;
  let tree: Awaited<ReturnType<typeof getProjectTree>> = [];
  try {
    if (!(await isSeeded())) {
      await seedDatabase();
    }
    tree = await getProjectTree();
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <main className="p-8">
        <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <h1 className="mb-2 font-bold">خطا در اتصال به پایگاه داده</h1>
          <p className="text-xs leading-6">{error}</p>
        </div>
      </main>
    );
  }

  return <Workspace initialTree={tree} />;
}
