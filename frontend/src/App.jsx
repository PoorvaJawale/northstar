import { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web/build/player/lottie_light';
import {
  Satellite,
  UploadCloud,
  Upload,
  FolderOpen,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  Sparkles,
  ArrowUp,
  Send,
  MessageSquare,
  Cpu,
  Globe,
  GitCompareArrows,
  Layers,
  ShieldAlert,
  Earth,
  Bot,
  FileDown,
  FileText,
  CheckCircle2,
  CircleAlert,
  AlertTriangle,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChartNoAxesCombined,
  LoaderCircle,
  Settings,
  Info,
  Mic
} from 'lucide-react';
import IndiaBackground from './IndiaBackground';

/* ------------------------------------------------------------------
 * SatQuery AI — revamped workspace
 * Design read: mission-control AI workspace for technical analysts,
 * calm-dark glass language, split-studio (scene left / chat right).
 * Dials: VARIANCE 7 / MOTION 6 / DENSITY 5.
 *
 * Icons upgraded to Lucide React (stroke width 1.8px, semantic GIS/AI icons).
 * ------------------------------------------------------------------ */

const taskLabels = {
  single_vqa: 'Question answering',
  single_caption: 'Scene description',
  single_grounding: 'Region highlighting',
  change_vqa: 'Change detection',
  change_map: 'Change map',
  cross_modal: 'Optical + SAR fusion',
  disaster_risk: 'Disaster risk',
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

const ICON_MAP = {
  satellite: Satellite,
  image: ImageIcon,
  upload: Upload,
  folder: FolderOpen,
  chat: MessageSquare,
  spark: Sparkles,
  check: CheckCircle2,
  alert: CircleAlert,
  file: FileDown,
  clock: Clock,
  globe: Globe,
  send: ArrowUp,
  expand: Maximize2,
  x: X,
  layers: Layers,
  cpu: Cpu,
  sun: Sun,
  moon: Moon,
  plus: Plus,
  info: Info,
  benchmark: ChartNoAxesCombined,
  loader: LoaderCircle,
};

function DynamicIcon({ name, size = 16, strokeWidth = 1.8, className = '', ...props }) {
  const Comp = ICON_MAP[name] || Sparkles;
  return <Comp size={size} strokeWidth={strokeWidth} className={`sq-icon ${className}`} {...props} />;
}

/* ---------- Lottie Looping Animation Component ---------- */
function LottieAnimation({ path = '/animation/lootie-loop.json', className = 'lottie-container', speed = 1.5 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: path,
      rendererSettings: {
        preserveAspectRatio: 'xMaxYMid meet',
        clearCanvas: false,
      },
    });

    anim.setSpeed(speed);

    return () => {
      anim.destroy();
    };
  }, [path, speed]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}

