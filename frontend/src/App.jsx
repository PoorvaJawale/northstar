import { useEffect, useRef, useState } from 'react';

// Guided, plain-language modes so non-expert users (field officers, farmers,
// IMD/disaster staff) don't have to know how to phrase an agentic query.
const MODES = {
  single: {
    label: 'Single image',
    hint: 'Upload ONE satellite image.',
    need: 1,
    presets: [
      'Is there a water body in this image?',
      'Is this a rural or an urban area?',
      'Describe the land cover and major objects.',
      'Highlight the buildings.',
      'Highlight the water body.',
    ],
  },
  change: {
    label: 'Compare two dates',
    hint: 'Upload TWO images of the SAME area from different dates.',
    need: 2,
    presets: [
      'What changed between these two dates and where?',
      'Has the built-up area increased or decreased?',
    ],
  },
  fusion: {
    label: 'Optical + Radar (SAR)',
    hint: 'Upload an OPTICAL image and a SAR (radar) image of the same area.',
    need: 2,
    presets: [
      'Use the optical and SAR images to identify built-up and water.',
      'Where is the water in this scene?',
    ],
  },
};

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

function App() {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('single');
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('checking');
  const [live, setLive] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTech, setShowTech] = useState(false);

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
  function clearAll() { setFiles([]); setQuery(''); setResult(null); setLoading(false); }

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

  const m = MODES[mode];
  const previews = files.map((f, i) => result?.input_config?.images?.[i]?.preview_png_b64
    ? `data:image/png;base64,${result.input_config.images[i].preview_png_b64}`
    : URL.createObjectURL(f));
  const evidenceImgs = (result?.evidence || []).filter((e) => e.image_b64);
  const pct = result?.confidence == null ? null : Math.round(Number(result.confidence) * 100);

  return (
    <div className="page">
      <div className="tricolor" />
      <header className="gov-header">
        <div className="gov-emblem" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10508a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="7" /><path d="M2 12h20" /><path d="M12 5c3 2.6 3 11.4 0 14M12 5c-3 2.6-3 11.4 0 14" /></svg>
        </div>
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
          <h2 className="step">Step 1 · Choose analysis type</h2>
          <div className="mode-tabs" role="tablist">
            {Object.entries(MODES).map(([key, v]) => (
              <button key={key} role="tab" aria-selected={mode === key}
                className={mode === key ? 'active' : ''}
                onClick={() => { setMode(key); setResult(null); }}>
                {v.label}
              </button>
            ))}
          </div>
          <p className="hint">{m.hint}</p>

          <h2 className="step">Step 2 · Add image{m.need > 1 ? 's' : ''}</h2>
          <label className="upload">
            <input ref={fileInputRef} type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" multiple onChange={handleFiles} />
            <span className="upload-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10508a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></span>
            <span><strong>Click to upload</strong><br /><small>GeoTIFF, TIFF, PNG or JPEG · up to 2 images</small></span>
          </label>
          <div className="thumbs">
            {files.map((f, i) => (
              <div className="thumb" key={i}>
                <img src={previews[i]} alt={f.name} />
                <div className="thumb-meta">
                  <span title={f.name}>{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)}>Remove</button>
                </div>
              </div>
            ))}
            {!files.length && <div className="thumb-empty">No image added yet.</div>}
          </div>

          <h2 className="step">Step 3 · Ask a question</h2>
          <div className="presets">
            {m.presets.map((p) => (
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
        </section>

        {/* RIGHT: plain-language results */}
        <section className="panel results" aria-label="Results">
          <h2 className="step">Result</h2>

          <div className="images-row">
            {files.map((f, i) => <figure key={i}><img src={previews[i]} alt={`input ${i + 1}`} /><figcaption>Input {i + 1}</figcaption></figure>)}
            {evidenceImgs.map((e, i) => (
              <figure key={`ev${i}`} className="evidence">
                <img src={`data:image/png;base64,${e.image_b64}`} alt={e.label || 'evidence'} />
                <figcaption>{e.label || 'Evidence overlay'}</figcaption>
              </figure>
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
    </div>
  );
}

export default App;
