const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_SIZE = 1024 * 1024;

const STEMS = [
  { zh: "甲", pinyin: "Jia", element: "木", polarity: "阳" },
  { zh: "乙", pinyin: "Yi", element: "木", polarity: "阴" },
  { zh: "丙", pinyin: "Bing", element: "火", polarity: "阳" },
  { zh: "丁", pinyin: "Ding", element: "火", polarity: "阴" },
  { zh: "戊", pinyin: "Wu", element: "土", polarity: "阳" },
  { zh: "己", pinyin: "Ji", element: "土", polarity: "阴" },
  { zh: "庚", pinyin: "Geng", element: "金", polarity: "阳" },
  { zh: "辛", pinyin: "Xin", element: "金", polarity: "阴" },
  { zh: "壬", pinyin: "Ren", element: "水", polarity: "阳" },
  { zh: "癸", pinyin: "Gui", element: "水", polarity: "阴" }
];

const BRANCHES = [
  { zh: "子", animal: "鼠", element: "水" },
  { zh: "丑", animal: "牛", element: "土" },
  { zh: "寅", animal: "虎", element: "木" },
  { zh: "卯", animal: "兔", element: "木" },
  { zh: "辰", animal: "龙", element: "土" },
  { zh: "巳", animal: "蛇", element: "火" },
  { zh: "午", animal: "马", element: "火" },
  { zh: "未", animal: "羊", element: "土" },
  { zh: "申", animal: "猴", element: "金" },
  { zh: "酉", animal: "鸡", element: "金" },
  { zh: "戌", animal: "狗", element: "土" },
  { zh: "亥", animal: "猪", element: "水" }
];

const ELEMENTS = ["木", "火", "土", "金", "水"];

const ELEMENT_COPY = {
  木: {
    talent: "生发力、学习力、规划感",
    advice: "把想法拆成小步推进，容易把灵感变成稳定产出。",
    balance: "适合增加复盘、整理和边界感。"
  },
  火: {
    talent: "表达力、行动热度、舞台感",
    advice: "先定节奏再冲刺，热情会更耐用。",
    balance: "适合留出冷静窗口，避免被临时情绪带偏。"
  },
  土: {
    talent: "承载力、稳定感、执行耐心",
    advice: "把资源盘清楚，再做长期投入。",
    balance: "适合主动更新方法，别让稳妥变成迟疑。"
  },
  金: {
    talent: "判断力、标准感、取舍能力",
    advice: "先确定原则，再处理复杂关系和选择。",
    balance: "适合增加弹性，给变化留出余地。"
  },
  水: {
    talent: "洞察力、适应力、信息敏感度",
    advice: "多做记录和沉淀，直觉会变成可复用的方法。",
    balance: "适合减少过度揣测，把注意力落回事实。"
  }
};

const PALM_ARCHETYPES = [
  {
    key: "steady",
    title: "稳线型",
    text: "掌纹节奏偏稳，适合走长期积累路线。做事不怕慢，怕的是频繁换方向。",
    focus: "长期项目、资产整理、技能打磨"
  },
  {
    key: "creative",
    title: "灵感型",
    text: "线条变化感较强，代表当下思路活跃，适合把灵感快速落到草稿或原型。",
    focus: "创意表达、内容策划、产品构思"
  },
  {
    key: "decisive",
    title: "决断型",
    text: "掌面明暗和线条对比更突出，象征当下适合做取舍，把拖着的事项收束。",
    focus: "决策、谈判、清理待办"
  },
  {
    key: "adaptive",
    title: "变通型",
    text: "纹理密度和边缘变化较均衡，适合边观察边调整，在复杂局面里找轻巧入口。",
    focus: "跨界协作、流程优化、环境适应"
  }
];

