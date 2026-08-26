// SatQuery AI — minimal single-page frontend (no build step).
const $ = (id) => document.getElementById(id);
let files = [];

const EXAMPLES = [
  "Describe the land-cover and major objects visible in this image.",
  "Highlight the water body referred to in the query.",
  "What changed between these two dates, and where did the change occur?",
  "Use the optical and SAR images together to identify built-up and water regions.",
  "Has the built-up area increased, decreased, or remained unchanged?",
];

// ---- boot ----
(async function init() {
  try {
    const h = await (await fetch("/api/health")).json();
    $("mode").textContent = h.mock_mode ? "MOCK MODE" : "LIVE MODELS";
    $("mode").style.color = h.mock_mode ? "var(--accent2)" : "var(--good)";
  } catch { $("mode").textContent = "backend offline"; }
  EXAMPLES.forEach((e) => {
    const c = document.createElement("span");
    c.className = "chip"; c.textContent = e;
    c.onclick = () => { $("query").value = e; };
    $("examples").appendChild(c);
  });
  loadRegistry();
})();

// ---- file picking ----
$("files").addEventListener("change", (ev) => {
  files = Array.from(ev.target.files).slice(0, 2);
  $("dropLabel").textContent = files.length
    ? `${files.length} image(s) selected` : "Click to choose 1–2 images";
  const t = $("thumbs"); t.innerHTML = "";
  files.forEach((f) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f); t.appendChild(img);
  });
});

// ---- run query ----
$("go").addEventListener("click", async () => {
  const text = $("query").value.trim();
  if (!files.length) return alert("Please choose 1 or 2 images.");
  if (!text) return alert("Please type a question.");
  $("go").disabled = true; $("go").textContent = "Running…";
  const fd = new FormData();
  fd.append("text", text);
  files.forEach((f) => fd.append("images", f));
  try {
    const r = await fetch("/api/query", { method: "POST", body: fd });
    const data = await r.json();
    render(data);
  } catch (e) {
    alert("Request failed: " + e);
  } finally {
    $("go").disabled = false; $("go").textContent = "Run SatQuery";
  }
});

// ---- render result ----
function render(d) {
  $("result").classList.remove("hidden");
  $("answer").innerHTML = d.answer || "(no answer)";
  $("answer").className = "answer" + (d.ok ? "" : " err");
  $("conf").textContent = d.ok ? Math.round((d.confidence || 0) * 100) + "%" : "—";
  $("task").textContent = d.task || "—";
  $("tools").textContent = (d.tools_used || []).join(", ") || "—";

  const rep = $("report");
  if (d.report_id) { rep.style.display = ""; rep.href = "/api/report/" + d.report_id; }
  else rep.style.display = "none";

  const ev = $("evidence"); ev.innerHTML = "";
  (d.evidence || []).forEach((e) => {
    if (!e.image_b64) return;
    const fig = document.createElement("figure");
    fig.innerHTML = `<img src="data:image/png;base64,${e.image_b64}">
      <figcaption>${e.label || e.kind}</figcaption>`;
    ev.appendChild(fig);
  });

  const tr = $("trace"); tr.innerHTML = "";
  (d.trace || []).forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="stage">${s.stage}</span> — ${s.detail}` +
      (s.data && Object.keys(s.data).length
        ? `<span class="data">${JSON.stringify(s.data)}</span>` : "");
    tr.appendChild(li);
  });
}

// ---- registry viewer + live reload (the demo moment) ----
async function loadRegistry() {
  try {
    const d = await (await fetch("/api/registry")).json();
    const box = $("registry"); box.innerHTML = "";
    d.tools.forEach((t) => {
      const el = document.createElement("div");
      el.className = "rtool";
      el.innerHTML = `<div class="rn">${t.name}</div>
        <div class="rt">tasks: ${t.tasks.join(", ")}<br>input: ${t.input_type}</div>`;
      box.appendChild(el);
    });
  } catch { /* backend offline */ }
}
$("reload").addEventListener("click", async () => {
  await fetch("/api/reload-registry", { method: "POST" });
  loadRegistry();
});