/* ---------- High-Performance Modern GIS Image Inspector Lightbox ---------- */
function ImageViewer({ src, label, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomBy(1.25);
      else if (e.key === '-') zoomBy(0.8);
      else if (e.key === '0' || e.key === 'r' || e.key === 'R') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomBy = (factor) => {
    setScale((prev) => {
      const next = Math.min(8, Math.max(0.5, +(prev * factor).toFixed(2)));
      if (next <= 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  const toggleZoom = (e) => {
    e.stopPropagation();
    if (scale !== 1) {
      reset();
    } else {
      setScale(2.5);
    }
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPos({
      x: dragStart.current.posX + dx,
      y: dragStart.current.posY + dy,
    });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    zoomBy(factor);
  };

  return (
    <div
      className="gis-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label || 'Image Viewer'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Floating GIS Inspector Dock */}
      <header className="gis-viewer-header" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gis-viewer-meta">
          <Satellite size={16} strokeWidth={1.8} className="gis-viewer-icon" />
          <span className="gis-viewer-title" title={label}>{label || 'Satellite Imagery'}</span>
        </div>

        <div className="gis-viewer-controls">
          <button
            type="button"
            className="gis-btn"
            onClick={() => zoomBy(0.8)}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="gis-btn gis-pct-btn"
            onClick={reset}
            title="Click to reset to 100%"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            className="gis-btn"
            onClick={() => zoomBy(1.25)}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="gis-btn"
            onClick={reset}
            title="Reset position and zoom (0)"
          >
            <RotateCcw size={15} strokeWidth={1.8} />
            <span>Reset</span>
          </button>
          <div className="gis-divider" />
          <button
            type="button"
            className="gis-btn gis-close-btn"
            onClick={onClose}
            title="Close viewer (Esc)"
            aria-label="Close viewer"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Main Canvas Viewport */}
      <main
        className="gis-viewer-stage"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={toggleZoom}
        style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in' }}
      >
        <div
          className="gis-viewer-content"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 120ms cubic-bezier(0.2, 0.9, 0.3, 1)',
          }}
        >
          <img
            src={src}
            alt={label || 'Expanded satellite view'}
            draggable={false}
            className="gis-viewer-img"
          />
        </div>
      </main>

      {/* Bottom Floating Keyboard / Navigation Guide */}
      <footer className="gis-viewer-hud">
        <span>Scroll / pinch to zoom</span>
        <span className="hud-dot">·</span>
        <span>Drag to pan</span>
        <span className="hud-dot">·</span>
        <span>Double-click to toggle {scale === 1 ? '2.5×' : '1×'}</span>
        <span className="hud-dot">·</span>
        <kbd>Esc</kbd> <span>to close</span>
      </footer>
    </div>
  );
}

function ZoomImage({ src, caption, evidence, onExpand }) {
  return (
    <div
      className={`img-wrap${evidence ? ' evidence' : ''}${onExpand ? ' is-inspectable' : ''}`}
      onClick={() => onExpand?.({ src, label: caption })}
      role={onExpand ? 'button' : undefined}
      tabIndex={onExpand ? 0 : undefined}
      onKeyDown={(e) => {
        if (onExpand && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onExpand({ src, label: caption });
        }
      }}
      title={onExpand ? 'Click to inspect and zoom full image' : caption}
    >
      <img src={src} alt={caption} />
      {onExpand && (
        <span className="inspect-badge" aria-hidden="true">
          <Maximize2 size={13} strokeWidth={2} />
          <span>Inspect</span>
        </span>
      )}
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
  const isDark = theme === 'dark';
  return (
    <div className="product-identity">
      <div className="product-branding">
        <img src="/logo/logo.png" alt="SatqueryAI" className="product-logo-img" />
        <h1 className="product-name">SatqueryAI</h1>
      </div>
      <button
        type="button"
        className="product-theme-btn"
        onClick={onToggleTheme}
        title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
        aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
      >
        {isDark ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
      </button>
    </div>
  );
}

function SceneHeader({ count = 0, max = 2, onClose }) {
  return (
    <div className="scene-header">
      <div className="scene-header-title">
        <h2>Scene Inspector</h2>
      </div>
      <div className="scene-header-right">
        <div className="scene-counter" title="Active scenes loaded">
          <span className="counter-num">{count}</span>
          <span className="counter-sep">/</span>
          <span className="counter-max">{max}</span>
        </div>
        {onClose && (
          <button
            type="button"
            className="scene-sheet-close-btn"
            onClick={onClose}
            aria-label="Close Scene Inspector sheet"
            title="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

function SceneDropCard({ onUpload }) {
  return (
    <label htmlFor="scene-upload" className="drop-card">
      <span className="drop-icon"><UploadCloud size={24} strokeWidth={1.8} /></span>
      <strong>Add a satellite image</strong>
      <small>One image, or two for change / optical–SAR.<br />GeoTIFF · TIFF · PNG · JPEG</small>
      <span className="drop-cta"><FolderOpen size={16} strokeWidth={1.8} /> Browse files</span>
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
          <Upload size={16} strokeWidth={1.8} /> Replace image
        </button>
        {files.length < 2 && (
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm action-btn"
            onClick={onAdd}
            title="Add second scene for bi-temporal change / optical-SAR fusion"
          >
            <Plus size={16} strokeWidth={1.8} /> Add scene
          </button>
        )}
        {files.length > 1 && (
          <button
            type="button"
            className="k-btn k-btn-ghost k-btn-xs remove-btn"
            onClick={() => onRemove(activeIndex)}
            title={`Remove ${activeIndex === 0 ? 'T1' : 'T2'}`}
          >
            <X size={16} strokeWidth={1.8} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function SceneMetadata({ file, index, dimensions }) {
  const [open, setOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 768 : true));
  const format = getFileFormat(file?.name);
  const size = formatFileSize(file?.size);
  const dims = dimensions[index];

  return (
    <div className={`scene-section scene-meta-section ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        className="sec-title sec-title-collapsible"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sec-title-label">✦ SCENE INFORMATION</span>
        <span className="sec-meta">
          <span>{index === 0 ? 'T1 (Baseline)' : 'T2 (Comparison)'}</span>
          {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
        </span>
      </button>
      {open && (
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
      )}
    </div>
  );
}

function getModelIcon(name) {
  switch (name) {
    case 'geochat':
      return <Globe size={18} strokeWidth={1.8} className="model-row-icon" />;
    case 'change':
      return <GitCompareArrows size={18} strokeWidth={1.8} className="model-row-icon" />;
    case 'optical_sar':
      return <Layers size={18} strokeWidth={1.8} className="model-row-icon" />;
    case 'disaster':
      return <ShieldAlert size={18} strokeWidth={1.8} className="model-row-icon" />;
    case 'landcover':
      return <Earth size={18} strokeWidth={1.8} className="model-row-icon" />;
    default:
      return <Bot size={18} strokeWidth={1.8} className="model-row-icon" />;
  }
}

function ModelStatus({ registry = [], defaultOpen }) {
  const [open, setOpen] = useState(() => (defaultOpen !== undefined ? defaultOpen : (typeof window !== 'undefined' ? window.innerWidth >= 768 : true)));
  const models = registry.length
    ? registry
    : [{ name: 'geochat' }, { name: 'change' }, { name: 'optical_sar' }];

  const formatName = (name) => {
    if (name === 'geochat') return 'GeoChat';
    if (name === 'change') return 'Change detection';
    if (name === 'optical_sar') return 'Optical-SAR';
    if (name === 'disaster') return 'Disaster detection';
    if (name === 'landcover') return 'Land-cover';
    return name;
  };

  return (
    <div className={`scene-section scene-models-section ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        className="sec-title sec-title-collapsible"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sec-title-label">✦ AI MODELS</span>
        <span className="sec-meta">
          <span>{models.length} online</span>
          {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
        </span>
      </button>
      {open && (
        <div className="model-status-list">
          {models.map((m) => (
            <div key={m.name} className="model-status-item">
              <span className="model-name">
                {getModelIcon(m.name)}
                <span>{formatName(m.name)}</span>
              </span>
              <span className="model-status-pill online">
                <i className="status-dot online" />
                Online
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BenchmarkPanel({ data, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!data) return null;
  const ft = data.fine_tune || {};
  return (
    <div className="scene-section bench-section">
      <button
        type="button"
        className="sec-title bench-head sec-title-collapsible"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sec-title-label">
          <ChartNoAxesCombined size={14} strokeWidth={1.8} />
          BENCHMARKS
        </span>
        <span className="sec-meta">
          <span>{open ? 'hide' : 'show'}</span>
          {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
        </span>
      </button>
      {open && (
        <div className="bench-body">
          <div className="bench-ft">Fine-tune <b>{ft.train_samples_before}→{ft.train_samples_after}</b> samples · loss <b>{ft.loss_start}→{ft.loss_end}</b>
            <div className="bench-acc">{ft.accuracy_after != null ? `accuracy ${ft.accuracy_before}→${ft.accuracy_after}` : 'accuracy: pending eval'}</div></div>
          <table className="bench-table"><tbody>
            {(data.models || []).map((r, i) => (
              <tr key={i}><td>{r.task}</td><td className="bm">{r.model}</td><td className="bn">{r.value != null ? r.value : '—'}</td></tr>))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

function SceneInspectorFooter() {
  return (
    <div className="scene-inspector-footer">
      <Clock size={14} strokeWidth={1.8} />
      <span>Background follows IST · day / night imagery crossfades automatically</span>
    </div>
  );
}

/* Kumo-inspired badge (local approximation, not the official package). */
function KBadge({ tone = 'neutral', dot = false, icon, children }) {
  return (
    <span className={`k-badge k-badge-${tone}${dot ? ' is-dot' : ''}`}>
      {dot ? <i className="k-dot" /> : icon ? <DynamicIcon name={icon} size={12} strokeWidth={1.8} /> : null}
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
        <span className="think-done-ic"><Check size={14} strokeWidth={1.8} /></span>
        <span className="think-label">Thought · {taskLabels[task] || task || 'analysis'}</span>
        <span className="think-count">{trace?.length || 0} steps{elapsed != null && ` · ${elapsed.toFixed(1)}s`}</span>
        <ChevronDown size={14} strokeWidth={1.8} className="chev" aria-hidden="true" />
      </summary>
      <ol className="task-rows">
        {(trace || []).map((s, k) => (
          <li key={k} className="task-row">
            <span className="task-ic"><Check size={14} strokeWidth={1.8} /></span>
            <div><strong>{stageLabel(s.stage)}</strong><span>{s.detail}</span></div>
          </li>
        ))}
      </ol>
      {tools?.length > 0 && (
        <div className="tool-chips" aria-label="Models used">
          {tools.map((t) => (
            <span key={t} className="tool-chip"><Cpu size={14} strokeWidth={1.8} />{t}</span>
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
        <ChevronDown size={14} strokeWidth={1.8} className={open ? 'chev open' : 'chev'} aria-hidden="true" />
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
                      ? <Check size={14} strokeWidth={1.8} />
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

/* CRS / GSD / overlap / physical-area chips shown under an answer. */
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

/* Explainable confidence — named dimensions + plain-language reasons. */
function ConfBreakdown({ breakdown }) {
  const pct = (v) => Math.round(Number(v) * 100);
  const dims = [['Model', breakdown.model], ['Evidence quality', breakdown.evidence_quality],
    ['Geospatial validity', breakdown.geospatial_validity]].filter(([, v]) => v != null);
  const o = pct(breakdown.overall);
  const reasons = breakdown.reasons || [];
  return (
    <div className="bot-conf conf-breakdown">
      <div className="conf-top">
        <span className="conf-word">{o >= 60 ? <CheckCircle2 size={16} strokeWidth={1.8} className="conf-icon hi" /> : <CircleAlert size={16} strokeWidth={1.8} className="conf-icon lo" />}{confidenceWord(o)} · {o}%</span>
        <span className="conf-cal" title="Not yet calibrated against ground-truth correctness">{breakdown.calibration_state}</span>
      </div>
      {dims.map(([name, v]) => { const p = pct(v); return (
        <div className="conf-dim" key={name}>
          <span className="conf-dim-name">{name}</span>
          <div className="k-meter sm"><span className={p >= 80 ? 'hi' : p >= 60 ? 'mid' : 'lo'} style={{ width: `${p}%` }} /></div>
          <span className="conf-dim-val">{p}%</span>
        </div>); })}
      {reasons.length > 0 && <ul className="conf-reasons">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </div>
  );
}

/* Evidence Explorer — the derivation chain behind an answer ("Show me why"). */
function WhyPanel({ m }) {
  const [open, setOpen] = useState(false);
  const steps = [['Question', m.question || '—'],
    ['Task · Model', `${taskLabels[m.task] || m.task || 'analysis'} · ${(m.tools || []).join(', ') || '—'}`]];
  if (m.alignment) steps.push(['Alignment', m.alignment.aligned
    ? `${m.alignment.method} → ${m.alignment.target_crs}${m.alignment.overlap_pct != null ? `, ${m.alignment.overlap_pct}% overlap` : ''}`
    : 'pixel-grid (inputs not georeferenced)']);
  if (m.evidence && m.evidence.length) steps.push(['Evidence', m.evidence.map((e) => e.label).filter(Boolean).join('; ')]);
  if (m.area) steps.push(['Measurement', m.area.area_ha != null
    ? `${m.area.pixels.toLocaleString()} px × (${m.area.gsd_m} m)² = ${m.area.area_ha} ha`
    : `${m.area.pixels.toLocaleString()} px = ${m.area.pct}% of scene`]);
  if (m.breakdown && m.breakdown.reasons && m.breakdown.reasons.length) steps.push(['Confidence', m.breakdown.reasons.join(' · ')]);
  return (
    <div className="why-panel">
      <button type="button" className="why-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Show me why</button>
      {open && <ol className="why-chain">{steps.map(([k, v], i) => (
        <li key={i}><span className="why-k">{k}</span><span className="why-v">{v}</span></li>))}</ol>}
    </div>
  );
}

/* One bot card shared by the streaming bubble and the committed message —
 * same order (thinking → answer → meta → evidence → confidence → why → report). */
function BotBubble({ thinking, text, streaming, streamDone, evidence, confidence, breakdown,
                     alignment, area, question, tools, task, reportId, onReport, onExpand, error, live }) {
  return (
    <div className={`bubble${error ? ' error' : ''}${live ? ' live' : ''}`}>
      {thinking}
      {text != null && (
        <p className="bot-answer">
          {text}
          {streaming && <span className={`stream-caret${streamDone ? ' is-done' : ''}`} aria-hidden="true" />}
        </p>
      )}
      {!error && <MetaRibbon alignment={alignment} area={area} />}
      {evidence && evidence.length > 0 && (
        <div className="bot-evidence">
          {evidence.map((e, k) => <ZoomImage key={k} evidence src={`data:image/png;base64,${e.image_b64}`} caption={e.label || 'Evidence overlay'} onExpand={onExpand} />)}
        </div>
      )}
      {breakdown ? <ConfBreakdown breakdown={breakdown} /> : (confidence != null && (() => { const pct = Math.round(Number(confidence) * 100); return (
        <div className="bot-conf">
          <div className="conf-top">
            <span className="conf-word">{pct >= 60 ? <CheckCircle2 size={16} strokeWidth={1.8} className="conf-icon hi" /> : <CircleAlert size={16} strokeWidth={1.8} className="conf-icon lo" />}{confidenceWord(pct)} · {pct}%</span>
            {task && <KBadge tone="info">{taskLabels[task] || task}</KBadge>}
          </div>
          <div className="k-meter sm"><span className={pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo'} style={{ width: `${pct}%` }} /></div>
        </div>
      ); })())}
      {!error && (breakdown || area || alignment) && (
        <WhyPanel m={{ question, task, tools, alignment, area, breakdown, evidence }} />
      )}
      {reportId && (
        <button type="button" className="report-btn" onClick={() => onReport(reportId)}>
          <FileDown size={16} strokeWidth={1.8} /> Full report · PDF / HTML
        </button>
      )}
    </div>
  );
}

function SuggestionToolbar({
  suggestions = [],
  suggestLoading = false,
  showSuggestions = true,
  onToggleSuggestions,
  onSelectSuggestion,
  loading = false,
}) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    // Support horizontal wheel/trackpad scrolling
    const handleWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY !== 0) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [suggestions, showSuggestions]);

  const scrollByAmount = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div
      className={`suggest-toolbar ${showSuggestions ? 'is-open' : 'is-collapsed'} ${
        canScrollLeft ? 'has-scroll-left' : ''
      } ${canScrollRight ? 'has-scroll-right' : ''}`}
    >
      <div className="suggest-toolbar-header">
        <span className="suggest-toolbar-label">
          <Sparkles size={12} strokeWidth={2} /> Suggested queries
        </span>
        <div className="suggest-toolbar-actions">
          {showSuggestions && (
            <div className="suggest-nav-controls">
              <button
                type="button"
                className="suggest-nav-btn"
                onClick={() => scrollByAmount('left')}
                disabled={!canScrollLeft}
                title="Scroll suggestions left"
                aria-label="Scroll suggestions left"
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="suggest-nav-btn"
                onClick={() => scrollByAmount('right')}
                disabled={!canScrollRight}
                title="Scroll suggestions right"
                aria-label="Scroll suggestions right"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          )}
          <button
            type="button"
            className="suggest-toggle-btn"
            onClick={onToggleSuggestions}
            title={showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
            aria-label={showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
          >
            {showSuggestions ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronUp size={14} strokeWidth={2} />}
          </button>
        </div>
      </div>
      {showSuggestions && (
        <div className="suggest-scroll-wrapper">
          <div className="suggest-scroll-row" ref={scrollRef}>
            {suggestLoading && !suggestions.length ? (
              <span className="suggest-loading">Reading scene context…</span>
            ) : (
              suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="suggest-chip"
                  onClick={() => onSelectSuggestion(q)}
                  disabled={loading}
                  title={q}
                >
                  <Sparkles size={13} strokeWidth={1.8} />
                  <span>{q}</span>
                </button>
              ))
            )}
          </div>
        </div>
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
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // live SSE run: { steps, t0, answer, answerDone }
  const [status, setStatus] = useState('checking');
  const [live, setLive] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [mobileTab, setMobileTab] = useState('inspector');
  const [chatExpanded, setChatExpanded] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('satquery-theme', theme);
  }, [theme]);

  useEffect(() => { loadHealth(); loadRegistry(); loadBenchmark(); }, []);
  async function loadBenchmark() {
    try { setBenchmark(await (await fetch('/api/benchmark')).json()); } catch { /* ignore */ }
  }
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);
  const pinBottom = () => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; };

  function generateFollowUps(lastTask, lastAnswer, fileCount) {
    const text = (lastAnswer || '').toLowerCase();
    const list = [];
    const add = (q) => { if (!list.includes(q)) list.push(q); };

    if (lastTask === 'single_caption' || lastTask === 'single_vqa') {
      if (text.includes('water') || text.includes('river') || text.includes('lake') || text.includes('flood')) {
        add('Highlight the water body.');
        add('Predict flood risk and disaster impact from this scene.');
      }
      if (text.includes('building') || text.includes('urban') || text.includes('city') || text.includes('settlement')) {
        add('Highlight the buildings.');
        add('Is this a rural or an urban area?');
      }
      if (text.includes('road') || text.includes('highway') || text.includes('street')) {
        add('Where are the roads in this image?');
      }
      if (text.includes('forest') || text.includes('vegetation') || text.includes('crop') || text.includes('agriculture')) {
        add('Is there significant vegetation or cropland?');
      }
    } else if (lastTask === 'single_grounding') {
      add('Describe the land cover in and around these highlighted areas.');
      add('Is this area prone to seasonal flood risk?');
    } else if (lastTask === 'disaster_risk') {
      add('Highlight the critical infrastructure and buildings in risk zones.');
      add('Describe evacuation and accessibility routes visible here.');
    } else if (lastTask === 'change_vqa' || lastTask === 'change_map' || lastTask === 'cross_modal') {
      add('What are the primary environmental impacts of these observed changes?');
      add('Highlight new buildings or cleared land in the recent image.');
    }

    if (fileCount > 1) {
      add('What changed between these two images and where?');
    }

    const fallbacks = [
      'Describe the land cover and major objects.',
      'Highlight the water body.',
      'Highlight the buildings.',
      'Predict flood risk and disaster impact from this scene.',
    ];
    for (const f of fallbacks) {
      if (list.length >= 4) break;
      add(f);
    }
    return list.slice(0, 4);
  }

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
    setMessages([]); setSuggestions([]); setSessionId(null); setShowSuggestions(true);

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
            breakdown: d.confidence_breakdown, alignment: d.alignment, area: d.area,
            question: text,
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
        breakdown: final.breakdown, alignment: final.alignment, area: final.area,
        question: final.question, tools: final.tools,
      } : p));
      pinBottom();
      await new Promise((res) => window.setTimeout(res, 650));
      setMessages((m) => [...m, { role: 'bot', ...final }]);
      setSuggestions(generateFollowUps(final.task, final.text || final.answer, files.length));
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
            breakdown: d.confidence_breakdown, alignment: d.alignment, area: d.area,
            question: text,
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
          setSuggestions(generateFollowUps(fb.task, fb.text, files.length));
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
    <div className={`page theme-${theme} mobile-tab-${mobileTab}${chatExpanded ? ' chat-is-expanded' : ''}`} data-theme={theme} data-mobile-tab={mobileTab}>
      <IndiaBackground theme={theme} />
      <div className="tricolor" />

      {/* Top Mobile Header (< 768px) */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <img src="/logo/logo.png" alt="SatqueryAI" className="mobile-logo-img" />
          <span className="mobile-app-name">SatqueryAI</span>
        </div>
        <div className="mobile-header-actions">
          <button
            type="button"
            className="mobile-header-btn"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
          </button>
        </div>
      </header>

      <input id="scene-upload" ref={fileInputRef} className="file-input" type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg" multiple onChange={(e) => startSession(e.target.files)} />
      <input id="scene-add" ref={addSceneInputRef} className="file-input" type="file"
        accept=".tif,.tiff,.png,.jpg,.jpeg" onChange={(e) => addScene(e.target.files)} />

      <main className={`workspace mobile-tab-${mobileTab}`}>
        {/* LEFT: Product Identity & Scene Inspector Panel */}
        <section className="glass scene-card scene-inspector" aria-label="Earth Observation Scene Inspector" style={{ '--d': '0ms' }}>
          <ProductHeader
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          />

          <div className="scene-scroll-body">
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

            <BenchmarkPanel data={benchmark} />

            <SceneInspectorFooter />
          </div>
        </section>

        {/* RIGHT: AI Assistant / Conversational Workspace */}
        <section className="glass chat-card" aria-label="AI Assistant" style={{ '--d': '90ms' }}>
          <div className="card-head">
            <div className="ai-assistant-head">
              <p className="kicker">✦ AI ASSISTANT</p>
              <h2>Conversation</h2>
            </div>
            <div className="card-head-actions">
              {lastReportId && (
                <button
                  type="button"
                  className="report-head-btn"
                  onClick={() => openReport(lastReportId)}
                  title="Export analysis report"
                  aria-label="Export analysis report"
                >
                  <FileDown size={17} strokeWidth={1.8} />
                </button>
              )}
              {lastReportId && <span className="card-head-divider" aria-hidden="true" />}
              <button
                type="button"
                className="chat-expand-btn"
                onClick={() => setChatExpanded((e) => !e)}
                title={chatExpanded ? "Exit full screen" : "Expand full screen"}
                aria-label={chatExpanded ? "Exit full screen" : "Expand full screen"}
              >
                {chatExpanded ? (
                  <Minimize2 size={17} strokeWidth={1.8} />
                ) : (
                  <Maximize2 size={17} strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>

          <div className="chat-thread" ref={threadRef}>
            {!hasScene && (
              <div className="empty-state empty-state-lottie">
                <LottieAnimation path="/animation/lootie-loop.json" />
              </div>
            )}
            {hasScene && messages.length === 0 && !loading && (
              <div className="thread-hint">
                <MessageSquare size={16} strokeWidth={1.8} />
                Ask your query below or tap a suggestion to start
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
                  breakdown={m.breakdown} alignment={m.alignment} area={m.area}
                  question={m.question} tools={m.tools}
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
                  breakdown={pending.breakdown} alignment={pending.alignment} area={pending.area}
                  question={pending.question} tools={pending.tools}
                  reportId={pending.reportId} onReport={openReport} onExpand={setViewer}
                />
              </div>
            )}
          </div>

          {/* Unified Composer Container */}
          <div className="chat-composer">
            {hasScene && (suggestions.length > 0 || suggestLoading) && (
              <SuggestionToolbar
                suggestions={suggestions}
                suggestLoading={suggestLoading}
                showSuggestions={showSuggestions}
                onToggleSuggestions={() => setShowSuggestions((s) => !s)}
                onSelectSuggestion={(q) => ask(q)}
                loading={loading}
              />
            )}

            {/* Prompt bar — beautifului prompt-bar language, kumo input shape */}
            <div className="promptbar">
              <span className="prompt-ctx" title="Scene attached">
                <ImageIcon size={14} strokeWidth={1.8} />{hasScene ? `${files.length} scene${files.length > 1 ? 's' : ''}` : 'no scene'}
              </span>
              <input
                type="text" value={input}
                placeholder={hasScene ? 'Ask about this scene…' : 'Add an image first…'}
                disabled={!hasScene}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
                aria-label="Ask about the scene"
              />
              <span className="prompt-model" title="Active models"><Cpu size={14} strokeWidth={1.8} />{registry.length || 3}</span>
              <button
                type="button"
                className="prompt-voice-btn"
                title="Voice input (coming soon)"
                aria-label="Voice input"
                disabled
              >
                <Mic size={15} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="k-btn k-btn-primary send"
                onClick={() => ask()}
                disabled={loading || !hasScene || !input.trim()}
                aria-label="Send message"
              >
                {loading ? (
                  <LoaderCircle size={16} strokeWidth={1.8} className="sq-spin" />
                ) : (
                  <>
                    <ArrowUp size={16} strokeWidth={2.2} />
                    <span>Ask</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Persistent Mobile Bottom Navigation Bar (< 768px): Only Inspector and Chat */}
      <nav className="mobile-bottom-nav" aria-label="Main Navigation">
        <button
          type="button"
          className={`mobile-nav-item ${mobileTab === 'inspector' ? 'is-active' : ''}`}
          onClick={() => setMobileTab('inspector')}
          aria-label="Scene Inspector"
        >
          <div className="nav-icon-badge-wrap">
            <Layers size={20} strokeWidth={mobileTab === 'inspector' ? 2.2 : 1.8} />
            {files.length > 0 && <span className="mobile-nav-badge">{files.length}</span>}
          </div>
          <span>Inspector</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${mobileTab === 'chat' ? 'is-active' : ''}`}
          onClick={() => setMobileTab('chat')}
          aria-label="AI Chat"
        >
          <div className="nav-icon-badge-wrap">
            <MessageSquare size={20} strokeWidth={mobileTab === 'chat' ? 2.2 : 1.8} />
            {messages.length > 0 && <span className="mobile-nav-dot" />}
          </div>
          <span>Chat</span>
        </button>
      </nav>

      <footer className="mission-foot">
        <span><Satellite size={14} strokeWidth={1.8} /> SatQuery AI · Agentic vision–language assistant</span>
        <span>ISRO / SAC · PS-26167 · Prototype</span>
      </footer>

      {viewer && <ImageViewer src={viewer.src} label={viewer.label} onClose={() => setViewer(null)} />}
    </div>
  );
}

export default App;
