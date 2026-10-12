"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, CalendarDays, Check, CheckCircle2, ChevronRight,
  CircleDot, ClipboardCheck, Clock3, Gauge, History, LayoutDashboard,
  ListChecks, Loader2, Menu, MessageSquareText, Milestone, Pencil, Plus, Save,
  Search, Settings2, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Users, X, Zap
} from "lucide-react";

type Kind = "owner" | "metric" | "metric_value" | "rock" | "todo" | "issue" | "headline" | "meeting" | "status_event";
type Rec = { id: string; kind: Kind; payload: any; sortKey: string; isSample: boolean; createdAt: number; updatedAt: number };
type View = "overview" | "scorecard" | "rocks" | "todos" | "issues" | "headlines" | "meetings" | "people";

const nav: { id: View; label: string; icon: any }[] = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard },
  { id: "scorecard", label: "Scorecard", icon: BarChart3 },
  { id: "rocks", label: "Rocks", icon: Milestone },
  { id: "todos", label: "To-Dos", icon: ListChecks },
  { id: "issues", label: "IDS Issues", icon: AlertTriangle },
  { id: "headlines", label: "Headlines", icon: MessageSquareText },
  { id: "meetings", label: "L10 Meetings", icon: Clock3 },
  { id: "people", label: "Team & Setup", icon: Users },
];

const agenda = [
  { name: "Segue", minutes: 5, note: "One personal and one professional win" },
  { name: "Scorecard", minutes: 5, note: "Call out misses—drop issues, do not solve yet" },
  { name: "Rock Review", minutes: 5, note: "On track or off track" },
  { name: "Headlines", minutes: 5, note: "Employee and project news" },
  { name: "To-Do Review", minutes: 5, note: "Done or not done" },
  { name: "IDS", minutes: 30, note: "Identify, discuss, solve the highest priorities" },
  { name: "Conclude", minutes: 5, note: "Recap, cascade messages, rate the meeting" },
];

const kindLabels: Record<string, string> = {
  owner: "team member", metric: "scorecard metric", rock: "Rock",
  todo: "to-do", issue: "IDS issue", headline: "headline"
};

