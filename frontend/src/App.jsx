import { useEffect, useRef, useState } from 'react';
import IndiaBackground from './IndiaBackground';

/* ------------------------------------------------------------------
 * SatQuery AI — revamped workspace
 * Design read: mission-control AI workspace for technical analysts,
 * calm-dark glass language, split-studio (scene left / chat right).
 * Dials: VARIANCE 7 / MOTION 6 / DENSITY 5.
 *
 * Borrowed inspiration (honest labels, hand-built — not official pkgs):
 * - "Thinking trace / Tool chips / Task rows / Prompt bar / Insight
 *    confidence" patterns inspired by beautifului.dev AI primitives.
 * - "Badge / Button variants / Meter / Layer card" language inspired
 *    by kumo-ui.com (Cloudflare Kumo). No @cloudflare/kumo dep — the
 *    classes below are a local approximation for offline use.
 * - Duotone glyphs inspired by runeicons.com (one glyph, five moods;
 *    we ship the duotone mood: soft fill + crisp stroke on a 24px grid).
 * - Split-studio composition + grotesk-sans evidence from Inspo study.
 *
 * Preserved: IndiaBackground earth + IST dynamic phases + glass panes.
 * Shape rule: cards 14px, inputs 10px, pills fully round. One accent:
 * warm saffron #ffa02e locked across CTAs, dots, meters.
 * ------------------------------------------------------------------ */

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

/* ---------- Rune-style duotone icon (inspired by runeicons.com) ----------
 * Duotone mood = translucent fill layer + full-strength stroke layer.
 * 24px grid, stroke 1.7, round caps. Inline — no icon package needed. */
const ICON_PATHS = {
  satellite: (
    <>
      <path className="ri-fill" d="M9.5 14.5 14.5 9.5l3 3-5 5-3-3Z" />
      <path d="M9.5 14.5 14.5 9.5l3 3-5 5-3-3Z" />
      <path d="M6.5 17.5 4 20M17.5 6.5 20 4M7 11l2 2M13 17l2 2M11 7l2 2M17 11l-2 2" />
      <path className="ri-fill" d="M12.6 7.6 16.4 3.8l3.8 3.8-3.8 3.8-3.8-3.8Z" />
      <path d="M12.6 7.6 16.4 3.8l3.8 3.8-3.8 3.8-3.8-3.8ZM4 13.5l3.5-3.5 3 3L7 16.5 4 13.5Z" />
    </>
  ),
  image: (
    <>
      <rect className="ri-fill" x="3.5" y="5" width="17" height="14" rx="2.5" />
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle className="ri-fill" cx="9" cy="10" r="1.8" />
      <path d="M4.5 17.5 10 12l3.5 3.5 3-3 3 3.5" />
    </>
  ),
  upload: (
    <>
      <path className="ri-fill" d="M12 15.5v-11M7.5 8 12 3.5 16.5 8" opacity="0" />
      <path d="M12 15.5v-11M7.5 8 12 3.5 16.5 8" />
      <path className="ri-fill" d="M4.5 15v3.5h15V15" opacity="0" />
      <path d="M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </>
  ),
  chat: (
    <>
      <path className="ri-fill" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" />
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  spark: (
    <>
      <path className="ri-fill" d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2L12 3.5Z" />
      <path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2L12 3.5Z" />
      <path d="M18.5 3.5v4M16.5 5.5h4" />
    </>
  ),
  check: (
    <>
      <circle className="ri-fill" cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.4 2.7 2.7 5-5.6" />
    </>
  ),
  alert: (
    <>
      <path className="ri-fill" d="M12 3.8 21 19.5H3L12 3.8Z" />
      <path d="M12 3.8 21 19.5H3L12 3.8Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="16.6" r="0.4" />
    </>
  ),
  file: (
    <>
      <path className="ri-fill" d="M6.5 3.5h7l4 4v13h-11v-17Z" />
      <path d="M6.5 3.5h7l4 4v13h-11v-17ZM13.5 3.5v4h4" />
      <path d="M9.5 12.5h5M9.5 15.5h5" />
    </>
  ),
  clock: (
    <>
      <circle className="ri-fill" cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  globe: (
    <>
      <circle className="ri-fill" cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5Z" />
    </>
  ),
  send: (
    <>
      <path className="ri-fill" d="M20.5 3.5 10.8 13.2M20.5 3.5 14 20.5l-3.2-7.3-7.3-3.2 17-6.5Z" />
      <path d="M20.5 3.5 10.8 13.2M20.5 3.5 14 20.5l-3.2-7.3-7.3-3.2 17-6.5Z" />
    </>
  ),
  expand: (
    <>
      <path d="M15 3.5h5.5V9M9 20.5H3.5V15M20.5 3.5 14 10M3.5 20.5 10 14" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
  layers: (
    <>
      <path className="ri-fill" d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
      <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5ZM4.5 12 12 16l7.5-4M4.5 16 12 20l7.5-4" />
    </>
  ),
  cpu: (
    <>
      <rect className="ri-fill" x="7" y="7" width="10" height="10" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3.5V6M14 3.5V6M10 18v2.5M14 18v2.5M3.5 10H6M3.5 14H6M18 10h2.5M18 14h2.5" />
    </>
  ),
  sun: (
    <>
      <circle className="ri-fill" cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2.5 12h2.5M19 12h2.5M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
    </>
  ),
  moon: (
    <>
      <path className="ri-fill" d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A9 9 0 0 0 12 3Z" />
      <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A9 9 0 0 0 12 3Z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  info: (
    <>
      <circle className="ri-fill" cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
};

function RuneIcon({ name, size = 16 }) {
  return (
    <svg
      className="ri"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name] || ICON_PATHS.spark}
    </svg>
  );
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
        <RuneIcon name="expand" size={15} />
        <span className="viewer-name">{label}</span>
        <span className="viewer-spacer" />
        <button type="button" className="k-btn k-btn-ghost k-btn-xs" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <span className="viewer-pct">{Math.round(scale * 100)}%</span>
        <button type="button" className="k-btn k-btn-ghost k-btn-xs" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button type="button" className="k-btn k-btn-ghost k-btn-xs" onClick={reset}>Reset</button>
        <button type="button" className="k-btn k-btn-ghost k-btn-xs viewer-close" onClick={onClose}><RuneIcon name="x" size={13} /> Close</button>
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
        <RuneIcon name="expand" size={14} />
      </button>
    </div>
  );
}

/* Format file size cleanly */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/* Extract clean file format from name */
function getFileFormat(filename) {
  if (!filename) return 'Raster';
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'tif' || ext === 'tiff') return 'GeoTIFF';
  if (ext === 'png') return 'PNG';
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'webp') return 'WebP';
  return ext.toUpperCase();
}

