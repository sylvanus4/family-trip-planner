/**
 * fetch_hotel_prices.mjs — 성수기 실측 호텔가 수집기 (코드가 포맷 소유)
 *
 * 4인 가족(성인2 + 아동 10세·8세) 기준으로 booking.com 호텔 상세페이지에서
 * 객실 단위 행(객실명·투숙인원·침대구성·2박 총액·조식 포함여부)을 실측 추출한다.
 *
 * 두 가지 객실 구성을 각각 조회한다:
 *   - one-room : no_rooms=1  → 4인이 한 방(침대 3개+ / 더블 포함)에 묵는 경우
 *   - two-room : no_rooms=2  → 방 2개로 나눠 묵는 경우
 *
 * 출력: data/<city>/hotel-prices.json  (생성물 — 손편집 금지)
 *
 * 사용:
 *   node scripts/fetch_hotel_prices.mjs data/busan --hotels grand-josun-busan --dates A
 *   node scripts/fetch_hotel_prices.mjs data/busan            # 전체 호텔 × 전체 날짜
 *
 * ⛔ 날조 금지: 화면에서 실제로 읽은 값 + URL + 조회시각만 기록. 못 읽으면 null.
 */
import pw from '/opt/homebrew/lib/node_modules/playwright-core/index.js';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = pw;

// ---------- 상수 (코드 소유) ----------
export const DATE_WINDOWS = {
  A: { checkin: '2026-08-24', checkout: '2026-08-26', label: '8/24(월)~8/26(수)' },
  B: { checkin: '2026-08-25', checkout: '2026-08-27', label: '8/25(화)~8/27(목)' },
  C: { checkin: '2026-08-26', checkout: '2026-08-28', label: '8/26(수)~8/28(금)' },
  D: { checkin: '2026-08-28', checkout: '2026-08-30', label: '8/28(금)~8/30(일)' },
};
const CHILD_AGES = [10, 8];              // 초4 · 초2
const ADULTS = 2;
const NIGHTS = 2;
const CONFIGS = [
  { id: 'one-room', rooms: 1, label: '1객실 (4인 한 방)' },
  { id: 'two-room', rooms: 2, label: '2객실' },
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// ---------- 파싱 헬퍼 (모두 실측 문자열에서만) ----------
const won = (s) => { const m = String(s).replace(/[^\d]/g, ''); return m ? +m : null; };

/** 객실 행 텍스트 → 구조화. 못 읽는 필드는 null (추정 금지).
 *  booking 표기가 호텔마다 달라서(2026-08-03 실측) 여러 패턴을 모두 시도한다. */
export function parseRoomRow(t) {
  const text = String(t).replace(/\s+/g, ' ').trim();

  // --- 가격: "요금 ₩1,430,000" 우선 ---
  let price = null;
  const mFee = text.match(/요금\s*₩\s?([\d,]{5,})/);
  const mAny = text.match(/₩\s?([\d,]{5,})/);
  if (mFee) price = won(mFee[1]); else if (mAny) price = won(mAny[1]);
  if (!price) return null;

  // --- 세금: "세금 및 기타 요금 포함" vs "+ 세금 및 기타 요금(₩184,800)" ---
  let tax_included = null, tax_extra_krw = null;
  if (/세금[^)]{0,12}포함/.test(text)) { tax_included = true; tax_extra_krw = 0; }
  const mTax = text.match(/\+\s*세금 및 기타 요금\s*\(₩\s?([\d,]{4,})\)/);
  if (mTax) { tax_included = false; tax_extra_krw = won(mTax[1]); }
  const price_all_in = tax_included === false && tax_extra_krw ? price + tax_extra_krw : price;

  // --- 투숙 가능 인원 (3가지 표기) ---
  let ad = null, ch = null;
  let m = text.match(/투숙 가능 인원:?\s*성인\s*(\d+)\s*명(?:\s*아동\s*(\d+)\s*명)?/);
  if (m) { ad = +m[1]; ch = m[2] ? +m[2] : 0; }
  if (ad === null) { m = text.match(/성인\s*(\d+)\s*명,\s*(?:어린이|아동)\s*(\d+)\s*명/); if (m) { ad = +m[1]; ch = +m[2]; } }
  if (ad === null) { m = text.match(/성인 최대 투숙 인원:?\s*(\d+)/); if (m) { ad = +m[1]; ch = 0; } }
  if (ad === null) { m = text.match(/투숙 가능 인원:?\s*(\d+)\s*명/); if (m) { ad = +m[1]; ch = 0; } }
  const capacity = ad === null ? null : { adults: ad, children: ch, total: ad + ch };

  // --- 침대 구성 ---
  const bedPat = /((?:대형 )?더블침대\s*\d*개?|싱글침대\s*\d*개?|킹\s*사이즈[^,]{0,12}|트윈[^,]{0,10}|2층침대\s*\d*개?)/g;
  const bedHits = [...new Set((text.match(bedPat) || []).map((s) => s.trim()))];
  const beds = bedHits.length ? bedHits.join(' + ').slice(0, 60) : null;
  const hasBigBed = /더블|킹/.test(beds || '') || /더블|킹/.test(text.slice(0, 300));
  // 침대 개수 추정: "싱글침대 1개 및 더블침대 1개" → 2 (더블=2인용)
  const bedCount = bedHits.length || null;

  // --- 객실명 ---
  const name = (text.split(/투숙 가능 인원|성인 \d+명, ?(?:어린이|아동)|성인 최대 투숙 인원/)[0] || '')
    .trim().slice(0, 60) || null;

  // --- 조식 ---
  let breakfast;
  if (/조식[^₩]{0,10}포함/.test(text)) {
    breakfast = { included: true, addon_krw: 0, raw: (text.match(/조식[^.]{0,20}포함/) || [])[0] || null };
  } else {
    const mB = text.match(/조식\s*₩\s?([\d,]{4,})/);
    breakfast = mB
      ? { included: false, addon_krw: won(mB[1]), raw: `조식 별도 ₩${mB[1]}` }
      : { included: false, addon_krw: null, raw: null };
  }

  const free_kids = /동반 아동[^.]{0,20}무료/.test(text) || undefined;

  return {
    name, capacity, beds, bed_count: bedCount, has_big_bed: hasBigBed,
    price_total: price, tax_included, tax_extra_krw, price_all_in,
    breakfast, free_kids,
  };
}