function mondayISO(date = new Date()) {
  const d = new Date(date); const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function dateLabel(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
}
function timeLabel(seconds: number) {
  const m = Math.floor(seconds / 60); const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function uid(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
const idsRanks = ["1", "2", "3"];
function idsRank(record: Rec) { const value = String(record.payload.priority || ""); return idsRanks.includes(value) ? value : ""; }
function idsOrder(a: Rec, b: Rec) { const ar = idsRank(a), br = idsRank(b); return (ar ? Number(ar) : 99) - (br ? Number(br) : 99) || a.createdAt - b.createdAt; }
async function assignIdsRank(issue: Rec, rank: string, records: Rec[], upsert: (record: any) => Promise<void>) {
  if (rank && idsRanks.includes(rank)) {
    const occupying = records.find(record => record.kind === "issue" && record.id !== issue.id && record.payload.status !== "solved" && idsRank(record) === rank);
    if (occupying) await upsert({ ...occupying, payload: { ...occupying.payload, priority: "" } });
  }
  await upsert({ ...issue, payload: { ...issue.payload, priority: rank } });
}

function ParkLogo({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? "park-logo compact" : "park-logo"} src="/park-construction-logo.png" alt="Park Construction Company"/>;
}

export default function Home() {
  const [records, setRecords] = useState<Rec[]>([]);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editor, setEditor] = useState<{ kind: Kind; record?: Rec } | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    try {
      setLoading(true); setError("");
      const response = await fetch("/api/records", { cache: "no-store" });
      if (!response.ok) throw new Error("The shared dashboard could not be loaded.");
      setRecords(await response.json());
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function upsert(record: Partial<Rec> & { id: string; kind: Kind; payload: any }) {
    const next = { ...record, sortKey: record.sortKey || "", isSample: false, createdAt: record.createdAt || Date.now(), updatedAt: Date.now() } as Rec;
    setRecords(current => current.some(r => r.id === next.id) ? current.map(r => r.id === next.id ? next : r) : [...current, next]);
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("That change could not be saved.");
    } catch (e: any) { setError(e.message); await load(); } finally { setSaving(false); }
  }

  async function remove(record: Rec) {
    if (!confirm(`Delete this ${kindLabels[record.kind] || "record"}? This cannot be undone.`)) return;
    setRecords(current => current.filter(r => r.id !== record.id));
    const response = await fetch(`/api/records?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    if (!response.ok) { setError("The record could not be deleted."); await load(); }
  }

  async function trackStatus(record: Rec, status: string, payloadPatch: Record<string, any> = {}) {
    const now = new Date();
    const updated = { ...record, payload: { ...record.payload, ...payloadPatch, status } };
    await upsert(updated);
    await upsert({
      id: uid("event"), kind: "status_event",
      payload: {
        entityKind: record.kind === "metric_value" ? "scorecard" : record.kind,
        recordId: record.kind === "metric_value" ? record.payload.metricId : record.id,
        ownerId: payloadPatch.ownerId || record.payload.ownerId,
        date: now.toISOString().slice(0, 10),
        timestamp: now.toISOString(), status,
        progress: payloadPatch.progress ?? record.payload.progress,
      },
    });
  }

  async function saveEditorRecord(record: any) {
    if (record.kind === "issue" && record.payload.status !== "solved") {
      const rank = String(record.payload.priority || "");
      if (idsRanks.includes(rank)) {
        const occupying = records.find(item => item.kind === "issue" && item.id !== record.id && item.payload.status !== "solved" && idsRank(item) === rank);
        if (occupying) await upsert({ ...occupying, payload: { ...occupying.payload, priority: "" } });
      }
    }
    await upsert(record); setEditor(null);
  }

  const byKind = (kind: Kind) => records.filter(r => r.kind === kind);
  const owners = byKind("owner");
  const owner = (id?: string) => owners.find(o => o.id === id)?.payload;
  const ownerName = (id?: string) => owner(id)?.name || "Unassigned";
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return records.filter(r => r.kind !== "metric_value" && JSON.stringify(r.payload).toLowerCase().includes(q)).slice(0, 8);
  }, [records, query]);

  if (loading) return <div className="loading"><ParkLogo compact/><Loader2 className="spin"/><strong>Opening the Safety & People dashboard…</strong><span>Connecting to the shared record.</span></div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <ParkLogo/>
          <div><strong>Safety + People</strong><span>Level 10 command center</span></div>
          <button className="icon-btn mobile-close" onClick={() => setMenuOpen(false)}><X size={18}/></button>
        </div>
        <div className="workspace-label"><ShieldCheck size={15}/> EOS LEADERSHIP WORKSPACE</div>
        <nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMenuOpen(false); }}><Icon size={18}/><span>{item.label}</span>{item.id === "issues" && byKind("issue").filter(i => i.payload.status !== "solved").length > 0 && <b>{byKind("issue").filter(i => i.payload.status !== "solved").length}</b>}</button>; })}</nav>
        <div className="side-card"><div className="eyebrow">Next meeting</div><strong>{dateLabel(mondayISO(new Date(Date.now() + 7 * 86400000)))}</strong><span>60 minutes · Safety & People</span><button onClick={() => setView("meetings")}><Zap size={14}/> Open meeting mode</button></div>
        <div className="sidebar-foot"><span className="status-dot"/> Shared database connected</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)}><Menu size={20}/></button>
          <div className="search-wrap"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Rocks, issues, owners…"/>{query && <button onClick={() => setQuery("")}><X size={15}/></button>}
            {query && <div className="search-results">{searchResults.length ? searchResults.map(r => <button key={r.id} onClick={() => { setView(r.kind === "meeting" ? "meetings" : r.kind === "owner" ? "people" : `${r.kind}s` as View); setQuery(""); }}><span>{kindLabels[r.kind] || r.kind}</span><strong>{r.payload.title || r.payload.name}</strong><ChevronRight size={15}/></button>) : <p>No matching records</p>}</div>}
          </div>
          <div className="save-state">{saving ? <><Loader2 size={15} className="spin"/> Saving</> : <><Check size={15}/> All changes saved</>}</div>
          <button className="meeting-cta" onClick={() => setView("meetings")}><Clock3 size={16}/> Run L10</button>
        </header>

        <div className="content">
          {error && <div className="error-banner"><AlertTriangle size={17}/>{error}<button onClick={load}>Try again</button></div>}
          {records.some(r => r.isSample) && <div className="sample-banner"><Sparkles size={17}/><div><strong>Sample entries are included</strong><span>Entries marked “Sample” are realistic placeholders. Edit or delete them as you add the team’s actual information.</span></div></div>}
          {view === "overview" && <Overview records={records} ownerName={ownerName} setView={setView} open={(kind: Kind) => setEditor({ kind })}/>}
          {view === "scorecard" && <Scorecard records={records} ownerName={ownerName} upsert={upsert} trackStatus={trackStatus} open={(record?: Rec) => setEditor({ kind: "metric", record })}/>}
          {view === "rocks" && <Rocks records={records} ownerName={ownerName} upsert={upsert} trackStatus={trackStatus} open={(record?: Rec) => setEditor({ kind: "rock", record })} remove={remove}/>}
          {view === "todos" && <Todos records={records} ownerName={ownerName} trackStatus={trackStatus} open={(record?: Rec) => setEditor({ kind: "todo", record })} remove={remove}/>}
          {view === "issues" && <Issues records={records} ownerName={ownerName} open={(record?: Rec) => setEditor({ kind: "issue", record })} remove={remove}/>}
          {view === "headlines" && <Headlines records={records} ownerName={ownerName} open={(record?: Rec) => setEditor({ kind: "headline", record })} remove={remove}/>}
          {view === "meetings" && <Meetings records={records} ownerName={ownerName} upsert={upsert} trackStatus={trackStatus} openIssue={() => setEditor({ kind: "issue" })}/>}
          {view === "people" && <People records={records} open={(record?: Rec) => setEditor({ kind: "owner", record })} remove={remove}/>}
        </div>
      </main>
      {editor && <Editor kind={editor.kind} record={editor.record} owners={owners} close={() => setEditor(null)} save={saveEditorRecord}/>}
    </div>
  );
}

function PageHead({ eyebrow, title, subtitle, action, onAction }: { eyebrow: string; title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <button className="primary-btn" onClick={onAction}><Plus size={17}/>{action}</button>}</div>;
}
function Sample({ show }: { show?: boolean }) { return show ? <span className="sample-chip">Sample</span> : null; }
function OwnerPill({ name }: { name: string }) { return <span className="owner-pill"><i>{name.split(" ").map(x => x[0]).slice(0, 2).join("")}</i>{name}</span>; }
function Empty({ icon: Icon = ClipboardCheck, title, copy }: any) { return <div className="empty"><Icon size={28}/><strong>{title}</strong><span>{copy}</span></div>; }

function Overview({ records, ownerName, setView, open }: any) {
  const get = (k: Kind) => records.filter((r: Rec) => r.kind === k);
  const todos = get("todo"), rocks = get("rock"), issues = get("issue"), metrics = get("metric"), values = get("metric_value");
  const currentWeek = mondayISO();
  const misses = metrics.filter((m: Rec) => { const v = values.find((x: Rec) => x.payload.metricId === m.id && x.payload.week === currentWeek)?.payload.value; return v !== undefined && (m.payload.direction === "gte" ? v < m.payload.target : v > m.payload.target); }).length;
  const openTodos = todos.filter((x: Rec) => x.payload.status !== "done");
  const overdue = openTodos.filter((x: Rec) => x.payload.dueDate < new Date().toISOString().slice(0, 10));
  const offTrack = rocks.filter((x: Rec) => x.payload.status === "off-track");
  const solved = issues.filter((x: Rec) => x.payload.status === "solved").length;
  const openIssues = issues.filter((i: Rec) => i.payload.status !== "solved").sort(idsOrder);
  return <>
    <PageHead eyebrow="Safety & People · Weekly pulse" title="Good morning, team." subtitle="Everything the leadership team needs to run a focused, accountable Level 10 meeting."/>
    <section className="hero-grid">
      <div className="pulse-card dark"><div className="card-top"><span>TEAM PULSE</span><Gauge size={20}/></div><strong className="pulse-score">{Math.max(42, 92 - misses * 8 - offTrack.length * 10 - overdue.length * 3)}</strong><span className="pulse-label">operating health</span><div className="pulse-bar"><i style={{ width: `${Math.max(42, 92 - misses * 8 - offTrack.length * 10)}%` }}/></div><p>{offTrack.length ? `${offTrack.length} Rock${offTrack.length > 1 ? "s" : ""} need leadership attention.` : "Quarterly priorities are moving in the right direction."}</p></div>
      <button className="pulse-card metric" onClick={() => setView("scorecard")}><div className="card-top"><span>SCORECARD</span><BarChart3 size={19}/></div><strong>{misses}</strong><p>weekly measurables off target</p><div className="card-link">Review numbers <ChevronRight size={16}/></div></button>
      <button className="pulse-card metric" onClick={() => setView("rocks")}><div className="card-top"><span>ROCKS</span><Target size={19}/></div><strong>{offTrack.length}<small> / {rocks.length}</small></strong><p>quarterly priorities off track</p><div className="card-link">Review Rocks <ChevronRight size={16}/></div></button>
      <button className="pulse-card metric" onClick={() => setView("todos")}><div className="card-top"><span>TO-DOS</span><CheckCircle2 size={19}/></div><strong>{Math.round((todos.filter((x: Rec) => x.payload.status === "done").length / Math.max(1, todos.length)) * 100)}%</strong><p>completion rate this week</p><div className="card-link">Review commitments <ChevronRight size={16}/></div></button>
    </section>
    <PerformanceAnalytics records={records} ownerName={ownerName}/>
    <MeetingRatingTrends records={records}/>
    <section className="two-col">
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">ACCOUNTABILITY</span><h2>This week&apos;s commitments</h2></div><button onClick={() => open("todo")}><Plus size={16}/> Add</button></div>
        <div className="stack-list">{openTodos.slice(0, 5).map((t: Rec) => <div className="list-row" key={t.id}><span className={`check-ring ${t.payload.dueDate < new Date().toISOString().slice(0,10) ? "danger" : ""}`}/><div><strong>{t.payload.title}</strong><span><OwnerPill name={ownerName(t.payload.ownerId)}/> · Due {dateLabel(t.payload.dueDate)} <Sample show={t.isSample}/></span></div></div>)}{!openTodos.length && <Empty title="All clear" copy="No open to-dos for this week."/>}</div>
        <button className="panel-foot" onClick={() => setView("todos")}>View all commitments <ChevronRight size={16}/></button>
      </div>
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">IDS QUEUE</span><h2>Issues to solve</h2></div><button onClick={() => open("issue")}><Plus size={16}/> Add</button></div>
        <div className="stack-list">{openIssues.slice(0,5).map((i: Rec) => <div className="issue-row" key={i.id}><b className={idsRank(i)?"ranked":""}>{idsRank(i)||"—"}</b><div><strong>{i.payload.title}</strong><span><span className={idsRank(i)?"queue-chip active":"queue-chip"}>{idsRank(i)?`Discuss #${idsRank(i)}`:"IDS backlog"}</span> {ownerName(i.payload.ownerId)} <Sample show={i.isSample}/></span></div><ChevronRight size={17}/></div>)}{openIssues.length === 0 && <Empty title="Issue list is clear" copy="Capture an obstacle when it surfaces."/>}</div>
        <button className="panel-foot" onClick={() => setView("issues")}>{solved} solved historically · Open IDS <ChevronRight size={16}/></button>
      </div>
    </section>
  </>;
}

const periodOptions = [
  ["current-week", "Current week"], ["current-month", "Current month"], ["last-month", "Last month"],
  ["current-quarter", "Current quarter"], ["last-quarter", "Last quarter"], ["ytd", "Year to date"], ["eoy", "End of year"],
] as const;

function periodRange(key: string) {
  const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
  let start = new Date(year, month, 1), end = new Date(year, month + 1, 0), mode = "week";
  if (key === "current-week") { start = new Date(`${mondayISO(today)}T12:00:00`); end = new Date(start); end.setDate(end.getDate() + 6); mode = "day"; }
  if (key === "last-month") { start = new Date(year, month - 1, 1); end = new Date(year, month, 0); }
  if (key === "current-quarter" || key === "last-quarter") { const shift = key === "last-quarter" ? -3 : 0; const q = Math.floor(month / 3) * 3 + shift; start = new Date(year, q, 1); end = new Date(year, q + 3, 0); mode = "month"; }
  if (key === "ytd") { start = new Date(year, 0, 1); end = today; mode = "month"; }
  if (key === "eoy") { start = new Date(year, 0, 1); end = new Date(year, 11, 31); mode = "month"; }
  end.setHours(23, 59, 59, 999); return { start, end, mode };
}

function latestByRecord(events: Rec[]) {
  const map = new Map<string, Rec>();
  events.forEach(event => { const current = map.get(event.payload.recordId); if (!current || String(event.payload.timestamp || event.payload.date) >= String(current.payload.timestamp || current.payload.date)) map.set(event.payload.recordId, event); });
  return [...map.values()];
}

function performanceFor(events: Rec[]) {
  const todos = latestByRecord(events.filter(e => e.payload.entityKind === "todo"));
  const rocks = latestByRecord(events.filter(e => e.payload.entityKind === "rock"));
  const tracked = latestByRecord(events.filter(e => ["rock", "scorecard"].includes(e.payload.entityKind)));
  const pct = (part: number, total: number) => total ? Math.round(part / total * 100) : 0;
  return {
    todos: pct(todos.filter(e => e.payload.status === "done").length, todos.length),
    rockProgress: rocks.length ? Math.round(rocks.reduce((sum, e) => sum + Number(e.payload.progress ?? (e.payload.status === "complete" ? 100 : 0)), 0) / rocks.length) : 0,
    onTrack: pct(tracked.filter(e => ["on-track", "complete"].includes(e.payload.status)).length, tracked.length),
    offTrack: pct(tracked.filter(e => e.payload.status === "off-track").length, tracked.length),
  };
}

function PerformanceAnalytics({ records, ownerName }: any) {
  const [period, setPeriod] = useState("current-quarter"); const [ownerId, setOwnerId] = useState("all");
  const owners = records.filter((r: Rec) => r.kind === "owner"); const { start, end, mode } = periodRange(period);
  const allEvents = records.filter((r: Rec) => r.kind === "status_event");
  const scopedEvents = allEvents.filter((e: Rec) => { const d = new Date(`${e.payload.date}T12:00:00`); return d >= start && d <= end && (ownerId === "all" || e.payload.ownerId === ownerId); });
  const events = scopedEvents.some((e: Rec) => !e.isSample) ? scopedEvents.filter((e: Rec) => !e.isSample) : scopedEvents;
  const summary = performanceFor(events);
  const bucketMap = new Map<string, Rec[]>();
  for (const event of events) {
    const d = new Date(`${event.payload.date}T12:00:00`);
    const key = mode === "day" ? event.payload.date : mode === "month" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : mondayISO(d);
    bucketMap.set(key, [...(bucketMap.get(key) || []), event]);
  }
  const buckets = [...bucketMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({ key, label: mode === "day" ? new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${key}T12:00:00`)) : mode === "month" ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${key}-01T12:00:00`)) : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00`)), ...performanceFor(rows) }));
  const series = [
    { key: "todos", label: "To-Dos complete", color: "orange" }, { key: "rockProgress", label: "Rock completion", color: "blue" },
    { key: "onTrack", label: "On track", color: "green" }, { key: "offTrack", label: "Off track", color: "red" },
  ] as const;
  return <section className="analytics-panel">
    <div className="analytics-head"><div><span className="eyebrow">PERFORMANCE COMMAND CENTER</span><h2>Accountability trends</h2><p>One view of execution by team or owner—calculated from saved weekly status updates.</p></div><div className="analytics-filters"><label>Period<select value={period} onChange={e => setPeriod(e.target.value)}>{periodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>View<select value={ownerId} onChange={e => setOwnerId(e.target.value)}><option value="all">Whole team</option>{owners.map((o: Rec) => <option key={o.id} value={o.id}>{o.payload.name}</option>)}</select></label></div></div>
    <div className="analytics-cards">{series.map(item => <div className={`analytics-card ${item.color}`} key={item.key}><span>{item.label}</span><strong>{summary[item.key]}%</strong><small>{ownerId === "all" ? "Group" : ownerName(ownerId)} · {periodOptions.find(p => p[0] === period)?.[1]}</small></div>)}</div>
    {buckets.length ? <><div className="chart-legend">{series.map(item => <span key={item.key}><i className={item.color}/>{item.label}</span>)}</div><div className="bar-chart" aria-label="Performance percentages over time"><div className="chart-grid"><span>100%</span><span>50%</span><span>0%</span></div>{buckets.map(bucket => <div className="chart-bucket" key={bucket.key}><div className="bars">{series.map(item => <i key={item.key} className={item.color} title={`${item.label}: ${bucket[item.key]}%`} style={{ height: `${Math.max(2, bucket[item.key])}%` }}/>)}</div><span>{bucket.label}</span></div>)}</div></> : <div className="analytics-empty"><TrendingUp size={24}/><strong>No saved status history in this view yet</strong><span>Run the review in Meeting Mode or update a status to begin the trend.</span></div>}
    {events.some((e: Rec) => e.isSample) && <div className="sample-data-note"><Sample show/> Trend includes clearly labeled sample history until your team replaces it with actual updates.</div>}
  </section>;
}

function MeetingRatingTrends({ records }: any) {
  const meetings = records
    .filter((record: Rec) => record.kind === "meeting" && record.payload.status === "complete")
    .sort((a: Rec, b: Rec) => String(a.payload.date || a.createdAt).localeCompare(String(b.payload.date || b.createdAt)))
    .slice(-12)
    .map((meeting: Rec) => {
      const ratings = Array.isArray(meeting.payload.ratings) ? meeting.payload.ratings.filter((rating: any) => Number(rating.rating) >= 1 && Number(rating.rating) <= 10) : [];
      const average = ratings.length ? ratings.reduce((sum: number, rating: any) => sum + Number(rating.rating), 0) / ratings.length : Number(meeting.payload.rating);
      return { ...meeting, ratings, average: Number.isFinite(average) ? average : null };
    })
    .filter((meeting: any) => meeting.average !== null);
  const people = new Map<string, string>();
  meetings.forEach((meeting: any) => meeting.ratings.forEach((rating: any) => people.set(rating.ownerId || rating.name, rating.name || "Team member")));
  const members = [...people.entries()].map(([id, name]) => ({ id, name }));
  const colors = ["#2f6db2", "#1f7a55", "#9a4f9f", "#c45146", "#9a6a10", "#397d8d", "#7654b4", "#b65d24"];
  const width = 920, height = 300, left = 54, right = 24, top = 20, bottom = 52;
  const x = (index: number) => meetings.length === 1 ? (left + width - right) / 2 : left + index * ((width - left - right) / (meetings.length - 1));
  const y = (score: number) => top + (10 - score) * ((height - top - bottom) / 9);
  const points = (values: { index: number; value: number }[]) => values.map(point => `${x(point.index)},${y(point.value)}`).join(" ");
  const latest = meetings[meetings.length - 1];
  return <section className="rating-trend-panel">
    <div className="rating-trend-head"><div><span className="eyebrow">MEETING HEALTH</span><h2>Meeting rating trends</h2><p>Ratings are captured by name during the final roll call and retained with each completed meeting.</p></div>{latest && <div className="rating-trend-summary"><span>Latest team average</span><strong>{latest.average.toFixed(1)}<small>/10</small></strong><small>{latest.ratings.length ? `${latest.ratings.length} team member${latest.ratings.length === 1 ? "" : "s"} rated` : "Legacy meeting score"}</small></div>}</div>
    {meetings.length ? <><div className="rating-legend"><span><i style={{ background: "#ed6b2e" }}/>Team average</span>{members.map((member, index) => <span key={member.id}><i style={{ background: colors[index % colors.length] }}/>{member.name}</span>)}</div><div className="rating-chart-scroll"><svg className="rating-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Meeting ratings by team member over time">
      {[10,8,6,4,2,1].map(score => <g key={score}><line x1={left} x2={width-right} y1={y(score)} y2={y(score)} className="rating-grid-line"/><text x={left-12} y={y(score)+4} textAnchor="end" className="rating-axis-label">{score}</text></g>)}
      {meetings.map((meeting: any, index: number) => <text key={meeting.id} x={x(index)} y={height-20} textAnchor="middle" className="rating-axis-label">{new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${meeting.payload.date}T12:00:00Z`))}</text>)}
      <polyline points={points(meetings.map((meeting: any, index: number) => ({ index, value: meeting.average })))} className="rating-average-line"/>
      {meetings.map((meeting: any, index: number) => <circle key={`average-${meeting.id}`} cx={x(index)} cy={y(meeting.average)} r="5" className="rating-average-point"><title>{`Team average: ${meeting.average.toFixed(1)} on ${dateLabel(meeting.payload.date)}`}</title></circle>)}
      {members.map((member, memberIndex) => { const values = meetings.map((meeting: any, index: number) => { const rating = meeting.ratings.find((item: any) => (item.ownerId || item.name) === member.id); return rating ? { index, value: Number(rating.rating) } : null; }).filter(Boolean) as { index: number; value: number }[]; return <g key={member.id}><polyline points={points(values)} className="rating-member-line" style={{ stroke: colors[memberIndex % colors.length] }}/>{values.map(point => <circle key={`${member.id}-${point.index}`} cx={x(point.index)} cy={y(point.value)} r="4" className="rating-member-point" style={{ fill: colors[memberIndex % colors.length] }}><title>{`${member.name}: ${point.value}/10 on ${dateLabel(meetings[point.index].payload.date)}`}</title></circle>)}</g>; })}
    </svg></div></> : <div className="analytics-empty"><Users size={25}/><strong>No meeting ratings yet</strong><span>Complete the team rating roll call at the end of a meeting to start this trend.</span></div>}
  </section>;
}

