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
  const fav=S.favR||new Set();
  return Object.entries(S.rest).filter(([id,r])=>r.lat&&!excl.has(id))
    .sort((a,b)=>((fav.has(b[0])?1:0)-(fav.has(a[0])?1:0)) || (haversine(target,a[1])-haversine(target,b[1]))).slice(0,k).map(x=>x[0]); }

/* ---------- ratings ---------- */
function stars(r){ if(r==null) return ""; const f=Math.round(r);
  return `<span class="stars">${"★".repeat(f)}${"☆".repeat(Math.max(0,5-f))}</span>`; }
function ratingLine(o){ if(!o) return "";
  if(o.rating==null){ return o.sentiment?`<div class="rate"><span class="senti">“${o.sentiment}”</span></div>`:""; }
  const rv=o.reviews?(o.reviews>=1000?(o.reviews/1000).toFixed(1)+"k":o.reviews):null;
  return `<div class="rate">${stars(o.rating)}<b>${o.rating}</b>${rv?`<span class="rev">리뷰 ${rv}</span>`:""}${o.sentiment?`<span class="senti">“${o.sentiment}”</span>`:""}</div>`; }
/* 3 blog/review discovery links (search-based, always valid — no fabricated post URLs) */
function reviewLinks(name,kind){ if(!name) return "";
  const third = kind==="food"
    ? {u:`https://www.diningcode.com/search/${enc(name)}`,t:"다이닝코드"}
    : {u:`https://search.naver.com/search.naver?query=${enc(name+" 리뷰")}`,t:"네이버리뷰"};
  return `<div class="reviews"><span class="rv-h">📝 후기</span>`+
    `<a class="rlnk" href="https://search.naver.com/search.naver?ssc=tab.blog.all&query=${enc(name+" 후기")}" target="_blank" rel="noopener">네이버블로그</a>`+
    `<a class="rlnk" href="https://www.google.com/search?q=${enc(name+" 블로그 후기")}" target="_blank" rel="noopener">구글</a>`+
    `<a class="rlnk" href="${third.u}" target="_blank" rel="noopener">${third.t}</a></div>`; }

/* photo: prefer real Wikimedia (img) then generated illustration (photo) */
function resolveImg(o){ if(!o) return null; if(o.img) return commons(o.img); if(o.photo) return o.photo; return null; }

/* ---------- favorites → 내 코스 ---------- */
function favKey(t){ return `fav${t}_${S.city.id}`; }
function loadFavs(){ try{ S.fav=new Set(JSON.parse(localStorage.getItem(favKey("A"))||"[]")); }catch(e){ S.fav=new Set(); }
  try{ S.favR=new Set(JSON.parse(localStorage.getItem(favKey("R"))||"[]")); }catch(e){ S.favR=new Set(); } }
function toggleFav(id,t){ const set=t==="R"?S.favR:S.fav; set.has(id)?set.delete(id):set.add(id);
  localStorage.setItem(favKey(t),JSON.stringify([...set]));
  document.querySelectorAll(`[data-fav="${t}:${id}"]`).forEach(b=>{ const on=set.has(id); b.classList.toggle("on",on); b.textContent=on?"✓ 담김":"＋ 내 코스"; });
  renderFavPill(); }
function favBtn(id,t){ const on=(t==="R"?S.favR:S.fav).has(id);
  return `<button class="favbtn${on?' on':''}" data-fav="${t}:${id}">${on?"✓ 담김":"＋ 내 코스"}</button>`; }
function bindFavs(scope){ (scope||document).querySelectorAll(".favbtn").forEach(b=>b.onclick=e=>{ e.preventDefault(); const [t,id]=b.dataset.fav.split(":"); toggleFav(id,t); }); }
function renderFavPill(){ let el=$("#favPill"); if(!el){ el=document.createElement("button"); el.id="favPill"; document.body.appendChild(el); }
  const n=(S.fav?.size||0)+(S.favR?.size||0);
  if(!n){ el.style.display="none"; return; }
  el.style.display="flex"; el.innerHTML=`🧩 담은 곳 <b>${n}</b> · 내 코스 만들기 →`;
  el.onclick=openBuilder; }
