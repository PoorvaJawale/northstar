import { useEffect, useRef, useState } from 'react';
import IndiaBackground from './IndiaBackground';

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

// An image with a hover "expand" control that opens the zoom viewer.
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
  const [viewer, setViewer] = useState(null);

  useEffect(() => { loadHealth(); }, []);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  async function loadHealth() {
    try {
      const d = await (await fetch('/api/health')).json();
      setLive(!d.mock_mode);
      setStatus(d.mock_mode ? 'Demo mode' : 'Live models connected');
    } catch { setLive(false); setStatus('Backend offline'); }
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
    setInput('');
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
        trace: d.trace || [], report_id: d.report_id,
      }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: `Request failed: ${err}`, error: true }]);
    } finally { setLoading(false); }
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

      <main className="chat-main">
        {!hasScene ? (
          <div className="chat-empty">
            <label htmlFor="scene-upload" className="empty-card">
              <span className="upload-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></span>
              <strong>Add a satellite image to begin</strong>
              <small>Upload one image, or two for change / optical–SAR analysis. GeoTIFF, TIFF, PNG or JPEG.</small>
            </label>
            <p className="empty-note">Then just ask questions in plain language — the assistant picks the right model automatically.</p>
          </div>
        ) : (
          <div className="chat-wrap">
            <div className="chat-scenebar">
              <span className="scene-tag">ANALYSING · {files.length > 1 ? `${files.length} scenes` : files[0].name}</span>
              <button type="button" className="upload-new" onClick={uploadNew}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                Upload new image
              </button>
            </div>
            <div className="scene-images">
              {previews.map((src, i) => <ZoomImage key={i} src={src} caption={files[i]?.name || `Scene ${i + 1}`} onExpand={setViewer} />)}
            </div>

            <div className="chat-inputbar">
              <input type="text" value={input} placeholder="Tell me what you want to know…"
                onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} />
              <button type="button" className="ask" onClick={() => ask()} disabled={loading || !input.trim()}>
                {loading ? '…' : 'Ask'}
              </button>
            </div>

            {(suggestions.length > 0 || suggestLoading) && (
              <div className="suggest-row">
                <span className="suggest-label">TRY ASKING</span>
                {suggestLoading && !suggestions.length
                  ? <span className="suggest-loading">reading the scene…</span>
                  : suggestions.map((q) => (
                    <button key={q} type="button" className="suggest-chip" onClick={() => ask(q)} disabled={loading}>{q}</button>
                  ))}
              </div>
            )}

            <div className="chat-thread" ref={threadRef}>
              {messages.length === 0 && !loading && (
                <div className="thread-hint">Ask a question above, or tap a suggestion, to start the conversation.</div>
              )}
              {messages.map((m, i) => m.role === 'user' ? (
                <div className="msg user" key={i}><div className="bubble">{m.text}</div></div>
              ) : (
                <div className="msg bot" key={i}>
                  <div className={`bubble${m.error ? ' error' : ''}`}>
                    <p className="bot-answer">{m.text}</p>
                    {m.evidence && m.evidence.length > 0 && (
                      <div className="bot-evidence">
                        {m.evidence.map((e, k) => <ZoomImage key={k} evidence src={`data:image/png;base64,${e.image_b64}`} caption={e.label || 'Evidence overlay'} onExpand={setViewer} />)}
                      </div>
                    )}
                    {m.confidence != null && (() => { const pct = Math.round(Number(m.confidence) * 100); return (
                      <div className="bot-conf">
                        <span>{confidenceWord(pct)} · {pct}%</span>
                        <div className="conf-bar"><span className={pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo'} style={{ width: `${pct}%` }} /></div>
                      </div>
                    ); })()}
                    {!m.error && (
                      <details className="bot-details">
                        <summary>Details · {taskLabels[m.task] || m.task || 'analysis'}{m.report_id ? '' : ''}</summary>
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
          </div>
        )}
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
