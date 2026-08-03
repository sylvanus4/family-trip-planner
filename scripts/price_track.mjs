/**
 * price_track.mjs — 일일 가격 추적: 이력 누적 · 변동량 계산 · 특가 판정 (코드가 소유)
 *
 * 수집기(fetch_hotel_prices / fetch_transport_prices)는 "오늘 값"만 쓴다.
 * 이 스크립트가 이력·델타·배지를 전담한다 — 모델이 숫자를 지어낼 여지를 없앤다.
 *
 *   1) data/<city>/price-history.jsonl 에 오늘 스냅샷 append (하루 1행/키, 멱등)
 *   2) 직전 스냅샷 대비 변동량/변동률을 hotel-prices.json / transport-prices.json 에 주입
 *   3) 배지 판정:
 *      - lowest_ever : 관측 이력 최저가(2회 이상 관측된 키만)
 *      - deal        : 같은 창의 비교군 중앙값보다 DEAL_PCT 이상 저렴 (비교군 3개 이상일 때만)
 *      - drop / rise : 전일 대비 THRESH_PCT 이상 변동
 *
 * 사용: node scripts/price_track.mjs data/busan
 */
import fs from 'node:fs';
import path from 'node:path';

const DEAL_PCT = 15;     // "다른 곳 대비 정말 쌀 때만" — 중앙값 대비 15%+ 저렴
const THRESH_PCT = 3;    // 전일 대비 3% 이상이어야 변동 표기(노이즈 컷)
const MIN_PEERS = 3;     // 비교군이 3개 미만이면 deal 판정 안 함(표본 부족)

const cityDir = process.argv[2];
if (!cityDir) { console.error('usage: node scripts/price_track.mjs data/<city>'); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const histPath = path.join(cityDir, 'price-history.jsonl');

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const pct = (now, prev) => (prev ? Math.round(((now - prev) / prev) * 1000) / 10 : null);

// ---------- 1) 오늘 값을 평탄한 {key: value} 로 수집 ----------
const flat = {};                       // key -> krw
const hotelPath = path.join(cityDir, 'hotel-prices.json');
const transPath = path.join(cityDir, 'transport-prices.json');
const hotels = readJson(hotelPath);
const trans = readJson(transPath);

if (hotels?.hotels) {
  for (const [hid, h] of Object.entries(hotels.hotels)) {
    for (const [dk, w] of Object.entries(h.windows || {})) {
      for (const [cid, c] of Object.entries(w.configs || {})) {
        for (const b of ['with_breakfast', 'without_breakfast']) {
          const v = c.lowest?.[b]?.family_total;
          if (v) flat[`hotel|${hid}|${dk}|${cid}|${b}`] = v;
        }
      }
    }
  }
}
if (trans?.windows) {
  for (const [dk, w] of Object.entries(trans.windows)) {
    if (w.family_total_estimate) flat[`flight|total|${dk}`] = w.family_total_estimate;
    for (const [air, r] of Object.entries(w.by_airline || {})) flat[`flight|${air}|${dk}`] = r.price;
  }
}

// ---------- 2) 이력 로드 ----------
const history = fs.existsSync(histPath)
  ? fs.readFileSync(histPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const byKey = {};                      // key -> [{date, v}]
history.forEach((row) => { (byKey[row.k] ||= []).push({ date: row.d, v: row.v }); });

// ---------- 3) 델타 + 배지 ----------
const stats = {};
for (const [k, v] of Object.entries(flat)) {
  const past = (byKey[k] || []).filter((r) => r.date !== today);
  const prev = past.length ? past[past.length - 1] : null;
  const allV = [...past.map((r) => r.v), v];
  stats[k] = {
    value: v,
    prev: prev ? prev.v : null,
    prev_date: prev ? prev.date : null,
    delta: prev ? v - prev.v : null,
    delta_pct: prev ? pct(v, prev.v) : null,
    observations: allV.length,
    lowest_ever: allV.length >= 2 && v <= Math.min(...allV),
    highest_ever: allV.length >= 2 && v >= Math.max(...allV),
  };
}

// deal 판정: 같은 (kind, window, config, breakfast) 비교군 안에서
const groups = {};
for (const k of Object.keys(flat)) {
  const p = k.split('|');
  const g = p[0] === 'hotel' ? `hotel|${p[2]}|${p[3]}|${p[4]}` : `flight|${p[2]}`;
  (groups[g] ||= []).push(k);
}
for (const [g, keys] of Object.entries(groups)) {
  if (keys.length < MIN_PEERS) continue;
  const med = median(keys.map((k) => flat[k]));
  keys.forEach((k) => {
    const below = Math.round(((med - flat[k]) / med) * 1000) / 10;
    stats[k].peer_median = med;
    stats[k].below_median_pct = below;
    stats[k].deal = below >= DEAL_PCT;      // "정말 쌀 때만"
    stats[k].peer_group = g;
  });
}

// ---------- 4) 주입 ----------
const badge = (s) => {
  const out = [];
  if (s.deal) out.push(`특가 (동일조건 중앙값 대비 ${s.below_median_pct}%↓)`);
  if (s.lowest_ever && s.observations >= 2) out.push('관측 최저');
  if (s.delta_pct !== null && Math.abs(s.delta_pct) >= THRESH_PCT) {
    out.push(`${s.delta_pct > 0 ? '▲' : '▼'} 전일 대비 ${Math.abs(s.delta).toLocaleString()}원 (${Math.abs(s.delta_pct)}%)`);
  }
  return out;
};

if (hotels?.hotels) {
  for (const [hid, h] of Object.entries(hotels.hotels)) {
    for (const [dk, w] of Object.entries(h.windows || {})) {
      for (const [cid, c] of Object.entries(w.configs || {})) {
        for (const b of ['with_breakfast', 'without_breakfast']) {
          const s = stats[`hotel|${hid}|${dk}|${cid}|${b}`];
          if (s && c.lowest?.[b]) c.lowest[b].tracking = { ...s, badges: badge(s) };
        }
      }
    }
  }
  hotels.meta.tracked_at = today;
  fs.writeFileSync(hotelPath, JSON.stringify(hotels, null, 2));
}
if (trans?.windows) {
  for (const [dk, w] of Object.entries(trans.windows)) {
    const s = stats[`flight|total|${dk}`];
    if (s) w.tracking = { ...s, badges: badge(s) };
    for (const [air, r] of Object.entries(w.by_airline || {})) {
      const sa = stats[`flight|${air}|${dk}`];
      if (sa) r.tracking = { ...sa, badges: badge(sa) };
    }
  }
  trans.meta.tracked_at = today;
  fs.writeFileSync(transPath, JSON.stringify(trans, null, 2));
}

// ---------- 5) 오늘 스냅샷 append (같은 날 재실행이면 그 날 행을 교체 = 멱등) ----------
const kept = history.filter((r) => r.d !== today);
const lines = [...kept, ...Object.entries(flat).map(([k, v]) => ({ d: today, k, v }))]
  .map((r) => JSON.stringify(r)).join('\n');
fs.writeFileSync(histPath, lines + '\n');

const changed = Object.values(stats).filter((s) => s.delta_pct !== null && Math.abs(s.delta_pct) >= THRESH_PCT).length;
const deals = Object.values(stats).filter((s) => s.deal).length;
console.error(`[price_track] ${cityDir}: keys=${Object.keys(flat).length} 변동=${changed} 특가=${deals} history_rows=${kept.length + Object.keys(flat).length}`);
