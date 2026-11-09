"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check,
  ChevronDown, CircleDollarSign, ClipboardList, Copy, ExternalLink, Film, Instagram, Layers3,
  Link2, Mail, MessageSquare, PackageCheck, Pencil, Radio, UserRound, X, Youtube,
} from "lucide-react";
import { METRICS, PLATFORMS, STAGES, type DealData } from "../lib/pipeline";

const icons = [MessageSquare, CircleDollarSign, PackageCheck, Film, Radio, Activity];
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = new Intl.NumberFormat("en-US");
const metricLabels = { views: "Views", comments: "Comments", clicks: "Clicks", orders: "Orders" };
const dateLabel = (value: string) => new Date(value + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function TextInput({ name, value, placeholder, type = "text", required, ...extra }: {
  name: string; value?: string | number | null; placeholder?: string; type?: string; required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "defaultValue">) {
  return <input name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} required={required} {...extra} />;
}

function toLocalDateTime(iso: string | null) {
  if (!iso) return "";
  const value = new Date(iso);
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function PlatformIcon({ platform, size = 15 }: { platform: DealData["creator"]["platform"]; size?: number }) {
  if (platform === "Instagram") return <Instagram size={size} />;
  if (platform === "YouTube") return <Youtube size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 15.8A4.2 4.2 0 1 1 9.8 11.6h1.1M14 15.8V3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.8v6.6a7.2 7.2 0 0 1-7.2 7.2" transform="translate(-1 -1)" /></svg>;
}

function Mark() {
  return <div className="mark" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 25 25" fill="none"><path d="M4.7 12.4h10.7l-3.7-3.7m3.7 3.7-3.7 3.7m4-10.5 4.6 4.7v4.2l-4.6 4.7" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"/></svg></div>;
}

function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="inline-link" href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={12} /></a>;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState("");
  return <div className="copy-row"><div><span>{label}</span><input aria-label={label} readOnly value={value} onFocus={(event) => event.target.select()} /></div>
    <button type="button" className="icon-button" aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setState("Copied"); }
      catch { setState("Select the value to copy it manually."); }
    }}>{state === "Copied" ? <Check size={16} /> : <Copy size={16} />}</button>
    <span className="copy-status" role="status">{state}</span></div>;
}

type Action = "save" | "advance" | "creator" | "metric";
type Submit = (action: Action, fields: Record<string, unknown>) => Promise<boolean>;

function CampaignFields({ deal }: { deal: DealData }) {
  return <>
    <Field label="Campaign destination" hint="Relay adds UTM parameters when the draft is approved."><TextInput name="destinationUrl" type="url" value={deal.destinationUrl} placeholder="https://yourstore.com/product" /></Field>
    <Field label="Affiliate URL (optional)"><TextInput name="affiliateUrl" type="url" value={deal.affiliateUrl} placeholder="https://…" /></Field>
    <Field label="Official tags & hashtags" hint="Leave blank for suggested hashtags."><TextInput name="requiredTags" value={deal.requiredTags} maxLength={500} placeholder="@brand #campaign #ad" /></Field>
    <Field label="Target live date" hint="Reminders follow the current target date."><TextInput name="targetLiveDate" type="date" value={deal.targetLiveDate} required={Boolean(deal.targetLiveDate)} /></Field>
  </>;
}