function Scorecard({ records, ownerName, upsert, trackStatus, open }: any) {
  const metrics = records.filter((r: Rec) => r.kind === "metric"); const values = records.filter((r: Rec) => r.kind === "metric_value");
  const [week, setWeek] = useState(mondayISO());
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i * 7); return mondayISO(d); });
  const valueFor = (metricId: string, w: string) => values.find((v: Rec) => v.payload.metricId === metricId && v.payload.week === w);
  const saveValue = async (metric: Rec, raw: string) => {
    const existing = valueFor(metric.id, week);
    if (raw.trim() === "") {
      if (existing) await upsert({ ...existing, payload: { ...existing.payload, value: null, status: "unreviewed" } });
      return;
    }
    const value = Number(raw);
    const status = metric.payload.direction === "gte" ? value >= metric.payload.target ? "on-track" : "off-track" : value <= metric.payload.target ? "on-track" : "off-track";
    const valueRecord = existing || { id: uid("value"), kind: "metric_value", payload: { metricId: metric.id, week, ownerId: metric.payload.ownerId }, sortKey: "", isSample: false, createdAt: Date.now(), updatedAt: Date.now() };
    await trackStatus(valueRecord, status, { value, note: existing?.payload.note || "", metricId: metric.id, week, ownerId: metric.payload.ownerId });
  };
  return <>
    <PageHead eyebrow="WEEKLY LEADING INDICATORS" title="Scorecard" subtitle="Keep 5–15 measurables that tell the team whether it is winning before the financials arrive." action="Add measurable" onAction={() => open()}/>
    <div className="toolbar"><label>Week of <select value={week} onChange={e => setWeek(e.target.value)}>{weeks.map(w => <option key={w} value={w}>{dateLabel(w)}</option>)}</select></label><span><CircleDot size={14}/> Values save when you leave the field</span></div>
    <div className="table-card"><div className="score-head"><span>MEASURABLE</span><span>OWNER</span><span>GOAL</span><span>8-WEEK TREND</span><span>THIS WEEK</span><span/></div>
      {metrics.map((m: Rec) => { const current = valueFor(m.id, week); const hit = current?.payload.status ? current.payload.status === "on-track" : current?.payload.value != null ? (m.payload.direction === "gte" ? current.payload.value >= m.payload.target : current.payload.value <= m.payload.target) : null; const series = [...weeks].reverse().map(w => valueFor(m.id,w)?.payload.value).filter((v:any)=>v!=null); const max = Math.max(m.payload.target, ...series, 1); return <div className="score-row" key={m.id}><div><strong>{m.payload.name}</strong><span>{m.payload.cadence} <Sample show={m.isSample}/></span></div><OwnerPill name={ownerName(m.payload.ownerId)}/><div className="goal">{m.payload.direction === "gte" ? "≥" : "≤"} {m.payload.target}{m.payload.unit === "%" ? "%" : ` ${m.payload.unit}`}</div><div className="sparkline">{[...weeks].reverse().map((w,i)=>{const v=valueFor(m.id,w)?.payload.value;return <i key={i} className={v==null ? "empty-bar" : ""} style={{height:`${v==null ? 8 : Math.max(12,(v/max)*38)}px`}}/>})}</div><div className={`value-cell ${hit === true ? "hit" : hit === false ? "miss" : ""}`}><input type="number" defaultValue={current?.payload.value ?? ""} key={`${m.id}-${week}-${current?.payload.value}`} onBlur={e => saveValue(m,e.target.value)} placeholder="—"/><span>{m.payload.unit === "%" ? "%" : ""}</span></div><button className="icon-btn" onClick={() => open(m)}><Pencil size={15}/></button></div>; })}
      {!metrics.length && <Empty icon={BarChart3} title="Build your scorecard" copy="Add the handful of weekly numbers that predict success."/>}
    </div>
    <div className="helper-note"><ShieldCheck size={18}/><div><strong>EOS meeting habit</strong><span>A miss becomes an issue only when it needs discussion. Keep the scorecard review to five minutes.</span></div></div>
  </>;
}

