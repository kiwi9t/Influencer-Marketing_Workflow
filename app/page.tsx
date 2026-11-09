import { loadDeal } from "../lib/deal";
import { db } from "../lib/db";
import Dashboard from "./dashboard";
import Workspace from "./workspace";

export const dynamic = "force-dynamic";
export default async function Home({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const { deal: id } = await searchParams;
  if (id) {
    const deal = await loadDeal(id);
    if (!deal) return <main className="p-10">Collaboration not found. <a href="/">Back to workspace</a></main>;
    return <Dashboard initial={deal} />;
  }
  const deals = await db.deal.findMany({ include: { creator: true }, orderBy: { targetLiveDate: "asc" } });
  return <Workspace deals={deals.map(d => ({
    id: d.id, title: d.title, name: d.creator.name, handle: d.creator.handle,
    platform: d.creator.platform, status: d.status, isDemo: d.isDemo,
    date: d.targetLiveDate?.toISOString().slice(0,10) ?? null,
    rate: d.agreedRate === null ? null : Number(d.agreedRate),
  }))} />;
}