/* ---------- SatQuery AI Logo (Tricolor brackets, orbit & satellite dot) ---------- */
function SatQueryLogo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className="sq-logo" aria-hidden="true">
      {/* Orbit ellipse */}
      <ellipse cx="18" cy="18" rx="14.5" ry="6.2" transform="rotate(-28 18 18)" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" strokeDasharray="3 2" />
      {/* Blue orbiting satellite dot */}
      <circle cx="29.5" cy="12" r="2.2" fill="#2563EB" />
      <circle cx="29.5" cy="12" r="3.8" stroke="#2563EB" strokeOpacity="0.45" strokeWidth="1" />
      {/* Orange < */}
      <path d="M12 13.5L8 18L12 22.5" stroke="#FF9933" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dynamic / */}
      <path d="M16 23.5L20 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* Green > */}
      <path d="M24 13.5L28 18L24 22.5" stroke="#138808" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Scene Inspector Subcomponents ---------- */

function ProductHeader({ theme, onToggleTheme }) {
  return (
    <div className="product-identity">
      <div className="product-branding">
        <div className="product-logo-tile">
          <SatQueryLogo size={24} />
        </div>
        <div className="product-titles">
          <h1 className="product-name">✦ SatQuery AI</h1>
          <p className="product-tagline">Vision–language assistant for remote sensing</p>
        </div>
      </div>
      <button
        type="button"
        className="theme-toggle-compact"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} mode`}
        aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} mode`}
      >
        <RuneIcon name={theme === 'light' ? 'moon' : 'sun'} size={14} />
      </button>
    </div>
  );
}

function SceneHeader({ count = 0, max = 2 }) {
  return (
    <div className="scene-header">
      <div className="scene-header-title">
        <h2>Scene Inspector</h2>
      </div>
      <div className="scene-counter" title="Active scenes loaded">
        <span className="counter-num">{count}</span>
        <span className="counter-sep">/</span>
        <span className="counter-max">{max}</span>
      </div>
    </div>
  );
}

