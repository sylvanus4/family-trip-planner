/* 가족여행 플래너 v4 — cities · map · transport · meals(route-inline) · ratings · custom route builder */
const REPO_URL = "https://github.com/sylvanus4/family-trip-planner";
const DAYCOL = {1:"#0E7C7B",2:"#E15A38",3:"#DE9A2E",4:"#6D28D9",5:"#0369A1"};
const S = { cities:[], city:null, plans:[], hotels:{}, at:{}, rest:{}, cur:null, map:null };

const $ = s => document.querySelector(s);
const won = n => n==null ? "-" : Number(n).toLocaleString("ko-KR");
const enc = s => encodeURIComponent(s);
const commons = f => f ? `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(f)}?width=500` : null;
const kakaoTo = p => `https://map.kakao.com/link/to/${enc(p.name)},${p.lat},${p.lon}`;
const TRANSIT = new Set(["station","airport"]);

function haversine(a,b){ const R=6371,r=x=>x*Math.PI/180;
  const dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon);
  const s=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)); }
const round100 = n => Math.round(n/100)*100;

function leg(a,b){ if(!a||!b||!a.lat||!b.lat) return null;
  const d=haversine(a,b),t=S.city.transport;
  if(d<0.45) return {icon:"🚶",mode:"도보",mins:Math.max(2,Math.round(d*15)),cost:0,note:"가까워요"};
  if(t.has_subway&&d<=12) return {icon:"🚇",mode:"지하철",mins:Math.round(d*4+8),cost:t.subway4,link:kakaoTo(b),linklabel:"길찾기",note:"4인(추정)"};
  const cost=round100(t.taxi_base+d*t.taxi_per_km);
  return {icon:"🚕",mode:"택시",mins:Math.round(d*3+5),cost,link:kakaoTo(b),linklabel:"카카오T 호출",note:t.has_subway?"택시비(추정)":"택시비 추정 · 렌터카도 편해요"}; }

function nearestRest(target,k,excl){ if(!target) return [];
  return Object.entries(S.rest).filter(([id,r])=>r.lat&&!excl.has(id))
    .sort((a,b)=>haversine(target,a[1])-haversine(target,b[1])).slice(0,k).map(x=>x[0]); }

/* ---------- ratings ---------- */
function stars(r){ if(r==null) return ""; const f=Math.round(r);
  return `<span class="stars">${"★".repeat(f)}${"☆".repeat(Math.max(0,5-f))}</span>`; }
function ratingLine(o){ if(!o||o.rating==null) return "";
  const rv=o.reviews?(o.reviews>=1000?(o.reviews/1000).toFixed(1)+"k":o.reviews):null;
  return `<div class="rate">${stars(o.rating)}<b>${o.rating}</b>${rv?`<span class="rev">리뷰 ${rv}</span>`:""}${o.sentiment?`<span class="senti">“${o.sentiment}”</span>`:""}</div>`; }

async function boot(){
  $("#repoLink").href=REPO_URL+"#readme";
  S.cities=(await fetch("data/cities.json").then(r=>r.json())).cities;
  renderCityPicker();
  const h=location.hash.replace("#","").split("/");
  await selectCity(S.cities.find(c=>c.id===h[0])?h[0]:S.cities[0].id, h[1]);
  $("#cmpBtn").onclick=toggleCompare;
  $("#buildBtn").onclick=openBuilder;
}

function renderCityPicker(){ const el=$("#cityPicker"); el.innerHTML="";
  S.cities.forEach(c=>{ const b=document.createElement("button");
    b.className="city-btn"+(c.id===(S.city&&S.city.id)?" active":""); b.textContent=`${c.emoji} ${c.name}`;
    b.dataset.id=c.id; b.onclick=()=>selectCity(c.id); el.appendChild(b); }); }

