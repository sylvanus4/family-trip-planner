#!/usr/bin/env bash
# 일일 가격 갱신 — Claude 호출 0회(순수 스크립트). launchd 가 하루 1회 실행한다.
#   수집(호텔·교통) → 추적(이력·변동량·특가) → 재빌드 → 게이트 → 커밋·푸시 → Pages 배포
# 게이트(validate GREEN + node --check)를 통과하지 못하면 커밋하지 않는다.
set -uo pipefail

REPO="${REPO:-$HOME/thaki/family-trip-planner}"
cd "$REPO" || { echo "no repo: $REPO"; exit 1; }

LOG_DIR="$REPO/.price-logs"; mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d)"
LOG="$LOG_DIR/$STAMP.log"
LOCK="$LOG_DIR/.lock"

# 중복 실행 방지(느린 크롤이 다음 fire 와 겹치지 않게)
if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "[$(date +%H:%M)] already running (pid $(cat "$LOCK")) — skip" >> "$LOG"; exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

export NODE_PATH="$(npm root -g)"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

say "=== daily price update start ==="
git pull --rebase --autostash -q origin main 2>>"$LOG" || say "WARN: pull failed (계속 진행)"

# 1) 수집 — 실패해도 다음 단계로(부분 갱신 허용). 각 단계 로그는 파일로.
for city in busan jeju; do
  say "collect hotels: $city"
  node scripts/fetch_hotel_prices.mjs "data/$city" --dates A,B,C,D >>"$LOG" 2>&1 || say "WARN: hotel collect failed ($city)"
done
say "collect transport"
node scripts/fetch_transport_prices.mjs jeju  >>"$LOG" 2>&1 || say "WARN: flight collect failed"
node scripts/fetch_transport_prices.mjs busan >>"$LOG" 2>&1 || say "WARN: srt write failed"

# 2) 추적 — 이력 누적 + 전일 대비 변동량 + 특가 배지 (멱등)
for city in busan jeju; do
  node scripts/price_track.mjs "data/$city" >>"$LOG" 2>&1 || say "WARN: track failed ($city)"
done

# 3) 재빌드
for city in busan jeju; do
  python3 scripts/build_plans.py "data/$city" >>"$LOG" 2>&1 || { say "FATAL: build failed ($city)"; exit 1; }
done

# 4) 게이트 — 통과 못하면 커밋 금지
if ! python3 scripts/validate.py >>"$LOG" 2>&1; then say "FATAL: validate RED — 커밋 중단"; exit 1; fi
for f in assets/app.js assets/calc.js; do
  node --check "$f" >>"$LOG" 2>&1 || { say "FATAL: syntax error in $f — 커밋 중단"; exit 1; }
done
say "gates GREEN"

# 5) 변경 없으면 커밋 안 함
if git diff --quiet -- data/ ; then say "no price change — nothing to commit"; exit 0; fi

CHANGED=$(node -e '
  const fs=require("fs");let n=0,d=0;
  for(const c of ["busan","jeju"]){
    try{const j=JSON.parse(fs.readFileSync(`data/${c}/hotel-prices.json`,"utf8"));
      for(const h of Object.values(j.hotels||{}))for(const w of Object.values(h.windows||{}))
        for(const cf of Object.values(w.configs||{}))for(const b of ["with_breakfast","without_breakfast"]){
          const t=cf.lowest?.[b]?.tracking; if(!t)continue;
          if(t.delta_pct!==null&&Math.abs(t.delta_pct)>=3)n++; if(t.deal)d++;}
    }catch(e){}
  }
  console.log(`${n}건 변동·${d}건 특가`);' 2>/dev/null || echo "갱신")

git add -A data/ >>"$LOG" 2>&1
git commit -q -m "chore(prices): 일일 가격 갱신 $STAMP ($CHANGED)" >>"$LOG" 2>&1 || { say "commit skipped"; exit 0; }
git push -q origin main >>"$LOG" 2>&1 || { say "WARN: push failed"; exit 1; }
gh api -X POST repos/sylvanus4/family-trip-planner/pages/builds >/dev/null 2>&1 || true
say "=== pushed: $CHANGED ==="
