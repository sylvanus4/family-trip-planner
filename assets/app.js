/* 가족여행 플래너 v3 — cities · map · transport · meals · decisions · compare */
const REPO_URL = "https://github.com/sylvanus4/family-trip-planner";
const DAYCOL = {1:"#0E7C7B",2:"#E15A38",3:"#DE9A2E",4:"#6D28D9",5:"#0369A1"};
const S = { cities:[], city:null, plans:[], hotels:{}, at:{}, rest:{}, cur:null, map:null };

const $ = s => document.querySelector(s);
const won = n => n==null ? "-" : Number(n).toLocaleString("ko-KR");
const enc = s => encodeURIComponent(s);
const commons = f => f ? `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(f)}?width=500` : null;
const kakaoTo = p => `https://map.kakao.com/link/to/${enc(p.name)},${p.lat},${p.lon}`;

function haversine(a,b){
  const R=6371, r=x=>x*Math.PI/180;
  const dLat=r(b.lat-a.lat), dLon=r(b.lon-a.lon);
  const s=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}
const round100 = n => Math.round(n/100)*100;

function leg(a,b){
  if(!a||!b||!a.lat||!b.lat) return null;
  const d=haversine(a,b), t=S.city.transport;
  if(d<0.45) return {icon:"🚶",mode:"도보",mins:Math.max(2,Math.round(d*15)),cost:0,note:"가까워요"};
  if(t.has_subway && d<=12) return {icon:"🚇",mode:"지하철",mins:Math.round(d*4+8),cost:t.subway4,link:kakaoTo(b),linklabel:"길찾기",note:"4인(추정)"};
  const cost=round100(t.taxi_base+d*t.taxi_per_km);
  return {icon:"🚕",mode:"택시",mins:Math.round(d*3+5),cost,link:kakaoTo(b),linklabel:"카카오T 호출",note:t.has_subway?"택시비(추정)":"택시비 추정 · 렌터카도 편해요"};
}

async function boot(){
  $("#repoLink").href = REPO_URL+"#readme";
  S.cities=(await fetch("data/cities.json").then(r=>r.json())).cities;
  renderCityPicker();
  const h=location.hash.replace("#","").split("/");
  const cid=S.cities.find(c=>c.id===h[0])?h[0]:S.cities[0].id;
  await selectCity(cid,h[1]);
  $("#cmpBtn").onclick=toggleCompare;
}

function renderCityPicker(){
  const el=$("#cityPicker"); el.innerHTML="";
  S.cities.forEach(c=>{ const b=document.createElement("button");
    b.className="city-btn"+(c.id===(S.city&&S.city.id)?" active":""); b.innerHTML=`${c.emoji} ${c.name}`;
    b.dataset.id=c.id; b.onclick=()=>selectCity(c.id); el.appendChild(b); });
}