// ---------- 수집 ----------
function bookingUrl(base, { checkin, checkout, rooms }) {
  const ages = CHILD_AGES.map((a) => `age=${a}`).join('&');
  return `${base}?checkin=${checkin}&checkout=${checkout}&group_adults=${ADULTS}` +
    `&group_children=${CHILD_AGES.length}&${ages}&no_rooms=${rooms}&selected_currency=KRW&lang=ko`;
}

/** hotels.json 의 booking_slug 가 있으면 그것을 신뢰(오매칭 방지). 없으면 이름검색 + 제목 대조. */
async function resolveBookingPage(page, h) {
  if (h.booking_slug) return `https://www.booking.com/hotel/kr/${h.booking_slug}.ko.html`;
  return findBookingPage(page, h.name);
}

async function findBookingPage(page, name) {
  const ages = CHILD_AGES.map((a) => `age=${a}`).join('&');
  const url = `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(name)}` +
    `&group_adults=${ADULTS}&group_children=${CHILD_AGES.length}&${ages}&no_rooms=1&selected_currency=KRW`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  return page.evaluate(() => {
    const a = document.querySelector('a[href*="/hotel/"]');
    return a ? a.href.split('?')[0] : null;
  });
}

async function scrapeRooms(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollBy(0, 2500));
  await page.waitForTimeout(3500);
  const rows = await page.evaluate(() => {
    const table = document.querySelector('#hprt-table, table[data-testid="hprt-table"], .hprt-table');
    const trs = table ? table.querySelectorAll('tr') : document.querySelectorAll('tr');
    const out = [];
    trs.forEach((tr) => {
      const t = (tr.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length > 30 && /₩/.test(t)) out.push(t.slice(0, 600));
    });
    return out.slice(0, 30);
  });
  return rows.map(parseRoomRow).filter(Boolean);
}

/**
 * 우리 가족 요구조건:
 *  - one-room : 한 방에 4인 전원 + 침대 4개 또는 3개(그중 하나는 더블/킹)
 *  - two-room : 방 2개로 분산 → 방당 2인 수용이면 충분
 * capacity를 못 읽은 행은 제외한다(추정으로 통과시키지 않음 — 잘못된 최저가 방지).
 */
export function fitsFamily(room, config) {
  if (!room.capacity) return false;
  if (config === 'two-room') return room.capacity.total >= 2;
  return room.capacity.total >= 4 && room.has_big_bed;
}

/**
 * ⚠️ booking 표시가 = "객실 1개 × 2박" 총액 (no_rooms 파라미터와 무관 — 2026-08-03 실측 확인:
 * no_rooms=1 과 no_rooms=2 의 동일 객실 표시가가 같았음). 따라서 가족 총액은 × 객실수.
 */
