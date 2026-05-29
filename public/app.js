const state = {
  palmMetrics: null,
  faceMetrics: null,
  latestReading: null
};

const elements = {
  form: document.querySelector("#readingForm"),
  formMessage: document.querySelector("#formMessage"),
  report: document.querySelector("#report"),
  emptyState: document.querySelector("#emptyState"),
  energyCanvas: document.querySelector("#energyCanvas"),
  palmInput: document.querySelector("#palmImage"),
  faceInput: document.querySelector("#faceImage"),
  palmPreview: document.querySelector("#palmPreview"),
  facePreview: document.querySelector("#facePreview"),
  palmStatus: document.querySelector("#palmStatus"),
  faceStatus: document.querySelector("#faceStatus")
};

const elementPalette = {
  木: "#406b4e",
  火: "#a84e3d",
  土: "#b4853b",
  金: "#6e7474",
  水: "#2f5f7a"
};

drawEnergyCanvas(null);

elements.palmInput.addEventListener("change", async (event) => {
  await handleImage(event.target.files[0], "palm");
});

elements.faceInput.addEventListener("change", async (event) => {
  await handleImage(event.target.files[0], "face");
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.form.querySelector("button");
  const formData = new FormData(elements.form);

  const payload = {
    profile: {
      name: String(formData.get("name") || "").trim(),
      gender: formData.get("gender"),
      birthDate: formData.get("birthDate"),
      birthHour: Number(formData.get("birthHour")),
      birthplace: String(formData.get("birthplace") || "").trim()
    },
    palmMetrics: state.palmMetrics,
    faceMetrics: state.faceMetrics
  };

  if (!payload.profile.birthDate) {
    showMessage("请先填写出生日期。", true);
    return;
  }

  button.disabled = true;
  showMessage("正在生成报告...");

  try {
    const response = await fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "生成失败");
    }
    state.latestReading = data.reading;
    renderReport(data.reading);
    drawEnergyCanvas(data.reading.elements);
    showMessage("报告已生成。");
  } catch (error) {
    showMessage(error.message || "生成失败，请稍后重试。", true);
  } finally {
    button.disabled = false;
  }
});

async function handleImage(file, type) {
  if (!file) return;

  const canvas = type === "palm" ? elements.palmPreview : elements.facePreview;
  const status = type === "palm" ? elements.palmStatus : elements.faceStatus;
  status.textContent = "分析中...";

  try {
    const bitmap = await createImageBitmap(file);
    const metrics = analyzeBitmap(bitmap, canvas, type);
    if (type === "palm") {
      state.palmMetrics = metrics;
      status.textContent = `线纹 ${Math.round(metrics.lineDensity * 100)} · 对比 ${Math.round(metrics.contrast * 100)}`;
    } else {
      state.faceMetrics = metrics;
      status.textContent = `光感 ${Math.round(metrics.brightness * 100)} · 均衡 ${Math.round(metrics.symmetry * 100)}`;
    }
  } catch {
    status.textContent = "图片读取失败";
  }
}

function analyzeBitmap(bitmap, previewCanvas, type) {
  const ctx = previewCanvas.getContext("2d", { willReadFrequently: true });
  const scale = Math.min(previewCanvas.width / bitmap.width, previewCanvas.height / bitmap.height);
  const width = Math.max(1, Math.floor(bitmap.width * scale));
  const height = Math.max(1, Math.floor(bitmap.height * scale));
  const offsetX = Math.floor((previewCanvas.width - width) / 2);
  const offsetY = Math.floor((previewCanvas.height - height) / 2);

  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  drawPreviewBackground(ctx, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(bitmap, offsetX, offsetY, width, height);

  const sampleCanvas = document.createElement("canvas");
  const sampleSize = 96;
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
  const imageData = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
  const data = imageData.data;

  let brightness = 0;
  let red = 0;
  let blue = 0;
  let variance = 0;
  const grays = new Float32Array(sampleSize * sampleSize);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const index = i / 4;
    grays[index] = gray;
    brightness += gray;
    red += r;
    blue += b;
  }

  const pixels = data.length / 4;
  const averageBrightness = brightness / pixels;

  for (const gray of grays) {
    variance += Math.pow(gray - averageBrightness, 2);
  }

  const contrast = Math.sqrt(variance / pixels) / 128;
  const warmth = (red / pixels - blue / pixels + 255) / 510;
  const edgeDensity = computeEdgeDensity(grays, sampleSize, sampleSize);
  const symmetry = computeVerticalSymmetry(grays, sampleSize, sampleSize);

  const metrics = {
    brightness: normalize(averageBrightness, 0, 255),
    contrast: clamp(contrast),
    warmth: clamp(warmth),
    edgeDensity,
    symmetry
  };

  if (type === "palm") {
    metrics.lineDensity = clamp(edgeDensity * 1.18 + contrast * 0.2);
  }

  return metrics;
}

function drawPreviewBackground(ctx, width, height) {
  ctx.fillStyle = "#f8f3e8";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(47, 95, 122, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function computeEdgeDensity(grays, width, height) {
  let edges = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = grays[i + 1] - grays[i - 1];
      const gy = grays[i + width] - grays[i - width];
      const gradient = Math.sqrt(gx * gx + gy * gy);
      if (gradient > 32) edges += 1;
      count += 1;
    }
  }
  return clamp(edges / Math.max(1, count) * 3.2);
}