function buildFromFavorites(){
  const ids=[...(S.fav||[])].filter(id=>S.at[id]);
  if(ids.length<2){ alert("여행지를 2곳 이상 '＋ 내 코스'로 담아주세요. (맛집은 담으면 해당 코스 식사에 우선 반영됩니다)"); return; }
  const hotelId=Object.keys(S.hotels)[0];
  const plan=buildCustomPlan(ids,hotelId,3);
  localStorage.setItem(`custom_${S.city.id}`,JSON.stringify({ids,hotel:hotelId,days:3}));
  upsertCustom(plan); renderPlanPicker(); selectPlan("custom");
}

function renderVideo(){ const el=$("#tripVideo"); if(!el) return; const c=S.city; el.innerHTML="";
  const vids=[[c.intro_video, c.id==="jeju"?"✈️ 비행기 타고 출발":"🚄 SRT 타고 출발"],[c.feel_video,"🌊 이번 여행 미리보기"]].filter(v=>v[0]);
  if(!vids.length) return;
  el.innerHTML=`<div class="tv-h">🎬 여행 미리보기</div><div class="tv-grid">${vids.map(([src,cap])=>`<figure class="tv"><video src="${src}" muted loop autoplay playsinline preload="metadata" onerror="this.closest('figure').style.display='none'"></video><figcaption>${cap}</figcaption></figure>`).join("")}</div>`;
  setTimeout(()=>{ if(![...el.querySelectorAll('figure')].some(f=>f.style.display!=='none')) el.innerHTML=""; },2500); }

function bookingCard(){ const c=S.city, b=c.booking||[], ht=c.home_transfer;
  return `<div class="card book"><div class="book-hd">🎫 예매 & 출발 준비</div>
    <div class="book-row"><b>${c.cost.intercity_label} 예매</b><div class="lnks">${b.map(x=>`<a class="lnk" href="${x.url}" target="_blank" rel="noopener">${x.label}</a>`).join("")}</div></div>
    ${ht?`<div class="book-row"><b>🚐 ${ht.label}</b><div class="bt-note">${ht.note}</div><div class="lnks">${(ht.book||[]).map(x=>`<a class="lnk" href="${x.url}" target="_blank" rel="noopener">${x.label}</a>`).join("")}</div></div>`:""}</div>`; }

function packingCard(){ const pk=S.city.packing; if(!pk) return "";
  const item=(x,i,g)=>{const k=`pk_${S.city.id}_${g}_${i}`;return `<label class="pk"><input type="checkbox" data-k="${k}" ${localStorage.getItem(k)?"checked":""}><span>${x}</span></label>`;};
  return `<div class="card pack"><div class="pack-hd">🧳 여행 준비물 <span class="deck-sub">체크하며 챙기세요</span></div>
    <div class="pack-grp">공통</div><div class="pack-list">${pk.common.map((x,i)=>item(x,i,"c")).join("")}</div>
    <div class="pack-grp">${S.city.name} 맞춤</div><div class="pack-list">${pk.specific.map((x,i)=>item(x,i,"s")).join("")}</div></div>`; }

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
  loadFavs(); restoreCustom();
  document.querySelectorAll(".city-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  $("#builder").hidden=true; $("#compare").hidden=true;
  renderPlanPicker(); renderFavPill();
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
  ${S.city.hero?`<img class="phero" src="${S.city.hero}" alt="${S.city.name}" onerror="this.style.display='none'">`:""}
  <div class="ph-top"><span class="ph-city">${S.city.emoji} ${S.city.name}</span><span class="ph-arr">${S.city.arrival}</span></div>
  <h2>${p.title}</h2>
  <p class="pintro">${p.intro||p.subtitle||""}</p>
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
  renderMapActions(p); renderVideo(); setTimeout(()=>map.invalidateSize(),120); }

