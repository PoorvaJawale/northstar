import { useEffect, useRef, useState } from 'react';
import IndiaBackground from './IndiaBackground';

const taskLabels = {
  single_vqa: 'Question answering',
  single_caption: 'Scene description',
  single_grounding: 'Region highlighting',
  change_vqa: 'Change detection',
  change_map: 'Change map',
  cross_modal: 'Optical + SAR fusion',
  disaster_risk: 'Disaster risk prediction',
  landcover_area: 'Land-cover area',
};

const stageLabel = (s) => ({
  inspect: 'Checked the image(s)',
  classify: 'Understood the question',
  select: 'Chose the right model',
  execute: 'Ran the analysis',
  fuse: 'Prepared the answer',
  report: 'Generated the report',
}[s] || s);

function confidenceWord(pct) {
  if (pct >= 80) return 'High confidence';
  if (pct >= 60) return 'Moderate confidence';
  return 'Limited confidence';
}

// Full-screen zoom viewer: scroll to zoom, drag to pan, Esc / backdrop to close.
function ImageViewer({ src, label, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const zoomBy = (f) => setScale((s) => Math.min(8, Math.max(1, +(s * f).toFixed(3))));
  const onDown = (e) => { if (scale > 1) drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; };
  const onMove = (e) => { if (drag.current) setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const onUp = () => { drag.current = null; };
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };
  return (
    <div className="viewer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="viewer-toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <span className="viewer-name">{label}</span>
        <span className="viewer-spacer" />
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <span className="viewer-pct">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button type="button" onClick={reset}>Reset</button>
        <button type="button" className="viewer-close" onClick={onClose}>✕ Close</button>
      </div>
      <div className="viewer-stage" onWheel={(e) => zoomBy(e.deltaY > 0 ? 0.9 : 1.1)}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        <img src={src} alt={label || ''} draggable="false"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }} />
      </div>
      <div className="viewer-hint">Scroll to zoom · drag to pan · Esc to close</div>
    </div>
  );
}

function ZoomImage({ src, caption, evidence, onExpand }) {
  return (
    <div className={`img-wrap${evidence ? ' evidence' : ''}`}>
      <img src={src} alt={caption} />
      <button type="button" className="expand-btn" aria-label="Expand image" onClick={() => onExpand({ src, label: caption })}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
      </button>
    </div>
  );
}

// ---- Geo evidence map: base scene + toggleable overlay layers -------------
function LayerViewer({ scene, layers, onExpand }) {
  const base = scene && scene[0];
  const [vis, setVis] = useState(() => layers.map(() => true));
  const [showBase, setShowBase] = useState(false);   // reveal the plain scene
  if (!layers || !layers.length) return null;
  const toggle = (i) => setVis((v) => v.map((x, k) => (k === i ? !x : x)));
  const topVisible = layers[vis.findIndex(Boolean) >= 0 ? vis.findIndex(Boolean) : 0];
  return (
    <div className="layer-viewer">
      <div className="layer-stage">
        {base && <img className="layer-base" src={base} alt="scene" />}
        {!showBase && layers.map((e, i) => (vis[i] ? (
          <img key={i} className="layer-overlay" src={`data:image/png;base64,${e.image_b64}`} alt={e.label || ''} />
        ) : null))}
        <button type="button" className="layer-expand" aria-label="Expand"
          onClick={() => onExpand({ src: `data:image/png;base64,${topVisible.image_b64}`, label: topVisible.label })}>⤢</button>
      </div>
      <div className="layer-controls">
        {base && (
          <label className="layer-toggle base-toggle">
            <input type="checkbox" checked={showBase} onChange={() => setShowBase((s) => !s)} />
            <span className="layer-name">Show base scene only</span>
          </label>
        )}
        {layers.length > 1 && layers.map((e, i) => (
          <label className={`layer-toggle${vis[i] ? ' on' : ''}`} key={i}>
            <input type="checkbox" checked={vis[i]} disabled={showBase} onChange={() => toggle(i)} />
            <span className="layer-swatch" style={{ background: e.color || '#38b6ff' }} />
            <span className="layer-name">{e.label || `Layer ${i + 1}`}</span>
            {e.area && <span className="layer-area">{e.area.area_ha != null ? `${e.area.area_ha} ha` : `${e.area.pct}%`}</span>}
          </label>
        ))}
        {layers.length === 1 && layers[0].area && (
          <span className="layer-area single">{layers[0].label}
            {' · '}{layers[0].area.area_ha != null ? `${layers[0].area.area_ha} ha` : `${layers[0].area.pct}%`}</span>
        )}
      </div>
    </div>
  );
}