function Rocks({ records, ownerName, upsert, trackStatus, open, remove }: any) {
  const rocks = records.filter((r: Rec) => r.kind === "rock");
  return <><PageHead eyebrow="QUARTERLY PRIORITIES" title="Rocks" subtitle="One owner, one clear finish line, and milestone visibility for every 90-day priority." action="Add Rock" onAction={() => open()}/>
    <div className="rock-grid">{rocks.map((r: Rec) => {
      const status = ["on-track", "off-track", "complete"].includes(r.payload.status) ? r.payload.status : "on-track";
      const progress = Math.min(100, Math.max(0, Number(r.payload.progress) || 0));
      const milestones = Array.isArray(r.payload.milestones) ? r.payload.milestones : [];
      return <article className="rock-card" key={r.id}><div className="rock-accent"/><div className="card-top"><span className={`status ${status}`}>{status.replace("-"," ")}</span><div><button className="icon-btn" onClick={() => open({...r,payload:{...r.payload,status,progress,milestones}})}><Pencil size={15}/></button><button className="icon-btn danger-icon" onClick={() => remove(r)}><Trash2 size={15}/></button></div></div><Sample show={r.isSample}/><h2>{r.payload.title || "Untitled Rock"}</h2><div className="meta-line"><OwnerPill name={ownerName(r.payload.ownerId)}/><span><CalendarDays size={14}/>{dateLabel(r.payload.dueDate)}</span></div><div className="progress-line"><strong>{progress}%</strong><span>complete</span></div><div className="progress"><i style={{width:`${progress}%`}}/></div><div className="milestones"><span>{milestones.filter((m:any)=>m.done).length} of {milestones.length} milestones complete</span>{milestones.map((m:any, index:number) => <label key={m.id || `${r.id}-milestone-${index}`}><input type="checkbox" checked={Boolean(m.done)} onChange={() => upsert({...r,payload:{...r.payload,status,progress,milestones:milestones.map((x:any)=>x.id===m.id?{...x,done:!x.done}:x)}})}/><i><Check size={12}/></i><span>{m.title || "Untitled milestone"}<small>{dateLabel(m.dueDate)}</small></span></label>)}</div><select className="rock-status" value={status} onChange={e=>trackStatus(r,e.target.value,{progress:e.target.value==="complete"?100:progress})}><option value="on-track">On track</option><option value="off-track">Off track</option><option value="complete">Complete</option></select></article>;
    })}{!rocks.length && <Empty icon={Milestone} title="No Rocks yet" copy="Add the Safety & People team's quarterly priorities."/>}</div>
  </>;
}