function computeVerticalSymmetry(grays, width, height) {
  let diff = 0;
  let count = 0;
  const half = Math.floor(width / 2);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < half; x += 2) {
      const left = grays[y * width + x];
      const right = grays[y * width + (width - 1 - x)];
      diff += Math.abs(left - right);
      count += 1;
    }
  }
  return clamp(1 - diff / Math.max(1, count) / 150);
}

function renderReport(reading) {
  elements.emptyState.classList.add("hidden");
  elements.report.classList.remove("hidden");

  const pillarHtml = reading.bazi.pillars
    .map(
      (pillar) => `
        <div class="pillar">
          <small>${pillar.label}</small>
          <strong>${pillar.name}</strong>
          <small>${pillar.stem.element}${pillar.branch.element} · ${pillar.animal}</small>
        </div>
      `
    )
    .join("");

  const elementHtml = Object.entries(reading.elements)
    .map(
      ([element, value]) => `
        <li class="metric-item">
          <strong>${element}</strong>
          <span class="bar"><span style="width:${Math.round(value * 100)}%; background:${elementPalette[element]}"></span></span>
          <span>${Math.round(value * 100)}</span>
        </li>
      `
    )
    .join("");

  const suggestions = reading.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const luckyColors = reading.lucky.colors.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");

  elements.report.innerHTML = `
    <article class="report-card wide accent-green">
      <p class="eyebrow">Overview</p>
      <h2>${escapeHtml(reading.headline)}</h2>
      <p>${escapeHtml(reading.overview[0])}</p>
      <p>${escapeHtml(reading.overview[1])}</p>
      <div class="tag-row">
        <span class="tag">幸运数 ${reading.lucky.number}</span>
        <span class="tag">方位 ${reading.lucky.direction}</span>
        <span class="tag">关键词 ${escapeHtml(reading.lucky.keyword)}</span>
      </div>
    </article>

    <article class="report-card accent-red">
      <p class="eyebrow">BaZi</p>
      <h3>生辰八字</h3>
      <div class="pillars">${pillarHtml}</div>
      <p>${escapeHtml(reading.bazi.note)}</p>
    </article>

    <article class="report-card accent-blue">
      <p class="eyebrow">Elements</p>
      <h3>五行分布</h3>
      <ul class="metric-list">${elementHtml}</ul>
    </article>

    <article class="report-card compact">
      <p class="eyebrow">Palm</p>
      <h3>${escapeHtml(reading.palm.title)}</h3>
      <p>${escapeHtml(reading.palm.summary)}</p>
      <p>${escapeHtml(reading.palm.details.join(" "))}</p>
      <div class="tag-row"><span class="tag">${escapeHtml(reading.palm.focus)}</span></div>
    </article>

    <article class="report-card compact">
      <p class="eyebrow">Face</p>
      <h3>${escapeHtml(reading.face.title)}</h3>
      <p>${escapeHtml(reading.face.summary)}</p>
      <p>${escapeHtml(reading.face.details.join(" "))}</p>
      <div class="tag-row"><span class="tag">${escapeHtml(reading.face.focus)}</span></div>
    </article>

    <article class="report-card compact">
      <p class="eyebrow">Lucky</p>
      <h3>今日小签</h3>
      <div class="tag-row">${luckyColors}</div>
      <p>把注意力放在“${escapeHtml(reading.lucky.keyword)}”相关的行动上。</p>
    </article>

    <article class="report-card wide">
      <p class="eyebrow">Next</p>
      <h3>行动建议</h3>
      <ul class="suggestion-list">${suggestions}</ul>
      <p>${escapeHtml(reading.disclaimer)}</p>
    </article>
  `;
}

function drawEnergyCanvas(scores) {
  const canvas = elements.energyCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2 + 8;
  const radius = Math.min(width, height) * 0.31;
  const labels = ["木", "火", "土", "金", "水"];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fdfbf5";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(31, 36, 40, 0.11)";
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    polygonPath(ctx, centerX, centerY, (radius / 4) * ring, labels.length);
    ctx.stroke();
  }

  labels.forEach((label, index) => {
    const angle = angleFor(index, labels.length);
    const x = centerX + Math.cos(angle) * (radius + 34);
    const y = centerY + Math.sin(angle) * (radius + 34);
    ctx.fillStyle = elementPalette[label];
    ctx.font = "700 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
  });

  const values = labels.map((label) => scores?.[label] ?? 0.55);
  ctx.beginPath();
  values.forEach((value, index) => {
    const angle = angleFor(index, labels.length);
    const x = centerX + Math.cos(angle) * radius * value;
    const y = centerY + Math.sin(angle) * radius * value;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(64, 107, 78, 0.24)";
  ctx.fill();
  ctx.strokeStyle = "#406b4e";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#1f2428";
  ctx.font = "800 26px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("五行能量图", 28, 42);
  ctx.fillStyle = "#66706a";
  ctx.font = "14px sans-serif";
  ctx.fillText(scores ? "已根据生辰与照片特征生成" : "等待生成报告", 30, 68);
}

function polygonPath(ctx, centerX, centerY, radius, sides) {
  ctx.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = angleFor(index, sides);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function angleFor(index, total) {
  return -Math.PI / 2 + (Math.PI * 2 * index) / total;
}

function showMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "#a84e3d" : "#66706a";
}

function normalize(value, min, max) {
  return clamp((value - min) / (max - min));
}

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
