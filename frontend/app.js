const $ = (id) => document.getElementById(id);
let files = [];

function resetPanels() {
  const evidence = $("evidence");
  const trace = $("trace");
  const visualPanel = $("visualPanel");
  const logPanel = $("logPanel");
  const reportWrap = $("reportWrap");

  if (evidence) evidence.innerHTML = "";
  if (trace) trace.innerHTML = "";
  if (visualPanel) visualPanel.classList.add("hidden");
  if (logPanel) logPanel.classList.add("hidden");
  if (reportWrap) reportWrap.classList.add("hidden");

  $("answer").textContent = "";
  $("conf").textContent = "";
  $("task").textContent = "";
  $("tools").textContent = "";
  $("report").href = "#";
}

async function init() {
  resetPanels();
  try {
    const health = await fetch("/api/health");
    const data = await health.json();
    $("mode").textContent = data.mock_mode ? "MOCK MODE" : "LIVE MODELS";
  } catch (error) {
    $("mode").textContent = "OFFLINE";
  }
}

$("files").addEventListener("change", (event) => {
  files = Array.from(event.target.files).slice(0, 2);
  $("dropLabel").textContent = files.length ? `${files.length} image(s) selected` : "Select 1–2 images";

  const thumbs = $("thumbs");
  thumbs.innerHTML = "";

  files.forEach((file) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    thumbs.appendChild(img);
  });
});

$("go").addEventListener("click", async () => {
  const text = $("query").value.trim();

  if (!files.length) {
    alert("Please choose 1 or 2 images.");
    return;
  }

  if (!text) {
    alert("Please type a question.");
    return;
  }

  $("go").disabled = true;
  $("go").textContent = "RUNNING";

  const formData = new FormData();
  formData.append("text", text);
  files.forEach((file) => formData.append("images", file));

  try {
    const response = await fetch("/api/query", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    renderResult(data);
  } catch (error) {
    alert("Request failed: " + error);
  } finally {
    $("go").disabled = false;
    $("go").textContent = "RUN QUERY";
  }
});

function renderResult(data) {
  resetPanels();

  if (!data || typeof data !== "object") {
    return;
  }

  const logPanel = $("logPanel");
  const visualPanel = $("visualPanel");

  if (data.answer || data.task || data.tools_used || data.confidence !== undefined || Array.isArray(data.trace)) {
    logPanel.classList.remove("hidden");

    if (data.answer) {
      $("answer").textContent = data.answer;
    }

    if (data.confidence !== undefined && data.confidence !== null) {
      $("conf").textContent = `${Math.round(data.confidence * 100)}%`;
    }

    if (data.task) {
      $("task").textContent = data.task;
    }

    if (Array.isArray(data.tools_used) && data.tools_used.length) {
      $("tools").textContent = data.tools_used.join(", ");
    }

    if (data.report_id) {
      $("report").href = `/api/report/${data.report_id}`;
      $("reportWrap").classList.remove("hidden");
    }

    if (Array.isArray(data.trace) && data.trace.length) {
      const traceList = $("trace");
      data.trace.forEach((step) => {
        const item = document.createElement("li");
        const stage = document.createElement("span");
        stage.className = "trace-stage";
        stage.textContent = step.stage || "STEP";

        const text = document.createElement("span");
        text.textContent = ` — ${step.detail || ""}`;

        item.appendChild(stage);
        item.appendChild(text);

        if (step.data && Object.keys(step.data).length) {
          const meta = document.createElement("span");
          meta.className = "trace-data";
          meta.textContent = JSON.stringify(step.data, null, 2);
          item.appendChild(meta);
        }

        traceList.appendChild(item);
      });
    }
  }

  if (Array.isArray(data.evidence) && data.evidence.length) {
    visualPanel.classList.remove("hidden");
    const evidenceWrap = $("evidence");

    data.evidence.forEach((item) => {
      if (!item || !item.image_b64) return;

      const card = document.createElement("figure");
      card.className = "evidence-card";

      const img = document.createElement("img");
      img.src = `data:image/png;base64,${item.image_b64}`;
      img.alt = item.label || item.kind || "Evidence image";

      const meta = document.createElement("figcaption");
      meta.className = "evidence-meta";
      meta.textContent = item.label || item.kind || "Evidence";

      card.appendChild(img);
      card.appendChild(meta);
      evidenceWrap.appendChild(card);
    });
  }
}

init();