const FACE_ARCHETYPES = [
  {
    key: "clear",
    title: "清朗型",
    text: "画面光线较清透，给人的第一印象偏直接、干净，适合把表达方式做得更明确。",
    focus: "公开表达、形象整理、清晰沟通"
  },
  {
    key: "warm",
    title: "温润型",
    text: "色温偏暖，整体气场更容易显得亲和，适合处理需要耐心和信任的事情。",
    focus: "关系经营、客户沟通、团队协作"
  },
  {
    key: "focused",
    title: "聚焦型",
    text: "画面对称和对比度较强，视觉重心集中，适合在目标明确的阶段持续推进。",
    focus: "目标管理、考试准备、项目攻坚"
  },
  {
    key: "soft",
    title: "舒展型",
    text: "画面边缘变化柔和，状态更偏舒展，适合修复节奏、重新分配注意力。",
    focus: "休整、关系缓和、生活秩序"
  }
];

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("请求内容过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 格式不正确"));
      }
    });

    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store"
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(data);
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function hashToUnit(...parts) {
  const hash = crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

function selectByScore(items, score) {
  const index = Math.min(items.length - 1, Math.floor(clamp(score) * items.length));
  return items[index];
}

function julianDayNumber(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function ganzhiFromIndex(index) {
  const normalized = ((index % 60) + 60) % 60;
  const stem = STEMS[normalized % 10];
  const branch = BRANCHES[normalized % 12];
  return {
    stem,
    branch,
    name: `${stem.zh}${branch.zh}`,
    animal: branch.animal,
    elementPair: [stem.element, branch.element]
  };
}

function getBaziMonthIndex(date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const md = month * 100 + day;
  const boundaries = [
    { start: 204, branchIndex: 2 },
    { start: 306, branchIndex: 3 },
    { start: 405, branchIndex: 4 },
    { start: 506, branchIndex: 5 },
    { start: 606, branchIndex: 6 },
    { start: 707, branchIndex: 7 },
    { start: 808, branchIndex: 8 },
    { start: 908, branchIndex: 9 },
    { start: 1008, branchIndex: 10 },
    { start: 1107, branchIndex: 11 },
    { start: 1207, branchIndex: 0 },
    { start: 106, branchIndex: 1 }
  ];

  if (md >= 204) {
    let selected = 2;
    for (const boundary of boundaries.slice(0, 11)) {
      if (md >= boundary.start) selected = boundary.branchIndex;
    }
    return selected;
  }

  return md >= 106 ? 1 : 0;
}

function calculateBazi(profile = {}) {
  if (!profile.birthDate) {
    throw new Error("请填写出生日期");
  }

  const [yearRaw, monthRaw, dayRaw] = String(profile.birthDate).split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) {
    throw new Error("出生日期格式不正确");
  }

  const birthHour = Number.isFinite(Number(profile.birthHour)) ? Number(profile.birthHour) : 12;
  const date = new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw));
  if (Number.isNaN(date.getTime())) {
    throw new Error("出生日期无效");
  }

  const md = monthRaw * 100 + dayRaw;
  const baziYear = md < 204 ? yearRaw - 1 : yearRaw;
  const yearPillar = ganzhiFromIndex(baziYear - 4);

  const monthBranchIndex = getBaziMonthIndex(date);
  const yearStemIndex = (baziYear - 4) % 10;
  const monthStemStarts = [2, 4, 6, 8, 0];
  const monthStemStart = monthStemStarts[((yearStemIndex % 5) + 5) % 5];
  const monthOrdinalFromYin = (monthBranchIndex - 2 + 12) % 12;
  const monthStemIndex = (monthStemStart + monthOrdinalFromYin) % 10;
  const monthPillar = {
    stem: STEMS[monthStemIndex],
    branch: BRANCHES[monthBranchIndex],
    name: `${STEMS[monthStemIndex].zh}${BRANCHES[monthBranchIndex].zh}`,
    animal: BRANCHES[monthBranchIndex].animal,
    elementPair: [STEMS[monthStemIndex].element, BRANCHES[monthBranchIndex].element]
  };

  const jdn = julianDayNumber(yearRaw, monthRaw, dayRaw);
  const dayPillar = ganzhiFromIndex(jdn + 49);

  const hourBranchIndex = Math.floor((birthHour + 1) / 2) % 12;
  const dayStemIndex = (jdn + 49) % 10;
  const hourStemStarts = [0, 2, 4, 6, 8];
  const hourStemStart = hourStemStarts[((dayStemIndex % 5) + 5) % 5];
  const hourStemIndex = (hourStemStart + hourBranchIndex) % 10;
  const hourPillar = {
    stem: STEMS[hourStemIndex],
    branch: BRANCHES[hourBranchIndex],
    name: `${STEMS[hourStemIndex].zh}${BRANCHES[hourBranchIndex].zh}`,
    animal: BRANCHES[hourBranchIndex].animal,
    elementPair: [STEMS[hourStemIndex].element, BRANCHES[hourBranchIndex].element]
  };

  return {
    pillars: [
      { label: "年柱", ...yearPillar },
      { label: "月柱", ...monthPillar },
      { label: "日柱", ...dayPillar },
      { label: "时柱", ...hourPillar }
    ],
    note: "八字排盘采用公历与节气近似边界，适合娱乐和产品演示；若用于传统命理研究，需要接入精确节气历法。"
  };
}

