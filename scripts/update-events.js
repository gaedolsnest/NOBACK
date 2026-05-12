const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "events.json");
const USER_AGENT = "NOBACK-Events-Updater/1.0 (+https://github.com/gaedolsnest/NOBACK)";
const LOOKAHEAD_DAYS = 60;

const roadrunSourceBase = "http://www.roadrun.co.kr/schedule/list.php";
const fallbackEvents = [
  {
    name: "2026 TNF100 KOREA with VECTIV",
    date: "2026-05-16",
    location: "강릉 경포호수광장",
    category: "트레일",
    distance: "10K / 22K / 50K / 100K",
    note: "공식 TNF100 KOREA 일정 보조 등록 대회입니다.",
    url: "https://image.thenorthfacekorea.co.kr/tnf100"
  },
  {
    name: "2026 iM뱅크 코리아 오픈 마라톤",
    date: "2026-06-07",
    location: "서울 여의도공원",
    category: "로드",
    distance: "5K / 10K / Half",
    note: "마라톤온라인 대회 일정 보조 등록 대회입니다.",
    url: "https://www.korearace.com/"
  },
  {
    name: "2026 큰별쌤과 함께하는 나눔 마라톤",
    date: "2026-06-27",
    location: "서울 상암 평화의공원",
    category: "로드",
    distance: "5K / 10K / Half",
    note: "마라톤온라인 대회 일정 보조 등록 대회입니다.",
    url: "https://www.kimrunning.com/"
  },
  {
    name: "2026 JTBC 서울마라톤",
    date: "2026-11-01",
    location: "서울",
    category: "로드",
    distance: "Full / 10K",
    note: "마라톤온라인 대회 일정 보조 등록 대회입니다.",
    url: "https://marathon.jtbc.com/"
  }
];

function getKstDate() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getYearMonthDay(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return { year, month, day };
}

function normalizeMonthDay(year, value) {
  const match = String(value || "").match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!match) return "";
  const month = String(match[1]).padStart(2, "0");
  const day = String(match[2]).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inferCategory(name, distance) {
  const text = `${name} ${distance}`;
  if (/트레일|trail|산악|50k|37k|24k|100km|100k/i.test(text)) return "트레일";
  return "로드";
}

function cleanEventName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .trim();
}

function absoluteRoadrunUrl(url) {
  if (!url) return roadrunSourceBase;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `http://www.roadrun.co.kr${url}`;
  return `http://www.roadrun.co.kr/schedule/${url}`;
}

async function fetchText(url, encoding = "utf-8") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new TextDecoder(encoding).decode(buffer);
  } finally {
    clearTimeout(timeout);
  }
}

function parseRoadrunSchedule(html, year) {
  const events = [];
  const rows = String(html || "").match(/<tr>[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    const dateMatch = row.match(/<font[^>]*size=["']?4["']?[^>]*>\s*(\d{1,2}\s*\/\s*\d{1,2})\s*<\/font>/i);
    const nameMatch = row.match(/<a[^>]*open_window\([^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    const distanceMatch = row.match(/<font[^>]*color=["']?#990000["']?[^>]*>\s*([\s\S]*?)\s*<\/font>/i);
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);

    if (!dateMatch || !nameMatch || !distanceMatch || cells.length < 3) continue;

    const date = normalizeMonthDay(year, dateMatch[1]);
    const name = cleanEventName(stripHtml(nameMatch[1]));
    const distance = stripHtml(distanceMatch[1])
      .replace(/,/g, " / ")
      .replace(/\s*\/\s*/g, " / ");
    const location = stripHtml(cells[2]) || "장소 확인";
    const homepageMatch = row.match(/<a\s+href=["'](https?:\/\/[^"']+)["'][^>]*target=["']?_new["']?/i);

    if (!name || !date) continue;

    events.push({
      name,
      date,
      location,
      category: inferCategory(name, distance),
      distance: distance || "거리 확인",
      note: "마라톤온라인 대회 일정 기반입니다.",
      url: absoluteRoadrunUrl(homepageMatch?.[1])
    });
  }

  return events;
}

async function collectRoadrunEvents() {
  const today = getKstDate();
  const endDate = addDays(today, LOOKAHEAD_DAYS);
  const startYear = getYearMonthDay(today).year;
  const endYear = getYearMonthDay(endDate).year;
  const years = Array.from(new Set([startYear, endYear]));
  const events = [];

  for (const year of years) {
    const url = `${roadrunSourceBase}?syear_key=${year}`;
    try {
      const html = await fetchText(url, "euc-kr");
      const found = parseRoadrunSchedule(html, year);
      events.push(...found);
      console.log(`[ok] scanned marathon.pe.kr schedule source via roadrun ${year}: ${found.length} candidate(s)`);
    } catch (error) {
      console.warn(`[warn] roadrun scan failed ${year}: ${error.message}`);
    }
  }

  return events;
}

function finalizeEvents(events) {
  const today = getKstDate();
  const endDate = addDays(today, LOOKAHEAD_DAYS);
  const deduped = new Map();

  for (const event of events) {
    if (!event.name || !event.date) continue;
    if (event.date < today || event.date > endDate) continue;

    const normalized = {
      name: event.name,
      date: event.date,
      location: event.location || "장소 확인",
      category: inferCategory(event.name, event.distance || event.category),
      distance: event.distance || "거리 확인",
      note: event.note || "마라톤온라인 대회 일정 기반입니다.",
      url: event.url || roadrunSourceBase
    };
    const key = `${normalized.name}__${normalized.date}`;
    if (!deduped.has(key)) deduped.set(key, normalized);
  }

  return Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const collected = await collectRoadrunEvents();
  const events = finalizeEvents([...collected, ...fallbackEvents]);
  const outputEvents = events.length ? events : finalizeEvents(fallbackEvents);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), events: outputEvents }, null, 2)}\n`,
    "utf8"
  );

  console.log(`[done] saved ${outputEvents.length} event(s) to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
