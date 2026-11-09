"use client";
import { useState } from "react";
import { STAGES } from "../lib/pipeline";

type Item = { id: string; title: string; name: string; handle: string; platform: string; status: string; isDemo: boolean; date: string | null; rate: number | null };
export default function Workspace({ deals }: { deals: Item[] }) {
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const monthly = deals.filter(d => d.date?.startsWith(month));
  const filtered = deals.filter(d => (!stage || d.status === stage) && (d.name + d.handle + d.title).toLowerCase().includes(search.toLowerCase()));
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const label = (status: string) => STAGES.find(s => s.id === status)?.label ?? status;
  return <div className="app-shell">
    <aside className="sidebar"><a href="/" className="brand"><div className="mark">↗</div><div><strong>Relay.</strong><small>CREATOR OPERATIONS</small></div></a>
      <nav className="sidebar-main space-y-2">{[["overview","Workspace"],["deals","Collaborations"],["calendar","Marketing calendar"]].map(([id,name]) =>
        <button key={id} className={`nav-item w-full ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{name}</button>)}</nav>
      <div className="sidebar-foot">From creator reply to campaign results</div>
    </aside>
    <main className="main"><header className="topbar"><span>Brand workspace / {tab === "calendar" ? "Calendar" : "Collaborations"}</span><span className="top-label">Demo-ready workspace</span></header>
      <div className="main-content">
        <div className="page-kicker">YOUR CREATOR PROGRAM</div>
        <div className="hero"><div><h1>{tab === "calendar" ? "Your month, in motion." : "Good partnerships. In view."}</h1><p>Plan launches, follow every collaboration, and keep your team aligned.</p></div>
          <button className="button primary" onClick={() => setAdding(true)}>＋ New collaboration</button></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            ["Active collaborations",deals.filter(d => d.status !== "COMPLETED").length],
            ["Planned this month",monthly.length],
            ["Posts confirmed live",monthly.filter(d => d.status === "COMPLETED").length],
            ["Monthly agreed fees", "$" + monthly.reduce((sum,d) => sum + (d.rate ?? 0),0).toLocaleString("en-US")],
          ].map(([name,value]) => <div className="panel p-5" key={name}><p className="subtle text-xs">{name}</p><strong className="text-3xl block mt-2">{value}</strong></div>)}
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <label className="field">Planning month<input type="month" value={month} onChange={e => { if(e.target.value) setMonth(e.target.value); }} /></label>
          <span className="subtle text-xs">Example collaborations carry a DEMO label.</span>
        </div>
        {tab === "calendar" ? <section className="panel p-4 overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[770px]">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <div className="p-3 font-bold text-xs" key={day}>{day}</div>)}
            {Array.from({length: offset},(_,i) => <div key={`blank-${i}`} className="bg-stone-50 border border-stone-100" />)}
            {Array.from({length:days},(_,i) => {
              const date = `${month}-${String(i+1).padStart(2,"0")}`;
              return <div key={date} className="min-h-32 border border-stone-100 p-2"><strong className="text-xs">{i+1}</strong>
                {monthly.filter(d => d.date === date).map(d => <a key={d.id} href={`/?deal=${d.id}`} className="block bg-violet-50 border-l-2 border-violet-400 rounded p-2 mt-2 text-xs">
                  <strong>{d.name}</strong><p>{d.title}</p><p className="subtle">{d.status === "COMPLETED" ? "Live confirmed" : "Planned"} · {d.platform}</p>
                </a>)}</div>;
            })}
          </div><p className="subtle mt-3 text-xs">{deals.filter(d => !d.date).length} collaborations still need a target date. Dates on this calendar are target publication dates.</p>
        </section> : <>
          {tab === "overview" && <section className="panel p-5 mb-6"><div className="flex justify-between"><h2 className="font-bold">This month’s launches</h2><button onClick={() => setTab("calendar")} className="inline-link">Open calendar →</button></div>
            <div className="grid md:grid-cols-3 gap-3 mt-4">{monthly.length ? monthly.slice(0,6).map(d => <a key={d.id} href={`/?deal=${d.id}`} className="p-4 rounded-lg bg-stone-50 border border-stone-100"><span className="text-xs text-violet-700">{d.date}</span><h3 className="font-bold mt-1">{d.name}</h3><p className="text-sm">{d.title}</p><span className="subtle text-xs">{label(d.status)}</span></a>) : <p className="subtle">No launches scheduled for this month.</p>}</div>
          </section>}
          <section className="panel p-5"><div className="flex flex-wrap items-end gap-3 justify-between"><h2 className="font-bold text-lg">All collaborations</h2><div className="flex gap-3 flex-wrap">
            <label className="field"><span>Search</span><input placeholder="Creator or campaign" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="field"><span>Stage</span><select value={stage} onChange={e => setStage(e.target.value)}><option value="">All stages</option>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          </div></div>
          <div className="table-scroll"><table className="metrics-table"><thead><tr><th>Creator / campaign</th><th>Platform</th><th>Deal stage</th><th>Target live</th><th>Agreed fee</th></tr></thead>
            <tbody>{filtered.map(d => <tr key={d.id}><th className="!py-4"><a href={`/?deal=${d.id}`} className="inline-link">{d.name} ↗</a>{d.isDemo && <span className="tracking-badge ml-2">DEMO</span>}<p className="font-normal subtle mt-1">{d.title}</p></th><td>{d.platform}</td><td><span className="platform justify-end">{label(d.status)}</span></td><td>{d.date ?? "Unscheduled"}</td><td>{d.rate === null ? "—" : "$" + d.rate.toLocaleString("en-US")}</td></tr>)}</tbody>
          </table>{!filtered.length && <p className="p-5 subtle">No matching collaborations.</p>}</div>
          </section>
        </>}
      </div>
    </main>
    {adding && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-labelledby="new-title" className="panel p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
      <h2 id="new-title" className="text-2xl font-bold">New collaboration</h2><p className="subtle mb-4">Add a creator and start shaping the scope.</p>
      <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        const fields = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const response = await fetch("/api/collaborations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)});
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          window.location.assign(`/?deal=${result.id}`);
        } catch(error) { setError(error instanceof Error ? error.message : "Could not save."); setBusy(false); }
      }}><fieldset disabled={busy} className="field-stack">
        {[["title","Campaign title"],["name","Creator name"],["handle","Handle"],["email","Email"]].map(([id,label]) => <label className="field" key={id}><span>{label}</span><input name={id} required maxLength={id === "email" ? 254 : 100} type={id === "email" ? "email" : "text"} /></label>)}
        <label className="field"><span>Platform</span><select name="platform"><option>Instagram</option><option>TikTok</option><option>YouTube</option></select></label>
        <label className="field"><span>Target live date (optional)</span><input name="targetLiveDate" type="date" /></label>
      </fieldset>{error && <p role="alert" className="error">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={() => setAdding(false)}>Cancel</button><button disabled={busy} className="button primary">{busy ? "Creating…" : "Create collaboration"}</button></div></form>
    </section></div>}
  </div>;
}
