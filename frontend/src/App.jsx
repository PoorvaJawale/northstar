import { useEffect, useMemo, useRef, useState } from 'react';

const examplePrompts = [
  'Describe the land-cover and major objects visible in this image.',
  'Highlight the water body referred to in the query.',
  'What changed between these two dates, and where did the change occur?',
  'Use the optical and SAR images together to identify built-up and water regions.',
  'Has the built-up area increased, decreased, or remained unchanged?',
];

const STAGES = ['inspect', 'classify', 'select', 'execute', 'fuse'];
const formatStage = (stage) =>
  stage?.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || 'STEP';

/* Radial confidence gauge (pure SVG, no deps). */
function RadialGauge({ pct, loading }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const val = loading ? 25 : Math.max(0, Math.min(100, pct ?? 0));
  const dash = (val / 100) * c;
  return (
    <div className="relative flex h-[140px] w-[140px] items-center justify-center">
      <svg viewBox="0 0 100 100" className={`h-full w-full ${loading ? 'gauge-spin' : ''}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5.5" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={loading ? '#7fc3ff' : '#ffffff'} strokeWidth="5.5"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="absolute text-center">
        {loading ? (
          <>
            <div className="mx-auto mb-1 flex justify-center gap-1">
              <span className="dot-pulse" /><span className="dot-pulse" style={{ animationDelay: '.2s' }} /><span className="dot-pulse" style={{ animationDelay: '.4s' }} />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Measuring</div>
          </>
        ) : (
          <>
            <div className="text-2xl font-semibold text-text">{Math.round(val)}%</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Certainty</div>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('STANDBY');
  const [registry, setRegistry] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [traceOpen, setTraceOpen] = useState({});
  const [hasResults, setHasResults] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);

  useEffect(() => { loadHealth(); loadRegistry(); }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        clearAllImages();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [files, query, loading]);

  async function loadHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setStatus(data.mock_mode ? 'MOCK MODE' : 'LIVE MODELS');
    } catch { setStatus('OFFLINE'); }
  }

  async function loadRegistry() {
    try {
      const res = await fetch('/api/registry');
      const data = await res.json();
      setRegistry(data.tools || []);
    } catch { setRegistry([]); }
  }

  const handleFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []).slice(0, 2);
    setFiles(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (indexToRemove) =>
    setFiles((prev) => prev.filter((_, index) => index !== indexToRemove));

  const clearAllImages = () => {
    setFiles([]);
    setResult(null);
    setHasResults(false);
    setTraceOpen({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleTracePayload = (index) =>
    setTraceOpen((prev) => ({ ...prev, [index]: !prev[index] }));

  const handleSubmit = async () => {
    if (!files.length) { alert('Please choose 1 or 2 images.'); return; }
    if (!query.trim()) { alert('Please type a question.'); return; }
    setLoading(true);
    setResult(null);
    setHasResults(false);
    const formData = new FormData();
    formData.append('text', query.trim());
    files.forEach((file) => formData.append('images', file));
    try {
      const res = await fetch('/api/query', { method: 'POST', body: formData });
      const data = await res.json();
      setResult(data);
      setHasResults(true);
    } catch (error) {
      alert(`Request failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const evidence = result?.evidence || [];
  const trace = result?.trace || [];
  const previewTrace = trace.slice(0, activityExpanded ? trace.length : 3);
  const confNum = result?.confidence !== undefined && result?.confidence !== null
    ? Math.round(Number(result.confidence) * 100) : null;
  const doneStages = new Set(trace.map((s) => s.stage));
  const stagesDone = STAGES.filter((s) => doneStages.has(s)).length;

  const metricRows = useMemo(() => ([
    { label: 'Confidence', value: confNum !== null ? `${confNum}%` : '—', percent: confNum ?? 0 },
    { label: 'Task match', value: result?.task ? 'HIGH' : (loading ? '—' : 'PENDING'), percent: result?.task ? 82 : 0 },
    { label: 'Evidence coverage', value: `${evidence.length || 0} items`, percent: evidence.length ? Math.min(100, evidence.length * 50) : 0 },
    { label: 'Signal quality', value: result ? 'STABLE' : 'IDLE', percent: result ? 88 : 0 },
  ]), [confNum, evidence.length, result, loading]);

  const dashboard = loading || hasResults;
  const onlineCount = registry.length;
  const uploadCount = files.length;

  const exampleChips = (
    <div className="flex flex-wrap gap-2">
      {examplePrompts.map((prompt) => (
        <button key={prompt} type="button" onClick={() => setQuery(prompt)}
          className="border border-white/10 bg-[#0d141b]/70 px-2.5 py-1.5 text-[11px] text-muted hover:border-white/30 hover:text-text">
          {prompt}
        </button>
      ))}
    </div>
  );

  const commandBox = (
    <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={4}
      placeholder="Ask SatQuery about this imagery..."
      className="w-full resize-none border border-white/10 bg-[#1a2128]/60 p-3 text-sm text-text placeholder:text-muted outline-none focus:border-white/30" />
  );

  return (
    <div className="min-h-screen px-2 py-3 text-text sm:px-4 lg:px-6">
      <div className="mx-auto max-w-[1600px] overflow-hidden border border-white/10 bg-[#0a0f14]/55 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-white/10 bg-[#11171d]/70 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-[#7fc3ff]" />
            <span className="text-sm font-semibold text-text">SatQuery&nbsp;AI</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:inline">PS 26167 · ISRO</span>
          </div>
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-[720px] items-center justify-center gap-2 border border-white/10 bg-[#171d23]/70 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">
              <span className="text-white/80">●</span><span>satquery.local</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border border-white/10 bg-[#1a2128]/70 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-muted">
              <span className="inline-block h-1.5 w-1.5 bg-[#7fc3ff]" />{status}
            </div>
            <button type="button" onClick={loadRegistry}
              className="border border-white/10 bg-[#1a2128]/70 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-muted hover:border-white/30 hover:text-text">
              Models
            </button>
          </div>
        </header>

        {/* ============ IDLE ============ */}
        {!dashboard && (
          <main className="flex justify-center p-4 sm:p-6">
            <div className="w-full max-w-[960px]">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Input</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{uploadCount}/2</div>
              </div>

              <h1 className="mt-5 text-2xl font-semibold text-text">Ask a question about satellite imagery</h1>
              <p className="mt-2 max-w-[70ch] text-sm text-muted">
                Upload 1 image for single-image tasks, or 2 images for an optical–SAR pair or a
                bi-temporal pair. GeoTIFF / TIFF / PNG / JPEG.
              </p>

              <label className="group mt-5 flex min-h-[190px] cursor-pointer flex-col items-center justify-center border border-dashed border-border bg-[#12181f]/50 px-4 text-center hover:border-white/30">
                <input ref={fileInputRef} type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" multiple className="hidden" onChange={handleFileChange} />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Add imagery</span>
                <span className="mt-3 text-lg text-text">Drop or browse 1–2 scenes</span>
                <div className="mt-4 flex gap-2">
                  {['Single', 'Bi-temporal', 'Optical-SAR'].map((t) => (
                    <span key={t} className="border border-white/10 bg-[#0d141b]/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t}</span>
                  ))}
                </div>
              </label>

              {uploadCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 border border-white/10 bg-[#0b1218]/70 px-2 py-1 text-xs text-text">
                      {file.name}
                      <button type="button" onClick={() => removeImage(index)} className="font-mono text-[9px] uppercase text-muted hover:text-text">×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-[#12181f]/50 p-3">
                  <div className="ui-label font-mono text-[10px] uppercase tracking-[0.18em]">Task / mode</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-text"><span className="model-status">■</span> Detected on run</div>
                </div>
                <div className="border border-white/10 bg-[#12181f]/50 p-3">
                  <div className="ui-label font-mono text-[10px] uppercase tracking-[0.18em]">Model</div>
                  <div className="mt-2 text-sm text-text">Agent-selected · {onlineCount} online</div>
                </div>
              </div>

              <div className="mt-5">
                <div className="ui-label mb-2 font-mono text-[10px] uppercase tracking-[0.18em]">Command</div>
                {commandBox}
              </div>

              <div className="mt-4">{exampleChips}</div>

              <button type="button" onClick={handleSubmit} disabled={loading}
                className="primary-cta mt-5 flex w-full items-center justify-center gap-3 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.28em]">
                Run SatQuery <span className="text-[10px] font-normal opacity-60">⌘/Ctrl + ↵</span>
              </button>

              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                <span className="flex items-center gap-1.5"><span className="model-status">■</span> Standby</span>
                {registry.map((t) => (
                  <span key={t.name} className="flex items-center gap-1.5"><span className="model-status text-[#7fc3ff]">■</span> {t.name}</span>
                ))}
              </div>
            </div>
          </main>
        )}

        {/* ============ DASHBOARD ============ */}
        {dashboard && (
          <main className="grid grid-cols-1 gap-3 p-3 sm:p-4 xl:h-[calc(100vh-104px)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
            {/* LEFT — INPUT */}
            <aside className="flex flex-col gap-3 overflow-y-auto border border-white/10 bg-[#0d1319]/55 p-3 shadow-subtle">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Input</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{uploadCount}/2</div>
              </div>

              <label className="group flex min-h-[70px] cursor-pointer flex-col items-center justify-center border border-dashed border-border bg-[#1a2128]/50 px-3 text-center hover:border-white/30">
                <input ref={fileInputRef} type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" multiple className="hidden" onChange={handleFileChange} />
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Add imagery</span>
                <span className="mt-1 text-xs text-text">Drop 1–2 scenes · TIF / PNG / JPG</span>
              </label>

              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="border border-white/10 bg-[#0b1218]/70 p-2">
                  <img src={URL.createObjectURL(file)} alt={file.name} className="h-24 w-full bg-black object-contain" />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="truncate text-[11px] text-text">{file.name}</span>
                    <button type="button" onClick={() => removeImage(index)} className="font-mono text-[9px] uppercase text-muted hover:text-text">Remove</button>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2">
                <div className="border border-white/10 bg-[#1a2128]/60 p-2.5">
                  <div className="ui-label font-mono text-[9px] uppercase tracking-[0.16em]">Task / mode</div>
                  <div className="data-value mt-1 font-mono text-[11px] uppercase">{result?.task ? result.task : (loading ? 'Detecting…' : '—')}</div>
                </div>
                <div className="border border-white/10 bg-[#1a2128]/60 p-2.5">
                  <div className="ui-label font-mono text-[9px] uppercase tracking-[0.16em]">Model</div>
                  <div className="data-value mt-1 font-mono text-[11px]">{result?.tools_used?.length ? result.tools_used.join(', ') : (loading ? 'Agent-selected' : '—')}</div>
                </div>
              </div>

              <div>
                <div className="ui-label mb-2 font-mono text-[10px] uppercase tracking-[0.18em]">Command</div>
                {commandBox}
              </div>

              {exampleChips}

              <button type="button" onClick={handleSubmit} disabled={loading}
                className="primary-cta mt-1 w-full px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.24em]">
                {loading ? 'Processing…' : 'Run SatQuery'}
              </button>
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                <span>⌘/Ctrl + ↵ Run</span>
                <button type="button" onClick={clearAllImages} className="hover:text-text">Esc Clear</button>
              </div>
            </aside>

            {/* CENTER — ANALYSIS + EVIDENCE */}
            <section className="flex min-h-0 flex-col gap-3">
              <div className="border border-white/10 bg-[#0d1319]/55 p-4 shadow-subtle">
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="ui-label font-mono text-[10px] font-semibold uppercase tracking-[0.22em]">Analysis</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{loading ? 'Executing…' : (result ? 'Result' : 'Waiting')}</div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_160px]">
                  <div className="border border-white/10 bg-[#1a2128]/60 p-4">
                    <div className="ui-label font-mono text-[10px] uppercase tracking-[0.18em]">Answer</div>
                    {loading ? (
                      <div className="mt-3 space-y-2">
                        <div className="skeleton h-3 w-[92%]" />
                        <div className="skeleton h-3 w-[80%]" />
                        <div className="skeleton h-3 w-[64%]" />
                      </div>
                    ) : (
                      <div className="data-value mt-3 text-lg leading-relaxed">{result?.answer || 'Awaiting analysis output.'}</div>
                    )}
                  </div>
                  <div className="flex items-center justify-center border border-white/10 bg-[#1a2128]/60 p-3">
                    <div className="text-center">
                      <div className="ui-label mb-1 font-mono text-[10px] uppercase tracking-[0.18em]">Confidence</div>
                      <RadialGauge pct={confNum} loading={loading} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
                  <span className="ui-label font-mono text-[10px] uppercase tracking-[0.18em]">Task / Tool</span>
                  {loading ? (
                    <span className="pill pill-live">Routing…</span>
                  ) : result?.task ? (
                    <>
                      <span className="pill">{result.task.toUpperCase()}</span>
                      {(result.tools_used || []).map((t) => <span key={t} className="pill">{t.toUpperCase()}</span>)}
                    </>
                  ) : <span className="text-muted">—</span>}
                  {result?.report_id && (
                    <a href={`/api/report/${result.report_id}`} target="_blank" rel="noreferrer"
                      className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[#7fc3ff] hover:text-[#a8d9ff]">
                      Download report ↓
                    </a>
                  )}
                </div>
              </div>

              {/* EVIDENCE — kept text-based on purpose */}
              <div className="flex min-h-0 flex-1 flex-col border border-white/10 bg-[#0d1319]/55 p-4 shadow-subtle">
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Evidence</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {loading ? 'Rendering' : result ? `${evidence.length} artifacts · ${uploadCount || 1} input scene` : '—'}
                  </div>
                </div>
                <div className="grid-bg flex min-h-[120px] flex-1 items-start overflow-y-auto p-4 font-mono text-[12px] leading-relaxed text-muted">
                  {loading ? (
                    <span className="scan-text">◇ Awaiting artifacts…</span>
                  ) : evidence.length ? (
                    <div className="space-y-1">
                      {evidence.map((e, i) => (
                        <div key={i}>◇ {(e.kind || 'evidence').toUpperCase()} · {e.label || ''} {e.data ? JSON.stringify(e.data) : ''}</div>
                      ))}
                    </div>
                  ) : result ? (
                    <span>◇ N_EVIDENCE = 0 · {(result.task || '').toUpperCase()} RETURNS TEXT ONLY</span>
                  ) : (
                    <span>◇ No evidence yet</span>
                  )}
                </div>
              </div>
            </section>

            {/* RIGHT — REGISTRY + METRICS + AGENT ACTIVITY */}
            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
              {/* Registry */}
              <div className="border border-white/10 bg-[#0d1319]/55 p-3 shadow-subtle">
                <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="ui-label font-mono text-[10px] font-semibold uppercase tracking-[0.22em]">Registry</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{onlineCount} online</div>
                </div>
                <div className="space-y-2">
                  {registry.length ? registry.map((tool) => (
                    <div key={tool.name} className="border border-white/10 bg-[#1a2128]/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="model-status text-[#7fc3ff]">■</span>
                          <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-text">{tool.name}</span>
                        </div>
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{tool.input_type}</span>
                      </div>
                      <div className="mt-1 pl-4 font-mono text-[10px] text-muted">{tool.tasks?.join(' · ')}</div>
                    </div>
                  )) : <div className="text-xs text-muted">Registry unavailable.</div>}
                </div>
              </div>

              {/* Metrics */}
              <div className="border border-white/10 bg-[#0d1319]/55 p-3 shadow-subtle">
                <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="ui-label font-mono text-[10px] font-semibold uppercase tracking-[0.22em]">Metrics</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{uploadCount || (result ? 1 : 0)} scene</div>
                </div>
                <div className="space-y-3">
                  {metricRows.map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                        <span>{row.label}</span><span className="text-white">{loading ? '—' : row.value}</span>
                      </div>
                      <div className="h-1.5 border border-white/10 bg-[#0b1117]">
                        <div className="h-full bg-[#e8edf3] transition-all duration-500" style={{ width: `${loading ? 0 : row.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent activity */}
              <div className="flex min-h-0 flex-1 flex-col border border-white/10 bg-[#0d1319]/55 p-3 shadow-subtle">
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="ui-label font-mono text-[10px] font-semibold uppercase tracking-[0.22em]">Agent activity</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{loading ? '…/5' : `${stagesDone}/5`} stages</div>
                </div>

                <div className="mb-3 grid grid-cols-5 gap-1">
                  {STAGES.map((s) => {
                    const done = doneStages.has(s);
                    const cls = done ? 'step-done' : loading ? 'step-active' : 'step-pending';
                    return (
                      <div key={s} className="flex flex-col items-center gap-1">
                        <span className={`step-dot ${cls}`} />
                        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted">{s}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {loading ? (
                    <>
                      <div className="skeleton h-12 w-full" />
                      <div className="skeleton h-12 w-full" />
                    </>
                  ) : trace.length ? (
                    <>
                      {previewTrace.map((step, index) => {
                        const open = Boolean(traceOpen[index]);
                        return (
                          <div key={`${step.stage}-${index}`} className="border border-white/10 bg-[#1a2128]/60 p-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="model-status text-[11px] text-[#7fc3ff]">■</span>
                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text">{formatStage(step.stage)}</span>
                              </div>
                              <span className="font-mono text-[9px] text-muted">{index + 1}/{trace.length}</span>
                            </div>
                            <div className="mt-1.5 text-[12px] text-text">{step.detail}</div>
                            {step.data && Object.keys(step.data).length ? (
                              <>
                                <button type="button" onClick={() => toggleTracePayload(index)} className="trace-toggle mt-2">
                                  {open ? '[-] Hide payload' : '[+] View payload'}
                                </button>
                                {open && (
                                  <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap border border-white/10 bg-[#08111b]/80 p-2 font-mono text-[10px] leading-relaxed text-muted">
                                    {JSON.stringify(step.data, null, 2)}
                                  </pre>
                                )}
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                      {trace.length > 3 && (
                        <button type="button" onClick={() => setActivityExpanded((p) => !p)} className="trace-toggle w-full justify-center">
                          {activityExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted">Execution trace will appear here.</div>
                  )}
                </div>
              </div>
            </aside>
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