function popupPoi(a,s){ const img=resolveImg(a);
  return `<div class="pop">${img?`<img src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
    <h4>${s.n}. ${a.name}</h4>${ratingLine(a)}<p class="pm">${a.price_hours||a.blurb||""}</p>
    <div class="pl">${a.naver?`<a href="${a.naver}" target="_blank" rel="noopener">네이버</a>`:""}${a.official?`<a href="${a.official}" target="_blank" rel="noopener">예매</a>`:""}<a href="${kakaoTo(a)}" target="_blank" rel="noopener">🚕</a></div></div>`; }
function popupHotel(h){ return `<div class="pop"><h4>🏨 ${h.name}</h4>${ratingLine(h)}${h.pool?`<p class="pm">🏊 ${h.pool}</p>`:""}<p class="pm">${h.price_range||""}</p>
    <div class="pl">${h.naver_map?`<a href="${h.naver_map}" target="_blank" rel="noopener">네이버</a>`:""}${h.booking?`<a href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}${h.phone?`<a href="tel:${h.phone}">전화</a>`:""}<a href="${kakaoTo(h)}" target="_blank" rel="noopener">🚕</a></div></div>`; }

function gmapsDir(stops){ const c=stops.map(s=>place(s.ref)).filter(x=>x&&x.lat); if(c.length<2) return null;
  const o=c[0],dd=c[c.length-1],w=c.slice(1,-1).map(x=>`${x.lat},${x.lon}`).join("|");
  let u=`https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${dd.lat},${dd.lon}&travelmode=transit`;
  if(w) u+=`&waypoints=${enc(w)}`; return u; }
function renderMapActions(p){ const el=$("#mapActions"); el.innerHTML="";
  const g=gmapsDir(p.days.flatMap(d=>d.stops));
  if(g) el.insertAdjacentHTML("beforeend",`<a href="${g}" target="_blank" rel="noopener">🧭 구글맵 전체 길찾기</a>`);
  if(p.kml) el.insertAdjacentHTML("beforeend",`<a href="${p.kml}" download>⬇️ KML(구글 마이맵)</a>`);
  el.insertAdjacentHTML("beforeend",`<button id="printBtn">🖨️ PDF·인쇄</button>`);
  $("#printBtn").onclick=()=>openPrint(p); }

function restCard(id){ const r=S.rest[id]; if(!r) return "";
  return `<div class="rest"><div class="rest-top"><div class="rest-nm">${r.name}${r.category?` <span class="rest-cat">${r.category}</span>`:""}</div>${favBtn(id,"R")}</div>
    ${ratingLine(r)}${r.menu?`<div class="rest-mn">${r.menu}${r.price?` · ${r.price}`:""}</div>`:""}
    ${r.kid_note?`<div class="rest-kid">👶 ${r.kid_note}</div>`:""}${r.wait?`<div class="rest-wt">⏱️ ${r.wait}</div>`:""}
    <div class="lnks">${r.naver?`<a class="lnk" href="${r.naver}" target="_blank" rel="noopener">네이버</a>`:""}${r.phone?`<a class="lnk" href="tel:${r.phone}">📞 ${r.phone}</a>`:""}<a class="lnk" href="${kakaoTo(r)}" target="_blank" rel="noopener">🚕</a></div>
    ${reviewLinks(r.name,"food")}</div>`; }
function mealBlock(mm){ return `<div class="meal"><div class="meal-slot">🍽️ ${mm.slot} <span class="meal-near">${mm.near} 근처</span></div>${mm.candidates.map(id=>restCard(id)).join("")}</div>`; }

function renderSide(p){ const el=$("#side"); el.innerHTML="";
  const h=S.hotels[p.base_hotel];
  if(h) el.insertAdjacentHTML("beforeend",`<div class="card hotel"><div class="hd">🏨 베이스 숙소 · 2박</div>
    ${resolveImg(h)?`<img class="hbanner" src="${resolveImg(h)}" alt="${h.name}" onerror="this.style.display='none'">`:""}<div class="in"><div class="grow"><p class="nm">${h.name}</p>${ratingLine(h)}${h.pool?`<p class="pool">🏊 ${h.pool}</p>`:""}<p class="meta">${h.family_note||""}</p><p class="price">${h.price_range||""}</p>
    <div class="lnks">${h.naver_map?`<a class="lnk" href="${h.naver_map}" target="_blank" rel="noopener">네이버 지도</a>`:""}${h.booking?`<a class="lnk" href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}${h.phone?`<a class="lnk" href="tel:${h.phone}">📞 ${h.phone}</a>`:""}<a class="lnk" href="${kakaoTo(h)}" target="_blank" rel="noopener">🚕 카카오T</a></div>
    ${reviewLinks(h.name,"hotel")}</div></div></div>`);
  el.insertAdjacentHTML("beforeend",bookingCard());
  if(p.decisions&&p.decisions.length) el.insertAdjacentHTML("beforeend",`<div class="card deck"><div class="deck-hd">✅ 결정 체크리스트 <span class="deck-sub">배우자 컨펌용</span></div>
    ${p.decisions.map((x,i)=>{const k=`chk_${S.city.id}_${p.id}_${i}`;return `<label class="deci"><input type="checkbox" data-k="${k}" ${localStorage.getItem(k)?"checked":""}><span><b>${x.label}</b><em>${x.note||""}</em></span></label>`;}).join("")}</div>`);
  const ct=S.city.city_tour;
  if(ct) el.insertAdjacentHTML("beforeend",`<div class="card tour"><div class="tour-hd">🚌 ${ct.name}</div><p class="tour-tx">${ct.note}</p>
    <div class="lnks">${ct.url?`<a class="lnk" href="${ct.url}" target="_blank" rel="noopener">홈페이지</a>`:""}${ct.booking?`<a class="lnk" href="${ct.booking}" target="_blank" rel="noopener">예약</a>`:""}${ct.phone?`<a class="lnk" href="tel:${ct.phone}">📞 ${ct.phone}</a>`:""}</div></div>`);
  p.days.forEach(d=>{ const col=DAYCOL[d.day]||"#333", g=gmapsDir(d.stops); let rows="";
    const mealsAfter=i=>(d.meals||[]).filter(m=>m.after===i).map(mealBlock).join("");
    rows+=mealsAfter(-1);
    for(let i=0;i<d.stops.length;i++){ const s=d.stops[i], a=place(s.ref); if(!a) continue;
      const isH=s.ref.startsWith("hotel:"), label=isH?"🏨":numFor(p,d,i), img=!isH?resolveImg(a):null;
      rows+=`<div class="stop"><div class="num"${isH?' style="background:#111"':''}>${label}</div>
        ${img?`<img class="thumb" src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
        <div class="body"><div class="nmrow">${s.time?`<span class="t">${s.time}</span>`:""}<span class="nm">${a.name}</span>${s.optional?'<span class="lnk opt">선택</span>':''}</div>
        ${ratingLine(a)}${s.note?`<div class="no">${s.note}</div>`:""}
        <div class="lnks">${(a.naver||a.naver_map)?`<a class="lnk" href="${a.naver||a.naver_map}" target="_blank" rel="noopener">네이버</a>`:""}${a.official?`<a class="lnk" href="${a.official}" target="_blank" rel="noopener">예매</a>`:""}${(!isH&&!TRANSIT.has(a.category))?favBtn(s.ref,"A"):""}</div>${!isH?reviewLinks(a.name,"spot"):""}</div></div>`;
      if(i<d.stops.length-1){ const b=place(d.stops[i+1].ref), lg=leg(a,b);
        if(lg) rows+=`<div class="leg"><span class="lg-ic">${lg.icon}</span><span class="lg-tx">${lg.mode} · 약 ${lg.mins}분${lg.cost?` · ₩${won(lg.cost)}`:" · 무료"}<span class="lg-no">${lg.note||""}</span></span>${lg.link?`<a class="lg-lk" href="${lg.link}" target="_blank" rel="noopener">${lg.linklabel}</a>`:""}</div>`; }
      rows+=mealsAfter(i);
    }
    el.insertAdjacentHTML("beforeend",`<div class="card day-block"><div class="day-hd" style="background:${col}"><h3>${d.day}일차 · ${d.label||""}</h3>${g?`<a class="zone" href="${g}" target="_blank" rel="noopener">🧭 길찾기</a>`:""}</div><div class="day-body">${rows}</div></div>`);
  });
  if(p.highlights&&p.highlights.length) el.insertAdjacentHTML("beforeend",`<div class="card hilite"><div class="hl-hd">✨ 이 여행의 하이라이트</div>${p.highlights.map(x=>`<div class="hl"><b>${x.name}</b> — ${x.blurb}</div>`).join("")}</div>`);
  el.insertAdjacentHTML("beforeend",packingCard());
  el.querySelectorAll("input[data-k]").forEach(cb=>cb.onchange=()=>{ cb.checked?localStorage.setItem(cb.dataset.k,"1"):localStorage.removeItem(cb.dataset.k); }); bindFavs(el); }
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
  const chk=id=>(S.fav&&S.fav.has(id))?" checked":"";
  const groups=Object.keys(byCat).sort().map(cat=>`<div class="bg"><div class="bg-h">${CATLABEL[cat]||cat}</div><div class="bg-items">
    ${byCat[cat].map(([id,a])=>`<label class="bo"><input type="checkbox" value="${id}"${chk(id)}><span>${a.name}${a.rating?` <em>★${a.rating}</em>`:""}</span></label>`).join("")}</div></div>`).join("");
  el.innerHTML=`<div class="card"><div class="cmp-head"><h3>🧩 내 코스 만들기 <span class="deck-sub">가고 싶은 곳을 담고 인원·일수를 고르면 완성됩니다</span></h3><button class="cmp-x" id="bX">닫기 ✕</button></div>
    <div class="bctrl"><label>숙소 <select id="bHotel">${hotelOpts}</select></label>
      <label>기간 <select id="bDays"><option value="2">2박3일</option><option value="1">1박2일</option><option value="3">3박4일</option></select></label>
      <label>인원 <select id="bPpl"><option value="2">2명</option><option value="3">3명</option><option value="4" selected>4명</option><option value="5">5명</option><option value="6">6명</option></select></label>
      <label>출발일 <input type="date" id="bDate"></label>
      <button class="btn p" id="bGo">코스 생성 →</button><span class="bcount" id="bCount">0곳 선택</span></div>
    <div class="bgroups">${groups}</div></div>`;
  el.hidden=false;
  const cbs=[...el.querySelectorAll('.bo input')];
  const upd=()=>$("#bCount").textContent=`${cbs.filter(c=>c.checked).length}곳 선택`; upd();
  cbs.forEach(c=>c.onchange=upd);
  $("#bX").onclick=()=>el.hidden=true;
  $("#bGo").onclick=()=>{ const ids=cbs.filter(c=>c.checked).map(c=>c.value);
    if(ids.length<2){ alert("2곳 이상 선택해주세요."); return; }
    const hotel=$("#bHotel").value, days=+$("#bDays").value+1, ppl=+$("#bPpl").value, date=$("#bDate").value;
    const plan=buildCustomPlan(ids,hotel,days,ppl,date);
    upsertCustom(plan); localStorage.setItem(`custom_${S.city.id}`,JSON.stringify({ids,hotel,days,ppl,date}));
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
function buildCustomPlan(ids,hotelId,ndays,people,date){
  people=people||4; date=date||"";
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
  const cc=S.city.cost, pf=people/4, sc=v=>Math.round(v*pf/100)*100;
  const paid=sc([...new Set(ids)].reduce((s,id)=>s+((S.at[id]||{}).price4||0),0));
  const rooms=Math.max(1,Math.ceil(people/4));
  const lodging=(hotel&&hotel.nightly?hotel.nightly:220000)*ndays*rooms;
  const cost=[{cat:cc.intercity_label,detail:`왕복 ${people}인`,amount:sc(cc.intercity),type:"추정"},
    ...(cc.home_transfer?[{cat:"집↔출발지 이동",detail:"잠실↔수서/공항 벤 왕복",amount:cc.home_transfer,type:"추정"}]:[]),
    {cat:"현지 교통",detail:"구간별 표시",amount:cc.local,type:"추정"},
    {cat:`숙박 ${ndays}박`,detail:`${hotel?hotel.name:""}${rooms>1?` · ${rooms}객실`:""}`,amount:lodging,type:"추정"},
    {cat:"입장·체험",detail:[...new Set(ids)].map(id=>(S.at[id]||{}).name).filter(Boolean).join(", "),amount:paid,type:"추정"},
    {cat:"식비",detail:`${people}인·${ndays+1}일`,amount:sc(cc.food),type:"추정"},{cat:"예비·기념품",detail:"버퍼",amount:cc.misc,type:"추정"}];
  const total=cost.reduce((s,c)=>s+c.amount,0);
  const kid={상:3,중:2,하:1}, kv=ids.map(id=>kid[(S.at[id]||{}).kid_fit]||0);
  const over=total>cc.budget;
  return {id:"custom",short:"내 코스",title:`${S.city.name} · 우리 가족 코스`,
    intro:`우리 가족이 직접 고른 ${ids.length}곳을 가까운 순서대로 이어 붙였습니다. 끼니마다 근처 맛집을 넣고 이동수단과 경비까지 자동으로 계산했어요.${date?` ${date}에 출발하는 ${people}인 기준입니다.`:` ${people}인 기준입니다.`}`,
    subtitle:`직접 고른 ${ids.length}곳 · ${people}인 · ${ndays}박${ndays+1}일${date?` · ${date} 출발`:""}`,
    region:S.city.name,base_hotel:hotelId,budget:cc.budget,total,chips:["직접 선택",`${people}인`,over?"예산 초과":"맞춤 코스"],recommended_for:"우리 가족이 직접 고른 코스",
    days,cost,decisions:[{label:cc.intercity_label+" 예매",note:"예매 오픈 즉시"},{label:"숙소 예약",note:hotel?hotel.name:""},{label:"예산 확정",note:`총액 ${won(total)}원`}],
    highlights:[],metrics:{stops:ids.length,indoor:0,kid:kv.length?+(kv.reduce((a,b)=>a+b,0)/kv.length).toFixed(1):0,meals:days.reduce((s,d)=>s+d.meals.length,0)}};
}
function upsertCustom(plan){ const i=S.plans.findIndex(p=>p.id==="custom"); if(i>=0) S.plans[i]=plan; else S.plans.push(plan); }
function restoreCustom(){ try{ const raw=localStorage.getItem(`custom_${S.city.id}`); if(!raw) return; const {ids,hotel,days,ppl,date}=JSON.parse(raw);
  const valid=ids.filter(id=>S.at[id]); if(valid.length>=2&&S.hotels[hotel]) upsertCustom(buildCustomPlan(valid,hotel,days,ppl,date)); }catch(e){} }

/* ---------- print / PDF (핵심 요약) ---------- */
function openPrint(p){
  const c=S.city, h=S.hotels[p.base_hotel];
  const restName=id=>(S.rest[id]||{}).name||"";
  let daysHtml="";
  p.days.forEach(d=>{
    const meal=slot=>{ const m=(d.meals||[]).find(x=>x.slot===slot); return m?`${slot}: ${m.candidates.map(restName).filter(Boolean).slice(0,2).join(" / ")}`:""; };
    let stops="";
    d.stops.forEach(s=>{ const a=place(s.ref); if(!a) return; const isH=s.ref.startsWith("hotel:");
      stops+=`<li>${s.time?`<b>${s.time}</b> `:""}${isH?"🏨 ":""}${a.name}${s.note?` <span class="pg">— ${s.note}</span>`:""}</li>`; });
    const meals=["아침","점심","저녁"].map(meal).filter(Boolean).join(" · ");
    daysHtml+=`<div class="pd"><h3>${d.day}일차 · ${d.label||""}</h3><ol>${stops}</ol>${meals?`<div class="pm">🍽️ ${meals}</div>`:""}</div>`;
  });
  const cost=(p.cost||[]).map(x=>`<tr><td>${x.cat}</td><td>${x.detail||""}</td><td style="text-align:right">${won(x.amount)}</td></tr>`).join("");
  const pk=c.packing?[...c.packing.common,...c.packing.specific]:[];
  const book=(c.booking||[]).map(x=>x.label).join(", ");
  let sheet=$("#printSheet"); if(!sheet){ sheet=document.createElement("div"); sheet.id="printSheet"; document.body.appendChild(sheet); }
  sheet.innerHTML=`
    <div class="ps-head"><h1>${p.title}</h1>
      <p>${c.emoji} ${c.name} · 어른 2 + 아이 2 · 2박 3일 · 예상 총경비 <b>${won(p.total)}원</b> (예산 ${won(p.budget)}원 이내)</p>
      <p>🏨 숙소: ${h?h.name:""}${h&&h.pool?` (${h.pool})`:""} · 🚄/✈️ ${c.arrival}</p></div>
    <div class="ps-days">${daysHtml}</div>
    <div class="ps-cost"><h3>💰 경비 (4인)</h3><table>${cost}<tr class="tot"><td>합계</td><td></td><td style="text-align:right">${won(p.total)}원</td></tr></table></div>
    <div class="ps-two">
      <div><h3>🎫 예매 & 이동</h3><p>${c.cost.intercity_label}: ${book}</p><p>${c.home_transfer?c.home_transfer.label+" (왕복 약 "+won(c.home_transfer.amount)+"원)":""}</p></div>
      <div><h3>🧳 준비물</h3><p>${pk.join(" · ")}</p></div>
    </div>
    <div class="ps-foot">가족여행 플래너 · 가격·시간은 추정 포함, 예약 전 재확인</div>`;
  document.body.classList.add("printing");
  const done=()=>{ document.body.classList.remove("printing"); window.removeEventListener("afterprint",done); };
  window.addEventListener("afterprint",done);
  setTimeout(()=>window.print(),200);
}

boot().catch(e=>{ $("#planHead").innerHTML='<p style="color:#E15A38">데이터 로드 실패: '+e.message+'</p>'; });
