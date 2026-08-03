---
name: good-dad-family-trip
description: >-
  Plans a family trip (특히 어린 아이 동반 국내여행) as a thoughtful "good dad" would — decides
  the hotel by minimizing total travel time, paces the itinerary to child fatigue, caps the
  total cost under budget, prepares rain/heat indoor alternatives, and produces a detailed
  branded DOCX with a red-numbered route map plus an importable Google My Maps (KML).
  Use when the user says "가족여행 계획", "좋은 아빠 스킬", "아이랑 여행 일정", "가족 여행 짜줘",
  "부산/제주/강릉 가족여행", "family trip plan", "kids trip itinerary", "여행 동선 지도".
  Do NOT use for solo/business travel logistics only, a single hotel lookup (use WebSearch),
  or building an interactive online map alone (that step delegates to google-mymaps-builder).
---

# Good Dad Family Trip Planner

아이 동반 가족여행을 "좋은 아빠" 기준으로 설계한다. 유명 관광지 나열이 아니라 **호텔·동선·비용·
피로도·날씨**를 함께 최적화하고, 검토·컨펌 가능한 **상세 DOCX + 빨간 번호 동선 지도 + 실제
구글 마이맵(KML)** 을 산출한다. 포맷·지도·경비 집계는 코드가 소유한다([[sonnet-format-determinism]]).

## 설계 원칙 (반드시 지킬 7조 — references/planning-rules.md 정본)

1. **호텔을 먼저 못박지 않는다.** 관광지 후보를 먼저 지도에 올리고, 총 이동시간이 가장 작은
   지역을 숙소로 고른다. 바다 전망보다 동선 점수가 우선.
2. **아이 피로도를 거리보다 크게 계산한다.** 한 번 이동 ≤45분, 연속 도보 ≤25분, 하루 주요
   방문지 2~3곳, 오후 휴식 1회. 서쪽·동쪽으로 크게 튀는 코스는 뺀다(별도 변형으로).
3. **가격은 최종 총액으로.** 왕복 교통 + 숙박 + 현지교통 + 입장료 + 식비 + 간식 + 예비비를
   모두 더하고, **계획 예산은 목표 예산의 85~90%까지만** 쓴다. 남는 여유는 업그레이드 옵션으로.
4. **아이 둘 다 만족하는 일정만.** 바다·체험·동물·전망·놀이공원·쇼핑·휴식 중 최소 3가지 포함.
   어른 위주(시장·사찰·카페) 일정이 연속되지 않게.
5. **우천·폭염 대체를 같은 시간대에.** 야외 장소마다 30분 이내 실내 대안을 짝지어 둔다.
6. **가격·영업시간에 조회시각 표기.** 확정가(공식 요금표)와 추정가(온라인 예매·시세)를 분리하고,
   예약 직전 재확인 항목을 명시. 수치 날조 금지([[news-freshness-and-sourcing]]).
7. **교통은 출발지 기준 최적 수단.** 수서 출발이면 SRT 직행이 기본, KTX는 역 이동비·시간을
   포함한 비교안으로만. 어린이 운임(만 6~12세 50%) 반영.

## 워크플로 (5단계)

### 1. 후보 수집 + 검증
관광지·숙소 후보를 WebSearch로 조사. 교통 요금·입장료는 공식 페이지에서 확인하고 확정/추정을
구분. URL은 실제 도달한 것만 인용(날조 금지).

### 2. 동선 클러스터링 → 숙소 결정
방문지를 지리적으로 묶고 지역별 동선 점수를 표로 비교해 베이스 숙소를 고른다(원칙 1·4). 숙소
고정으로 짐 이동 0회를 목표.

### 3. 빨간 번호 동선 지도 생성 (코드 소유)
```bash
.venv/bin/python .claude/skills/good-dad-family-trip/scripts/route_map.py stops.json \
  --out outputs/family-trip/route-map.png
```
`stops.json` = `{"title":..,"stops":[{"n":1,"name":"부산역","lon":129.0416,"lat":35.1151,"day":0}, ...],
"legs":[[1,2,1],[2,3,1],...]}` (leg = [from,to,day]). 실좌표 기반, 방문순서를 **빨간 번호**로,
일자별 색 동선으로 렌더. 지도 타일은 네트워크 제약으로 미포함 — 스타일드 해안선 + 실좌표.

### 4. 실제 구글 마이맵(KML) 생성 — google-mymaps-builder 위임
현장에서 핀·길찾기로 따라다닐 실제 지도는 [[google-mymaps-builder]]에 위임한다:
```bash
# places.json = {title, categories:{ "1일차": [{name,address,confidence}], ... }}
.venv/bin/python .claude/skills/google-mymaps-builder/scripts/gen_map.py places.json \
  --out outputs/family-trip/mymaps/
```
→ 임포트용 KML+CSV. 사용자가 로그인하면 실제 공유 마이맵까지(그 스킬 Step 4~6) 만들 수 있다.

### 5. 상세 DOCX 산출 (docx-readability 정본)
계획을 마크다운으로 쓰고(요약·원칙·교통 SRT/KTX 비교표·숙소 동선 비교표·일자별 표·우천 대체표·
경비 상세표 + ```chart``` 경비 파이) `md_to_branded_docx.py`로 렌더([[docx-readability]]):
```bash
.venv/bin/python scripts/md_to_branded_docx.py plan.md --out OUT.docx \
  --subtitle "..." --author "가족여행 플래너" --require-table
```
지도 이미지는 마크다운에 `[[ROUTE_MAP]]` 플레이스홀더를 두고, 렌더 후 python-docx로 해당
문단에 `add_picture`로 삽입(렌더러는 ```chart``` 외 임의 이미지를 마크다운으로 못 받는다).
게이트(escape_leaks==0 / tables>0 / chart err==0) 통과 후에만 배포.

## 산출물
- `outputs/family-trip/<날짜>-<지역>-<안>.docx` — 표지·목차·비교표·경비표·동선 지도 포함 정본
- `outputs/family-trip/route-map.png` — 빨간 번호 동선 지도
- `outputs/family-trip/mymaps/*.kml` — 구글 마이맵 임포트 파일

## 확장 (1안 → N안 + 컨펌 비교표)
1안이 승인되면 같은 7조를 유지하며 색을 달리한 N개안(베이스 지역·예산대·실내비중 변형)으로 확장.
컨펌용으로 한 장짜리 **비교표**(총경비·이동량·아이 만족요소·실내비중·추천대상)를 만들어 나란히 제시.

## gotchas
- 지도 타일 서버는 이 환경 네트워크에서 차단 → 실제 맵 스크린샷 불가. 정적 지도는 **실좌표 기반
  스타일드 렌더**(route_map.py)로, 실제 지도는 **KML 임포트**로 분리 제공(정직).
- 입장료·호텔가는 대부분 추정 → 반드시 조회일 표기 + 예약 직전 재확인 명시(원칙 6).
- 이 스킬은 **아이 동반 가족여행**용. 단발 장소 검색·업무출장 물류엔 과잉(억지 적용 금지).