function scoreElements(bazi, palmMetrics = {}, faceMetrics = {}) {
  const scores = Object.fromEntries(ELEMENTS.map((element) => [element, 0]));

  for (const pillar of bazi.pillars) {
    scores[pillar.stem.element] += 1.2;
    scores[pillar.branch.element] += 0.9;
  }

  const palmLine = clamp(palmMetrics.lineDensity ?? palmMetrics.edgeDensity ?? 0.45);
  const palmContrast = clamp(palmMetrics.contrast ?? 0.45);
  const faceWarmth = clamp(faceMetrics.warmth ?? 0.5);
  const faceSymmetry = clamp(faceMetrics.symmetry ?? 0.55);
  const faceBrightness = clamp(faceMetrics.brightness ?? 0.52);

  scores.木 += palmLine * 0.9 + faceBrightness * 0.25;
  scores.火 += faceWarmth * 0.85 + palmContrast * 0.35;
  scores.土 += (1 - Math.abs(0.5 - faceSymmetry)) * 0.75;
  scores.金 += palmContrast * 0.65 + faceSymmetry * 0.25;
  scores.水 += (1 - faceWarmth) * 0.65 + (1 - palmLine) * 0.35;

  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(
    Object.entries(scores).map(([element, value]) => [element, Number((value / max).toFixed(3))])
  );
}

function dominantElements(scores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([element, score]) => ({ element, score }));
}

function getPalmReading(metrics = {}, seed) {
  const lineDensity = clamp(metrics.lineDensity ?? metrics.edgeDensity ?? 0.45);
  const contrast = clamp(metrics.contrast ?? 0.45);
  const warmth = clamp(metrics.warmth ?? 0.48);
  const composite = clamp(lineDensity * 0.48 + contrast * 0.34 + warmth * 0.18 + seed * 0.1);
  const archetype = selectByScore(PALM_ARCHETYPES, composite);

  const lineTone = lineDensity > 0.6 ? "纹理信息较多，适合多线推进但需要定期收束。" : "纹理节奏较简，适合把重点放在一两件真正重要的事上。";
  const contrastTone = contrast > 0.55 ? "掌面层次清楚，近期适合做明确判断。" : "掌面层次柔和，近期适合先观察后发力。";

  return {
    title: archetype.title,
    summary: archetype.text,
    focus: archetype.focus,
    details: [lineTone, contrastTone],
    metrics: {
      lineDensity: Number(lineDensity.toFixed(2)),
      contrast: Number(contrast.toFixed(2)),
      warmth: Number(warmth.toFixed(2))
    }
  };
}

