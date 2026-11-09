import { loadDeal, mutateDeal, WorkflowError } from "../../../lib/deal";

export async function GET(request: Request) {
  const deal = await loadDeal(new URL(request.url).searchParams.get("id") ?? undefined);
  return deal ? Response.json(deal) : Response.json({ error: "Deal not initialized. Run npm run db:setup." }, { status: 404 });
}

export async function PATCH(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return Response.json({ error: "Use application/json." }, { status: 415 });
  }
  try {
    return Response.json(await mutateDeal(await request.json(), new URL(request.url).searchParams.get("id") ?? undefined));
  } catch (error) {
    if (error instanceof WorkflowError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    console.error("Unable to update deal:", error);
    return Response.json({ error: "The update could not be saved. Try again." }, { status: 500 });
  }
}
