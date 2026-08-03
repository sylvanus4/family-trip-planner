/* 가족여행 플래너 — data-driven interactive planner */
const REPO_URL = "https://github.com/sylvanus4/family-trip-planner";
const DAYCOL = {1:"#0E7C7B",2:"#E15A38",3:"#DE9A2E",4:"#6D28D9",5:"#0369A1"};
const state = { plans:[], hotels:{}, attractions:{}, cur:null, map:null, layer:null };

const $ = s => document.querySelector(s);
const won = n => n==null ? "-" : Number(n).toLocaleString("ko-KR");
const commons = f => f ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=500` : null;

async function boot(){
  document.getElementById("repoLink").href = REPO_URL + "#readme";
  const [plans,hotels,attractions] = await Promise.all([
    fetch("data/plans.json").then(r=>r.json()),
    fetch("data/hotels.json").then(r=>r.json()),
    fetch("data/attractions.json").then(r=>r.json())
  ]);
  state.plans = plans.plans; state.hotels = hotels; state.attractions = attractions;
  renderPicker();
  const want = (location.hash.match(/plan=([^&]+)/)||[])[1];
  selectPlan(want && state.plans.find(p=>p.id===want) ? want : state.plans[0].id);
}

function place(ref){
  if(ref.startsWith("hotel:")) { const h=state.hotels[ref.slice(6)]; return h && {...h,_type:"hotel"}; }
  const a=state.attractions[ref]; return a && {...a,_type:"poi"};
}

function renderPicker(){
  const el=$("#planPicker"); el.innerHTML="";
  state.plans.forEach(p=>{
    const b=document.createElement("button");
    b.className="plan-btn"+(p.id===state.cur?" active":"");
    const done = localStorage.getItem("confirm_"+p.id);
    b.innerHTML = (done?'<span class="chk">✓</span> ':'') + p.short;
    b.onclick=()=>selectPlan(p.id);
    b.dataset.id=p.id; el.appendChild(b);
  });
}

function selectPlan(id){
  state.cur=id; location.hash="plan="+id;
  document.querySelectorAll(".plan-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  const p=state.plans.find(x=>x.id===id);
  renderHead(p); renderMap(p); renderSide(p); renderCost(p); renderConfirm(p);
}

function renderHead(p){
  $("#planHead").innerHTML = `
    <h2>${p.title}</h2>
    <p class="psub">${p.subtitle||""}</p>
    <div class="chips">
      ${(p.chips||[]).map(c=>`<span class="chip">${c}</span>`).join("")}
      ${p.total!=null?`<span class="chip total">예상 총경비 ${won(p.total)}원</span>`:""}
    </div>`;
}

function numberedStops(p){
  const out=[]; let n=0;
  p.days.forEach(d=> d.stops.forEach(s=>{ if(!s.ref.startsWith("hotel:")){ n++; out.push({...s,n,day:d.day}); }}));
  return out;
}

function renderMap(p){
  if(state.map){ state.map.remove(); state.map=null; }
  const map=L.map("map",{scrollWheelZoom:true}); state.map=map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
  const pts=[];
  // day polylines
  p.days.forEach(d=>{
    const coords=d.stops.map(s=>place(s.ref)).filter(x=>x&&x.lat).map(x=>[x.lat,x.lon]);
    if(coords.length>1) L.polyline(coords,{color:DAYCOL[d.day]||"#333",weight:4,opacity:.75,dashArray:"2 8"}).addTo(map);
  });
  // hotel marker
  const hotel=state.hotels[(p.base_hotel||"")];
  if(hotel&&hotel.lat){
    const hi=L.divIcon({className:"",html:`<div class="pin hotel"><span>🏨</span></div>`,iconSize:[30,30],iconAnchor:[15,28]});
    L.marker([hotel.lat,hotel.lon],{icon:hi}).addTo(map).bindPopup(popupHotel(hotel));
    pts.push([hotel.lat,hotel.lon]);
  }
  // numbered POI markers
  numberedStops(p).forEach(s=>{
    const a=place(s.ref); if(!a||!a.lat) return;
    const icon=L.divIcon({className:"",html:`<div class="pin d${s.day}"><span>${s.n}</span></div>`,iconSize:[30,30],iconAnchor:[15,28]});
    L.marker([a.lat,a.lon],{icon}).addTo(map).bindPopup(popupPoi(a,s));
    pts.push([a.lat,a.lon]);
  });
  if(pts.length) map.fitBounds(pts,{padding:[40,40]});
  renderMapActions(p);
  setTimeout(()=>map.invalidateSize(),120);
}

function popupPoi(a,s){
  const img=commons(a.img);
  return `<div class="pop">${img?`<img src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
    <h4>${s.n}. ${a.name}</h4>
    <p class="pm">${a.price_hours||a.blurb||""}</p>
    <div class="pl">
      ${a.naver?`<a href="${a.naver}" target="_blank" rel="noopener">네이버 지도</a>`:""}
      ${a.review?`<a href="${a.review}" target="_blank" rel="noopener">리뷰</a>`:""}
      ${a.official?`<a href="${a.official}" target="_blank" rel="noopener">예매·공식</a>`:""}
    </div></div>`;
}
function popupHotel(h){
  const img=h.img?commons(h.img):null;
  return `<div class="pop">${img?`<img src="${img}" alt="${h.name}" onerror="this.style.display='none'">`:""}
    <h4>🏨 ${h.name}</h4><p class="pm">${h.price_range||""}</p>
    <div class="pl">
      ${h.naver_map?`<a href="${h.naver_map}" target="_blank" rel="noopener">네이버 지도</a>`:""}
      ${h.booking?`<a href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}
      ${h.phone?`<a href="tel:${h.phone}">전화 ${h.phone}</a>`:""}
    </div></div>`;
}

function gmapsDir(stops){
  const c=stops.map(s=>place(s.ref)).filter(x=>x&&x.lat);
  if(c.length<2) return null;
  const o=c[0], d=c[c.length-1], w=c.slice(1,-1).map(x=>`${x.lat},${x.lon}`).join("|");
  let u=`https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${d.lat},${d.lon}&travelmode=transit`;
  if(w) u+=`&waypoints=${encodeURIComponent(w)}`;
  return u;
}

function renderMapActions(p){
  const el=$("#mapActions"); el.innerHTML="";
  const all=p.days.flatMap(d=>d.stops);
  const g=gmapsDir(all);
  if(g) el.insertAdjacentHTML("beforeend",`<a href="${g}" target="_blank" rel="noopener">🧭 구글맵 전체 길찾기</a>`);
  if(p.mymaps) el.insertAdjacentHTML("beforeend",`<a href="${p.mymaps}" target="_blank" rel="noopener">🗺️ 구글 마이맵</a>`);
  if(p.kml) el.insertAdjacentHTML("beforeend",`<a href="${p.kml}" download>⬇️ KML 다운로드</a>`);
}

function renderSide(p){
  const el=$("#side"); el.innerHTML="";
  // hotel card
  const h=state.hotels[(p.base_hotel||"")];
  if(h){
    const img=h.img?commons(h.img):null;
    el.insertAdjacentHTML("beforeend",`<div class="hotel">
      <div class="hd">🏨 베이스 숙소</div>
      <div class="in">
        ${img?`<img src="${img}" alt="${h.name}" onerror="this.style.display='none'">`:""}
        <div>
          <p class="nm">${h.name}</p>
          <p class="meta">${h.family_note||""}</p>
          <p class="price">${h.price_range||""}</p>
          <div class="lnks">
            ${h.naver_map?`<a class="lnk" href="${h.naver_map}" target="_blank" rel="noopener">네이버 지도</a>`:""}
            ${h.booking?`<a class="lnk" href="${h.booking}" target="_blank" rel="noopener">예약</a>`:""}
            ${h.phone?`<a class="lnk" href="tel:${h.phone}">전화 ${h.phone}</a>`:""}
          </div>
        </div>
      </div></div>`);
  }
  // days
  let n=0;
  p.days.forEach(d=>{
    const col=DAYCOL[d.day]||"#333";
    const g=gmapsDir(d.stops);
    let rows="";
    d.stops.forEach(s=>{
      const a=place(s.ref); if(!a) return;
      const isHotel=s.ref.startsWith("hotel:");
      const label = isHotel ? "🏨" : (++n);
      const img = !isHotel && a.img ? commons(a.img) : null;
      rows+=`<div class="stop">
        <div class="num" style="${isHotel?'background:#111':''}">${label}</div>
        ${img?`<img class="thumb" src="${img}" alt="${a.name}" onerror="this.style.display='none'">`:""}
        <div class="body">
          ${s.time?`<div class="t">${s.time}</div>`:""}
          <div class="nm">${a.name}${s.optional?' <span class="lnk opt">옵션</span>':''}</div>
          ${s.note?`<div class="no">${s.note}</div>`:""}
          <div class="lnks">
            ${a.naver||a.naver_map?`<a class="lnk" href="${a.naver||a.naver_map}" target="_blank" rel="noopener">네이버 지도</a>`:""}
            ${a.review?`<a class="lnk" href="${a.review}" target="_blank" rel="noopener">리뷰</a>`:""}
            ${a.official?`<a class="lnk" href="${a.official}" target="_blank" rel="noopener">예매·공식</a>`:""}
            ${a.booking?`<a class="lnk" href="${a.booking}" target="_blank" rel="noopener">예약</a>`:""}
            ${a.phone?`<a class="lnk" href="tel:${a.phone}">전화</a>`:""}
          </div>
        </div></div>`;
    });
    el.insertAdjacentHTML("beforeend",`<div class="day-block">
      <div class="day-hd" style="background:${col}">
        <h3>${d.day}일차 · ${d.label||""}</h3>
        ${g?`<a class="zone" style="color:#fff" href="${g}" target="_blank" rel="noopener">🧭 길찾기</a>`:`<span class="zone">${d.zone||""}</span>`}
      </div>${rows}</div>`);
  });
}

function renderCost(p){
  const el=$("#cost");
  if(!p.cost||!p.cost.length){ el.innerHTML=""; return; }
  const rows=p.cost.map(c=>`<tr><td>${c.cat}</td><td>${c.detail||""}</td>
    <td class="n">${won(c.amount)}</td>
    <td>${c.type?`<span class="badge ${c.type==='확정'?'f':'e'}">${c.type}</span>`:""}</td></tr>`).join("");
  el.innerHTML=`<h3>전체 경비 (4인 기준)</h3>
    <table><thead><tr><th>항목</th><th>내역</th><th class="n">금액(원)</th><th>구분</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>합계</td><td>${p.budget?`예산 ${won(p.budget)}원 이내`:""}</td>
      <td class="n">${won(p.total)}</td><td></td></tr></tfoot></table>`;
}

function renderConfirm(p){
  const el=$("#confirmBar");
  const done=localStorage.getItem("confirm_"+p.id);
  const cnt=state.plans.filter(x=>localStorage.getItem("confirm_"+x.id)).length;
  el.innerHTML=`
    <span class="st">${done?`✓ <b>${p.short}</b> 컨펌함`:`이 여행안이 마음에 드나요?`} · 컨펌한 안 ${cnt}개</span>
    <button class="btn p ${done?'done':''}" id="cfm">${done?'컨펌 취소':'이 안으로 컨펌 👍'}</button>
    <button class="btn s" id="shr">🔗 링크 공유</button>`;
  $("#cfm").onclick=()=>{
    if(done) localStorage.removeItem("confirm_"+p.id);
    else localStorage.setItem("confirm_"+p.id, new Date().toISOString());
    renderPicker(); renderConfirm(p);
    document.querySelectorAll(".plan-btn").forEach(b=>b.classList.toggle("active",b.dataset.id===p.id));
  };
  $("#shr").onclick=async()=>{
    const url=location.origin+location.pathname+"#plan="+p.id;
    try{ await navigator.clipboard.writeText(url); $("#shr").textContent="✓ 복사됨"; setTimeout(()=>$("#shr").textContent="🔗 링크 공유",1500);}catch(e){ prompt("링크 복사:",url); }
  };
}

boot().catch(e=>{ document.getElementById("planHead").innerHTML='<p style="color:#E15A38">데이터 로드 실패: '+e.message+'</p>'; });
