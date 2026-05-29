const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateBazi, createReading, julianDayNumber, scoreElements } = require("../server");

test("julianDayNumber returns the known JDN for 2000-01-01", () => {
  assert.equal(julianDayNumber(2000, 1, 1), 2451545);
});

test("calculateBazi returns four pillars", () => {
  const bazi = calculateBazi({ birthDate: "1992-08-18", birthHour: 9 });
  assert.equal(bazi.pillars.length, 4);
  assert.deepEqual(
    bazi.pillars.map((pillar) => pillar.label),
    ["年柱", "月柱", "日柱", "时柱"]
  );
});

test("scoreElements normalizes all five elements", () => {
  const bazi = calculateBazi({ birthDate: "1992-08-18", birthHour: 9 });
  const scores = scoreElements(bazi, { lineDensity: 0.6, contrast: 0.4 }, { warmth: 0.5, symmetry: 0.7 });
  assert.deepEqual(Object.keys(scores), ["木", "火", "土", "金", "水"]);
  for (const value of Object.values(scores)) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test("createReading builds a complete entertainment report", () => {
  const reading = createReading({
    profile: {
      name: "测试用户",
      gender: "未填写",
      birthDate: "1992-08-18",
      birthHour: 9,
      birthplace: "上海"
    },
    palmMetrics: { lineDensity: 0.62, contrast: 0.42, warmth: 0.5 },
    faceMetrics: { brightness: 0.58, warmth: 0.51, symmetry: 0.72 }
  });

  assert.ok(reading.headline.includes("日主"));
  assert.equal(reading.bazi.pillars.length, 4);
  assert.ok(reading.palm.summary);
  assert.ok(reading.face.summary);
  assert.ok(reading.disclaimer.includes("娱乐"));
});

test("createReading works without uploaded image metrics", () => {
  const reading = createReading({
    profile: {
      birthDate: "1992-08-18",
      birthHour: 9
    },
    palmMetrics: null,
    faceMetrics: null
  });

  assert.equal(reading.bazi.pillars.length, 4);
  assert.ok(reading.palm.summary);
  assert.ok(reading.face.summary);
});
