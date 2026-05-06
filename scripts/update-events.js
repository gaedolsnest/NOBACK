const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "events.json");
const USER_AGENT = "NOBACK-Events-Updater/1.0 (+https://github.com/gaedolsnest/NOBACK)";

const curatedSources = [
  {
    url: "https://www.tnf100korea.com/",
    event: {
      name: "2026 아이오닉9 TNF 100 KOREA",
      date: "2026-05-16",
      location: "강원 강릉",
      category: "트레일",
      distance: "10K / 50K / 100K",
      note: "강릉 산길을 길게 즐기는 대표 트레일 러닝 대회입니다."
    }
  },
  {
    url: "https://www.koreatrailrunning.com/",
    event: {
      name: "2026 한라산 100 트레일런",
      date: "2026-06-06",
      location: "제주 한라산 일대",
      category: "트레일",
      distance: "10K / 40K / 100K",
      note: "제주 한라산 일대를 달리는 장거리 트레일 일정입니다."
    }
  },
  {
    url: "https://www.korearace.com/",
    event: {
      name: "2026 iM뱅크 코리아 오픈 마라톤",
      date: "2026-06-07",
      location: "서울 여의도공원",
      category: "로드",
      distance: "5K / 10K / Half",
      note: "서울 도심에서 참가하기 좋은 로드 대회입니다."
    }
  },
  {
    url: "https://www.kimrunning.com/",
    event: {
      name: "2026 큰별쌤과 함께하는 나눔 마라톤",
      date: "2026-06-27",
      location: "서울 상암 평화의공원",
      category: "로드",
      distance: "5K / 10K / Half",
      note: "상암 일대에서 열리는 나눔 콘셉트의 마라톤입니다."
    }
  },
  {
    url: "https://www.koreatrailrunning.com/",
    event: {
      name: "2026 성남 트레일 레이스",
      date: "2026-09-12",
      location: "경기 성남",
      category: "트레일",
      distance: "12K / 21K / 50K / 100K",
      note: "가을 시즌 트레일 참가를 노려보기 좋은 일정입니다."
    }
  },
  {
    url: "https://marathon.jtbc.com/",
    event: {
      name: "2026 JTBC 서울마라톤",
      date: "2026-11-01",
      location: "서울",
      category: "마라톤",
      distance: "Full / 10K",
      note: "하반기 대표 도심 마라톤 일정입니다."
    }
  }
];

const sourcePages = [
  "https://www.kormarathon.com/ko/races",
  "https://www.korearace.com/",
  "https://www.koreatrailrunning.com/",
  "https://trailrunners.kr/"
];

function toDateKey(value) {
  const match = String(value || "").match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function normalizeEvent(event) {
  const date = toDateKey(event.date);
  if (!event.name || !date) return null;

  return {
    name: String(event.name).trim(),
    date,
    location: String(event.location || "장소 확인").trim(),
    category: String(event.category || inferCategory(event.name)).trim(),
    distance: String(event.distance || "거리 확인").trim(),
    note: String(event.note || "상세 일정은 공식 안내를 확인해 주세요.").trim(),
    url: String(event.url || "").trim()
  };
}

function inferCategory(name) {
  const text = String(name || "");
  if (/트레일|trail|tnf/i.test(text)) return "트레일";
  if (/마라톤|marathon|jtbc|full/i.test(text)) return "마라톤";
  return "로드";
}

function extractJsonLdEvents(html, sourceUrl) {
  const events = [];
  const scripts = String(html || "").match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];

  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list.flatMap(item => item["@graph"] || item)) {
        if (!item || !/Event/i.test(String(item["@type"] || ""))) continue;
        events.push({
          name: item.name,
          date: item.startDate,
          location: item.location?.name || item.location?.address?.addressLocality || "장소 확인",
          category: inferCategory(item.name),
          distance: "거리 확인",
          note: item.description || "상세 일정은 공식 안내를 확인해 주세요.",
          url: item.url || sourceUrl
        });
      }
    } catch (error) {
      console.warn(`[warn] JSON-LD parse failed: ${sourceUrl} (${error.message})`);
    }
  }

  return events;
}

function extractLooseEvents(html, sourceUrl) {
  const text = stripHtml(html);
  const events = [];
  const pattern = /(20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}).{0,70}?((?:마라톤|트레일|러닝|런|레이스)[^.!?]{2,70})/g;
  let match;

  while ((match = pattern.exec(text))) {
    const name = match[2].replace(/접수|신청|가능|마감|예정/g, "").trim();
    if (!name || name.length > 80) continue;
    events.push({
      name,
      date: match[1],
      location: "장소 확인",
      category: inferCategory(name),
      distance: "거리 확인",
      note: "대회 목록에서 자동 수집한 일정입니다.",
      url: sourceUrl
    });
  }

  return events;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function collectCuratedEvents() {
  const events = [];

  for (const source of curatedSources) {
    try {
      await fetchText(source.url);
      events.push({ ...source.event, url: source.url });
      console.log(`[ok] confirmed: ${source.event.name}`);
    } catch (error) {
      events.push({ ...source.event, url: source.url });
      console.warn(`[warn] source check failed, kept seed: ${source.event.name} (${error.message})`);
    }
  }

  return events;
}

async function collectPageEvents() {
  const events = [];

  for (const url of sourcePages) {
    try {
      const html = await fetchText(url);
      const found = extractJsonLdEvents(html, url);
      events.push(...found);
      console.log(`[ok] scanned ${url}: ${found.length} candidate(s)`);
    } catch (error) {
      console.warn(`[warn] scan failed: ${url} (${error.message})`);
    }
  }

  return events;
}

function finalizeEvents(events) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deduped = new Map();
  for (const raw of events) {
    const event = normalizeEvent(raw);
    if (!event) continue;

    const eventEnd = new Date(`${event.date}T23:59:59+09:00`);
    if (eventEnd < today) continue;

    const key = `${event.name}__${event.date}`;
    if (!deduped.has(key)) deduped.set(key, event);
  }

  return Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const events = finalizeEvents([
    ...(await collectCuratedEvents()),
    ...(await collectPageEvents())
  ]);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), events }, null, 2)}\n`,
    "utf8"
  );

  console.log(`[done] saved ${events.length} event(s) to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