async function selectCity(id, wantPlan){
  S.city=S.cities.find(c=>c.id===id); const d=S.city.dir;
  const [plans,hotels,at,rest]=await Promise.all([
    fetch(`${d}/plans.json`).then(r=>r.json()),
    fetch(`${d}/hotels.json`).then(r=>r.json()),
    fetch(`${d}/attractions.json`).then(r=>r.json()),
    fetch(`${d}/restaurants.json`).then(r=>r.ok?r.json():{}).catch(()=>({}))]);
  S.plans=plans.plans; S.hotels=hotels; S.at=at; S.rest=rest||{};
  restoreCustom();
  document.querySelectorAll(".city-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  $("#builder").hidden=true; $("#compare").hidden=true;
  renderPlanPicker();
  selectPlan(wantPlan && S.plans.find(p=>p.id===wantPlan) ? wantPlan : S.plans[0].id);
}

function place(ref){ if(ref.startsWith("hotel:")){ const h=S.hotels[ref.slice(6)]; return h&&{...h,_type:"hotel"}; }
  const a=S.at[ref]; return a&&{...a,_type:"poi"}; }

function renderPlanPicker(){ const el=$("#planPicker"); el.innerHTML="";
  S.plans.forEach(p=>{ const b=document.createElement("button");
    b.className="plan-btn"+(p.id===S.cur?" active":"")+(p.id==="custom"?" custom":"");
    b.innerHTML=(localStorage.getItem(`cfm_${S.city.id}_${p.id}`)?'<span class="chk">✓</span> ':'')+(p.id==="custom"?"🧩 ":"")+p.short;
    b.dataset.id=p.id; b.onclick=()=>selectPlan(p.id); el.appendChild(b); }); }

function selectPlan(id){ S.cur=id; location.hash=`${S.city.id}/${id}`; $("#compare").hidden=true; $("#builder").hidden=true;
  document.querySelectorAll(".plan-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  const p=S.plans.find(x=>x.id===id); if(!p) return;
  renderHead(p); renderMap(p); renderSide(p); renderCost(p); renderConfirm(p);
  window.scrollTo({top:0,behavior:"smooth"}); }

function renderHead(p){ $("#planHead").innerHTML=`
  <div class="ph-top"><span class="ph-city">${S.city.emoji} ${S.city.name}</span><span class="ph-arr">${S.city.arrival}</span></div>
  <h2>${p.title}</h2>
  <p class="psub">${p.subtitle||""}</p>
  ${p.recommended_for?`<p class="recfor">👨‍👩‍👧‍👧 이런 가족에게 &nbsp;<b>${p.recommended_for}</b></p>`:""}
  <div class="chips">
    ${(p.chips||[]).map(c=>`<span class="chip">${c}</span>`).join("")}
    ${p.total!=null?`<span class="chip total">예상 총경비 ${won(p.total)}원</span>`:""}
    ${p.budget?`<span class="chip ok">예산 ${won(p.budget)}원 이내 👍</span>`:""}
  </div>`; }

function orderedStops(p){ const o=[]; let n=0;
  p.days.forEach(d=>d.stops.forEach(s=>{ const h=s.ref.startsWith("hotel:"); o.push({...s,day:d.day,isHotel:h,n:h?null:++n}); })); return o; }

function renderMap(p){ if(S.map){ S.map.remove(); S.map=null; }
  const map=L.map("map",{scrollWheelZoom:true}); S.map=map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
  const pts=[];
  p.days.forEach(d=>{ const co=d.stops.map(s=>place(s.ref)).filter(x=>x&&x.lat).map(x=>[x.lat,x.lon]);
    if(co.length>1) L.polyline(co,{color:DAYCOL[d.day]||"#333",weight:4,opacity:.75,dashArray:"2 8"}).addTo(map); });
  orderedStops(p).forEach(s=>{ const a=place(s.ref); if(!a||!a.lat) return;
    const html=s.isHotel?`<div class="pin hotel"><span>🏨</span></div>`:`<div class="pin d${s.day}"><span>${s.n}</span></div>`;
    L.marker([a.lat,a.lon],{icon:L.divIcon({className:"",html,iconSize:[32,32],iconAnchor:[16,30]})}).addTo(map).bindPopup(s.isHotel?popupHotel(a):popupPoi(a,s)); pts.push([a.lat,a.lon]); });
  if(pts.length) map.fitBounds(pts,{padding:[48,48]});
  renderMapActions(p); setTimeout(()=>map.invalidateSize(),120); }

function popupPoi(a,s){ const img=commons(a.img);
  return `<div class="pop">${img?`<img src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
    <h4>${s.n}. ${a.name}</h4>${ratingLine(a)}<p class="pm">${a.price_hours||a.blurb||""}</p>
    <div class="pl">${a.naver?`<a href="${a.naver}" target="_blank" rel="noopener">네이버</a>`:""}${a.official?`<a href="${a.official}" target="_blank" rel="noopener">예매</a>`:""}<a href="${kakaoTo(a)}" target="_blank" rel="noopener">🚕</a></div></div>`; }
function popupHotel(h){ return `<div class="pop"><h4>🏨 ${h.name}</h4>${ratingLine(h)}<p class="pm">${h.price_range||""}</p>
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
    ${ratingLine(r)}${r.menu?`<div class="rest-mn">${r.menu}${r.price?` · ${r.price}`:""}</div>`:""}
    ${r.kid_note?`<div class="rest-kid">👶 ${r.kid_note}</div>`:""}${r.wait?`<div class="rest-wt">⏱️ ${r.wait}</div>`:""}
    <div class="lnks">${r.naver?`<a class="lnk" href="${r.naver}" target="_blank" rel="noopener">네이버</a>`:""}${r.phone?`<a class="lnk" href="tel:${r.phone}">📞 ${r.phone}</a>`:""}<a class="lnk" href="${kakaoTo(r)}" target="_blank" rel="noopener">🚕</a></div></div>`; }
function mealBlock(mm){ return `<div class="meal"><div class="meal-slot">🍽️ ${mm.slot} <span class="meal-near">${mm.near} 근처</span></div>${mm.candidates.map(id=>restCard(S.rest[id])).join("")}</div>`; }

function renderSide(p){ const el=$("#side"); el.innerHTML="";
  const h=S.hotels[p.base_hotel];
  if(h) el.insertAdjacentHTML("beforeend",`<div class="card hotel"><div class="hd">🏨 베이스 숙소 · 2박</div>
    <div class="in"><div class="grow"><p class="nm">${h.name}</p>${ratingLine(h)}<p class="meta">${h.family_note||""}</p><p class="price">${h.price_range||""}</p>
    <div class="lnks">${h.naver_map?`<a class="lnk" href="${h.naver_map}" target="_blank" rel="noopener">네이버 지도</a>`:""}${h.booking?`<a class="lnk" href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}${h.phone?`<a class="lnk" href="tel:${h.phone}">📞 ${h.phone}</a>`:""}<a class="lnk" href="${kakaoTo(h)}" target="_blank" rel="noopener">🚕 카카오T</a></div></div></div></div>`);
  if(p.decisions&&p.decisions.length) el.insertAdjacentHTML("beforeend",`<div class="card deck"><div class="deck-hd">✅ 결정 체크리스트 <span class="deck-sub">배우자 컨펌용</span></div>
    ${p.decisions.map((x,i)=>{const k=`chk_${S.city.id}_${p.id}_${i}`;return `<label class="deci"><input type="checkbox" data-k="${k}" ${localStorage.getItem(k)?"checked":""}><span><b>${x.label}</b><em>${x.note||""}</em></span></label>`;}).join("")}</div>`);
  const ct=S.city.city_tour;
  if(ct) el.insertAdjacentHTML("beforeend",`<div class="card tour"><div class="tour-hd">🚌 ${ct.name}</div><p class="tour-tx">${ct.note}</p>
    <div class="lnks">${ct.url?`<a class="lnk" href="${ct.url}" target="_blank" rel="noopener">홈페이지</a>`:""}${ct.booking?`<a class="lnk" href="${ct.booking}" target="_blank" rel="noopener">예약</a>`:""}${ct.phone?`<a class="lnk" href="tel:${ct.phone}">📞 ${ct.phone}</a>`:""}</div></div>`);
  p.days.forEach(d=>{ const col=DAYCOL[d.day]||"#333", g=gmapsDir(d.stops); let rows="";
    const mealsAfter=i=>(d.meals||[]).filter(m=>m.after===i).map(mealBlock).join("");
    rows+=mealsAfter(-1);
    for(let i=0;i<d.stops.length;i++){ const s=d.stops[i], a=place(s.ref); if(!a) continue;
      const isH=s.ref.startsWith("hotel:"), label=isH?"🏨":numFor(p,d,i), img=!isH&&a.img?commons(a.img):null;
      rows+=`<div class="stop"><div class="num"${isH?' style="background:#111"':''}>${label}</div>
        ${img?`<img class="thumb" src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
        <div class="body"><div class="nmrow">${s.time?`<span class="t">${s.time}</span>`:""}<span class="nm">${a.name}</span>${s.optional?'<span class="lnk opt">선택</span>':''}</div>
        ${ratingLine(a)}${s.note?`<div class="no">${s.note}</div>`:""}
        <div class="lnks">${(a.naver||a.naver_map)?`<a class="lnk" href="${a.naver||a.naver_map}" target="_blank" rel="noopener">네이버</a>`:""}${a.official?`<a class="lnk" href="${a.official}" target="_blank" rel="noopener">예매</a>`:""}</div></div></div>`;
      if(i<d.stops.length-1){ const b=place(d.stops[i+1].ref), lg=leg(a,b);
        if(lg) rows+=`<div class="leg"><span class="lg-ic">${lg.icon}</span><span class="lg-tx">${lg.mode} · 약 ${lg.mins}분${lg.cost?` · ₩${won(lg.cost)}`:" · 무료"}<span class="lg-no">${lg.note||""}</span></span>${lg.link?`<a class="lg-lk" href="${lg.link}" target="_blank" rel="noopener">${lg.linklabel}</a>`:""}</div>`; }
      rows+=mealsAfter(i);
    }
    el.insertAdjacentHTML("beforeend",`<div class="card day-block"><div class="day-hd" style="background:${col}"><h3>${d.day}일차 · ${d.label||""}</h3>${g?`<a class="zone" href="${g}" target="_blank" rel="noopener">🧭 길찾기</a>`:""}</div><div class="day-body">${rows}</div></div>`);
  });
  if(p.highlights&&p.highlights.length) el.insertAdjacentHTML("beforeend",`<div class="card hilite"><div class="hl-hd">✨ 이 여행의 하이라이트</div>${p.highlights.map(x=>`<div class="hl"><b>${x.name}</b> — ${x.blurb}</div>`).join("")}</div>`);
  el.querySelectorAll(".deci input").forEach(cb=>cb.onchange=()=>{ cb.checked?localStorage.setItem(cb.dataset.k,"1"):localStorage.removeItem(cb.dataset.k); }); }
function numFor(p,day,idx){ let n=0; for(const d of p.days){ for(let i=0;i<d.stops.length;i++){ if(!d.stops[i].ref.startsWith("hotel:")) n++; if(d===day&&i===idx) return n; } } return n; }

function renderCost(p){ const el=$("#cost"); if(!p.cost||!p.cost.length){ el.innerHTML=""; return; }
  const rows=p.cost.map(c=>`<tr><td class="cat">${c.cat}</td><td class="detail">${c.detail||""}</td><td class="n">${won(c.amount)}</td><td>${c.type?`<span class="badge ${c.type==='확정'?'f':'e'}">${c.type}</span>`:""}</td></tr>`).join("");
  const left=p.budget?p.budget-p.total:null;
  el.innerHTML=`<div class="card"><h3>💰 전체 경비 (4인 기준) · 식비는 위 맛집 참고</h3>
    <div class="tbl-wrap"><table><thead><tr><th>항목</th><th>내역</th><th class="n">금액(원)</th><th>구분</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>합계</td><td class="detail">${p.budget?`예산 ${won(p.budget)}원 이내`:""}</td><td class="n">${won(p.total)}</td><td></td></tr>
    ${left!=null?`<tr class="buf"><td>남는 여유</td><td class="detail">업그레이드 여력</td><td class="n">+${won(left)}</td><td></td></tr>`:""}</tfoot></table></div></div>`; }

function renderConfirm(p){ const el=$("#confirmBar"), key=`cfm_${S.city.id}_${p.id}`, done=localStorage.getItem(key);
  const cnt=S.plans.filter(x=>localStorage.getItem(`cfm_${S.city.id}_${x.id}`)).length;
  el.innerHTML=`<span class="st">${done?`✓ <b>${p.short}</b> 컨펌함`:`이 여행안이 마음에 드나요?`} · ${S.city.name} 컨펌 ${cnt}개</span>
    <button class="btn p ${done?'done':''}" id="cfm">${done?'컨펌 취소':'이 안으로 컨펌 👍'}</button><button class="btn s" id="shr">🔗 링크 공유</button>`;
  $("#cfm").onclick=()=>{ done?localStorage.removeItem(key):localStorage.setItem(key,new Date().toISOString()); renderPlanPicker(); renderConfirm(p); document.querySelectorAll(".plan-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===p.id)); };
  $("#shr").onclick=async()=>{ const url=location.origin+location.pathname+`#${S.city.id}/${p.id}`; try{ await navigator.clipboard.writeText(url); $("#shr").textContent="✓ 복사됨"; setTimeout(()=>$("#shr").textContent="🔗 링크 공유",1500);}catch(e){ prompt("링크:",url);} }; }

/* ---------- compare ---------- */
function toggleCompare(){ const el=$("#compare"); $("#builder").hidden=true; if(!el.hidden){ el.hidden=true; return; }
  const rows=S.plans.map(p=>{ const done=localStorage.getItem(`cfm_${S.city.id}_${p.id}`), m=p.metrics||{};
    return `<tr><td class="cat">${p.id==="custom"?"🧩 ":""}${p.short}${done?' <span class="chk">✓</span>':''}<div class="cmp-sub">${p.recommended_for||""}</div></td>
      <td class="n">${won(p.total)}</td><td class="n">${m.stops??"-"}곳</td><td class="n">${m.meals??"-"}끼</td><td class="n">${m.indoor??"-"}</td><td class="n">${m.kid??"-"}</td>
      <td><button class="btn s mini" data-go="${p.id}">열기 →</button></td></tr>`; }).join("");
  el.innerHTML=`<div class="card"><div class="cmp-head"><h3>📊 ${S.city.name} 여행안 비교 (${S.plans.length}개)</h3><button class="cmp-x" id="cmpX">닫기 ✕</button></div>
    <div class="tbl-wrap"><table class="cmp"><thead><tr><th>여행안 / 추천 대상</th><th class="n">총경비</th><th class="n">방문지</th><th class="n">식사</th><th class="n">실내</th><th class="n">아이만족<br><span class="mini2">(3=상)</span></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="cmp-tip">💡 실내 = 실내형 방문지 수(우천 대비) · 아이만족 = kid-fit 평균 · 식사 = 끼니별 맛집 슬롯 수.</p></div>`;
  el.hidden=false; $("#cmpX").onclick=()=>el.hidden=true;
  el.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>selectPlan(b.dataset.go)); el.scrollIntoView({behavior:"smooth"}); }

/* ---------- custom route builder ---------- */
const CATLABEL={beach:"🏖️ 해변",aquarium:"🐠 아쿠아리움",temple:"⛩️ 사찰",themepark:"🎢 놀이공원",experience:"🎡 체험",village:"🏘️ 마을",view:"🌆 전망",science:"🔬 과학관",mall:"🏬 실내몰",nature:"🌿 자연",waterfall:"💧 폭포",cave:"🕳️ 동굴",museum:"🖼️ 박물관",island:"⛴️ 섬(배)",drive:"🚗 드라이브"};
function openBuilder(){ $("#compare").hidden=true; const el=$("#builder"); if(!el.hidden){ el.hidden=true; return; }
  const byCat={}; Object.entries(S.at).forEach(([id,a])=>{ if(TRANSIT.has(a.category)) return; (byCat[a.category]=byCat[a.category]||[]).push([id,a]); });
  const hotelOpts=Object.entries(S.hotels).map(([id,h])=>`<option value="${id}">${h.name} · ${h.price_range||""}</option>`).join("");
  const groups=Object.keys(byCat).sort().map(cat=>`<div class="bg"><div class="bg-h">${CATLABEL[cat]||cat}</div><div class="bg-items">
    ${byCat[cat].map(([id,a])=>`<label class="bo"><input type="checkbox" value="${id}"><span>${a.name}${a.rating?` <em>★${a.rating}</em>`:""}</span></label>`).join("")}</div></div>`).join("");
  el.innerHTML=`<div class="card"><div class="cmp-head"><h3>🧩 내 코스 만들기 <span class="deck-sub">가고 싶은 곳만 골라 새 코스를 만드세요</span></h3><button class="cmp-x" id="bX">닫기 ✕</button></div>
    <div class="bctrl"><label>숙소 <select id="bHotel">${hotelOpts}</select></label>
      <label>일수 <select id="bDays"><option value="2">2박3일</option><option value="1">1박2일</option><option value="3">3박4일</option></select></label>
      <button class="btn p" id="bGo">코스 생성 →</button><span class="bcount" id="bCount">0곳 선택</span></div>
    <div class="bgroups">${groups}</div></div>`;
  el.hidden=false;
  const cbs=[...el.querySelectorAll('.bo input')];
  const upd=()=>$("#bCount").textContent=`${cbs.filter(c=>c.checked).length}곳 선택`;
  cbs.forEach(c=>c.onchange=upd);
  $("#bX").onclick=()=>el.hidden=true;
  $("#bGo").onclick=()=>{ const ids=cbs.filter(c=>c.checked).map(c=>c.value);
    if(ids.length<2){ alert("2곳 이상 선택해주세요."); return; }
    const plan=buildCustomPlan(ids,$("#bHotel").value,+$("#bDays").value+1);
    upsertCustom(plan); localStorage.setItem(`custom_${S.city.id}`,JSON.stringify({ids,hotel:$("#bHotel").value,days:+$("#bDays").value+1}));
    el.hidden=true; renderPlanPicker(); selectPlan("custom"); };
  el.scrollIntoView({behavior:"smooth"}); }

function buildDayMeals(stops,hotel,dayNum){
  const pois=stops.map((s,i)=>[i,S.at[s.ref]]).filter(([i,a])=>a&&a.lat&&!TRANSIT.has(a.category));
  const used=new Set(), meals=[];
  if(dayNum>1&&hotel&&hotel.lat){ const b=nearestRest(hotel,2,used); b.forEach(x=>used.add(x)); if(b.length) meals.push({slot:"아침",after:-1,near:hotel.name,candidates:b}); }
  if(pois.length){ const [li,la]=pois[Math.floor(pois.length/2)]; const c=nearestRest(la,3,used); c.forEach(x=>used.add(x)); if(c.length) meals.push({slot:"점심",after:li,near:la.name,candidates:c});
    const last=stops[stops.length-1], lastTransit=S.at[last.ref]&&TRANSIT.has(S.at[last.ref].category);
    let di=null,da=null,near=null; const afterL=pois.filter(([i])=>i>li);
    if(afterL.length){ [di,da]=afterL[afterL.length-1]; near=da.name; } else if(hotel&&hotel.lat&&!lastTransit){ di=stops.length-1; da=hotel; near=hotel.name; }
    if(da){ const c2=nearestRest(da,3,used); if(c2.length) meals.push({slot:"저녁",after:di,near,candidates:c2}); } }
  return meals;
}
function buildCustomPlan(ids,hotelId,ndays){
  const hotel=S.hotels[hotelId], spots=ids.map(id=>({id,...S.at[id]})).filter(x=>x.lat);
  let cur=hotel&&hotel.lat?hotel:spots[0], rem=[...spots], order=[];
  while(rem.length){ rem.sort((a,b)=>haversine(cur,a)-haversine(cur,b)); const n=rem.shift(); order.push(n); cur=n; }
  const perDay=Math.ceil(order.length/ndays), days=[];
  const arr=S.city.arrival_ref;
  for(let d=0; d<ndays; d++){ const slice=order.slice(d*perDay,(d+1)*perDay); if(!slice.length) continue;
    const stops=[];
    if(d===0&&arr&&S.at[arr]) stops.push({ref:arr,time:"",note:"도착"});
    if(hotel) stops.push({ref:"hotel:"+hotelId,time:"",note:d===0?"체크인":"숙소"});
    slice.forEach(s=>stops.push({ref:s.id,time:"",note:""}));
    if(d===ndays-1&&arr&&S.at[arr]) stops.push({ref:arr,time:"",note:"귀가"});
    days.push({day:d+1,label:"내 코스",stops,meals:buildDayMeals(stops,hotel,d+1)});
  }
  const cc=S.city.cost, paid=[...new Set(ids)].reduce((s,id)=>s+((S.at[id]||{}).price4||0),0);
  const lodging=(hotel&&hotel.nightly?hotel.nightly:220000)*(ndays);
  const cost=[{cat:cc.intercity_label,detail:"왕복 4인",amount:cc.intercity,type:"추정"},
    {cat:"현지 교통",detail:"구간별 표시",amount:cc.local,type:"추정"},
    {cat:`숙박 ${ndays}박`,detail:hotel?hotel.name:"",amount:lodging,type:"추정"},
    {cat:"입장·체험",detail:[...new Set(ids)].map(id=>(S.at[id]||{}).name).filter(Boolean).join(", "),amount:paid,type:"추정"},
    {cat:"식비",detail:`4인·${ndays+1}일`,amount:cc.food,type:"추정"},{cat:"예비·기념품",detail:"버퍼",amount:cc.misc,type:"추정"}];
  const total=cost.reduce((s,c)=>s+c.amount,0);
  const kid={상:3,중:2,하:1}, kv=ids.map(id=>kid[(S.at[id]||{}).kid_fit]||0);
  return {id:"custom",short:"내 코스",title:`${S.city.name} · 내가 만든 코스`,subtitle:`선택한 ${ids.length}곳을 동선 순서로 자동 배치 · 식사·이동·경비 자동 계산`,
    region:S.city.name,base_hotel:hotelId,budget:cc.budget,total,chips:["직접 선택","맞춤 코스"],recommended_for:"우리 가족이 직접 고른 코스",
    days,cost,decisions:[{label:cc.intercity_label+" 예매",note:"예매 오픈 즉시"},{label:"숙소 예약",note:hotel?hotel.name:""},{label:"예산 확정",note:`총액 ${won(total)}원`}],
    highlights:[],metrics:{stops:ids.length,indoor:0,kid:kv.length?+(kv.reduce((a,b)=>a+b,0)/kv.length).toFixed(1):0,meals:days.reduce((s,d)=>s+d.meals.length,0)}};
}
function upsertCustom(plan){ const i=S.plans.findIndex(p=>p.id==="custom"); if(i>=0) S.plans[i]=plan; else S.plans.push(plan); }
function restoreCustom(){ try{ const raw=localStorage.getItem(`custom_${S.city.id}`); if(!raw) return; const {ids,hotel,days}=JSON.parse(raw);
  const valid=ids.filter(id=>S.at[id]); if(valid.length>=2&&S.hotels[hotel]) upsertCustom(buildCustomPlan(valid,hotel,days)); }catch(e){} }

boot().catch(e=>{ $("#planHead").innerHTML='<p style="color:#E15A38">데이터 로드 실패: '+e.message+'</p>'; });