function Todos({ records, ownerName, trackStatus, open, remove }: any) {
  const [filter,setFilter]=useState("open"); const todos = records.filter((r:Rec)=>r.kind==="todo").filter((r:Rec)=>filter==="all" || (filter==="done" ? r.payload.status==="done" : r.payload.status!=="done"));
  return <><PageHead eyebrow="7-DAY COMMITMENTS" title="To-Dos" subtitle="Every commitment has one owner and is due by the next meeting." action="Add to-do" onAction={()=>open()}/><div className="filter-tabs"><button className={filter==="open"?"active":""} onClick={()=>setFilter("open")}>Open</button><button className={filter==="done"?"active":""} onClick={()=>setFilter("done")}>Done</button><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All</button></div><div className="table-card todo-table">{todos.map((t:Rec)=><div className={`todo-row ${t.payload.status==="done"?"done":""}`} key={t.id}><button className="todo-check" onClick={()=>trackStatus(t,t.payload.status==="done"?"open":"done",{completedAt:t.payload.status==="done"?null:new Date().toISOString()})}>{t.payload.status==="done"&&<Check size={15}/>}</button><div><strong>{t.payload.title}</strong><span>{t.payload.source || "Added manually"} <Sample show={t.isSample}/></span></div><OwnerPill name={ownerName(t.payload.ownerId)}/><span className={`due ${t.payload.status!=="done"&&t.payload.dueDate<new Date().toISOString().slice(0,10)?"late":""}`}>{dateLabel(t.payload.dueDate)}</span><button className="icon-btn" onClick={()=>open(t)}><Pencil size={15}/></button><button className="icon-btn danger-icon" onClick={()=>remove(t)}><Trash2 size={15}/></button></div>)}{!todos.length&&<Empty icon={CheckCircle2} title="Nothing here" copy="Add a seven-day commitment or change the filter."/ >}</div></>;
}

function Issues({ records, ownerName, open, remove }: any) {
  const [showSolved,setShowSolved]=useState(false); const issues=records.filter((r:Rec)=>r.kind==="issue").filter((r:Rec)=>showSolved?r.payload.status==="solved":r.payload.status!=="solved").sort(idsOrder);
  return <><PageHead eyebrow="IDENTIFY · DISCUSS · SOLVE" title="IDS Issues" subtitle="Review the IDS backlog, add or edit issues, and reference solved history. Discussion order and solving are handled inside Meeting Mode." action="Add IDS item" onAction={()=>open()}/><div className="filter-tabs"><button className={!showSolved?"active":""} onClick={()=>setShowSolved(false)}>Open IDS backlog</button><button className={showSolved?"active":""} onClick={()=>setShowSolved(true)}>Solved history</button></div><div className="issue-board">{issues.map((i:Rec)=><article className={`issue-card ${idsRank(i)?"ranked":""}`} key={i.id}><div className={`issue-number ${idsRank(i)?"ranked":""}`}>{showSolved?<Check size={17}/>:idsRank(i)||"—"}</div><div className="issue-body"><div className="issue-labels"><span className={idsRank(i)?"queue-chip active":"queue-chip"}>{idsRank(i)?`Queued #${idsRank(i)} for meeting`:"IDS backlog"}</span>{i.payload.sourceKind&&<span className="source-chip">From {i.payload.sourceKind.replace("metric_value","scorecard")}</span>}<Sample show={i.isSample}/></div><h2>{i.payload.title}</h2><p>{i.payload.context||"No context added yet."}</p>{i.payload.resolution&&<div className="resolution"><CheckCircle2 size={16}/><div><strong>Resolution</strong><span>{i.payload.resolution}</span></div></div>}<div className="meta-line"><OwnerPill name={ownerName(i.payload.ownerId)}/><span>{i.isSample ? "Sample record" : `Captured ${dateLabel(new Date(i.createdAt).toISOString().slice(0,10))}`}</span></div></div><div className="issue-actions"><button className="icon-btn" aria-label={`Edit ${i.payload.title}`} onClick={()=>open(i)}><Pencil size={15}/></button><button className="icon-btn danger-icon" aria-label={`Delete ${i.payload.title}`} onClick={()=>remove(i)}><Trash2 size={15}/></button></div></article>)}{!issues.length&&<Empty icon={AlertTriangle} title={showSolved?"No solved issues yet":"The IDS backlog is clear"} copy="Add an issue here or use Drop Down during Scorecard, Rock, Headline, or To-Do review in Meeting Mode."/ >}</div></>;
}

function Headlines({ records, ownerName, open, remove }: any) {
  const headlines=records.filter((r:Rec)=>r.kind==="headline");
  return <><PageHead eyebrow="CUSTOMER / EMPLOYEE / PROJECT" title="Headlines" subtitle="Brief news the whole team should know—good or challenging, but not yet an issue to solve." action="Add headline" onAction={()=>open()}/><div className="headline-grid">{headlines.map((h:Rec)=><article className={`headline-card ${h.payload.tone}`} key={h.id}><div className="headline-icon">{h.payload.tone==="good"?<Sparkles size={20}/>:<AlertTriangle size={20}/>}</div><div><span className="eyebrow">{h.payload.tone==="good"?"GOOD NEWS":"WATCH ITEM"} · {dateLabel(h.payload.date)}</span><h2>{h.payload.title}</h2><p>{h.payload.detail}</p><div className="meta-line"><OwnerPill name={ownerName(h.payload.ownerId)}/><Sample show={h.isSample}/></div></div><div><button className="icon-btn" onClick={()=>open(h)}><Pencil size={15}/></button><button className="icon-btn danger-icon" onClick={()=>remove(h)}><Trash2 size={15}/></button></div></article>)}{!headlines.length&&<Empty icon={MessageSquareText} title="No headlines yet" copy="Capture news as it happens during the week."/ >}</div></>;
}