// ---- Explainable confidence (named dimensions instead of one number) ------
function ConfBreakdown({ breakdown, fallback }) {
  const pct = (v) => Math.round(Number(v) * 100);
  if (!breakdown) {
    if (fallback == null) return null;
    const p = pct(fallback);
    return <div className="bot-conf"><span>{confidenceWord(p)} · {p}%</span>
      <div className="conf-bar"><span className={p >= 80 ? 'hi' : p >= 60 ? 'mid' : 'lo'} style={{ width: `${p}%` }} /></div></div>;
  }
  // show all three dimensions; ones that don't apply to this task read "n/a"
  const dims = [['Model', breakdown.model], ['Evidence quality', breakdown.evidence_quality],
    ['Geospatial validity', breakdown.geospatial_validity]];
  const o = pct(breakdown.overall);
  const reasons = breakdown.reasons || [];
  return (
    <div className="conf-breakdown">
      <div className="conf-overall"><strong>{confidenceWord(o)}</strong> · {o}%
        <em className="conf-cal" title="These scores are not yet calibrated against ground-truth correctness">{breakdown.calibration_state}</em></div>
      {dims.map(([name, v]) => { const na = v == null; const p = na ? 0 : pct(v); return (
        <div className={`conf-dim${na ? ' na' : ''}`} key={name}>
          <span className="conf-dim-name">{name}</span>
          <div className="conf-bar"><span className={p >= 80 ? 'hi' : p >= 60 ? 'mid' : 'lo'} style={{ width: `${p}%` }} /></div>
          <span className="conf-dim-val">{na ? 'n/a' : `${p}%`}</span>
        </div>); })}
      {reasons.length > 0 && (
        <ul className="conf-reasons">
          {reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---- CRS / GSD / overlap / area ribbon ------------------------------------
function MetaRibbon({ alignment, area }) {
  const chips = [];
  if (alignment) {
    if (alignment.aligned) {
      if (alignment.target_crs) chips.push(alignment.target_crs);
      if (alignment.gsd_m) chips.push(`${alignment.gsd_m} m/px`);
      if (alignment.overlap_pct != null) chips.push(`${alignment.overlap_pct}% overlap`);
    } else chips.push('pixel-grid · no CRS');
  }
  if (area) chips.push(area.area_ha != null ? `${area.area_ha} ha` : `${area.pct}% of scene`);
  if (!chips.length) return null;
  return <div className="meta-ribbon">{chips.map((c, i) => <span className="meta-chip" key={i}>{c}</span>)}</div>;
}

// ---- Evidence Explorer: the derivation chain behind an answer -------------
function WhyPanel({ m }) {
  const [open, setOpen] = useState(false);
  const steps = [['Question', m.question || '—'],
    ['Task · Model', `${taskLabels[m.task] || m.task} · ${(m.tools || []).join(', ') || '—'}`]];
  if (m.alignment) steps.push(['Alignment', m.alignment.aligned
    ? `${m.alignment.method} → ${m.alignment.target_crs}${m.alignment.overlap_pct != null ? `, ${m.alignment.overlap_pct}% overlap` : ''}`
    : 'pixel-grid (inputs not georeferenced)']);
  if (m.evidence && m.evidence.length) steps.push(['Evidence', m.evidence.map((e) => e.label).join('; ')]);
  if (m.area) steps.push(['Measurement', m.area.area_ha != null
    ? `${m.area.pixels.toLocaleString()} px × (${m.area.gsd_m} m)² = ${m.area.area_ha} ha`
    : `${m.area.pixels.toLocaleString()} px = ${m.area.pct}% of scene`]);
  if (m.breakdown && m.breakdown.reasons) steps.push(['Confidence', m.breakdown.reasons.join(' · ')]);
  return (
    <div className="why-panel">
      <button type="button" className="why-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Show me why</button>
      {open && <ol className="why-chain">{steps.map(([k, v], i) => (
        <li key={i}><span className="why-k">{k}</span><span className="why-v">{v}</span></li>))}</ol>}
    </div>
  );
}

// ---- Analysis Plan Preview (what the agent will do, before running) -------
function PlanCard({ plan, loading, onRun, onClose }) {
  if (!plan && !loading) return null;
  return (
    <div className="plan-card">
      <div className="plan-head"><strong>Analysis plan</strong>
        <button type="button" className="plan-x" onClick={onClose}>✕</button></div>
      {loading ? <div className="plan-warn">planning…</div>
        : !plan.compatible ? <div className="plan-warn">{plan.note || 'Cannot plan this input.'}</div> : (
        <>
          <div className="plan-row"><span>Intent</span><b>{taskLabels[plan.task] || plan.task}</b><em>via {plan.method}</em></div>
          <div className="plan-row"><span>Tool</span><b>{plan.tool}</b></div>
          <div className="plan-row"><span>Inputs</span>{plan.inputs.join(' · ')}</div>
          <div className="plan-steps">{plan.pipeline.map((s, i) => <span className="plan-step" key={i}>{i + 1}. {s}</span>)}</div>
          <div className="plan-foot"><span>~{plan.est_seconds}s</span>
            <button type="button" className="plan-run" onClick={onRun}>Run analysis →</button></div>
        </>
      )}
    </div>
  );
}

// ---- Benchmark table (measured numbers) -----------------------------------
function BenchmarkPanel({ data, open, onToggle }) {
  if (!data) return null;
  const ft = data.fine_tune || {};
  return (
    <>
      <div className="section-title bench-head" onClick={onToggle}>BENCHMARKS
        <span className="section-meta">{open ? '▾' : '▸'}</span></div>
      {open && (
        <div className="bench-panel">
          <div className="bench-ft">Fine-tune: <b>{ft.train_samples_before}→{ft.train_samples_after}</b> samples ·
            loss <b>{ft.loss_start}→{ft.loss_end}</b><br />
            <em>{ft.accuracy_after != null ? `accuracy ${ft.accuracy_before}→${ft.accuracy_after}` : 'accuracy: pending eval'}</em></div>
          <table className="bench-table"><tbody>
            {(data.models || []).map((r, i) => (
              <tr key={i}><td>{r.task}</td><td className="bench-model">{r.model}</td>
                <td className="bench-num">{r.value != null ? r.value : '—'}</td></tr>))}
          </tbody></table>
        </div>
      )}
    </>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const threadRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('checking');
  const [live, setLive] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [plan, setPlan] = useState(null);        // Analysis Plan Preview
  const [planLoading, setPlanLoading] = useState(false);
  const [benchmark, setBenchmark] = useState(null);
  const [showBench, setShowBench] = useState(false);

  useEffect(() => { loadHealth(); loadRegistry(); loadBenchmark(); }, []);
  // Auto Analysis-Plan-Preview: as the user types (scene loaded), show what the
  // agent WOULD do — debounced, model-free, so it never blocks.
  useEffect(() => {
    if (!sessionId || input.trim().length < 3 || loading) { setPlan(null); return; }
    const id = setTimeout(() => { previewPlan(); }, 650);
    return () => clearTimeout(id);
  }, [input, sessionId, loading]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  async function loadHealth() {
    try {
      const d = await (await fetch('/api/health')).json();
      setLive(!d.mock_mode);
      setStatus(d.mock_mode ? 'Demo mode' : 'Live models connected');
    } catch { setLive(false); setStatus('Backend offline'); }
  }
  async function loadRegistry() {
    try { const d = await (await fetch('/api/registry')).json(); setRegistry(d.tools || []); }
    catch { setRegistry([]); }
  }

  async function startSession(fileList) {
    const picked = Array.from(fileList).slice(0, 2);
    if (!picked.length) return;
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
    setMessages([]); setSuggestions([]); setSessionId(null);
    const fd = new FormData();
    picked.forEach((f) => fd.append('images', f));
    try {
      const s = await (await fetch('/api/session', { method: 'POST', body: fd })).json();
      setSessionId(s.session_id);
      fetchSuggestions(s.session_id);
    } catch (err) { alert(`Could not load the image: ${err}`); }
  }

  async function fetchSuggestions(sid) {
    setSuggestLoading(true);
    try {
      const d = await (await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sid }) })).json();
      setSuggestions(d.suggestions || []);
    } catch { setSuggestions([]); }
    finally { setSuggestLoading(false); }
  }

  async function ask(q) {
    const text = (q ?? input).trim();
    if (!sessionId) { alert('Please add an image first.'); return; }
    if (!text || loading) return;
    setInput(''); setPlan(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      const d = await r.json();
      setMessages((m) => [...m, {
        role: 'bot', text: d.answer || 'No answer returned.',
        evidence: (d.evidence || []).filter((e) => e.image_b64),
        task: d.task, tools: d.tools_used, confidence: d.confidence,
        breakdown: d.confidence_breakdown, alignment: d.alignment, area: d.area,
        scene: previews, question: text,
        trace: d.trace || [], report_id: d.report_id,
      }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: `Request failed: ${err}`, error: true }]);
    } finally { setLoading(false); }
  }

  async function loadBenchmark() {
    try { setBenchmark(await (await fetch('/api/benchmark')).json()); } catch { /* ignore */ }
  }

  // Analysis Plan Preview: ask the backend what it WOULD do, without running the model
  async function previewPlan() {
    const text = input.trim();
    if (!sessionId || !text) { setPlan(null); return; }
    setPlanLoading(true);
    try {
      const d = await (await fetch('/api/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      })).json();
      setPlan(d);
    } catch { setPlan(null); }
    finally { setPlanLoading(false); }
  }
  function runPlan() { const q = plan?.query; setPlan(null); ask(q); }

  function removeScene(i) {
    // removing a scene invalidates the session; simplest is to reset
    uploadNew();
  }
  function uploadNew() {
    setFiles([]); setPreviews([]); setSessionId(null); setMessages([]); setSuggestions([]); setInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => fileInputRef.current?.click(), 0);
  }
  const openReport = (id) => window.open(`/api/report/${id}`, '_blank', 'noopener,noreferrer');

  const hasScene = files.length > 0;

  return (
    <div className="page">
      <IndiaBackground />
      <div className="tricolor" />
      <header className="gov-header">
        <div className="gov-emblem" aria-hidden="true">🛰️</div>
        <div className="gov-title">
          <h1>SatQuery AI</h1>
          <p>Satellite Image Analysis Assistant · ISRO Problem Statement 26167</p>
        </div>
        <div className={`gov-status ${live ? 'ok' : 'off'}`}><span className="dot" /> {status}</div>
      </header>

      <input id="scene-upload" ref={fileInputRef} className="file-input" type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg" multiple onChange={(e) => startSession(e.target.files)} />

      <main className="gov-main">
        {/* LEFT: scene / data workspace */}
        <section className="panel scene-panel" aria-label="Scene">
          <div className="panel-heading">
            <div><span className="eyebrow">DATA</span><h2>Loaded scene</h2></div>
            {hasScene && <span className="count-badge">{files.length}/2</span>}
          </div>

          {!hasScene ? (
            <label htmlFor="scene-upload" className="upload-card">
              <span className="upload-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></span>
              <strong>Add a satellite image</strong>
              <small>One image, or two for change / optical–SAR. GeoTIFF, TIFF, PNG, JPEG.</small>
            </label>
          ) : (
            <>
              <div className="scene-list">
                {previews.map((src, i) => (
                  <div className="scene-item" key={i}>
                    <ZoomImage src={src} caption={files[i]?.name || `Scene ${i + 1}`} onExpand={setViewer} />
                    <div className="scene-meta"><span title={files[i]?.name}>{files[i]?.name}</span></div>
                  </div>
                ))}
              </div>
              <button type="button" className="upload-new" onClick={uploadNew}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                Upload new image
              </button>
            </>
          )}

          <div className="section-title">SPECIALIST MODELS<span className="section-meta">{registry.length} online</span></div>
          <div className="models-mini">
            {(registry.length ? registry : [{ name: 'geochat' }, { name: 'change' }, { name: 'optical_sar' }]).map((t) => (
              <span className="model-pill" key={t.name}><i className="online-dot" />{t.name}</span>
            ))}
          </div>

          <BenchmarkPanel data={benchmark} open={showBench} onToggle={() => setShowBench((s) => !s)} />
        </section>

        {/* RIGHT: conversational assistant */}
        <section className="panel chat-panel" aria-label="Assistant">
          <div className="panel-heading">
            <div><span className="eyebrow">AI ASSISTANT</span><h2>Conversation</h2></div>
            <span className={`status-chip ${loading ? 'status-running' : messages.length ? 'status-complete' : ''}`}>
              {loading ? 'THINKING' : messages.length ? 'READY' : 'ASK ANYTHING'}
            </span>
          </div>

          <div className="chat-thread" ref={threadRef}>
            {!hasScene && <div className="thread-hint">Add a scene on the left, then ask questions here. Follow-ups stay in the same conversation.</div>}
            {hasScene && messages.length === 0 && !loading && (
              <div className="thread-hint">Ask a question below, or tap a suggestion, to start analysing this scene.</div>
            )}
            {messages.map((m, i) => m.role === 'user' ? (
              <div className="msg user" key={i}><div className="bubble">{m.text}</div></div>
            ) : (
              <div className="msg bot" key={i}>
                <div className={`bubble${m.error ? ' error' : ''}`}>
                  <p className="bot-answer">{m.text}</p>
                  <MetaRibbon alignment={m.alignment} area={m.area} />
                  {m.evidence && m.evidence.length > 0 && (
                    <LayerViewer scene={m.scene} layers={m.evidence} onExpand={setViewer} />
                  )}
                  {!m.error && (m.breakdown || m.confidence != null) && (
                    <ConfBreakdown breakdown={m.breakdown} fallback={m.confidence} />
                  )}
                  {!m.error && <WhyPanel m={m} />}
                  {!m.error && (
                    <details className="bot-details">
                      <summary>Details · {taskLabels[m.task] || m.task || 'analysis'}</summary>
                      <div className="bot-meta">Model: {(m.tools || []).join(', ') || '—'}</div>
                      <ol className="trace">
                        {(m.trace || []).map((s, k) => <li key={k}><strong>{stageLabel(s.stage)}</strong><span>{s.detail}</span></li>)}
                      </ol>
                      {m.report_id && <button type="button" className="report-mini" onClick={() => openReport(m.report_id)}>Download full report (PDF / HTML)</button>}
                    </details>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="msg bot"><div className="bubble typing"><i /><i /><i /></div></div>}
          </div>

          {hasScene && (suggestions.length > 0 || suggestLoading) && (
            <div className="suggest-row">
              <span className="suggest-label">TRY ASKING</span>
              {suggestLoading && !suggestions.length
                ? <span className="suggest-loading">reading the scene…</span>
                : suggestions.map((q) => <button key={q} type="button" className="suggest-chip" onClick={() => ask(q)} disabled={loading}>{q}</button>)}
            </div>
          )}

          {(plan || planLoading) && <PlanCard plan={plan} loading={planLoading} onRun={runPlan} onClose={() => setPlan(null)} />}

          <div className="chat-inputbar">
            <input type="text" value={input} placeholder={hasScene ? 'Tell me what you want to know…' : 'Add an image first…'}
              disabled={!hasScene} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} />
            <button type="button" className="plan-btn" title="Preview the analysis plan before running"
              onClick={previewPlan} disabled={loading || !hasScene || !input.trim()}>Plan</button>
            <button type="button" className="ask" onClick={() => ask()} disabled={loading || !hasScene || !input.trim()}>
              {loading ? '…' : 'Ask'}
            </button>
          </div>
        </section>
      </main>

      <footer className="gov-footer">
        <span>SatQuery AI · Agentic Vision–Language Assistant for Remote Sensing</span>
        <span>ISRO / SAC · Problem Statement 26167 · Prototype</span>
      </footer>

      {viewer && <ImageViewer src={viewer.src} label={viewer.label} onClose={() => setViewer(null)} />}
    </div>
  );
}

export default App;