function getFaceReading(metrics = {}, seed) {
  const brightness = clamp(metrics.brightness ?? 0.52);
  const warmth = clamp(metrics.warmth ?? 0.5);
  const symmetry = clamp(metrics.symmetry ?? 0.56);
  const contrast = clamp(metrics.contrast ?? 0.44);
  const composite = clamp(brightness * 0.22 + warmth * 0.3 + symmetry * 0.3 + contrast * 0.12 + seed * 0.06);
  const archetype = selectByScore(FACE_ARCHETYPES, composite);

  const lightTone = brightness > 0.56 ? "光感偏亮，适合把信息说得更直接。" : "光感偏沉，适合把节奏放慢，先建立安全感。";
  const balanceTone = symmetry > 0.64 ? "视觉重心稳定，适合承接需要连续专注的任务。" : "视觉变化较活，适合用弹性方法处理变化。";

  return {
    title: archetype.title,
    summary: archetype.text,
    focus: archetype.focus,
    details: [lightTone, balanceTone],
    metrics: {
      brightness: Number(brightness.toFixed(2)),
      warmth: Number(warmth.toFixed(2)),
      symmetry: Number(symmetry.toFixed(2))
    }
  };
}

function createReading(payload = {}) {
  const profile = payload.profile || {};
  const palmMetrics = payload.palmMetrics || {};
  const faceMetrics = payload.faceMetrics || {};
  const bazi = calculateBazi(profile);
  const seed = hashToUnit(profile.name || "匿名", profile.birthDate, profile.birthHour, profile.gender || "unknown");
  const palm = getPalmReading(palmMetrics, seed);
  const face = getFaceReading(faceMetrics, 1 - seed);
  const elementScores = scoreElements(bazi, palmMetrics, faceMetrics);
  const sortedElements = dominantElements(elementScores);
  const primary = sortedElements[0].element;
  const secondary = sortedElements[1].element;
  const missing = sortedElements[sortedElements.length - 1].element;
  const dayMaster = bazi.pillars[2].stem.element;
  const luckyNumber = Math.floor(seed * 81) + 9;
  const direction = ["东", "南", "中", "西", "北"][ELEMENTS.indexOf(primary)] || "东";

  return {
    generatedAt: new Date().toISOString(),
    profile: {
      name: profile.name || "未署名",
      gender: profile.gender || "未填写",
      birthDate: profile.birthDate,
      birthHour: Number(profile.birthHour ?? 12),
      birthplace: profile.birthplace || ""
    },
    headline: `${primary}${secondary}相生，日主属${dayMaster}`,
    overview: [
      `你的盘面主调偏${primary}，辅以${secondary}。这类组合更适合用“${ELEMENT_COPY[primary].talent}”打开局面。`,
      `手相侧重显示当前行动节奏，面相侧重显示照片里的状态气场；两者与八字合看，更像一份自我观察报告。`
    ],
    bazi,
    elements: elementScores,
    palm,
    face,
    suggestions: [
      ELEMENT_COPY[primary].advice,
      ELEMENT_COPY[missing].balance,
      `未来一周可以把“${palm.focus}”和“${face.focus}”各选一件小事落地。`
    ],
    lucky: {
      number: luckyNumber,
      direction,
      colors: colorSetForElement(primary),
      keyword: `${primary}气`
    },
    disclaimer: "本软件仅用于娱乐、文化体验和产品演示，不构成现实决策、健康、财务或关系建议。"
  };
}

function colorSetForElement(element) {
  const colors = {
    木: ["青绿", "松石", "浅棕"],
    火: ["朱红", "珊瑚", "暖白"],
    土: ["陶土", "麦黄", "岩灰"],
    金: ["银白", "砂金", "墨黑"],
    水: ["玄青", "湖蓝", "月白"]
  };
  return colors[element] || colors.木;
}

async function routeRequest(req, res) {
  if ((req.method === "GET" || req.method === "HEAD") && req.url === "/healthz") {
    sendJson(res, 200, { ok: true, service: "xuanjing-reading-app" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/reading") {
    try {
      const payload = await parseRequestBody(req);
      const reading = createReading(payload);
      sendJson(res, 200, { ok: true, reading });
    } catch (error) {
      sendJson(res, 400, { ok: false, message: error.message || "测算失败" });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, message: "Method not allowed" });
}

if (require.main === module) {
  const server = http.createServer(routeRequest);
  server.listen(PORT, HOST, () => {
    console.log(`Xuanjing Reading App is running at http://${HOST}:${PORT}`);
  });
}

module.exports = {
  calculateBazi,
  createReading,
  getFaceReading,
  getPalmReading,
  julianDayNumber,
  scoreElements
};