function Meetings({ records, ownerName, upsert, trackStatus, openIssue }: any) {
  const [running,setRunning]=useState(false),[section,setSection]=useState(0),[seconds,setSeconds]=useState(0),[ratings,setRatings]=useState<Record<string,number>>({}),[notes,setNotes]=useState<Record<number,string>>({}),[cascade,setCascade]=useState(""),[resolutions,setResolutions]=useState<Record<string,string>>({});
  const meetings=records.filter((r:Rec)=>r.kind==="meeting").sort((a:Rec,b:Rec)=>b.createdAt-a.createdAt);
  const owners=records.filter((r:Rec)=>r.kind==="owner"), metrics=records.filter((r:Rec)=>r.kind==="metric"), values=records.filter((r:Rec)=>r.kind==="metric_value"), rocks=records.filter((r:Rec)=>r.kind==="rock"), todos=records.filter((r:Rec)=>r.kind==="todo"), headlines=records.filter((r:Rec)=>r.kind==="headline"), issues=records.filter((r:Rec)=>r.kind==="issue"&&r.payload.status!=="solved").sort(idsOrder);
  const week=mondayISO(); const valueFor=(metricId:string)=>values.find((v:Rec)=>v.payload.metricId===metricId&&v.payload.week===week);
  const ratedCount=owners.filter((owner:Rec)=>Number(ratings[owner.id])>=1&&Number(ratings[owner.id])<=10).length, allRated=owners.length>0&&ratedCount===owners.length;
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[running]);
  async function conclude(){if(!allRated)return;const meetingRatings=owners.map((owner:Rec)=>({ownerId:owner.id,name:owner.payload.name,rating:ratings[owner.id]}));const rating=Math.round((meetingRatings.reduce((sum:number,item:any)=>sum+item.rating,0)/meetingRatings.length)*10)/10;await upsert({id:uid("meeting"),kind:"meeting",payload:{date:new Date().toISOString().slice(0,10),durationSeconds:seconds,rating,ratings:meetingRatings,agenda:agenda.map((a,i)=>({...a,notes:notes[i]||""})),cascade,status:"complete"}});setRunning(false);setSection(0);setSeconds(0);setRatings({});setNotes({});setCascade("");}
  function linkedIssue(sourceId:string){return records.find((r:Rec)=>r.kind==="issue"&&r.payload.sourceId===sourceId&&r.payload.status!=="solved");}
  async function dropToIds(source:Rec,title:string,context:string){const existing=linkedIssue(source.id);if(!existing)await upsert({id:uid("issue"),kind:"issue",payload:{title,context,ownerId:source.payload.ownerId,priority:"",status:"open",resolution:"",sourceId:source.id,sourceKind:source.kind,sourceLabel:title}});}
  async function markMetric(metric:Rec,status:string,value?:number|null){const existing=valueFor(metric.id);const valueRecord=existing||{id:uid("value"),kind:"metric_value",payload:{metricId:metric.id,week,ownerId:metric.payload.ownerId},sortKey:"",isSample:false,createdAt:Date.now(),updatedAt:Date.now()};await trackStatus(valueRecord,status,{metricId:metric.id,week,ownerId:metric.payload.ownerId,value:value??existing?.payload.value??null,note:existing?.payload.note||""});}
  async function saveMetric(metric:Rec,raw:string){const existing=valueFor(metric.id);if(raw.trim()===""){if(existing)await upsert({...existing,payload:{...existing.payload,value:null,status:"unreviewed"}});return;}const value=Number(raw);const status=metric.payload.direction==="gte"?(value>=metric.payload.target?"on-track":"off-track"):(value<=metric.payload.target?"on-track":"off-track");await markMetric(metric,status,value);}
  async function solveIssue(issue:Rec){const resolution=(resolutions[issue.id]||"").trim();if(!resolution)return;await upsert({...issue,payload:{...issue.payload,resolution,status:"solved",solvedAt:new Date().toISOString()}});setResolutions(current=>({...current,[issue.id]:""}));}
  const dropButton=(source:Rec,title:string,context:string)=><button className={`ids-drop ${linkedIssue(source.id)?"linked":""}`} onClick={()=>dropToIds(source,title,context)}>{linkedIssue(source.id)?"In IDS":"Drop Down"}<ChevronRight size={15}/></button>;

  const reviewContent = section===1 ? <div className="meeting-review-list">{metrics.map((metric:Rec)=>{const value=valueFor(metric.id);const status=value?.payload.status||(value?.payload.value!=null?(metric.payload.direction==="gte"?value.payload.value>=metric.payload.target:value.payload.value<=metric.payload.target)?"on-track":"off-track":"unreviewed");return <article className="meeting-review" key={metric.id}><div className="review-main"><span className="review-type">SCORECARD</span><strong>{metric.payload.name}</strong><small><OwnerPill name={ownerName(metric.payload.ownerId)}/> Goal {metric.payload.direction==="gte"?"≥":"≤"} {metric.payload.target}{metric.payload.unit==="%"?"%":` ${metric.payload.unit}`}</small></div><div className="meeting-value"><input aria-label={`${metric.payload.name} value`} type="number" defaultValue={value?.payload.value??""} key={`${metric.id}-${value?.payload.value}`} onBlur={e=>saveMetric(metric,e.target.value)} placeholder="Value"/><span>{metric.payload.unit==="%"?"%":""}</span></div><div className="review-status"><button className={status==="on-track"?"active good":""} onClick={()=>markMetric(metric,"on-track")}><CheckCircle2 size={16}/> On Track</button><button className={status==="off-track"?"active bad":""} onClick={()=>markMetric(metric,"off-track")}><AlertTriangle size={16}/> Off Track</button></div>{dropButton(metric,`${metric.payload.name} is off target`,`Dropped from the ${dateLabel(week)} scorecard review. Goal: ${metric.payload.direction==="gte"?"at least":"at most"} ${metric.payload.target}${metric.payload.unit==="%"?"%":` ${metric.payload.unit}`}; current value: ${value?.payload.value??"not entered"}.`)}</article>})}{!metrics.length&&<Empty icon={BarChart3} title="No scorecard measurables" copy="Add them from the Scorecard screen before the meeting."/>}</div>
  : section===2 ? <div className="meeting-review-list">{rocks.map((rock:Rec)=><article className="meeting-review" key={rock.id}><div className="review-main"><span className="review-type">{rock.payload.quarter||"QUARTERLY ROCK"}</span><strong>{rock.payload.title}</strong><small><OwnerPill name={ownerName(rock.payload.ownerId)}/> {rock.payload.progress}% complete · Due {dateLabel(rock.payload.dueDate)}</small></div><div className="review-status"><button className={rock.payload.status==="on-track"?"active good":""} onClick={()=>trackStatus(rock,"on-track")}><CheckCircle2 size={16}/> On Track</button><button className={rock.payload.status==="off-track"?"active bad":""} onClick={()=>trackStatus(rock,"off-track")}><AlertTriangle size={16}/> Off Track</button><button className={rock.payload.status==="complete"?"active done":""} onClick={()=>trackStatus(rock,"complete",{progress:100})}><Check size={16}/> Complete</button></div>{dropButton(rock,`Rock off track: ${rock.payload.title}`,`Dropped from Rock Review at ${rock.payload.progress}% completion. Due ${dateLabel(rock.payload.dueDate)}.`)}</article>)}{!rocks.length&&<Empty icon={Milestone} title="No Rocks to review" copy="Add quarterly priorities from the Rocks screen."/>}</div>
  : section===3 ? <div className="meeting-review-list">{headlines.map((headline:Rec)=><article className="meeting-review headline-review" key={headline.id}><div className={`headline-icon ${headline.payload.tone}`}><MessageSquareText size={18}/></div><div className="review-main"><span className="review-type">{headline.payload.tone==="good"?"GOOD NEWS":"WATCH ITEM"}</span><strong>{headline.payload.title}</strong><small><OwnerPill name={ownerName(headline.payload.ownerId)}/> {headline.payload.detail}</small></div>{dropButton(headline,headline.payload.title,headline.payload.detail||"Dropped from Headlines.")}</article>)}{!headlines.length&&<Empty icon={MessageSquareText} title="No headlines" copy="Capture headlines during the week so they are ready here."/>}</div>
  : section===4 ? <div className="meeting-review-list">{todos.map((todo:Rec)=><article className="meeting-review" key={todo.id}><div className="review-main"><span className="review-type">TO-DO</span><strong>{todo.payload.title}</strong><small><OwnerPill name={ownerName(todo.payload.ownerId)}/> Due {dateLabel(todo.payload.dueDate)}</small></div><div className="review-status"><button className={todo.payload.status==="done"?"active done":""} onClick={()=>trackStatus(todo,"done",{completedAt:new Date().toISOString()})}><Check size={16}/> Done</button><button className={todo.payload.status!=="done"?"active bad":""} onClick={()=>trackStatus(todo,"open",{completedAt:null})}><X size={16}/> Not Done</button></div>{dropButton(todo,`To-Do not done: ${todo.payload.title}`,`Dropped from To-Do Review. Due ${dateLabel(todo.payload.dueDate)}.`)}</article>)}{!todos.length&&<Empty icon={ListChecks} title="No To-Dos to review" copy="Add commitments as they are assigned."/>}</div>
  : section===5 ? <div className="ids-workspace"><div className="meeting-ids-header"><div><strong>{issues.filter((issue:Rec)=>idsRank(issue)).length} of 3 selected</strong><span>Assign 1, 2, and 3 to the next issues the group will discuss. Solving one frees its number for the next item.</span></div><button onClick={openIssue}><Plus size={16}/> Add IDS item</button></div>{issues.map((issue:Rec)=><article className={`ids-work-item ${idsRank(issue)?"ranked":""}`} key={issue.id}><div className={`issue-number ${idsRank(issue)?"ranked":""}`}>{idsRank(issue)||"—"}</div><div><div className="ids-work-head"><label className="ids-rank-control inline"><span>Discuss</span><select aria-label={`Discussion order for ${issue.payload.title}`} value={idsRank(issue)} onChange={e=>assignIdsRank(issue,e.target.value,records,upsert)}><option value="">Backlog</option><option value="1">1 — First</option><option value="2">2 — Second</option><option value="3">3 — Third</option></select></label>{issue.payload.sourceKind&&<span className="source-chip">From {issue.payload.sourceKind.replace("metric_value","scorecard")}</span>}</div><h3>{issue.payload.title}</h3><p>{issue.payload.context}</p><div className="ids-solve"><input value={resolutions[issue.id]||""} onChange={e=>setResolutions(current=>({...current,[issue.id]:e.target.value}))} placeholder="Record the decision or solution…"/><button disabled={!(resolutions[issue.id]||"").trim()} onClick={()=>solveIssue(issue)}><CheckCircle2 size={16}/> Mark solved</button></div></div></article>)}{!issues.length&&<Empty icon={CheckCircle2} title="IDS queue is clear" copy="Add an issue here or use Drop Down during the earlier review sections."/>}</div> : null;

  return <><PageHead eyebrow="PARK'S 60-MINUTE WORKFLOW" title="Level 10 Meeting" subtitle="Review the live Scorecard, Rocks, and To-Dos; drop exceptions into IDS once; solve and record the decision."/>
    {!running ? <div className="meeting-launch"><div className="launch-visual"><ParkLogo/><div className="timer-ring"><strong>60</strong><span>MIN</span></div><span>Safety & People</span></div><div><span className="eyebrow">READY WHEN THE TEAM IS</span><h2>Run one connected meeting</h2><p>The agenda is tailored to Park&apos;s one-hour cadence. Statuses update the same shared records, anything dropped follows you into IDS, and the session is saved to permanent history.</p><div className="agenda-preview">{agenda.map((a,i)=><div key={a.name}><b>{i+1}</b><span>{a.name}</span><strong>{a.minutes}m</strong></div>)}</div><button className="primary-btn large" onClick={()=>setRunning(true)}><Zap size={18}/> Start today&apos;s meeting</button></div></div> :
      <div className="meeting-runner"><div className="runner-top"><div><span className="live-dot"/> MEETING IN PROGRESS · 60 MIN TARGET</div><strong className={seconds>3600?"overtime":""}>{timeLabel(seconds)}</strong><button onClick={()=>setRunning(false)}>Pause</button></div><div className="runner-grid"><aside>{agenda.map((a,i)=><button key={a.name} className={section===i?"active":section>i?"done":""} onClick={()=>setSection(i)}><i>{section>i?<Check size={14}/>:i+1}</i><span>{a.name}<small>{a.minutes} minutes</small></span></button>)}</aside><section><div className="section-kicker">STEP {section+1} OF {agenda.length} · {agenda[section].minutes} MINUTES</div><h2>{agenda[section].name}</h2><p>{agenda[section].note}</p>{reviewContent}{(section===0||section===3)&&<textarea className="meeting-notes" value={notes[section]||""} onChange={e=>setNotes({...notes,[section]:e.target.value})} placeholder={`Capture ${agenda[section].name.toLowerCase()} notes…`}/>} {section>0&&section<6&&<textarea className="meeting-notes compact" value={notes[section]||""} onChange={e=>setNotes({...notes,[section]:e.target.value})} placeholder="Optional section notes…"/>}
        {section===6&&<div className="conclude-grid"><label className="form-field"><span>Meeting notes</span><textarea value={notes[section]||""} onChange={e=>setNotes({...notes,[section]:e.target.value})} placeholder="Final decisions, reminders, or follow-up…"/></label><label className="form-field"><span>Messages to cascade</span><textarea value={cascade} onChange={e=>setCascade(e.target.value)} placeholder="What should be shared outside this room?"/></label><div className="team-rating-panel"><div className="team-rating-head"><div><span className="eyebrow">LIVE RATING ROLL CALL</span><h3>Rate the meeting together</h3><p>Go around the room and record each person&apos;s spoken score. Everyone&apos;s rating remains visible to the team.</p></div><strong>{ratedCount} of {owners.length} complete</strong></div>{owners.map((owner:Rec)=><div className="team-rating-row" key={owner.id}><OwnerPill name={owner.payload.name}/><div className="rating-scale" role="group" aria-label={`${owner.payload.name}'s meeting rating`}>{[1,2,3,4,5,6,7,8,9,10].map(score=><button type="button" key={score} aria-pressed={ratings[owner.id]===score} className={ratings[owner.id]===score?"active":""} onClick={()=>setRatings(current=>({...current,[owner.id]:score}))}>{score}</button>)}</div><output>{ratings[owner.id]?`${ratings[owner.id]}/10`:"Waiting"}</output></div>)}{!owners.length&&<div className="rating-required"><AlertTriangle size={18}/><span>Add team members in Team &amp; Setup before concluding a meeting.</span></div>}<div className={`rating-required ${allRated?"complete":""}`}>{allRated?<CheckCircle2 size={18}/>:<Users size={18}/>}<span>{allRated?"All ratings are recorded. The meeting is ready to conclude.":`${owners.length-ratedCount} rating${owners.length-ratedCount===1?"":"s"} still needed before this meeting can be saved.`}</span></div></div></div>}
        <div className="runner-actions"><button disabled={section===0} onClick={()=>setSection(s=>s-1)}>Back</button>{section<6?<button className="primary-btn" onClick={()=>setSection(s=>s+1)}>Next: {agenda[section+1].name}<ChevronRight size={16}/></button>:<button className="primary-btn" disabled={!allRated} title={!allRated?"Record a rating for every team member first":"Save the completed meeting"} onClick={conclude}><Save size={16}/> Save &amp; conclude</button>}</div></section></div></div>}
    <div className="history-panel"><div className="panel-head"><div><span className="eyebrow">MEETING MEMORY</span><h2>Session history</h2></div></div>{meetings.map((m:Rec)=><div className="meeting-history" key={m.id}><div className="date-tile"><strong>{new Date(m.payload.date+"T12:00:00Z").getUTCDate()}</strong><span>{new Intl.DateTimeFormat("en-US",{month:"short",timeZone:"UTC"}).format(new Date(m.payload.date+"T12:00:00Z"))}</span></div><div><strong>Safety & People Level 10</strong><span>{Math.round(m.payload.durationSeconds/60)} minutes · {m.payload.agenda?.filter((a:any)=>a.notes).length||0} sections with notes</span>{Array.isArray(m.payload.ratings)&&<div className="history-ratings">{m.payload.ratings.map((item:any)=><span key={item.ownerId||item.name}><b>{item.name}</b> {item.rating}/10</span>)}</div>}</div><span className="meeting-rating">{Number(m.payload.rating).toFixed(Number(m.payload.rating)%1?1:0)}<small>/10 avg</small></span></div>)}{!meetings.length&&<Empty icon={History} title="No completed meetings yet" copy="The first concluded session will appear here."/ >}</div></>;
}

