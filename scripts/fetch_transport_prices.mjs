/**
 * fetch_transport_prices.mjs — 성수기 교통비 실측 수집기 (코드가 포맷 소유)
 *
 * 4개 날짜 윈도우 × 어른2 + 어린이2 기준으로
 *   - 제주: 네이버 항공권(전 항공사 집계) 김포(GMP)↔제주(CJU) 왕복 최저가
 *   - 부산: SRT 수서↔부산 운임(고정 운임 — 날짜별 변동 없음, 매진 여부만 변동)
 * 을 실측 수집한다.
 *
 * 출력: data/<city>/transport-prices.json  (생성물 — 손편집 금지)
 *
 * ⚠️ 가격 기준(1인 vs 총액) 자가검증 내장:
 *    adult=1 과 adult=2 조회 결과가 같으면 "1인 기준"으로 판정한다.
 *    이 판정 없이 총액을 계산하면 예산이 2배 틀어진다.
 *
 * 사용:
 *   node scripts/fetch_transport_prices.mjs jeju            # 항공
 *   node scripts/fetch_transport_prices.mjs busan           # SRT
 */
import pw from '/opt/homebrew/lib/node_modules/playwright-core/index.js';
import fs from 'node:fs';
const { chromium } = pw;

export const DATE_WINDOWS = {
  A: { checkin: '2026-08-24', checkout: '2026-08-26', label: '8/24(월)~8/26(수)' },
  B: { checkin: '2026-08-25', checkout: '2026-08-27', label: '8/25(화)~8/27(목)' },
  C: { checkin: '2026-08-26', checkout: '2026-08-28', label: '8/26(수)~8/28(금)' },
  D: { checkin: '2026-08-28', checkout: '2026-08-30', label: '8/28(금)~8/30(일)' },
};
const ADULTS = 2, CHILDREN = 2;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const AIRLINES = ['대한항공', '아시아나항공', '아시아나', '제주항공', '티웨이항공', '티웨이', '진에어', '에어부산', '이스타항공', '이스타'];

const won = (s) => { const m = String(s).replace(/[^\d]/g, ''); return m ? +m : null; };
const ymd = (d) => d.replace(/-/g, '');

function naverUrl(dep, ret, adult, child) {
  return `https://flight.naver.com/flights/domestic/GMP-CJU-${ymd(dep)}/CJU-GMP-${ymd(ret)}?adult=${adult}&child=${child}`;
}

/** 항공편 행 파싱: 항공사 / 시각 / 가격 */
export function parseFlightRow(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const air = AIRLINES.find((a) => t.includes(a)) || null;
  const price = won((t.match(/([\d,]{5,})\s?원/) || [])[1]);
  const times = (t.match(/\d{1,2}:\d{2}/g) || []).slice(0, 2);
  if (!air || !price) return null;
  return { airline: air, depart: times[0] || null, arrive: times[1] || null, price, raw: t.slice(0, 140) };
}

async function scrapeNaver(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 70000 });
  await page.waitForTimeout(15000);
  const rows = await page.evaluate(() => {
    const els = document.querySelectorAll('div[class*="domestic_Flight"]');
    return [...els].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 15 && /원/.test(t));
  });
  return rows.map(parseFlightRow).filter(Boolean);
}

const city = process.argv[2];
if (!city) { console.error('usage: node scripts/fetch_transport_prices.mjs <busan|jeju> [--srt-adult 52600]'); process.exit(1); }
/** CLI 인자 헬퍼 — 사람-검증 상수를 코드 밖에서 덮어쓸 수 있게 한다 */
const argVal = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
function cfgNum(flag, dflt) {
  const v = argVal(flag);
  return v ? +String(v).replace(/[^\d]/g, '') : dflt;
}
const outPath = `data/${city}/transport-prices.json`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 1200 }, userAgent: UA });
const page = await ctx.newPage();

const result = {
  meta: {
    adults: ADULTS, children: CHILDREN, date_windows: DATE_WINDOWS,
    fetched_at: new Date().toISOString(),
    note: '실측값만 기록. 못 읽은 항목은 null.',
  },
  windows: {},
};