function lowestOf(rooms, roomsRequested) {
  const mult = roomsRequested || 1;
  const withB = rooms.filter((r) => r.breakfast.included);
  const noB = rooms.filter((r) => !r.breakfast.included);
  const min = (arr, key) => (arr.length ? arr.reduce((a, b) => (key(b) < key(a) ? b : a)) : null);
  const wrap = (r, extra = 0) => (r ? {
    ...r,
    rooms: mult,
    family_total: r.price_total * mult + extra,
    per_night_per_room: Math.round(r.price_total / NIGHTS),
  } : null);
  const bestNo = min(noB, (r) => r.price_total);
  const bestAddon = min(noB.filter((r) => r.breakfast.addon_krw), (r) => r.price_total);
  return {
    with_breakfast: wrap(min(withB, (r) => r.price_total)),
    without_breakfast: wrap(bestNo),
    // 조식 별도 객실 + 조식 애드온(표기 원문 기준, 단위 미검증)
    without_plus_addon: bestAddon
      ? { ...wrap(bestAddon), addon_note: `조식 애드온 ₩${bestAddon.breakfast.addon_krw.toLocaleString()} — 1인/1박 단위 미검증(예약 직전 확인)` }
      : null,
  };
}

// ---------- 메인 ----------
const argv = process.argv.slice(2);
const cityDir = argv[0];
if (!cityDir) { console.error('usage: node scripts/fetch_hotel_prices.mjs data/<city> [--hotels id,id] [--dates A,B]'); process.exit(1); }
const argVal = (f) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : null; };
const onlyHotels = (argVal('--hotels') || '').split(',').filter(Boolean);
const onlyDates = (argVal('--dates') || 'A,B,C,D').split(',').filter(Boolean);
const resolveOnly = argv.includes('--resolve-only');   // slug 검증 전용(가격 조회 안 함)

const hotels = JSON.parse(fs.readFileSync(path.join(cityDir, 'hotels.json'), 'utf8'));
const ids = onlyHotels.length ? onlyHotels : Object.keys(hotels);
const outPath = path.join(cityDir, 'hotel-prices.json');
const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 1100 }, userAgent: UA,
});
const page = await ctx.newPage();

const result = {
  meta: {
    adults: ADULTS, children_ages: CHILD_AGES, nights: NIGHTS,
    date_windows: DATE_WINDOWS, configs: CONFIGS,
    source_priority: ['booking'], fetched_at: new Date().toISOString(),
    note: '실측값만 기록. 못 읽은 항목은 null. 가격은 세금·수수료 포함 2박 총액(booking 표기 기준).',
  },
  hotels: prev.hotels || {},
};

for (const id of ids) {
  const h = hotels[id];
  if (!h) { console.error(`skip unknown hotel: ${id}`); continue; }
  const base = await resolveBookingPage(page, h);
  if (!base) { result.hotels[id] = { name: h.name, error: 'booking page not found' }; console.error(`[${id}] NOT FOUND`); continue; }
  // 오매칭 감지: 실제 페이지 제목을 찍어 사람이 눈으로 대조할 수 있게 남긴다
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const pageTitle = (await page.title().catch(() => '')).slice(0, 70);
  console.error(`[${id}] ${h.name}\n   -> ${base}\n   -> 페이지제목: ${pageTitle}${h.booking_slug ? ' (slug 고정)' : ' ⚠️ 이름검색 — 대조 필요'}`);

  const entry = result.hotels[id] = { name: h.name, booking_base: base, booking_page_title: pageTitle, slug_pinned: !!h.booking_slug, windows: {} };
  if (resolveOnly) {
    const m = base.match(/\/hotel\/[a-z]{2}\/([^.?/]+)/);
    console.log(`${id}\t${m ? m[1] : 'UNPARSED:' + base}\t${pageTitle}`);
    continue;
  }
  for (const dk of onlyDates) {
    const w = DATE_WINDOWS[dk];
    if (!w) continue;
    entry.windows[dk] = { ...w, configs: {} };
    for (const cfg of CONFIGS) {
      const url = bookingUrl(base, { checkin: w.checkin, checkout: w.checkout, rooms: cfg.rooms });
      let rooms = [];
      try { rooms = await scrapeRooms(page, url); }
      catch (e) { console.error(`  ! ${dk}/${cfg.id}: ${String(e.message).slice(0, 70)}`); }
      const fit = rooms.filter((r) => fitsFamily(r, cfg.id));
      entry.windows[dk].configs[cfg.id] = {
        label: cfg.label, rooms_requested: cfg.rooms, url,
        checked_at: new Date().toISOString(),
        all_rooms: rooms.length, family_fit: fit,
        lowest: lowestOf(fit.length ? fit : rooms, cfg.rooms),
      };
      const lo = entry.windows[dk].configs[cfg.id].lowest;
      console.error(`  ${dk} ${cfg.id}: rows=${rooms.length} fit=${fit.length}` +
        ` 조식포함=${lo.with_breakfast?.family_total ?? '-'} 조식별도=${lo.without_breakfast?.family_total ?? '-'}`);
      await page.waitForTimeout(2500);
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.error(`\nWROTE ${outPath}`);
await browser.close();
