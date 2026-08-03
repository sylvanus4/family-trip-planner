/* 💰 예산 계산기 — 실측 호텔가/교통비로 "이 날짜 · 이 호텔 · 이 구성" 최종 총액을 계산한다.
   데이터 출처: data/<city>/hotel-prices.json · transport-prices.json · cities.json
   ⛔ 숫자는 전부 수집기 산출물에서만 읽는다(하드코딩·추정 금지). 없으면 '미확인'으로 표시. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const won = (n) => (n == null ? null : n.toLocaleString('ko-KR'));
  const C = { cities: [], city: null, hotel: null, win: 'A', cfg: 'one-room', bf: 'without_breakfast', data: {} };

  const CFG_LABEL = { 'one-room': '1객실 (4인 한 방)', 'two-room': '2객실' };
  const BF_LABEL = { with_breakfast: '조식 포함', without_breakfast: '조식 미포함' };

  async function loadCity(id) {
    if (C.data[id]) return C.data[id];
    const g = async (f) => { try { const r = await fetch(`data/${id}/${f}?t=${Date.now()}`); return r.ok ? await r.json() : null; } catch { return null; } };
    const [hotels, prices, transport] = await Promise.all([g('hotels.json'), g('hotel-prices.json'), g('transport-prices.json')]);
    return (C.data[id] = { hotels, prices, transport });
  }

  /** 선택 조합의 숙박비 + 근거 */
  function lodging() {
    const d = C.data[C.city.id];
    const h = d.prices?.hotels?.[C.hotel];
    const c = h?.windows?.[C.win]?.configs?.[C.cfg];
    if (!c) return { amount: null, why: '실측 데이터 없음' };
    let pick = c.lowest?.[C.bf];
    let fellBack = false;
    if (!pick) { // 조식포함 객실이 매진인 창이 실제로 있다 → 정직하게 대체 표기
      pick = c.lowest?.[C.bf === 'with_breakfast' ? 'without_breakfast' : 'with_breakfast'];
      fellBack = !!pick;
    }
    if (!pick) return { amount: null, why: '해당 조건 잔여 객실 없음' };
    return {
      amount: pick.family_total,
      room: pick.name, beds: pick.beds, rooms: pick.rooms,
      perNight: pick.per_night_per_room,
      tax: pick.tax_included === false ? `세금 별도분 ₩${won(pick.tax_extra_krw)} 포함 계산` : '세금 포함가',
      addon: pick.breakfast?.addon_krw ? `조식 추가 시 1회 ₩${won(pick.breakfast.addon_krw)} (단위 미검증)` : null,
      badges: pick.tracking?.badges || [],
      url: c.url, fellBack,
      why: fellBack ? `${BF_LABEL[C.bf]} 객실이 없어 대체 객실로 계산` : null,
    };
  }

  /** 도시별 도시간 교통비 */
  function intercity() {
    const d = C.data[C.city.id];
    const t = d.transport;
    if (C.city.id === 'busan') {
      const s = t?.srt;
      return s?.family_roundtrip_krw
        ? { amount: s.family_roundtrip_krw, label: `SRT 왕복 (${s.grade})`, note: `${s.party} · 고정 운임 · ${s.verified_at} 확인`, fixed: true }
        : { amount: null, label: 'SRT 왕복', note: '미확인' };
    }
    const w = t?.windows?.[C.win];
    return w?.family_total_estimate
      ? { amount: w.family_total_estimate, label: '항공 왕복 (4인)',
          note: `${w.lowest_leg?.airline || ''} 최저 편도 ₩${won(w.lowest_leg?.price)} 기준 · 소아 운임 별도 확인`,
          badges: w.tracking?.badges || [], url: w.url }
      : { amount: null, label: '항공 왕복', note: '미확인' };
  }

  function render() {
    const el = $('#calc');
    if (!el || !C.city) return;
    const d = C.data[C.city.id];
    const cc = C.city.cost || {};
    const lo = lodging(), ic = intercity();

    const rows = [
      { cat: ic.label, amt: ic.amount, note: ic.note, badges: ic.badges, url: ic.url },
      { cat: '집 ↔ 출발지 이동', amt: cc.home_transfer, note: C.city.home_transfer?.label || '' },
      { cat: '현지 교통', amt: cc.local, note: C.city.id === 'jeju' ? '렌터카·주유 포함 추정' : '지하철·택시 추정' },
      { cat: `숙박 2박 · ${CFG_LABEL[C.cfg]} · ${BF_LABEL[C.bf]}`, amt: lo.amount,
        note: [lo.room, lo.beds, lo.rooms > 1 ? `${lo.rooms}객실` : null, lo.tax, lo.why].filter(Boolean).join(' · '),
        badges: lo.badges, url: lo.url, warn: lo.fellBack },
      { cat: '식비', amt: cc.food, note: '4인 3일 추정' },
      { cat: '예비·기념품', amt: cc.misc, note: '버퍼' },
    ];
    const known = rows.filter((r) => r.amt != null);
    const total = known.reduce((a, r) => a + r.amt, 0);
    const missing = rows.filter((r) => r.amt == null);
    const budget = cc.budget || 0;
    const over = budget && total > budget;

    const winOpts = Object.entries(d.prices?.meta?.date_windows || {})
      .map(([k, w]) => `<option value="${k}"${k === C.win ? ' selected' : ''}>${w.label}</option>`).join('');
    const hotelOpts = Object.entries(d.hotels || {})
      .map(([id, h]) => `<option value="${id}"${id === C.hotel ? ' selected' : ''}>${h.name}</option>`).join('');

    el.innerHTML = `
      <div class="calc-hd"><h2>💰 예산 계산기</h2>
        <p class="calc-sub">날짜·호텔·객실구성·조식을 고르면 실측가로 최종 총액이 계산됩니다.
        <span class="calc-stamp">가격 조회 ${(d.prices?.meta?.fetched_at || '').slice(0, 10) || '-'}</span></p></div>
      <div class="calc-ctrl">
        <label>도시 <select id="cCity">${C.cities.map((c) => `<option value="${c.id}"${c.id === C.city.id ? ' selected' : ''}>${c.emoji} ${c.name}</option>`).join('')}</select></label>
        <label>날짜 <select id="cWin">${winOpts}</select></label>
        <label>숙소 <select id="cHotel">${hotelOpts}</select></label>
        <label>객실 <select id="cCfg">${Object.entries(CFG_LABEL).map(([k, v]) => `<option value="${k}"${k === C.cfg ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>조식 <select id="cBf">${Object.entries(BF_LABEL).map(([k, v]) => `<option value="${k}"${k === C.bf ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <table class="calc-tbl"><thead><tr><th>항목</th><th>금액</th><th>근거</th></tr></thead><tbody>
        ${rows.map((r) => `<tr${r.warn ? ' class="warn"' : ''}${r.amt == null ? ' class="miss"' : ''}>
          <td>${r.cat}</td>
          <td class="amt">${r.amt == null ? '<span class="unk">미확인</span>' : won(r.amt) + '원'}</td>
          <td class="note">${r.note || ''}
            ${(r.badges || []).map((b) => `<span class="bdg${b.startsWith('특가') ? ' deal' : b.startsWith('▼') ? ' down' : b.startsWith('▲') ? ' up' : ''}">${b}</span>`).join('')}
            ${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">확인</a>` : ''}</td></tr>`).join('')}
      </tbody><tfoot>
        <tr class="tot"><td>합계</td><td class="amt">${won(total)}원</td>
          <td>${missing.length ? `<span class="unk">${missing.length}개 항목 미확인 — 실제 총액은 더 커집니다</span>` : '전 항목 반영'}</td></tr>
        ${budget ? `<tr class="bud"><td>예산</td><td class="amt">${won(budget)}원</td>
          <td>${over ? `<span class="bdg up">${won(total - budget)}원 초과</span>` : `<span class="bdg down">${won(budget - total)}원 여유</span>`}</td></tr>` : ''}
      </tfoot></table>
      <div class="calc-grid" id="calcGrid"></div>`;

    renderGrid();
    $('#cCity').onchange = async (e) => { C.city = C.cities.find((c) => c.id === e.target.value); await loadCity(C.city.id); C.hotel = Object.keys(C.data[C.city.id].hotels || {})[0]; render(); };
    $('#cWin').onchange = (e) => { C.win = e.target.value; render(); };
    $('#cHotel').onchange = (e) => { C.hotel = e.target.value; render(); };
    $('#cCfg').onchange = (e) => { C.cfg = e.target.value; render(); };
    $('#cBf').onchange = (e) => { C.bf = e.target.value; render(); };
  }

  /** 날짜 × 호텔 전체 그리드 — "날짜별 금액"을 한눈에 */
  function renderGrid() {
    const d = C.data[C.city.id];
    const wins = Object.entries(d.prices?.meta?.date_windows || {});
    if (!wins.length) return;
    const cc = C.city.cost || {};
    const fixedSide = (cc.home_transfer || 0) + (cc.local || 0) + (cc.food || 0) + (cc.misc || 0);
    const ics = {};
    wins.forEach(([k]) => { const save = C.win; C.win = k; ics[k] = intercity().amount; C.win = save; });

    let best = { total: Infinity };
    const body = Object.entries(d.hotels || {}).map(([hid, h]) => {
      const tds = wins.map(([k]) => {
        const c = d.prices?.hotels?.[hid]?.windows?.[k]?.configs?.[C.cfg];
        const p = c?.lowest?.[C.bf] || c?.lowest?.without_breakfast || c?.lowest?.with_breakfast;
        if (!p) return '<td class="unk">-</td>';
        const tot = p.family_total + (ics[k] || 0) + fixedSide;
        if (tot < best.total) best = { total: tot, hid, k, name: h.name };
        const deal = (p.tracking?.badges || []).some((b) => b.startsWith('특가'));
        return `<td class="${hid === C.hotel && k === C.win ? 'sel' : ''}${deal ? ' deal' : ''}"
          title="숙박 ${won(p.family_total)} + 교통 ${won(ics[k])} + 기타 ${won(fixedSide)}">
          <b>${won(tot)}</b><span>숙박 ${won(p.family_total)}</span></td>`;
      }).join('');
      return `<tr><th>${h.name}</th>${tds}</tr>`;
    }).join('');

    $('#calcGrid').innerHTML = `
      <h3>📅 날짜 × 숙소 최종 총액 <small>(${CFG_LABEL[C.cfg]} · ${BF_LABEL[C.bf]} · 교통·식비·예비 포함)</small></h3>
      <div class="calc-scroll"><table class="calc-matrix">
        <thead><tr><th>숙소</th>${wins.map(([, w]) => `<th>${w.label}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody></table></div>
      ${best.hid ? `<p class="calc-best">최저 조합 — <b>${best.name}</b> · ${d.prices.meta.date_windows[best.k].label} · <b>${won(best.total)}원</b></p>` : ''}`;
  }

  async function init() {
    const host = $('#calc');
    if (!host) return;
    try {
      const cities = await (await fetch(`data/cities.json?t=${Date.now()}`)).json();
      C.cities = Array.isArray(cities) ? cities : cities.cities || [];
      C.city = C.cities[0];
      if (!C.city) return;
      await loadCity(C.city.id);
      C.hotel = Object.keys(C.data[C.city.id].hotels || {})[0];
      render();
    } catch (e) {
      host.innerHTML = '<p class="unk">계산기 데이터를 불러오지 못했습니다.</p>';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