function StageForm({ deal, submit, busy }: { deal: DealData; submit: Submit; busy: boolean }) {
  const stage = STAGES.find((item) => item.id === deal.status)!;
  const [review, setReview] = useState(deal.reviewStatus ?? "");
  const [draft, setDraft] = useState(deal.draftUrl ?? "");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    if (deal.status === "LOGISTICS_CONTRACT") fields.contractSigned = fields.contractSigned === "on";
    if (deal.status === "LIVE_PENDING" && typeof fields.publishedAt === "string" && fields.publishedAt) {
      const published = new Date(fields.publishedAt);
      if (!Number.isNaN(published.valueOf())) fields.publishedAt = published.toISOString();
    }
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "advance" ? "advance" : "save";
    void submit(action, fields);
  }

  return <form onSubmit={onSubmit} className="stage-form">
    <fieldset disabled={busy} className="field-stack">
      {deal.status === "PITCHING" && <>
        <Field label="Topic & creative scope" hint="Include the format, key talking points, and expected deliverables.">
          <textarea name="topicNotes" rows={5} maxLength={6000} defaultValue={deal.topicNotes} placeholder="What should the creator make?" />
        </Field>
        <Field label="Do’s & don’ts"><textarea name="scopeRequirements" rows={3} maxLength={6000} defaultValue={deal.scopeRequirements} placeholder="Required selling points, claims to avoid, and brand guidelines" /></Field>
        <div className="notice"><MessageSquare size={16} /><p><strong>Positive reply received.</strong> Confirm the scope to open negotiation and queue a quote request.</p></div>
      </>}
      {deal.status === "NEGOTIATION" && <>
        <div className="two-fields">
          <Field label="Asking rate (USD)"><TextInput name="askingRate" value={deal.askingRate} placeholder="e.g. 1200.00" inputMode="decimal" /></Field>
          <Field label="Target budget (USD)"><TextInput name="targetBudget" value={deal.targetBudget} inputMode="decimal" /></Field>
          <Field label="Latest counteroffer (USD)"><TextInput name="offerRate" inputMode="decimal" /></Field>
          <Field label="Agreed rate (USD)"><TextInput name="agreedRate" value={deal.agreedRate} placeholder="e.g. 950.00" inputMode="decimal" /></Field>
        </div>
        <Field label="Negotiation log entry" hint="Saving appends this note and the offer to the history."><textarea name="negotiationNote" rows={3} maxLength={3000} placeholder="What was offered and how did the creator respond?" /></Field>
      </>}
      {deal.status === "LOGISTICS_CONTRACT" && <>
        {deal.contractDraft && <details className="deal-record"><summary><ClipboardList size={16} /> Contract draft <ChevronDown size={15} className="chevron" /></summary>
          <pre className="whitespace-pre-wrap break-words text-sm">{deal.contractDraft}</pre>
          <a download="collaboration-contract-draft.txt" className="inline-link mt-2" href={`data:text/plain;charset=utf-8,${encodeURIComponent(deal.contractDraft)}`}>Download draft</a>
        </details>}
        <Field label="Contract URL"><TextInput name="contractUrl" type="url" value={deal.contractUrl} placeholder="https://…" /></Field>
        <label className="checkbox"><input type="checkbox" name="contractSigned" defaultChecked={deal.contractSigned} /> Contract is signed</label>
        <Field label="Product brief URL" hint="Relay queues an email when the brief and target date are saved."><TextInput name="briefUrl" type="url" value={deal.briefUrl} placeholder="https://…" /></Field>
        <Field label="Shipping address"><textarea name="shippingAddress" rows={3} maxLength={800} defaultValue={deal.shippingAddress ?? ""} placeholder="Recipient, street address, city, postal code, country" /></Field>
        <div className="two-fields">
          <Field label="Sample tracking number"><TextInput name="shippingTrackingNumber" value={deal.shippingTrackingNumber} placeholder="Carrier tracking number" maxLength={120} /></Field>
          <Field label="Target live date"><TextInput name="targetLiveDate" type="date" value={deal.targetLiveDate} /></Field>
          <Field label="Planned shipment"><TextInput name="plannedShipDate" type="date" value={deal.plannedShipDate} /></Field>
          <Field label="Expected delivery"><TextInput name="expectedDeliveryDate" type="date" value={deal.expectedDeliveryDate} /></Field>
          <Field label="Delivered on"><TextInput name="deliveredAt" type="date" value={deal.deliveredAt} /></Field>
          <Field label="Sample quality check"><select name="sampleStatus" defaultValue={deal.sampleStatus ?? ""}>
            <option value="">Pending</option><option value="PASSED">Passed</option><option value="FAILED">Failed</option>
          </select></Field>
        </div>
        <Field label="Sample check notes"><textarea name="sampleNotes" rows={2} maxLength={3000} defaultValue={deal.sampleNotes} /></Field>
        <div className="notice"><PackageCheck size={16} /><p>Relay opens draft review when the contract, brief, schedule and shipment are recorded, and the delivered sample passes inspection.</p></div>
      </>}
      {deal.status === "DRAFT_REVIEW" && <>
        <Field label="Script URL"><TextInput name="scriptUrl" type="url" value={deal.scriptUrl} placeholder="https://…" /></Field>
        <Field label="Draft video URL"><input name="draftUrl" type="url" value={draft} placeholder="https://…" onChange={(event) => { setDraft(event.target.value); setReview(""); }} /></Field>
        <Field label="Review status">
          <select name="reviewStatus" value={review} onChange={(event) => setReview(event.target.value as typeof review)}>
            <option value="">Awaiting review</option><option value="REVISION_REQUESTED">Revision requested</option><option value="APPROVED">Approved</option>
          </select>
        </Field>
        <Field label="Review notes"><textarea name="reviewNotes" rows={3} maxLength={6000} defaultValue={deal.reviewNotes} placeholder="What’s working? What needs to change?" /></Field>
        <CampaignFields deal={deal} />
        <div className="notice"><Link2 size={16} /><p>Approval plus a campaign destination queues the publication assets and opens Go live.</p></div>
      </>}
      {deal.status === "LIVE_PENDING" && <>
        <CampaignFields deal={deal} />
        <div className="tracking-pack">
          {deal.trackingLink && deal.hashtags ? <><CopyValue value={deal.trackingLink} label="UTM tracking link" /><CopyValue value={deal.hashtags} label="Publication tags" /></> :
            <div className="notice"><Link2 size={16} /><p>Save the destination to generate a shareable UTM link and hashtags.</p></div>}
        </div>
        <Field label="Live video URL"><TextInput name="liveVideoUrl" type="url" value={deal.liveVideoUrl} placeholder="https://…" /></Field>
        <Field label="Published at" hint="Enter the publish time in your local timezone."><TextInput name="publishedAt" type="datetime-local" value={toLocalDateTime(deal.publishedAt)} /></Field>
      </>}
    </fieldset>
    <div className="form-actions">
      <button type="submit" value="save" className={`button ${stage.next ? "secondary" : "primary"}`} disabled={busy}>Save {deal.status === "PITCHING" ? "notes" : "details"}</button>
      {stage.next && <button type="submit" value="advance" className="button primary" disabled={busy}>{stage.next}<ArrowRight size={17} /></button>}
    </div>
  </form>;
}

