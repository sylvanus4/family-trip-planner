# 🧭 가족여행 플래너 (Family Trip Planner)

아이와 함께하는 가족여행을 **실제 인터랙티브 지도 위 동선**으로 계획하고, 호텔·관광지 정보와
네이버 리뷰·예약 링크, 사진을 한 페이지에서 확인하고 **컨펌**까지 받는 오픈소스 정적 사이트입니다.

**➡️ 라이브 페이지:** `https://sylvanus4.github.io/family-trip-planner/`

정적 사이트(빌드 불필요)라 `data/*.json`만 고치면 누구나 여행안을 추가·수정할 수 있습니다.

## 무엇이 되나

- 🗺️ **실제 지도(OpenStreetMap/Leaflet)** 위에 방문 순서를 **빨간 번호 핀**으로, 일자별 색 경로로 표시
- 📍 핀/카드마다 **네이버 지도·리뷰·예매·전화·사진**(위키미디어 커먼스) 링크
- 🧳 **여러 여행안** 탭 전환(해운대 클래식 / 블로거 인기 / 우천·폭염 대비 …) + 항목별 경비표
- 👍 **컨펌 기능**(브라우저 저장) + 🔗 **링크 공유**(특정 안으로 바로 열기)
- 🧭 각 일자 **구글맵 길찾기 딥링크** + **KML 다운로드**(구글 마이맵 가져오기)

## 여행안 추가·수정 (누구나)

전부 `data/` 안의 JSON만 고치면 됩니다. 코드 수정 불필요.

1. **`data/attractions.json`** — 장소 사전. 키=id, 값:
   ```json
   "blueline": { "name":"해운대 블루라인파크", "lat":35.1614, "lon":129.1706,
     "category":"experience", "naver":"https://map.naver.com/p/search/...",
     "review":"...", "img":"Commons File.jpg 또는 null", "price_hours":"...",
     "official":"...", "blurb":"아이 관점 한 줄", "kid_fit":"상|중|하" }
   ```
   - `img`: [위키미디어 커먼스](https://commons.wikimedia.org)의 **실제 파일명**만 넣습니다.
     `https://commons.wikimedia.org/wiki/Special:FilePath/<파일명>` 로 자동 로드됩니다. 없으면 `null`.
2. **`data/hotels.json`** — 호텔 사전(전화·네이버·예약·가격·가족 노트).
3. **`data/plans.json`** — 여행안 목록. 각 안은 `days[].stops[].ref`로 위 id를 참조합니다.
   `ref`가 `hotel:<id>`면 숙소(검정 🏨), 그 외는 관광지(빨간 번호). `cost[]`로 경비표를 만듭니다.

저장 후 `git push`하면 GitHub Pages가 자동 갱신됩니다.

## 사진·리뷰 원칙 (정직)

- 사진은 자유 라이선스 **위키미디어 커먼스**만 임베드(핫링크 깨짐/저작권 회피). 없으면 링크로 대체.
- 가격·영업시간은 `[추정]` 포함이며 **예약 직전 공식/네이버에서 재확인**하세요. 수치 날조 금지.

## 함께 배포된 스킬

`skills/good-dad-family-trip/` — "좋은 아빠 가족여행" 계획 스킬(7조 원칙·워크플로)과
`scripts/route_map.py`(실좌표 빨간 번호 동선 지도 생성기)를 함께 담았습니다. 다른 도시로
확장하거나 계획 로직을 고쳐 재사용할 수 있습니다.

## 로컬 미리보기

```bash
python3 -m http.server 8000    # http://localhost:8000  (file:// 로 열면 fetch가 막힙니다)
```

## 라이선스

코드 MIT. 지도 데이터 © OpenStreetMap 기여자. 사진 © 각 위키미디어 커먼스 저작자(파일 페이지 참조).
