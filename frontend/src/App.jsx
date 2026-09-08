import { useEffect, useRef, useState } from 'react';
import IndiaBackground from './IndiaBackground';

// Plain-language starter questions. The agent auto-detects the task
// (single image / bi-temporal change / optical-SAR fusion) from what's
// uploaded — the user never has to pick a mode.
const PRESETS = [
  'Is there a water body in this image?',
  'Is this a rural or an urban area?',
  'Describe the land cover and major objects.',
  'Highlight the buildings.',
  'What changed between these two dates and where?',
  'Use the optical and SAR images to identify built-up and water.',
];

const taskLabels = {
  single_vqa: 'Question answering',
  single_caption: 'Scene description',
  single_grounding: 'Region highlighting',
  change_vqa: 'Change detection',
  change_map: 'Change map',
  cross_modal: 'Optical + SAR fusion',
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

// A result image with a hover "expand" control that opens the zoom viewer.
function ResultImage({ src, caption, evidence, onExpand }) {
  return (
    <figure className={evidence ? 'evidence' : undefined}>
      <div className="img-wrap">
        <img src={src} alt={caption} />
        <button type="button" className="expand-btn" aria-label="Expand image"
          onClick={() => onExpand({ src, label: caption })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </button>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// Full-screen zoom viewer: scroll to zoom, drag to pan, buttons, Esc / backdrop to close.
function ImageViewer({ src, label, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomBy = (factor) => setScale((s) => Math.min(8, Math.max(1, +(s * factor).toFixed(3))));
  const onWheel = (e) => { zoomBy(e.deltaY > 0 ? 0.9 : 1.1); };
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
      <div className="viewer-stage" onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove}
        onMouseUp={onUp} onMouseLeave={onUp}>
        <img src={src} alt={label || ''} draggable="false"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }} />
      </div>
      <div className="viewer-hint">Scroll to zoom · drag to pan · Esc to close</div>
    </div>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('checking');
  const [live, setLive] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [viewer, setViewer] = useState(null);

  useEffect(() => { loadHealth(); loadRegistry(); }, []);

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
  function handleFiles(e) {
    setFiles(Array.from(e.target.files || []).slice(0, 2));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
  function removeFile(i) { setFiles((c) => c.filter((_, k) => k !== i)); }
  function clearAll() { setFiles([]); setQuery(''); setResult(null); setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  function replaceImageSet() {
    if (!window.confirm('Replace both uploaded images and start a new comparison?')) return;
    clearAll();
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function submit(q) {
    const text = (q ?? query).trim();
    if (!files.length) { alert('Please add an image first.'); return; }
    if (!text) { alert('Please choose or type a question.'); return; }
    setQuery(text); setLoading(true); setResult(null); setShowTech(false);
    const fd = new FormData();
    fd.append('text', text);
    files.forEach((f) => fd.append('images', f));
    try {
      const r = await fetch('/api/query', { method: 'POST', body: fd });
      setResult(await r.json());
    } catch (err) { alert(`Request failed: ${err}`); }
    finally { setLoading(false); }
  }
  function openReport() {
    if (result?.report_id) window.open(`/api/report/${result.report_id}`, '_blank', 'noopener,noreferrer');
  }

  const previews = files.map((f, i) => result?.input_config?.images?.[i]?.preview_png_b64
    ? `data:image/png;base64,${result.input_config.images[i].preview_png_b64}`
    : URL.createObjectURL(f));
  const evidenceImgs = (result?.evidence || []).filter((e) => e.image_b64);
  const pct = result?.confidence == null ? null : Math.round(Number(result.confidence) * 100);

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
        <div className={`gov-status ${live ? 'ok' : 'off'}`}>
          <span className="dot" /> {status}
        </div>
      </header>

      <main className="gov-main">
        {/* LEFT: guided inputs */}
        <section className="panel inputs" aria-label="Inputs">
          <div className="step-box">
            <h2 className="step">Step 1 · Add image(s)</h2>
            <p className="hint">Upload one image, or two for change / optical–SAR analysis — the assistant detects the task automatically.</p>
            <input id="scene-upload" ref={fileInputRef} className="file-input" type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" multiple onChange={handleFiles} />
            {!files.length ? <label htmlFor="scene-upload" className="upload">
              <span className="upload-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></span>
              <span><strong>Click to upload</strong><br /><small>GeoTIFF, TIFF, PNG or JPEG · up to 2 images</small></span>
            </label> : <div className="uploaded-scenes">
              {files.map((f, i) => <div className="thumb" key={i}>
                <img src={previews[i]} alt={f.name} />
                <button type="button" className="thumb-remove" aria-label={`Remove ${f.name}`} onClick={() => removeFile(i)}>×</button>
                <span className="thumb-name" title={f.name}>{f.name}</span>
              </div>)}
              {files.length < 2 ? <button type="button" className="add-image" aria-label="Add another image" onClick={() => fileInputRef.current?.click()}>+</button> : <button type="button" className="replace-set" onClick={replaceImageSet}><span aria-hidden="true">↻</span> New set</button>}
            </div>}
          </div>

          <div className="step-box">
            <h2 className="step">Step 2 · Ask a question</h2>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p} type="button" className="preset" onClick={() => submit(p)} disabled={loading || !files.length}>
                  {p}
                </button>
              ))}
            </div>
            <textarea rows={2} value={query} placeholder="…or type your own question"
              onChange={(e) => setQuery(e.target.value)} />
            <div className="actions">
              <button className="run" onClick={() => submit()} disabled={loading || !files.length}>
                {loading ? 'Analysing…' : 'Run analysis'}
              </button>
              <button className="clear" onClick={clearAll}>Clear</button>
            </div>
          </div>
        </section>

        {/* RIGHT: plain-language results */}
        <section className="panel results" aria-label="Results">
          <h2 className="step">Result</h2>

          <div className="images-row">
            {files.map((f, i) => <ResultImage key={i} src={previews[i]} caption={`Input ${i + 1}`} onExpand={setViewer} />)}
            {evidenceImgs.map((e, i) => (
              <ResultImage key={`ev${i}`} evidence src={`data:image/png;base64,${e.image_b64}`}
                caption={e.label || 'Evidence overlay'} onExpand={setViewer} />
            ))}
            {!files.length && <div className="placeholder">Upload an image and ask a question to see results here.</div>}
          </div>

          {loading && <div className="answer-box loading">Running the analysis on your image… this can take a moment.</div>}

          {result && !loading && (
            <>
              <div className="answer-box">
                <div className="answer-label">Answer</div>
                <p className="answer-text">{result.answer || 'No answer returned.'}</p>
              </div>

              <div className="facts">
                <div><span>Task</span><strong>{taskLabels[result.task] || result.task || '—'}</strong></div>
                <div><span>Model used</span><strong>{(result.tools_used || []).join(', ') || '—'}</strong></div>
              </div>

              {pct != null && (
                <div className="confidence">
                  <div className="conf-head"><span>{confidenceWord(pct)}</span><strong>{pct}%</strong></div>
                  <div className="conf-bar"><span className={pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo'} style={{ width: `${pct}%` }} /></div>
                </div>
              )}

              {result.report_id && (
                <button className="report" onClick={openReport}>Download full report (PDF / HTML)</button>
              )}

              <button className="tech-toggle" onClick={() => setShowTech((v) => !v)}>
                {showTech ? 'Hide technical details (audit trail)' : 'Show technical details (audit trail)'}
              </button>
              {showTech && (
                <div className="tech">
                  <div className="tech-block">
                    <h3>How the system reached this answer</h3>
                    <ol className="trace">
                      {(result.trace || []).map((s, i) => (
                        <li key={i}>
                          <strong>{stageLabel(s.stage)}</strong>
                          <span>{s.detail}</span>
                          {s.data && Object.keys(s.data).length > 0 && (
                            <details><summary>data</summary><pre>{JSON.stringify(s.data, null, 2)}</pre></details>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="tech-block">
                    <h3>Available specialist models ({registry.length})</h3>
                    <ul className="models">
                      {registry.map((t) => <li key={t.name}><strong>{t.name}</strong> — {t.input_type} · {(t.tasks || []).join(', ')}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
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