function MetricsForm({ deal, busy, submit }: { deal: DealData; busy: boolean; submit: Submit }) {
  const firstMissing = Array.from({ length: 7 }, (_, index) => index + 1).find((day) => !deal.metrics.some((metric) => metric.dayNumber === day)) ?? 7;
  const [day, setDay] = useState(firstMissing);
  const existing = deal.metrics.find((metric) => metric.dayNumber === day);
  const published = deal.publishedAt ? new Date(deal.publishedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
  return <div>
    <div className="notice live-notice"><Radio size={16} /><p><strong>Post is live.</strong> {published}{deal.liveVideoUrl && <> · <SafeLink href={deal.liveVideoUrl}>View video</SafeLink></>}</p></div>
    <form className="metric-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void submit("metric", { dayNumber: day, ...Object.fromEntries(METRICS.map((key) => [key, Number(form.get(key))])) });
    }}>
      <fieldset disabled={busy} className="field-stack">
        <Field label="Tracking day">
          <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map((item) => <option key={item} value={item}>Day {item}{deal.metrics.some((metric) => metric.dayNumber === item) ? " · logged" : ""}</option>)}
          </select>
        </Field>
        <div className="metric-fields" key={`${day}-${deal.revision}`}>
          {METRICS.map((key) => <Field label={metricLabels[key]} key={key}><TextInput name={key} type="number" min={0} max={2147483647} step={1} placeholder="0" value={existing?.[key]} required /></Field>)}
        </div>
      </fieldset>
      <div className="form-actions"><button className="button primary" disabled={busy} type="submit">{existing ? "Update" : "Save"} day {day}<Check size={17} /></button></div>
    </form>
    <div className="table-scroll">
      <table className="metrics-table">
        <caption>Daily results <span>{deal.metrics.length} of 7 days logged</span></caption>
        <thead><tr><th scope="col">Day</th>{METRICS.map((key) => <th key={key} scope="col">{metricLabels[key]}</th>)}<th scope="col">Source</th></tr></thead>
        <tbody>{Array.from({ length: 7 }, (_, i) => i + 1).map((item) => {
          const row = deal.metrics.find((metric) => metric.dayNumber === item);
          return <tr key={item}><th scope="row"><button type="button" className={item === day ? "day selected" : "day"} aria-pressed={item === day} onClick={() => setDay(item)}>Day {item}</button></th>
            {METRICS.map((key) => <td key={key}>{row ? count.format(row[key]) : "—"}</td>)}<td>{row ? (row.source === "PROVIDER" ? "Provider" : row.source === "DEMO" ? "Demo" : "Manual") : "—"}</td></tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function CreatorDialog({ deal, dialog, busy, submit, error }: { deal: DealData; dialog: React.RefObject<HTMLDialogElement | null>; busy: boolean; submit: Submit; error: string }) {
  const { creator } = deal;
  const locked = Boolean(deal.trackingLink);
  return <dialog ref={dialog} aria-labelledby="edit-title" className="edit-dialog">
    <div className="dialog-heading"><div><p className="eyebrow">Creator profile</p><h2 id="edit-title">Edit creator</h2></div><button type="button" className="icon-button" aria-label="Close creator editor" onClick={() => dialog.current?.close()}><X size={19} /></button></div>
    <form onSubmit={async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      if (locked) Object.assign(values, { handle: creator.handle, platform: creator.platform });
      if (await submit("creator", values)) dialog.current?.close();
    }}>
      <fieldset disabled={busy} className="field-stack">
        <Field label="Name"><TextInput name="name" value={creator.name} maxLength={80} required /></Field>
        <div className="two-fields">
          <Field label="Handle"><TextInput name="handle" value={creator.handle} maxLength={31} readOnly={locked} required /></Field>
          <Field label="Platform"><select name="platform" defaultValue={creator.platform} disabled={locked}>{PLATFORMS.map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        {locked && <p className="subtle text-sm">Handle and platform are locked after a tracking link is generated.</p>}
        <Field label="Email"><TextInput name="email" type="email" value={creator.email} required maxLength={254} /></Field>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>Save creator<Check size={17} /></button>
      </div>
    </form>
  </dialog>;
}

function DealRecord({ deal }: { deal: DealData }) {
  return <details className="deal-record">
    <summary><ClipboardList size={16} /><span>Deal record</span><ChevronDown size={15} className="chevron" /></summary>
    <dl>
      <dt>Creative scope</dt><dd className="whitespace-pre-wrap">{deal.topicNotes || "—"}</dd>
      <dt>Do’s & don’ts</dt><dd className="whitespace-pre-wrap">{deal.scopeRequirements || "—"}</dd>
      <dt>Target budget</dt><dd>{deal.targetBudget === null ? "—" : usd.format(deal.targetBudget)}</dd>
      <dt>Asking / agreed</dt><dd>{deal.askingRate === null ? "—" : usd.format(deal.askingRate)} / {deal.agreedRate === null ? "—" : usd.format(deal.agreedRate)}</dd>
      {deal.lockedAt && <><dt>Rate locked</dt><dd>{dateLabel(deal.lockedAt.slice(0, 10))}</dd></>}
      <dt>Contract</dt><dd>{deal.contractUrl ? <SafeLink href={deal.contractUrl}>{deal.contractSigned ? "Signed contract" : "View contract"}</SafeLink> : "—"}</dd>
      <dt>Product brief</dt><dd>{deal.briefUrl ? <SafeLink href={deal.briefUrl}>View brief</SafeLink> : "—"}</dd>
      <dt>Shipping address</dt><dd className="whitespace-pre-wrap">{deal.shippingAddress || "—"}</dd>
      <dt>Tracking number</dt><dd>{deal.shippingTrackingNumber || "—"}</dd>
      <dt>Target live date</dt><dd>{deal.targetLiveDate ? dateLabel(deal.targetLiveDate) : "—"}</dd>
      <dt>Sample delivered / quality check</dt><dd>{deal.deliveredAt ? dateLabel(deal.deliveredAt) : "—"} / {deal.sampleStatus ?? "Pending"}{deal.sampleNotes && <p>{deal.sampleNotes}</p>}</dd>
      <dt>Script</dt><dd>{deal.scriptUrl ? <SafeLink href={deal.scriptUrl}>View script</SafeLink> : "—"}</dd>
      <dt>Draft</dt><dd>{deal.draftUrl ? <SafeLink href={deal.draftUrl}>View draft</SafeLink> : "—"}{deal.reviewStatus && <p>{deal.reviewStatus === "APPROVED" ? "Approved" : "Revision requested"}</p>}{deal.reviewNotes && <p className="whitespace-pre-wrap">{deal.reviewNotes}</p>}</dd>
      <dt>Campaign link</dt><dd>{deal.trackingLink ? <SafeLink href={deal.trackingLink}>Open tracking link</SafeLink> : "—"}{deal.hashtags && <p>{deal.hashtags}</p>}</dd>
      <dt>Affiliate link</dt><dd>{deal.affiliateUrl ? <SafeLink href={deal.affiliateUrl}>Open affiliate link</SafeLink> : "—"}</dd>
      <dt>Live post</dt><dd>{deal.liveVideoUrl ? <SafeLink href={deal.liveVideoUrl}>View video</SafeLink> : "—"}</dd>
    </dl>
  </details>;
}

function AutomationPanel({ deal }: { deal: DealData }) {
  const statuses = { PENDING: "Queued", RUNNING: "Running", PREVIEW: "Preview", DONE: "Done", FAILED: "Failed", CANCELED: "Canceled" };
  return <section id="automation" className="panel tracking-panel" aria-labelledby="automation-title">
    <div className="context-heading"><h2 id="automation-title"><Activity size={17} /> Automation</h2>
      <button type="button" className="button secondary" onClick={() => window.location.reload()}>Reload</button></div>
    {deal.jobs.length === 0 ? <p>Queued emails and metric jobs appear here.</p> : <ul className="mt-3 space-y-2">
      {deal.jobs.map((job) => <li className="rounded-md border border-violet-100 p-2 text-xs" key={job.id}>
        <div className="flex items-start justify-between gap-2"><strong>{job.subject}</strong><span className="tracking-badge">{statuses[job.status]}</span></div>
        {job.recipient && <p className="subtle break-words">To {job.recipient}</p>}
        <p className="subtle">{new Date(job.dueAt).toISOString().slice(0, 16).replace("T", " ")} UTC{job.attempts > 0 && ` · ${job.attempts} attempt(s)`}</p>
        {job.lastError && <p className="mt-1 text-red-800">{job.lastError}</p>}
        {job.preview && <details className="mt-1"><summary>View email</summary><p className="whitespace-pre-wrap break-words">{job.preview}</p></details>}
      </li>)}
    </ul>}
  </section>;
}

function DealHistory({ deal }: { deal: DealData }) {
  return <section className="panel tracking-panel">
    <div className="context-heading"><h2><ClipboardList size={17} /> History</h2></div>
    <details className="deal-record"><summary>Negotiation ({deal.negotiationHistory.length})<ChevronDown size={15} className="chevron" /></summary>
      <ul className="space-y-2 text-xs">{deal.negotiationHistory.map((entry) => <li key={entry.id}>
        <strong>{entry.createdAt.slice(0, 10)}</strong>
        <p>Ask {entry.askingRate === null ? "—" : usd.format(entry.askingRate)} · Offer {entry.offerRate === null ? "—" : usd.format(entry.offerRate)}</p>
        {entry.note && <p className="whitespace-pre-wrap break-words">{entry.note}</p>}
      </li>)}</ul>
    </details>
    <details className="deal-record"><summary>Deliverables ({deal.deliverables.length})<ChevronDown size={15} className="chevron" /></summary>
      <ul className="space-y-2 text-xs">{deal.deliverables.map((entry) => <li key={entry.id}>
        <strong>{entry.kind} · {entry.status.replaceAll("_", " ")}</strong><p>{entry.createdAt.slice(0, 10)}</p>
        {entry.url && <SafeLink href={entry.url}>View deliverable</SafeLink>}
        {entry.notes && <p className="whitespace-pre-wrap break-words">{entry.notes}</p>}
      </li>)}</ul>
    </details>
  </section>;
}

export default function Dashboard({ initial }: { initial: DealData }) {
  const [deal, setDeal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState("pipeline");
  const [dialogVersion, setDialogVersion] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const nextFocus = useRef(false);
  const current = STAGES.findIndex((stage) => stage.id === deal.status);
  const stage = STAGES[current];
  const StageIcon = icons[current];
  const initials = deal.creator.name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
  const tracking = deal.metrics.length;

  useEffect(() => {
    if (nextFocus.current) { editorHeading.current?.focus({ preventScroll: true }); nextFocus.current = false; }
  }, [current]);

  useEffect(() => {
    if (dialogVersion) dialog.current?.showModal();
  }, [dialogVersion]);

  const submit: Submit = async (action, fields) => {
    if (busy) return false;
    const fail = action === "creator" ? setModalError : setError;
    setBusy(true); fail(""); setNotice("");
    try {
      const response = await fetch(`/api/deal?id=${encodeURIComponent(deal.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, fields, revision: deal.revision }) });
      const result = await response.json();
      if (!response.ok) { fail(result.error ?? "Unable to save the update."); return false; }
      const moved = result.status !== deal.status;
      if (moved) nextFocus.current = true;
      setDeal(result);
      if (action === "save") setFormVersion((value) => value + 1);
      setNotice(moved ? `Moved to ${STAGES.find((item) => item.id === result.status)?.label}.` : action === "metric" ? `Day ${fields.dayNumber} saved.` : action === "creator" ? "Creator updated." : "Changes saved.");
      return true;
    } catch { fail("Could not reach the server. Try again."); return false; }
    finally { setBusy(false); }
  };

  function showCreator() {
    setModalError("");
    setDialogVersion((value) => value + 1);
  }

  return <div className="app-shell">
    <a className="skip" href="#workspace">Skip to deal workspace</a>
    <aside className="sidebar">
      <a href="#pipeline" className="brand" onClick={() => setActive("pipeline")}><Mark /><div><strong>Relay<span>.</span></strong><small>CREATOR OPERATIONS</small></div></a>
      <div className="sidebar-main"><a className="nav-item" href="/">← All collaborations</a>
        <p className="nav-label">Workspace</p>
        <nav aria-label="Workspace">
          <a href="#pipeline" className={active === "pipeline" ? "nav-item active" : "nav-item"} aria-current={active === "pipeline" ? "location" : undefined} onClick={() => setActive("pipeline")}><Layers3 size={18} /> Deal pipeline</a>
          <a href="#creator" className={active === "creator" ? "nav-item active" : "nav-item"} aria-current={active === "creator" ? "location" : undefined} onClick={() => setActive("creator")}><UserRound size={18} /> Creator details</a>
          <a href={deal.status === "COMPLETED" ? "#workspace" : "#tracking"} className={active === "tracking" ? "nav-item active" : "nav-item"} aria-current={active === "tracking" ? "location" : undefined} onClick={() => setActive("tracking")}><Activity size={18} /> 7-day tracking</a>
        </nav>
      </div>
      <div className="sidebar-foot"><span className="workspace-icon"><Layers3 size={16} /></span><div><strong>Creator workspace</strong><small>1 collaboration</small></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>Deal pipeline</strong></div><span className="top-label"><span /> Single deal</span></header>
      <div className="main-content">
        <section id="pipeline" aria-labelledby="pipeline-title">
          <div className="page-kicker"><span /> {deal.isDemo ? "DEMO COLLABORATION" : "COLLABORATION WORKSPACE"}</div>
          <div className="hero"><div><h1 id="pipeline-title">{deal.title}</h1><p>Manage one collaboration from positive reply to post performance.</p></div>
            <div className="progress-chip"><span className="progress-icon"><Activity size={17} /></span><div><strong>Stage {current + 1} of 6</strong><small>{stage.label}</small></div></div>
          </div>
          <div className="pipeline-title"><h2>Deal stages</h2><span><i className="legend-dot" /> Current stage</span></div>
          <ol className="stage-grid" aria-label="Deal stages">
            {STAGES.map((item, i) => {
              const Icon = icons[i];
              return <li key={item.id} aria-current={i === current ? "step" : undefined} className={`stage-tile ${i === current ? "stage-current" : i < current ? "stage-done" : ""}`}>
                <div className="tile-top"><span className="tile-icon"><Icon size={17} /></span><span className="stage-number">{i < current ? <Check size={15} aria-label="Done" /> : String(i + 1).padStart(2, "0")}</span></div>
                <strong>{item.label}</strong><small>{item.hint}</small>
              </li>;
            })}
          </ol>
        </section>

        <section className="panel tracking-panel mt-5"><h2 className="font-bold">Deal stage history</h2>
          <div className="flex flex-wrap gap-3 mt-3">{deal.stageHistory.length ? deal.stageHistory.map((event, i) =>
            <div key={i} className="rounded-lg bg-violet-50 p-3 text-xs"><strong>{STAGES.find(s => s.id === event.to)?.label ?? event.to}</strong><p>{event.at.slice(0,16).replace("T"," ")} UTC</p></div>)
            : <p className="subtle">Earlier transition timestamps were not recorded. Future changes will appear here.</p>}</div>
        </section>
        <div className="workspace-grid">
          <section id="workspace" className="panel editor" aria-labelledby="editor-title">
            <div className="editor-banner">
              <div className="banner-label"><span><StageIcon size={15} /></span> STAGE {String(current + 1).padStart(2, "0")} <i /> {stage.label.toUpperCase()}</div>
              <div className="banner-graphic" aria-hidden="true"><ArrowDownRight size={124} strokeWidth={0.7} /></div>
              <h2 id="editor-title" tabIndex={-1} ref={editorHeading}>{stage.title}</h2><p>{stage.description}</p>
            </div>
            <div className="editor-body" aria-busy={busy}>
              {deal.status === "COMPLETED" ? <MetricsForm deal={deal} submit={submit} busy={busy} /> :
                <StageForm key={`${deal.status}-${formVersion}`} deal={deal} submit={submit} busy={busy} />}
              {error && <p className="error" role="alert">{error}</p>}
              <div className="save-status" role="status">{busy ? "Saving…" : notice && <><Check size={15} />{notice}</>}</div>
            </div>
          </section>

          <div className="context-stack">
            <section id="creator" className="panel creator-panel" aria-labelledby="creator-title">
              <div className="context-heading"><h2 id="creator-title"><UserRound size={17} /> Creator</h2><button className="icon-button" type="button" title="Edit creator" aria-label="Edit creator" onClick={showCreator} disabled={busy}><Pencil size={15} /></button></div>
              <div className="profile"><div className="avatar" aria-hidden="true">{initials}</div><div><h3>{deal.creator.name}</h3><p>{deal.creator.handle}</p></div></div>
              <div className="creator-meta"><span className="platform"><PlatformIcon platform={deal.creator.platform} />{deal.creator.platform}</span><a className="email" href={`mailto:${deal.creator.email}`}><Mail size={15} /><span>{deal.creator.email}</span><ArrowUpRight size={13} /></a></div>
              <DealRecord deal={deal} />
            </section>

            <AutomationPanel deal={deal} />
            <DealHistory deal={deal} />
            <section id="tracking" className="panel tracking-panel" aria-labelledby="tracking-title">
              <div className="context-heading"><h2 id="tracking-title"><Activity size={17} /> 7-day tracking</h2><span className={`tracking-badge ${deal.status === "COMPLETED" ? "tracking-live" : ""}`}>{deal.status !== "COMPLETED" ? "Not started" : tracking === 7 ? "All days logged" : "Post live"}</span></div>
              <div className="progress-days" aria-label={`${tracking} of 7 days logged`}>
                {Array.from({ length: 7 }, (_, i) => i + 1).map((day) => <div key={day} className={deal.metrics.some((metric) => metric.dayNumber === day) ? "logged" : ""} aria-hidden="true"><span /><small>{day}</small></div>)}
              </div>
              <p>{deal.status === "COMPLETED" ? `${tracking} of 7 daily snapshots recorded.` : "Daily snapshots unlock after you confirm the live post."}</p>
            </section>
          </div>
        </div>
        <footer className="main-footer"><a href="#pipeline" onClick={() => setActive("pipeline")}><ArrowLeft size={13} /> Back to pipeline</a><span><CalendarDays size={14} /> Reply to results</span></footer>
      </div>
    </main>
    <CreatorDialog key={dialogVersion} deal={deal} dialog={dialog} busy={busy} submit={submit} error={modalError} />
  </div>;
}