function SceneDropCard({ onUpload }) {
  return (
    <label htmlFor="scene-upload" className="drop-card">
      <span className="drop-icon"><RuneIcon name="upload" size={22} /></span>
      <strong>Add a satellite image</strong>
      <small>One image, or two for change / optical–SAR.<br />GeoTIFF · TIFF · PNG · JPEG</small>
      <span className="drop-cta"><RuneIcon name="image" size={13} /> Browse files</span>
    </label>
  );
}

function ScenePreview({ files, previews, activeIndex, onSelectIndex, dimensions, onExpand, onReplace, onAdd, onRemove }) {
  const activeFile = files[activeIndex] || files[0];
  const activePreview = previews[activeIndex] || previews[0];
  const activeDims = dimensions[activeIndex];
  const format = getFileFormat(activeFile?.name);

  return (
    <div className="scene-preview-card">
      {files.length > 1 && (
        <div className="scene-tabs" role="tablist" aria-label="Loaded scenes">
          {files.map((f, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={activeIndex === i}
              className={`scene-tab ${activeIndex === i ? 'is-active' : ''}`}
              onClick={() => onSelectIndex(i)}
            >
              <span className="tab-tag">{i === 0 ? 'T1' : 'T2'}</span>
              <span className="tab-name" title={f.name}>{f.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="scene-viewport">
        <ZoomImage
          src={activePreview}
          caption={activeFile?.name || `Scene ${activeIndex + 1}`}
          onExpand={onExpand}
        />
        <div className="scene-viewport-badge">
          <KBadge tone="info">{activeIndex === 0 ? 'T1' : 'T2'}</KBadge>
        </div>
      </div>

      <div className="scene-summary">
        <span className="scene-filename" title={activeFile?.name}>{activeFile?.name}</span>
        <span className="scene-details">
          {format} {activeDims ? `• ${activeDims}` : ''}
        </span>
      </div>

      <div className="scene-actions">
        <button
          type="button"
          className="k-btn k-btn-primary k-btn-sm action-btn"
          onClick={onReplace}
          title="Replace the current image"
        >
          <RuneIcon name="upload" size={13} /> Replace image
        </button>
        {files.length < 2 && (
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm action-btn"
            onClick={onAdd}
            title="Add second scene for bi-temporal change / optical-SAR fusion"
          >
            <RuneIcon name="plus" size={13} /> + Add scene
          </button>
        )}
        {files.length > 1 && (
          <button
            type="button"
            className="k-btn k-btn-ghost k-btn-xs remove-btn"
            onClick={() => onRemove(activeIndex)}
            title={`Remove ${activeIndex === 0 ? 'T1' : 'T2'}`}
          >
            <RuneIcon name="x" size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function SceneMetadata({ file, index, dimensions }) {
  const format = getFileFormat(file?.name);
  const size = formatFileSize(file?.size);
  const dims = dimensions[index];

  return (
    <div className="scene-section scene-meta-section">
      <div className="sec-title">
        <span>✦ SCENE INFORMATION</span>
        <span className="sec-meta">{index === 0 ? 'T1 (Baseline)' : 'T2 (Comparison)'}</span>
      </div>
      <div className="meta-table">
        <div className="meta-row">
          <span className="meta-label">Format</span>
          <span className="meta-value">{format}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Dimensions</span>
          <span className="meta-value">{dims ? `${dims} px` : '—'}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">File size</span>
          <span className="meta-value">{size}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Sensor</span>
          <span className="meta-value is-muted">Not available</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Location</span>
          <span className="meta-value is-muted">Not available</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Acquisition</span>
          <span className="meta-value is-muted">Not available</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Resolution</span>
          <span className="meta-value is-muted">Not available</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Bands</span>
          <span className="meta-value is-muted">Not available</span>
        </div>
      </div>
    </div>
  );
}

function ModelStatus({ registry = [] }) {
  const models = registry.length
    ? registry
    : [{ name: 'geochat' }, { name: 'change' }, { name: 'optical_sar' }];

  const formatName = (name) => {
    if (name === 'geochat') return 'GeoChat';
    if (name === 'change') return 'Change';
    if (name === 'optical_sar') return 'Optical-SAR';
    return name;
  };

  return (
    <div className="scene-section scene-models-section">
      <div className="sec-title">
        <span>✦ AI MODELS</span>
        <span className="sec-meta">{models.length} online</span>
      </div>
      <div className="model-status-list">
        {models.map((m) => (
          <div key={m.name} className="model-status-item">
            <span className="model-name">
              <i className="status-dot online" />
              {formatName(m.name)}
            </span>
            <span className="model-state">Online</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneInspectorFooter() {
  return (
    <div className="scene-inspector-footer">
      <RuneIcon name="clock" size={12} />
      <span>Background follows IST · day / night imagery crossfades automatically</span>
    </div>
  );
}

/* Kumo-inspired badge (local approximation, not the official package). */
function KBadge({ tone = 'neutral', dot = false, icon, children }) {
  return (
    <span className={`k-badge k-badge-${tone}${dot ? ' is-dot' : ''}`}>
      {dot ? <i className="k-dot" /> : icon ? <RuneIcon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/* BeautifulUI-inspired thinking trace: expandable steps + tool chips.
 * Collapsed to a single line by default; expanding reveals the full trace.
 * Header mirrors the live thinking single-line language so the streaming
 * card and the committed card read as the same component. */
function ThinkingTrace({ trace, tools, task, elapsed }) {
  if (!trace?.length && !tools?.length) return null;
  return (
    <details className="think" open={false}>
      <summary className="think-summary">
        <span className="think-done-ic"><RuneIcon name="check" size={12} /></span>
        <span className="think-label">Thought · {taskLabels[task] || task || 'analysis'}</span>
        <span className="think-count">{trace?.length || 0} steps{elapsed != null && ` · ${elapsed.toFixed(1)}s`}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="chev" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <ol className="task-rows">
        {(trace || []).map((s, k) => (
          <li key={k} className="task-row">
            <span className="task-ic"><RuneIcon name="check" size={13} /></span>
            <div><strong>{stageLabel(s.stage)}</strong><span>{s.detail}</span></div>
          </li>
        ))}
      </ol>
      {tools?.length > 0 && (
        <div className="tool-chips" aria-label="Models used">
          {tools.map((t) => (
            <span key={t} className="tool-chip"><RuneIcon name="cpu" size={12} />{t}</span>
          ))}
        </div>
      )}
    </details>
  );
}

/* 3×3 pixel-grid loader — beautifului "loading state" language.
 * Nine 4px cells flashing in sequence (staggered pixel-on), next to
 * shimmer text. Pure CSS, transform/opacity only. */
function PixelGrid() {
  return (
    <span className="pixel-grid" aria-hidden="true">
      {[90, 180, 270, 0, 90, 180, 90, 180, 270].map((d, i) => (
        <i key={i} style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

/* Live thought-processing — beautifului "thinking" language, fed by SSE.
 * Single line by default (shimmer of the running stage + step count +
 * elapsed timer); expanding reveals the rail of steps. Running steps carry
 * a spinner ring; finished steps pop in a check. Elapsed ticks locally so
 * the parent never re-renders on a timer. */
function LiveThinking({ pending, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(t);
  }, []);
  const secs = ((now - pending.t0) / 1000).toFixed(1);
  const running = [...pending.steps].reverse().find((s) => s.status === 'running');
  const doneCount = pending.steps.filter((s) => s.status === 'done').length;
  return (
    <div className="live-think">
      <button type="button" className="live-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <PixelGrid />
        <span className="shimmer" role="status">{running ? running.label : pending.answer != null ? 'Answering' : 'Thinking'}</span>
        {pending.steps.length > 0 && <span className="live-count">{doneCount}/{pending.steps.length}</span>}
        <span className="elapsed">{secs}s</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={open ? 'chev open' : 'chev'} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className={`live-grid${open ? ' is-open' : ''}`}>
        <div className="live-overflow">
          {pending.steps.length === 0 ? (
            <p className="live-wait">Contacting the agent…</p>
          ) : (
            <ol className="live-steps">
              {pending.steps.map((s, k) => (
                <li key={`${s.stage}-${k}`} className={`live-step is-${s.status}`} style={{ '--d': `${Math.min(k, 6) * 60}ms` }}>
                  <span className="live-rail" aria-hidden="true" />
                  <span className="live-ic">
                    {s.status === 'done'
                      ? <RuneIcon name="check" size={12} />
                      : <span className="ring" aria-hidden="true" />}
                  </span>
                  <div className="live-body">
                    <strong>{s.label || stageLabel(s.stage)}</strong>
                    {s.detail && <span className="live-detail">{s.detail}</span>}
                    {(s.logs || []).map((lg, j) => (
                      <span key={j} className="live-log">{lg}</span>
                    ))}
                  </div>
                  {s.status === 'done' && s.ms != null && <span className="live-ms">{(s.ms / 1000).toFixed(1)}s</span>}
                </li>
              ))}
            </ol>
          )}
          <p className="live-meta">{doneCount} of {pending.steps.length || '…'} stages complete</p>
        </div>
      </div>
    </div>
  );
}

/* One bot card shared by the streaming bubble and the committed message —
 * same order (thinking → answer → evidence → confidence → report) so the
 * stream visibly settles into the final card instead of swapping layouts. */
function BotBubble({ thinking, text, streaming, streamDone, evidence, confidence, task, reportId, onReport, onExpand, error, live }) {
  return (
    <div className={`bubble${error ? ' error' : ''}${live ? ' live' : ''}`}>
      {thinking}
      {text != null && (
        <p className="bot-answer">
          {text}
          {streaming && <span className={`stream-caret${streamDone ? ' is-done' : ''}`} aria-hidden="true" />}
        </p>
      )}
      {evidence && evidence.length > 0 && (
        <div className="bot-evidence">
          {evidence.map((e, k) => <ZoomImage key={k} evidence src={`data:image/png;base64,${e.image_b64}`} caption={e.label || 'Evidence overlay'} onExpand={onExpand} />)}
        </div>
      )}
      {confidence != null && (() => { const pct = Math.round(Number(confidence) * 100); return (
        <div className="bot-conf">
          <div className="conf-top">
            <span className="conf-word"><RuneIcon name={pct >= 60 ? 'check' : 'alert'} size={12} />{confidenceWord(pct)} · {pct}%</span>
            {task && <KBadge tone="info">{taskLabels[task] || task}</KBadge>}
          </div>
          <div className="k-meter sm"><span className={pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo'} style={{ width: `${pct}%` }} /></div>
        </div>
      ); })()}
      {reportId && (
        <button type="button" className="k-btn k-btn-outline k-btn-sm report-btn" onClick={() => onReport(reportId)}>
          <RuneIcon name="file" size={13} /> Full report · PDF / HTML
        </button>
      )}
    </div>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const addSceneInputRef = useRef(null);
  const threadRef = useRef(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('satquery-theme') || 'light');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dimensions, setDimensions] = useState({});
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // live SSE run: { steps, t0, answer, answerDone }
  const [status, setStatus] = useState('checking');
  const [live, setLive] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('satquery-theme', theme);
  }, [theme]);

  useEffect(() => { loadHealth(); loadRegistry(); }, []);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);
  const pinBottom = () => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; };

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
    const newPreviews = picked.map((f) => URL.createObjectURL(f));
    setPreviews(newPreviews);
    setActiveSceneIndex(0);
    setMessages([]); setSuggestions([]); setSessionId(null);

    // Read dimensions from images
    newPreviews.forEach((src, idx) => {
      const img = new Image();
      img.onload = () => {
        setDimensions((prev) => ({ ...prev, [idx]: `${img.naturalWidth} × ${img.naturalHeight}` }));
      };
      img.src = src;
    });

    const fd = new FormData();
    picked.forEach((f) => fd.append('images', f));
    try {
      const s = await (await fetch('/api/session', { method: 'POST', body: fd })).json();
      setSessionId(s.session_id);
      fetchSuggestions(s.session_id);
    } catch (err) { alert(`Could not load the image: ${err}`); }
  }

  async function addScene(fileList) {
    const additional = Array.from(fileList);
    if (!additional.length) return;
    const merged = [...files, ...additional].slice(0, 2);
    await startSession(merged);
  }

  function removeScene(indexToRemove) {
    const remaining = files.filter((_, i) => i !== indexToRemove);
    if (remaining.length === 0) {
      uploadNew();
    } else {
      startSession(remaining);
    }
  }

  async function fetchSuggestions(sid) {
    setSuggestLoading(true);
    try {
      const d = await (await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sid }) })).json();
      setSuggestions(d.suggestions || []);
    } catch { setSuggestions([]); }
    finally { setSuggestLoading(false); }
  }

  /* Drain POST /api/chat/stream (SSE) into the pending run. Stage start/done
   * frames grow the live thinking rail; log frames append tool progress;
   * the result frame resolves with the final payload. Throws when the
   * stream breaks before a result so the caller can fall back.
   *
   * Presentation pacing: mock (and fast) runs emit every frame in one
   * burst, which would flash the whole rail at once. Applications are
   * spaced ≥ STEP_PACE apart so stages appear one by one; slow live runs
   * are unaffected (the pump only waits when it is behind). */
  const STEP_PACE = 500;
  async function streamChat(sid, text, patch, t0) {
    const r = await fetch('/api/chat/stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, message: text }),
    });
    if (!r.ok) throw new Error(`Stream failed (${r.status})`);
    if (!r.body || typeof r.body.getReader !== 'function') throw new Error('Streaming unsupported');
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let final = null;
    let chain = Promise.resolve();
    let lastApply = 0;
    const schedule = (fn) => {
      chain = chain.then(async () => {
        const wait = Math.max(0, lastApply + STEP_PACE - performance.now());
        if (wait) await new Promise((res) => window.setTimeout(res, wait));
        fn();
        lastApply = performance.now();
        pinBottom();
      });
      return chain;
    };
    const onEvent = (ev) => {
      if (!ev || ev.type === 'open' || ev.type === 'done') return;
      if (ev.type === 'error') throw new Error(ev.message || 'Agent error');
      if (ev.type === 'stage') {
        schedule(() => patch((p) => {
          if (!p) return p;
          const steps = [...p.steps];
          if (ev.status === 'start') {
            if (!steps.some((s) => s.stage === ev.stage && s.status === 'running')) {
              steps.push({ stage: ev.stage, label: ev.label || stageLabel(ev.stage), detail: null, status: 'running', logs: [] });
            }
          } else {
            const i = [...steps].reverse().findIndex((s) => s.stage === ev.stage && s.status === 'running');
            if (i >= 0) {
              const at = steps.length - 1 - i;
              steps[at] = { ...steps[at], status: 'done', detail: ev.step?.detail || steps[at].detail, ms: ev.step?.ms };
            } else {
              steps.push({ stage: ev.stage, label: stageLabel(ev.stage), detail: ev.step?.detail, status: 'done', ms: ev.step?.ms, logs: [] });
            }
          }
          return { ...p, steps };
        }));
      } else if (ev.type === 'log') {
        schedule(() => patch((p) => {
          if (!p) return p;
          const steps = [...p.steps];
          let at = [...steps].reverse().findIndex((s) => s.stage === ev.stage && s.status === 'running');
          at = at >= 0 ? steps.length - 1 - at : steps.length - 1;
          if (at < 0) return p;
          const cur = steps[at];
          steps[at] = { ...cur, logs: [...(cur.logs || []), ev.message].slice(-4) };
          return { ...p, steps };
        }));
      } else if (ev.type === 'result') {
        schedule(() => {
          const d = ev.response || {};
          final = {
            text: d.answer || 'No answer returned.',
            evidence: (d.evidence || []).filter((e) => e.image_b64),
            task: d.task, tools: d.tools_used, confidence: d.confidence,
            trace: d.trace || [], report_id: d.report_id,
            elapsed: (performance.now() - t0) / 1000,
          };
        });
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          let ev = null;
          try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          onEvent(ev); // throws on error frames — propagates out of the loop
        }
      }
      pinBottom();
    }
    await chain;
    if (!final) throw new Error('Stream ended without a result');
    return final;
  }

  /* Reveal the answer word-by-word behind a caret (beautifului streaming
   * text). The backend returns the whole answer, so this is a paced reveal,
   * not token streaming — instant when reduced motion is preferred. */
  function revealAnswer(final, patch) {
    const full = final.text || '';
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || full.length < 24) {
      patch((p) => (p ? { ...p, answer: full, answerDone: true } : p));
      pinBottom();
      return Promise.resolve();
    }
    const words = full.split(/(\s+)/);
    return new Promise((res) => {
      let i = 0;
      const tick = () => {
        i += 2;
        const done = i >= words.length;
        const slice = words.slice(0, done ? words.length : i).join('');
        patch((p) => (p ? { ...p, answer: slice, answerDone: done } : p));
        pinBottom();
        if (done) window.setTimeout(res, 350);
        else window.setTimeout(tick, 36);
      };
      tick();
    });
  }

  async function ask(q) {
    const text = (q ?? input).trim();
    if (!sessionId) { alert('Please add an image first.'); return; }
    if (!text || loading) return;
    const sid = sessionId;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    const t0 = performance.now();
    setPending({ steps: [], t0, answer: null, answerDone: false });
    const patch = (fn) => setPending((p) => (p ? fn(p) : p));
    let streamed = false;
    try {
      const final = await streamChat(sid, text, patch, t0);
      streamed = true;
      await revealAnswer(final, patch);
      // Settle evidence + confidence + report into the streaming card first
      // so it morphs into the final layout — then commit the identical card.
      patch((p) => (p ? {
        ...p,
        evidence: final.evidence, confidence: final.confidence,
        task: final.task, reportId: final.report_id,
      } : p));
      pinBottom();
      await new Promise((res) => window.setTimeout(res, 650));
      setMessages((m) => [...m, { role: 'bot', ...final }]);
    } catch (err) {
      if (!streamed) {
        // SSE unavailable (e.g. backend predates /api/chat/stream — restart
        // it to get live staging): single blocking fetch, then play the
        // same choreography — populate the rail from the real trace, then
        // stream the answer text.
        try {
          const r = await fetch('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid, message: text }),
          });
          const d = await r.json();
          const fb = {
            role: 'bot', text: d.answer || 'No answer returned.',
            evidence: (d.evidence || []).filter((e) => e.image_b64),
            task: d.task, tools: d.tools_used, confidence: d.confidence,
            trace: d.trace || [], report_id: d.report_id,
            elapsed: (performance.now() - t0) / 1000,
          };
          patch((p) => (p ? {
            ...p,
            steps: (d.trace || []).map((s) => ({
              stage: s.stage, label: stageLabel(s.stage), detail: s.detail,
              status: 'done', ms: s.ms, logs: [],
            })),
          } : p));
          await revealAnswer(fb, patch);
          patch((p) => (p ? {
            ...p,
            evidence: fb.evidence, confidence: fb.confidence,
            task: fb.task, reportId: fb.report_id,
          } : p));
          pinBottom();
          await new Promise((res) => window.setTimeout(res, 650));
          setMessages((m) => [...m, fb]);
        } catch (err2) {
          setMessages((m) => [...m, { role: 'bot', text: `Request failed: ${err2}`, error: true }]);
        }
      } else {
        setMessages((m) => [...m, { role: 'bot', text: `Request failed: ${err}`, error: true }]);
      }
    } finally { setPending(null); setLoading(false); }
  }

  function uploadNew() {
    setFiles([]); setPreviews([]); setSessionId(null); setMessages([]); setSuggestions([]); setInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => fileInputRef.current?.click(), 0);
  }
  const openReport = (id) => window.open(`/api/report/${id}`, '_blank', 'noopener,noreferrer');

  const hasScene = files.length > 0;
  const lastReport = [...messages].reverse().find((m) => m.role === 'bot' && m.report_id);
  const lastReportId = lastReport?.report_id;

  return (
    <div className={`page theme-${theme}`} data-theme={theme}>
      <IndiaBackground theme={theme} />
      <div className="tricolor" />

      <input id="scene-upload" ref={fileInputRef} className="file-input" type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg" multiple onChange={(e) => startSession(e.target.files)} />
      <input id="scene-add" ref={addSceneInputRef} className="file-input" type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg" onChange={(e) => addScene(e.target.files)} />

      <main className="workspace">
        {/* LEFT: Product Identity & Scene Inspector Panel */}
        <section className="glass scene-card scene-inspector" aria-label="Earth Observation Scene Inspector" style={{ '--d': '0ms' }}>
          <ProductHeader
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          />

          <SceneHeader count={files.length} max={2} />

          {!hasScene ? (
            <SceneDropCard onUpload={() => fileInputRef.current?.click()} />
          ) : (
            <>
              <ScenePreview
                files={files}
                previews={previews}
                activeIndex={activeSceneIndex}
                onSelectIndex={setActiveSceneIndex}
                dimensions={dimensions}
                onExpand={setViewer}
                onReplace={() => fileInputRef.current?.click()}
                onAdd={() => addSceneInputRef.current?.click()}
                onRemove={removeScene}
              />

              <SceneMetadata
                file={files[activeSceneIndex] || files[0]}
                index={activeSceneIndex}
                dimensions={dimensions}
              />
            </>
          )}

          <ModelStatus registry={registry} />

          <SceneInspectorFooter />
        </section>

        {/* RIGHT: AI Assistant / Conversational Workspace */}
        <section className="glass chat-card" aria-label="AI Assistant" style={{ '--d': '90ms' }}>
          <div className="card-head">
            <div className="ai-assistant-head">
              <p className="kicker">✦ AI ASSISTANT</p>
              <h2>Conversation</h2>
            </div>
            {lastReportId && (
              <button
                type="button"
                className="k-btn k-btn-ghost k-btn-xs report-head-btn"
                onClick={() => openReport(lastReportId)}
                title="Open full report in a new tab"
              >
                <RuneIcon name="file" size={13} />
                <span>Export report</span>
              </button>
            )}
          </div>

          <div className="chat-thread" ref={threadRef}>
            {!hasScene && (
              <div className="empty-state">
                <span className="empty-icon"><RuneIcon name="satellite" size={26} /></span>
                <strong>Start with a scene</strong>
                <p>Add a satellite image on the left. Follow-ups stay in the same conversation, with evidence overlays attached to every answer.</p>
                <div className="empty-steps">
                  <span><i>1</i> Upload GeoTIFF / PNG</span>
                  <span><i>2</i> Ask in plain language</span>
                  <span><i>3</i> Export the PDF report</span>
                </div>
              </div>
            )}
            {hasScene && messages.length === 0 && !loading && (
              <div className="thread-hint">
                <RuneIcon name="chat" size={14} />
                Scene locked in. Ask below — or tap a suggestion to start.
              </div>
            )}
            {messages.map((m, i) => m.role === 'user' ? (
              <div className="msg user reveal" key={i}>
                <div className="bubble">{m.text}</div>
              </div>
            ) : (
              <div className="msg bot reveal" key={i}>
                <BotBubble
                  thinking={!m.error && (m.trace?.length || m.tools?.length)
                    ? <ThinkingTrace trace={m.trace} tools={m.tools} task={m.task} elapsed={m.elapsed} />
                    : null}
                  text={m.text} error={m.error}
                  evidence={m.evidence} confidence={m.confidence} task={m.task}
                  reportId={m.report_id} onReport={openReport} onExpand={setViewer}
                />
              </div>
            ))}
            {pending && (
              <div className="msg bot">
                <BotBubble live
                  thinking={<LiveThinking pending={pending} />}
                  text={pending.answer} streaming={pending.answer != null} streamDone={pending.answerDone}
                  evidence={pending.evidence} confidence={pending.confidence} task={pending.task}
                  reportId={pending.reportId} onReport={openReport} onExpand={setViewer}
                />
              </div>
            )}
          </div>

          {hasScene && (suggestions.length > 0 || suggestLoading) && (
            <div className="suggest-zone">
              <span className="suggest-label">Try asking</span>
              <div className="suggest-row">
                {suggestLoading && !suggestions.length
                  ? <span className="suggest-loading">Reading the scene…</span>
                  : suggestions.map((q) => <button key={q} type="button" className="suggest-chip" onClick={() => ask(q)} disabled={loading}><RuneIcon name="spark" size={12} />{q}</button>)}
              </div>
            </div>
          )}

          {/* Prompt bar — beautifului prompt-bar language, kumo input shape */}
          <div className="promptbar">
            <span className="prompt-ctx" title="Scene attached">
              <RuneIcon name="image" size={12} />{hasScene ? `${files.length} scene${files.length > 1 ? 's' : ''}` : 'no scene'}
            </span>
            <input
              type="text" value={input}
              placeholder={hasScene ? 'Ask about this scene…' : 'Add an image first…'}
              disabled={!hasScene}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
              aria-label="Ask about the scene"
            />
            <span className="prompt-model" title="Active models"><RuneIcon name="cpu" size={12} />{registry.length || 3}</span>
            <button type="button" className="k-btn k-btn-primary send" onClick={() => ask()} disabled={loading || !hasScene || !input.trim()} aria-label="Send">
              {loading ? '…' : <><RuneIcon name="send" size={14} /><span>Ask</span></>}
            </button>
          </div>
        </section>
      </main>

      <footer className="mission-foot">
        <span><RuneIcon name="satellite" size={12} /> SatQuery AI · Agentic vision–language assistant</span>
        <span>ISRO / SAC · PS-26167 · Prototype</span>
      </footer>

      {viewer && <ImageViewer src={viewer.src} label={viewer.label} onClose={() => setViewer(null)} />}
    </div>
  );
}

export default App;
