import { useEffect, useMemo, useRef, useState } from 'react';

const examplePrompts = [
  'Describe the land cover',
  'Is there a water body?',
  'What changed between these dates?',
  'Highlight the affected area',
];

const formatStage = (stage) => stage?.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || 'STEP';

function App() {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('STANDBY');
  const [registry, setRegistry] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadHealth();
    loadRegistry();
  }, []);

  async function loadHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setStatus(data.mock_mode ? 'MOCK MODE' : 'LIVE MODELS');
    } catch {
      setStatus('OFFLINE');
    }
  }

  async function loadRegistry() {
    try {
      const res = await fetch('/api/registry');
      const data = await res.json();
      setRegistry(data.tools || []);
    } catch {
      setRegistry([]);
    }
  }

  const inputSummary = useMemo(() => {
    if (!files.length) return 'No imagery selected';
    if (files.length === 1) return `${files[0].name}`;
    return `${files[0].name} + ${files[1].name}`;
  }, [files]);

  const handleFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []).slice(0, 2);
    setFiles(nextFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (indexToRemove) => {
    setFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const clearAllImages = () => {
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!files.length) {
      alert('Please choose 1 or 2 images.');
      return;
    }
    if (!query.trim()) {
      alert('Please type a question.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('text', query.trim());
    files.forEach((file) => formData.append('images', file));

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      alert(`Request failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const evidence = result?.evidence || [];
  const trace = result?.trace || [];
  const confidencePct = result?.confidence !== undefined && result?.confidence !== null
    ? `${Math.round(Number(result.confidence) * 100)}%`
    : '—';

  return (
    <div className="min-h-screen px-2 py-4 text-text sm:px-4 lg:px-6">
      <div className="mx-auto max-w-[1460px] overflow-hidden border border-white/10 bg-[#0a0f14]/55 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#11171d]/70 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 border border-white/10 bg-[#1b2229]/70 px-2 py-1 text-[10px] font-medium text-muted sm:flex">
              <span className="inline-block h-2 w-2 bg-[#7fc3ff]" />
              <span>Northstar</span>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-[760px] items-center justify-center gap-2 border border-white/10 bg-[#171d23]/70 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">
              <span className="text-white/80">●</span>
              <span>satquery.local</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="border border-white/10 bg-[#1a2128]/70 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-muted">
              {status}
            </div>
            <button
              type="button"
              className="border border-white/10 bg-[#1a2128]/70 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-muted hover:border-white/30 hover:text-text"
              onClick={loadRegistry}
            >
              Models
            </button>
          </div>
        </header>

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="grid min-h-[calc(100vh-120px)] grid-cols-1 gap-4 xl:grid-cols-[335px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-4 border border-white/10 bg-[#0d1319]/55 p-3 shadow-subtle">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Input</div>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{files.length}/2</div>
                  {files.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllImages}
                      className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted hover:text-text"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="group flex min-h-[170px] cursor-pointer flex-col items-center justify-center border border-dashed border-border bg-[#1a2128]/60 px-4 text-center text-sm text-muted hover:border-white/30 hover:text-text">
                  <input ref={fileInputRef} type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" multiple className="hidden" onChange={handleFileChange} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Add imagery</span>
                  <span className="mt-3 text-base text-text">Upload 1–2 images</span>
                </label>

                <div className="space-y-2">
                  {files.length ? (
                    files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center gap-3 border border-white/10 bg-[#0b1218]/70 p-2">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="h-16 w-16 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-text">{file.name}</div>
                          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Image {index + 1}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="border border-white/10 bg-white/5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted hover:border-white/30 hover:text-text"
                          aria-label={`Remove ${file.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="border border-white/10 bg-[#1a2128]/60 p-3 text-xs text-muted">
                      No imagery selected.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Task / mode</div>
                <div className="border border-white/10 bg-[#1a2128]/60 p-3 text-sm text-text">
                  {result?.task ? result.task.replace(/_/g, ' ').toUpperCase() : 'Awaiting detection'}
                </div>
              </div>

              <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Model</div>
                <div className="border border-white/10 bg-[#1a2128]/60 p-3 text-sm text-text">
                  {result?.tools_used?.length ? result.tools_used.join(', ') : 'Auto-selected by agent'}
                </div>
              </div>

              <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Command</div>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={5}
                  placeholder="Ask Northstar about this imagery..."
                  className="w-full resize-none border border-white/10 bg-[#1a2128]/60 p-3 text-sm text-text placeholder:text-muted outline-none focus:border-white/30"
                />

                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="border border-white/10 bg-[#0d141b]/70 px-2.5 py-1.5 text-[11px] text-muted hover:border-white/30 hover:text-text"
                      onClick={() => setQuery(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full border border-[#7fc3ff]/40 bg-[#7fc3ff]/90 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#06131d] shadow-[0_0_0_1px_rgba(127,195,255,0.25)] hover:bg-[#8ed0ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Processing...' : 'Run query'}
                </button>
              </div>
            </aside>

            <section className="flex flex-col gap-4">
              <div className="border border-white/10 bg-[#0d1319]/55 p-3 shadow-subtle">
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Imagery workspace</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{inputSummary}</div>
                </div>

                <div className="min-h-[420px] border border-white/10 bg-[#060b10]/60 p-3">
                  {files.length ? (
                    <div className="grid h-full min-h-[380px] gap-4 md:grid-cols-2">
                      {files.map((file, index) => (
                        <div key={`${file.name}-view-${index}`} className="group relative overflow-hidden border border-white/10 bg-[#0c1319]/70">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute left-3 top-3 border border-white/10 bg-[#111a22]/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text">
                            {index === 0 ? 'Image 01' : 'Image 02'}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute right-3 top-3 border border-white/10 bg-[#111a22]/80 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted opacity-0 transition group-hover:opacity-100 hover:text-text"
                            aria-label={`Remove ${file.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[380px] items-center justify-center text-sm text-muted">
                      Imagery will appear here after upload.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="border border-white/10 bg-[#0d1319]/55 p-4 shadow-subtle">
                  <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Analysis</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{result ? 'Result' : 'Waiting'}</div>
                  </div>

                  <div className="space-y-4">
                    <div className="border border-white/10 bg-[#1a2128]/60 p-4">
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Answer</div>
                      <div className="mt-3 text-lg leading-relaxed text-text">
                        {result?.answer || 'Awaiting analysis output.'}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="border border-white/10 bg-[#1a2128]/60 p-4">
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Confidence</div>
                        <div className="mt-3 text-3xl font-semibold text-text">{confidencePct}</div>
                      </div>

                      <div className="border border-white/10 bg-[#1a2128]/60 p-4">
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Task / Tool</div>
                        <div className="mt-3 text-sm text-text">
                          {result?.task ? result.task.replace(/_/g, ' ').toUpperCase() : '—'}
                        </div>
                        <div className="mt-2 text-xs text-muted">
                          {result?.tools_used?.length ? result.tools_used.join(', ') : '—'}
                        </div>
                      </div>
                    </div>

                    {result?.report_id && (
                      <div className="border border-white/10 bg-[#1a2128]/60 p-3">
                        <a
                          href={`/api/report/${result.report_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7fc3ff] hover:text-[#a8d9ff]"
                        >
                          Download report
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-white/10 bg-[#0d1319]/55 p-4 shadow-subtle">
                  <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Model registry</div>
                  </div>

                  <div className="space-y-3">
                    {registry.length ? registry.map((tool) => (
                      <div key={tool.name} className="border border-white/10 bg-[#1a2128]/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-text">{tool.name}</div>
                          <div className="h-2 w-2 bg-success" />
                        </div>
                        <div className="mt-2 text-[11px] text-muted">{tool.tasks?.join(' · ') || 'task set'}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{tool.input_type}</div>
                      </div>
                    )) : (
                      <div className="border border-white/10 bg-[#1a2128]/60 p-3 text-sm text-muted">
                        Registry unavailable.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border border-white/10 bg-[#0d1319]/55 p-4 shadow-subtle">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Evidence</div>
                </div>

                {evidence.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {evidence.map((item, index) => (
                      <div key={`${item.kind}-${index}`} className="overflow-hidden border border-white/10 bg-[#1a2128]/60">
                        {item.image_b64 ? (
                          <img src={`data:image/png;base64,${item.image_b64}`} alt={item.label || 'evidence'} className="h-52 w-full object-cover" />
                        ) : null}
                        <div className="border-t border-border p-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                          {item.label || item.kind || 'evidence'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted">No evidence returned yet.</div>
                )}
              </div>

              <div className="border border-white/10 bg-[#0d1319]/55 p-4 shadow-subtle">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Agent activity</div>
                </div>

                {trace.length ? (
                  <ol className="space-y-3">
                    {trace.map((step, index) => (
                      <li key={`${step.stage}-${index}`} className="border border-white/10 bg-[#1a2128]/60 p-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2.5 w-2.5 bg-success" />
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text">{formatStage(step.stage)}</span>
                        </div>
                        <div className="mt-2 text-sm text-text">{step.detail}</div>
                        {step.data && Object.keys(step.data).length ? (
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap border border-white/10 bg-[#08111b]/80 p-2 font-mono text-[10px] leading-relaxed text-muted">
                            {JSON.stringify(step.data, null, 2)}
                          </pre>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-sm text-muted">Execution trace will appear here.</div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