function People({ records, open, remove }: any) {
  const owners=records.filter((r:Rec)=>r.kind==="owner");
  return <><PageHead eyebrow="CONFIGURATION" title="Team & setup" subtitle="Maintain the owners available throughout the scorecard, Rocks, to-dos, and IDS." action="Add team member" onAction={()=>open()}/><div className="people-grid">{owners.map((o:Rec)=><article className="person-card" key={o.id}><div className={`avatar ${o.payload.color}`}>{o.payload.initials||o.payload.name.split(" ").map((x:string)=>x[0]).join("").slice(0,2)}</div><div><h2>{o.payload.name}</h2><span>{o.payload.role}</span><Sample show={o.isSample}/></div><button className="icon-btn" onClick={()=>open(o)}><Pencil size={15}/></button><button className="icon-btn danger-icon" onClick={()=>remove(o)}><Trash2 size={15}/></button></article>)}</div><div className="setup-note"><Settings2 size={22}/><div><h2>Built for a shared team record</h2><p>All authorized visitors see the same Safety & People data. Records live in the hosted database—not in this browser—so another approved device can pick up where the team left off.</p></div></div></>;
}

function Editor({ kind, record, owners, close, save }: any) {
  const base=record?.payload||{}; const [data,setData]=useState<any>({...base,milestonesText:(base.milestones||[]).map((m:any)=>`${m.title}|${m.dueDate}|${m.done?"done":"open"}`).join("\n")}); const set=(k:string,v:any)=>setData((d:any)=>({...d,[k]:v}));
  const title=record?`Edit ${kindLabels[kind]}`:`Add ${kindLabels[kind]}`;
  function submit(e:any){e.preventDefault();let payload={...data};if(kind==="rock"){payload.status=payload.status||"on-track";payload.quarter=payload.quarter||`Q${Math.floor(new Date().getMonth()/3)+1} ${new Date().getFullYear()}`;payload.progress=Math.min(100,Math.max(0,Number(payload.progress)||0));payload.milestones=(payload.milestonesText||"").split("\n").filter(Boolean).map((line:string,index:number)=>{const [title,dueDate,state]=line.split("|");const existing=base.milestones?.[index];return{id:existing?.id||uid("milestone"),title:title.trim(),dueDate:(dueDate||"").trim(),done:(state||"").trim().toLowerCase()==="done"};});delete payload.milestonesText;}if(kind==="metric")payload.target=Number(payload.target||0);save({id:record?.id||uid(kind),kind,payload,sortKey:record?.sortKey||""});}
  const OwnerSelect=()=> <label className="form-field"><span>Owner</span><select value={data.ownerId||""} onChange={e=>set("ownerId",e.target.value)} required><option value="">Select an owner</option>{owners.map((o:Rec)=><option key={o.id} value={o.id}>{o.payload.name}</option>)}</select></label>;
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">MANUAL ENTRY</span><h2>{title}</h2></div><button type="button" className="icon-btn" onClick={close}><X size={19}/></button></div><div className="modal-body">
    {kind==="owner"&&<><label className="form-field"><span>Name</span><input value={data.name||""} onChange={e=>set("name",e.target.value)} required autoFocus/></label><label className="form-field"><span>Role</span><input value={data.role||""} onChange={e=>set("role",e.target.value)} required/></label><div className="form-row"><label className="form-field"><span>Initials</span><input value={data.initials||""} maxLength={3} onChange={e=>set("initials",e.target.value.toUpperCase())}/></label><label className="form-field"><span>Color</span><select value={data.color||"orange"} onChange={e=>set("color",e.target.value)}><option>orange</option><option>blue</option><option>green</option></select></label></div></>}
    {kind==="metric"&&<><label className="form-field"><span>Measurable</span><input value={data.name||""} onChange={e=>set("name",e.target.value)} required autoFocus placeholder="e.g., Open corrective actions"/></label><OwnerSelect/><div className="form-row"><label className="form-field"><span>Target</span><input type="number" step="any" value={data.target??""} onChange={e=>set("target",e.target.value)} required/></label><label className="form-field"><span>Direction</span><select value={data.direction||"gte"} onChange={e=>set("direction",e.target.value)}><option value="gte">At least (≥)</option><option value="lte">At most (≤)</option></select></label></div><div className="form-row"><label className="form-field"><span>Unit</span><select value={data.unit||"count"} onChange={e=>set("unit",e.target.value)}><option value="count">count</option><option value="%">%</option><option value="days">days</option><option value="hours">hours</option></select></label><label className="form-field"><span>Cadence</span><select value={data.cadence||"Weekly"} onChange={e=>set("cadence",e.target.value)}><option>Weekly</option><option>Monthly</option></select></label></div></>}
    {kind==="rock"&&<><label className="form-field"><span>Rock title</span><input value={data.title||""} onChange={e=>set("title",e.target.value)} required autoFocus/></label><OwnerSelect/><div className="form-row"><label className="form-field"><span>Quarter</span><input value={data.quarter||"Q4 2026"} onChange={e=>set("quarter",e.target.value)}/></label><label className="form-field"><span>Due date</span><input type="date" value={data.dueDate||""} onChange={e=>set("dueDate",e.target.value)} required/></label></div><div className="form-row"><label className="form-field"><span>Status</span><select value={data.status||"on-track"} onChange={e=>set("status",e.target.value)}><option value="on-track">On track</option><option value="off-track">Off track</option><option value="complete">Complete</option></select></label><label className="form-field"><span>Progress %</span><input type="number" min="0" max="100" value={data.progress??0} onChange={e=>set("progress",e.target.value)}/></label></div><label className="form-field"><span>Milestones <small>one per line: title | YYYY-MM-DD | open/done</small></span><textarea rows={5} value={data.milestonesText||""} onChange={e=>set("milestonesText",e.target.value)} placeholder="Draft checklist | 2026-10-23 | open"/></label><label className="form-field"><span>Notes</span><textarea value={data.notes||""} onChange={e=>set("notes",e.target.value)}/></label></>}
    {kind==="todo"&&<><label className="form-field"><span>Commitment</span><input value={data.title||""} onChange={e=>set("title",e.target.value)} required autoFocus/></label><OwnerSelect/><label className="form-field"><span>Due date</span><input type="date" value={data.dueDate||mondayISO(new Date(Date.now()+7*86400000))} onChange={e=>set("dueDate",e.target.value)} required/></label><label className="form-field"><span>Status</span><select value={data.status||"open"} onChange={e=>set("status",e.target.value)}><option value="open">Open</option><option value="done">Done</option></select></label></>}
    {kind==="issue"&&<><label className="form-field"><span>IDS item</span><input value={data.title||""} onChange={e=>set("title",e.target.value)} required autoFocus/></label><OwnerSelect/><label className="form-field"><span>Context / root obstacle</span><textarea value={data.context||""} onChange={e=>set("context",e.target.value)} rows={4}/></label><label className="form-field"><span>Resolution</span><textarea value={data.resolution||""} onChange={e=>set("resolution",e.target.value)} placeholder="Record the decision or solution…" rows={4}/></label><label className="form-field"><span>Status</span><select value={data.status||"open"} onChange={e=>set("status",e.target.value)}><option value="open">Open</option><option value="solved">Solved</option></select></label></>}
    {kind==="headline"&&<><label className="form-field"><span>Headline</span><input value={data.title||""} onChange={e=>set("title",e.target.value)} required autoFocus/></label><OwnerSelect/><div className="form-row"><label className="form-field"><span>Type</span><select value={data.tone||"good"} onChange={e=>set("tone",e.target.value)}><option value="good">Good news</option><option value="watch">Watch item</option></select></label><label className="form-field"><span>Date</span><input type="date" value={data.date||new Date().toISOString().slice(0,10)} onChange={e=>set("date",e.target.value)}/></label></div><label className="form-field"><span>Details</span><textarea value={data.detail||""} onChange={e=>set("detail",e.target.value)} rows={5}/></label></>}
  </div><div className="modal-foot"><button type="button" onClick={close}>Cancel</button><button className="primary-btn" type="submit"><Save size={16}/> Save {kindLabels[kind]}</button></div></form></div>;
}