async function selectCity(id, wantPlan){
  S.city=S.cities.find(c=>c.id===id); const d=S.city.dir;
  const [plans,hotels,at,rest]=await Promise.all([
    fetch(`${d}/plans.json`).then(r=>r.json()),
    fetch(`${d}/hotels.json`).then(r=>r.json()),
    fetch(`${d}/attractions.json`).then(r=>r.json()),
    fetch(`${d}/restaurants.json`).then(r=>r.ok?r.json():{}).catch(()=>({}))
  ]);
  S.plans=plans.plans; S.hotels=hotels; S.at=at; S.rest=rest||{};
  document.querySelectorAll(".city-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  renderPlanPicker(); $("#compare").hidden=true;
  selectPlan(wantPlan && S.plans.find(p=>p.id===wantPlan) ? wantPlan : S.plans[0].id);
}

function place(ref){
  if(ref.startsWith("hotel:")){ const h=S.hotels[ref.slice(6)]; return h&&{...h,_type:"hotel"}; }
  const a=S.at[ref]; return a&&{...a,_type:"poi"};
}

function renderPlanPicker(){
  const el=$("#planPicker"); el.innerHTML="";
  S.plans.forEach(p=>{ const b=document.createElement("button");
    b.className="plan-btn"+(p.id===S.cur?" active":"");
    b.innerHTML=(localStorage.getItem(`cfm_${S.city.id}_${p.id}`)?'<span class="chk">✓</span> ':'')+p.short;
    b.dataset.id=p.id; b.onclick=()=>selectPlan(p.id); el.appendChild(b); });
}

function selectPlan(id){
  S.cur=id; location.hash=`${S.city.id}/${id}`; $("#compare").hidden=true;
  document.querySelectorAll(".plan-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  const p=S.plans.find(x=>x.id===id);
  renderHead(p); renderMap(p); renderSide(p); renderCost(p); renderConfirm(p);
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderHead(p){
  $("#planHead").innerHTML=`
    <div class="ph-top"><span class="ph-city">${S.city.emoji} ${S.city.name}</span><span class="ph-arr">${S.city.arrival}</span></div>
    <h2>${p.title}</h2>
    <p class="psub">${p.subtitle||""}</p>
    ${p.recommended_for?`<p class="recfor">👨‍👩‍👧‍👧 이런 가족에게: <b>${p.recommended_for}</b></p>`:""}
    <div class="chips">
      ${(p.chips||[]).map(c=>`<span class="chip">${c}</span>`).join("")}
      ${p.total!=null?`<span class="chip total">예상 총경비 ${won(p.total)}원</span>`:""}
      ${p.budget?`<span class="chip ok">예산 ${won(p.budget)}원 이내 👍</span>`:""}
    </div>`;
}

function orderedStops(p){ const o=[]; let n=0;
  p.days.forEach(d=>d.stops.forEach(s=>{ const h=s.ref.startsWith("hotel:"); o.push({...s,day:d.day,isHotel:h,n:h?null:++n}); })); return o; }

function renderMap(p){
  if(S.map){ S.map.remove(); S.map=null; }
  const map=L.map("map",{scrollWheelZoom:true}); S.map=map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
  const pts=[];
  p.days.forEach(d=>{ const co=d.stops.map(s=>place(s.ref)).filter(x=>x&&x.lat).map(x=>[x.lat,x.lon]);
    if(co.length>1) L.polyline(co,{color:DAYCOL[d.day]||"#333",weight:4,opacity:.75,dashArray:"2 8"}).addTo(map); });
  orderedStops(p).forEach(s=>{ const a=place(s.ref); if(!a||!a.lat) return;
    const html=s.isHotel?`<div class="pin hotel"><span>🏨</span></div>`:`<div class="pin d${s.day}"><span>${s.n}</span></div>`;
    L.marker([a.lat,a.lon],{icon:L.divIcon({className:"",html,iconSize:[30,30],iconAnchor:[15,28]})}).addTo(map).bindPopup(s.isHotel?popupHotel(a):popupPoi(a,s)); pts.push([a.lat,a.lon]); });
  if(pts.length) map.fitBounds(pts,{padding:[45,45]});
  renderMapActions(p); setTimeout(()=>map.invalidateSize(),120);
}
function popupPoi(a,s){ const img=commons(a.img);
  return `<div class="pop">${img?`<img src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
    <h4>${s.n}. ${a.name}</h4><p class="pm">${a.price_hours||a.blurb||""}</p>
    <div class="pl">${a.naver?`<a href="${a.naver}" target="_blank" rel="noopener">네이버</a>`:""}${a.review?`<a href="${a.review}" target="_blank" rel="noopener">리뷰</a>`:""}${a.official?`<a href="${a.official}" target="_blank" rel="noopener">예매</a>`:""}<a href="${kakaoTo(a)}" target="_blank" rel="noopener">🚕</a></div></div>`; }
function popupHotel(h){ return `<div class="pop"><h4>🏨 ${h.name}</h4><p class="pm">${h.price_range||""}</p>
    <div class="pl">${h.naver_map?`<a href="${h.naver_map}" target="_blank" rel="noopener">네이버</a>`:""}${h.booking?`<a href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}${h.phone?`<a href="tel:${h.phone}">전화</a>`:""}<a href="${kakaoTo(h)}" target="_blank" rel="noopener">🚕</a></div></div>`; }

function gmapsDir(stops){ const c=stops.map(s=>place(s.ref)).filter(x=>x&&x.lat); if(c.length<2) return null;
  const o=c[0],dd=c[c.length-1],w=c.slice(1,-1).map(x=>`${x.lat},${x.lon}`).join("|");
  let u=`https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${dd.lat},${dd.lon}&travelmode=transit`;
  if(w) u+=`&waypoints=${enc(w)}`; return u; }
function renderMapActions(p){ const el=$("#mapActions"); el.innerHTML="";
  const g=gmapsDir(p.days.flatMap(d=>d.stops));
  if(g) el.insertAdjacentHTML("beforeend",`<a href="${g}" target="_blank" rel="noopener">🧭 구글맵 전체 길찾기</a>`);
  if(p.kml) el.insertAdjacentHTML("beforeend",`<a href="${p.kml}" download>⬇️ KML(구글 마이맵)</a>`); }

function restCard(r){ if(!r) return "";
  return `<div class="rest"><div class="rest-nm">${r.name}${r.category?` <span class="rest-cat">${r.category}</span>`:""}</div>
    ${r.menu?`<div class="rest-mn">${r.menu}${r.price?` · ${r.price}`:""}</div>`:""}
    ${r.kid_note?`<div class="rest-kid">👶 ${r.kid_note}</div>`:""}
    ${r.wait?`<div class="rest-wt">⏱️ ${r.wait}</div>`:""}
    <div class="lnks">${r.naver?`<a class="lnk" href="${r.naver}" target="_blank" rel="noopener">네이버</a>`:""}${r.phone?`<a class="lnk" href="tel:${r.phone}">📞 ${r.phone}</a>`:""}<a class="lnk" href="${kakaoTo(r)}" target="_blank" rel="noopener">🚕</a></div></div>`; }

function renderSide(p){
  const el=$("#side"); el.innerHTML="";
  const h=S.hotels[p.base_hotel];
  if(h) el.insertAdjacentHTML("beforeend",`<div class="hotel"><div class="hd">🏨 베이스 숙소 · 2박</div>
    <div class="in"><div><p class="nm">${h.name}</p><p class="meta">${h.family_note||""}</p><p class="price">${h.price_range||""}</p>
    <div class="lnks">${h.naver_map?`<a class="lnk" href="${h.naver_map}" target="_blank" rel="noopener">네이버 지도</a>`:""}${h.booking?`<a class="lnk" href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}${h.phone?`<a class="lnk" href="tel:${h.phone}">📞 ${h.phone}</a>`:""}<a class="lnk" href="${kakaoTo(h)}" target="_blank" rel="noopener">🚕 카카오T</a></div></div></div></div>`);
  // decision checklist (for the wife)
  if(p.decisions&&p.decisions.length) el.insertAdjacentHTML("beforeend",`<div class="deck"><div class="deck-hd">✅ 결정 체크리스트 <span class="deck-sub">와이프 컨펌용</span></div>
    ${p.decisions.map((x,i)=>{const k=`chk_${S.city.id}_${p.id}_${i}`;return `<label class="deci"><input type="checkbox" data-k="${k}" ${localStorage.getItem(k)?"checked":""}><span><b>${x.label}</b><em>${x.note||""}</em></span></label>`;}).join("")}</div>`);
  // city tour / transport tip
  const ct=S.city.city_tour;
  if(ct) el.insertAdjacentHTML("beforeend",`<div class="tour"><div class="tour-hd">🚌 ${ct.name}</div><p class="tour-tx">${ct.note}</p>
    <div class="lnks">${ct.url?`<a class="lnk" href="${ct.url}" target="_blank" rel="noopener">홈페이지</a>`:""}${ct.booking?`<a class="lnk" href="${ct.booking}" target="_blank" rel="noopener">예약</a>`:""}${ct.phone?`<a class="lnk" href="tel:${ct.phone}">📞 ${ct.phone}</a>`:""}</div></div>`);
  // days with stops, legs, meals
  p.days.forEach(d=>{
    const col=DAYCOL[d.day]||"#333", g=gmapsDir(d.stops); let rows="";
    for(let i=0;i<d.stops.length;i++){
      const s=d.stops[i], a=place(s.ref); if(!a) continue;
      const isH=s.ref.startsWith("hotel:"), label=isH?"🏨":numFor(p,d,i), img=!isH&&a.img?commons(a.img):null;
      rows+=`<div class="stop"><div class="num"${isH?' style="background:#111"':''}>${label}</div>
        ${img?`<img class="thumb" src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
        <div class="body">${s.time?`<div class="t">${s.time}</div>`:""}<div class="nm">${a.name}${s.optional?' <span class="lnk opt">선택</span>':''}</div>${s.note?`<div class="no">${s.note}</div>`:""}
        <div class="lnks">${(a.naver||a.naver_map)?`<a class="lnk" href="${a.naver||a.naver_map}" target="_blank" rel="noopener">네이버</a>`:""}${a.review?`<a class="lnk" href="${a.review}" target="_blank" rel="noopener">리뷰</a>`:""}${a.official?`<a class="lnk" href="${a.official}" target="_blank" rel="noopener">예매</a>`:""}</div></div></div>`;
      if(i<d.stops.length-1){ const b=place(d.stops[i+1].ref), lg=leg(a,b);
        if(lg) rows+=`<div class="leg"><span class="lg-ic">${lg.icon}</span><span class="lg-tx">${lg.mode} · 약 ${lg.mins}분${lg.cost?` · ₩${won(lg.cost)}`:" · 무료"}<span class="lg-no">${lg.note||""}</span></span>${lg.link?`<a class="lg-lk" href="${lg.link}" target="_blank" rel="noopener">${lg.linklabel}</a>`:""}</div>`; }
    }
    let meals="";
    if(d.meals&&d.meals.length) meals=`<div class="meals"><div class="meals-hd">🍽️ 이 날의 식사 (동선 위 아이 동반 맛집 · 대안 포함)</div>
      ${d.meals.map(mm=>`<div class="meal"><div class="meal-slot">${mm.slot} <span class="meal-near">${mm.near} 근처</span></div>${mm.candidates.map(id=>restCard(S.rest[id])).join("")}</div>`).join("")}</div>`;
    el.insertAdjacentHTML("beforeend",`<div class="day-block"><div class="day-hd" style="background:${col}"><h3>${d.day}일차 · ${d.label||""}</h3>${g?`<a class="zone" style="color:#fff" href="${g}" target="_blank" rel="noopener">🧭 길찾기</a>`:""}</div>${rows}${meals}</div>`);
  });
  // highlights
  if(p.highlights&&p.highlights.length) el.insertAdjacentHTML("beforeend",`<div class="hilite"><div class="hl-hd">✨ 이 여행의 하이라이트</div>${p.highlights.map(x=>`<div class="hl"><b>${x.name}</b> — ${x.blurb}</div>`).join("")}</div>`);
  // persist checklist
  el.querySelectorAll(".deci input").forEach(cb=>cb.onchange=()=>{ cb.checked?localStorage.setItem(cb.dataset.k,"1"):localStorage.removeItem(cb.dataset.k); });
}
function numFor(p,day,idx){ let n=0; for(const d of p.days){ for(let i=0;i<d.stops.length;i++){ if(!d.stops[i].ref.startsWith("hotel:")) n++; if(d===day&&i===idx) return n; } } return n; }

function renderCost(p){ const el=$("#cost"); if(!p.cost||!p.cost.length){ el.innerHTML=""; return; }
  const rows=p.cost.map(c=>`<tr><td class="cat">${c.cat}</td><td class="detail">${c.detail||""}</td><td class="n">${won(c.amount)}</td><td>${c.type?`<span class="badge ${c.type==='확정'?'f':'e'}">${c.type}</span>`:""}</td></tr>`).join("");
  const left=p.budget?p.budget-p.total:null;
  el.innerHTML=`<h3>💰 전체 경비 (4인 기준) · 식비는 위 맛집 참고</h3>
    <table><thead><tr><th>항목</th><th>내역</th><th class="n">금액(원)</th><th>구분</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>합계</td><td class="detail">${p.budget?`예산 ${won(p.budget)}원 이내`:""}</td><td class="n">${won(p.total)}</td><td></td></tr>
    ${left!=null?`<tr class="buf"><td>남는 여유</td><td class="detail">업그레이드 여력</td><td class="n">+${won(left)}</td><td></td></tr>`:""}</tfoot></table>`; }

function renderConfirm(p){ const el=$("#confirmBar"), key=`cfm_${S.city.id}_${p.id}`, done=localStorage.getItem(key);
  const cnt=S.plans.filter(x=>localStorage.getItem(`cfm_${S.city.id}_${x.id}`)).length;
  el.innerHTML=`<span class="st">${done?`✓ <b>${p.short}</b> 컨펌함`:`이 여행안이 마음에 드나요?`} · ${S.city.name} 컨펌 ${cnt}개</span>
    <button class="btn p ${done?'done':''}" id="cfm">${done?'컨펌 취소':'이 안으로 컨펌 👍'}</button><button class="btn s" id="shr">🔗 링크 공유</button>`;
  $("#cfm").onclick=()=>{ done?localStorage.removeItem(key):localStorage.setItem(key,new Date().toISOString()); renderPlanPicker(); renderConfirm(p); document.querySelectorAll(".plan-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===p.id)); };
  $("#shr").onclick=async()=>{ const url=location.origin+location.pathname+`#${S.city.id}/${p.id}`; try{ await navigator.clipboard.writeText(url); $("#shr").textContent="✓ 복사됨"; setTimeout(()=>$("#shr").textContent="🔗 링크 공유",1500);}catch(e){ prompt("링크:",url);} }; }

function toggleCompare(){ const el=$("#compare"); if(!el.hidden){ el.hidden=true; return; }
  const rows=S.plans.map(p=>{ const done=localStorage.getItem(`cfm_${S.city.id}_${p.id}`), m=p.metrics||{};
    return `<tr data-id="${p.id}"><td class="cat">${p.short}${done?' <span class="chk">✓</span>':''}<div class="cmp-sub">${p.recommended_for||""}</div></td>
      <td class="n">${won(p.total)}</td><td class="n">${m.stops??"-"}곳</td><td class="n">${m.meals??"-"}끼</td><td class="n">${m.indoor??"-"}</td><td class="n">${m.kid??"-"}</td>
      <td><button class="btn s mini" data-go="${p.id}">열기 →</button></td></tr>`; }).join("");
  el.innerHTML=`<div class="cmp-head"><h3>📊 ${S.city.name} 여행안 비교 (${S.plans.length}개)</h3><button class="cmp-x" id="cmpX">닫기 ✕</button></div>
    <div class="cmp-wrap"><table class="cmp"><thead><tr><th>여행안 / 추천 대상</th><th class="n">총경비</th><th class="n">방문지</th><th class="n">식사</th><th class="n">실내</th><th class="n">아이만족<br><span class="mini2">(3=상)</span></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="cmp-tip">💡 실내 = 실내형 방문지 수(우천 대비) · 아이만족 = kid-fit 평균 · 식사 = 끼니별 맛집 슬롯 수. 마음에 드는 안의 <b>열기</b>로 지도·식사동선을 보고 컨펌하세요.</p>`;
  el.hidden=false; $("#cmpX").onclick=()=>el.hidden=true;
  el.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>selectPlan(b.dataset.go)); el.scrollIntoView({behavior:"smooth"}); }

boot().catch(e=>{ $("#planHead").innerHTML='<p style="color:#E15A38">데이터 로드 실패: '+e.message+'</p>'; });
