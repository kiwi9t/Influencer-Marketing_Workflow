import { creatorDeal, submitCreator, WorkflowError } from "../../lib/deal";

function html(content: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Relay · Creator update</title><style>
    body{font:16px/1.5 system-ui;margin:2rem auto;padding:0 1rem;max-width:38rem;color:#252236;background:#f7f6f3}
    label{display:block;margin:1rem 0} input:not([type=checkbox]),textarea{box-sizing:border-box;width:100%;padding:.6rem;font:inherit}
    button{padding:.65rem 1rem;background:#5c42a4;color:white;border:0;border-radius:6px;font:inherit}
    </style></head><body><main><h1>Creator update</h1>${content}</main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function errorResponse(error: unknown) {
  if (error instanceof WorkflowError) return html(`<p>${escapeHtml(error.message)}</p><p>Use your browser’s Back button to return to the form.</p>`, error.status);
  return html("<p>Relay could not process the update. Please try again.</p>", 500);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const deal = await creatorDeal(token);
    let fields: string;
    if (deal.status === "NEGOTIATION") {
      fields = '<label>Your quote (USD)<input name="askingRate" inputmode="decimal" maxlength="15" required></label>';
    } else if (deal.status === "LOGISTICS_CONTRACT" || deal.status === "DRAFT_REVIEW") {
      const logistics = deal.status === "LOGISTICS_CONTRACT";
      const address = logistics && !deal.shippingTrackingNumber
        ? '<label>Shipping address<textarea name="shippingAddress" rows="3" maxlength="800"></textarea></label>' : "";
      const delivery = logistics && deal.shippingTrackingNumber && !deal.deliveredAt
        ? '<label><input type="checkbox" name="delivered"> I have received the sample</label>' : "";
      fields = `${address}${delivery}<label>Script URL<input name="scriptUrl" type="url" maxlength="2000"></label>
        <label>Draft video URL<input name="draftUrl" type="url" maxlength="2000"></label>`;
    } else if (deal.status === "LIVE_PENDING") {
      fields = '<label>Live video URL<input name="liveVideoUrl" type="url" maxlength="2000" required></label><label>Publication time in UTC (e.g. 2026-11-08T18:30:00Z)<input name="publishedAt" maxlength="30" required></label>';
    } else {
      return html("<p>There is no update to submit at the current stage.</p>");
    }
    return html(`<p>Submit an update for this collaboration.</p><form action="/submit" method="post">
      <input type="hidden" name="token" value="${escapeHtml(token)}"><input type="hidden" name="revision" value="${deal.revision}">${fields}<button>Send update</button></form>`);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/x-www-form-urlencoded")) return html("<p>Invalid submission format.</p>", 415);
  try {
    const body = await request.text();
    if (body.length > 16_384) return html("<p>Submission is too large.</p>", 413);
    const form = Object.fromEntries(new URLSearchParams(body));
    await submitCreator(form.token ?? "", form);
    return html("<p>Update received. Thank you!</p>");
  } catch (error) {
    return errorResponse(error);
  }
}