if (city === 'jeju') {
  // --- 자가검증: 표시가가 1인 기준인지 총액인지 ---
  const a1 = await scrapeNaver(page, naverUrl('2026-08-24', '2026-08-26', 1, 0));
  await page.waitForTimeout(3000);
  const a2 = await scrapeNaver(page, naverUrl('2026-08-24', '2026-08-26', 2, 0));
  const min1 = a1.length ? Math.min(...a1.map((r) => r.price)) : null;
  const min2 = a2.length ? Math.min(...a2.map((r) => r.price)) : null;
  const basis = min1 && min2 ? (min1 === min2 ? 'per_person' : 'total_for_party') : 'unknown';
  result.meta.price_basis = basis;
  result.meta.price_basis_evidence = { adult1_min: min1, adult2_min: min2 };
  console.error(`[basis] adult1_min=${min1} adult2_min=${min2} -> ${basis}`);

  for (const [dk, w] of Object.entries(DATE_WINDOWS)) {
    const url = naverUrl(w.checkin, w.checkout, ADULTS, CHILDREN);
    let rows = [];
    try { rows = await scrapeNaver(page, url); } catch (e) { console.error(`  ! ${dk}: ${e.message.slice(0, 60)}`); }
    // 항공사별 최저
    const byAir = {};
    rows.forEach((r) => { if (!byAir[r.airline] || r.price < byAir[r.airline].price) byAir[r.airline] = r; });
    const lowest = rows.length ? rows.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    // 왕복 1인 최저(가는편+오는편 각각 최저라고 가정하지 않고, 표시된 최저 2건 합)
    const sorted = [...rows].sort((x, y) => x.price - y.price);
    const roundtrip_per_person = sorted.length >= 2 ? sorted[0].price + sorted[1].price : null;
    result.windows[dk] = {
      ...w, source: 'naver-flight', url, checked_at: new Date().toISOString(),
      rows_found: rows.length, by_airline: byAir, lowest_leg: lowest,
      roundtrip_per_person_estimate: roundtrip_per_person,
      family_total_estimate: roundtrip_per_person && basis === 'per_person'
        ? roundtrip_per_person * (ADULTS + CHILDREN) : null,
      caveat: '어린이 운임 할인은 네이버 표기에 반영 여부가 항공사별로 달라 예매 직전 재확인 필요.',
    };
    console.error(`  ${dk}: rows=${rows.length} 최저편도=${lowest?.price ?? '-'} 항공사=${Object.keys(byAir).length}`);
    await page.waitForTimeout(3000);
  }
} else if (city === 'busan') {
  /**
   * ⛔ SRT(etk.srail.kr) 자동 조회 금지 — 2026-08-03 실측:
   *    "자동화된 요청으로 감지되어 차단되었습니다. 매크로 프로그램 사용은 SR 영업정책에 따라
   *     엄격히 금지되어 있으며, 반복 시 회원 자격상실 및 이용제한" → IP 일시 차단됨.
   *    예매 시스템 자동화는 약관 위반 + 계정 정지 위험이므로 재시도하지 않는다.
   *
   * SRT 운임은 고정 공시운임이라 날짜별 변동이 없다 → 사람이 1회 확인해 아래 상수만 갱신하면 된다.
   * 변동 요소는 "잔여석/매진"뿐이고, 그건 예매 시점에 사람이 확인한다.
   */
  /** 사람이 SR 공식 앱에서 확인해 준 값 (2026-08-03, 어른2+어린이2 왕복 총액) */
  const SRT_VERIFIED = {
    일반실: 310000,
    특실: 500000,
  };
  const grade = argVal('--srt-grade') || '일반실';       // 기본 일반실 (사용자 지정)
  result.srt = {
    route: '수서 ↔ 부산 (SRT)',
    grade,
    fixed_fare: true,
    family_roundtrip_krw: cfgNum('--srt-roundtrip', SRT_VERIFIED[grade] ?? null),
    alternatives: SRT_VERIFIED,
    party: `어른 ${ADULTS} + 어린이 ${CHILDREN}`,
    verified_at: '2026-08-03',
    verified_by: 'human (SR 공식 앱 확인)',
    status: 'verified_constant',
    policy_note: 'SR 약관상 예매 시스템 자동 조회 금지 → 사람이 확인한 고정 운임을 상수로 사용한다. 날짜별 변동 없음, 확인할 것은 잔여석뿐.',
  };
  for (const [dk, w] of Object.entries(DATE_WINDOWS)) {
    result.windows[dk] = { ...w, source: 'fixed-tariff', note: 'SRT 운임 고정 — 날짜별 차이 없음. 확인할 것은 잔여석뿐.' };
  }
  const frt = result.srt.family_roundtrip_krw;
  console.error(`SRT[${grade}]: ${result.srt.status}${frt ? ` 왕복4인 ${frt.toLocaleString()}원` : ' — --srt-roundtrip <총액> 으로 주입 필요'}`);
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.error(`\nWROTE ${outPath}`);
await browser.close();
