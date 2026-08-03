#!/usr/bin/env python3
"""
new_city.py — 새 도시를 "현재 구성 그대로" 재현하는 스캐폴드.

부산·제주와 동일한 파이프라인(실측 호텔가 · 실측 교통비 · 일일 추적 · 계산기 · 게이트)이
새 도시에도 자동으로 걸리도록, 필요한 파일 5종 + cities.json 엔트리를 만들어 준다.

사용:
  python3 scripts/new_city.py gangneung --name 강릉 --emoji 🌅 \
      --arrival "KTX 서울역 출발 · 약 2시간" --intercity-label "KTX 왕복" --budget 4000000

그다음 (순서 고정):
  1) data/<city>/attractions.json · hotels.json · restaurants.json 을 실제 데이터로 채운다
     - hotels.json 각 호텔에 booking_slug 필수 (이름검색은 오매칭 위험 — 반드시 검증해 고정)
       검증: node scripts/fetch_hotel_prices.mjs data/<city> --resolve-only
  2) node scripts/fetch_hotel_prices.mjs data/<city> --dates A,B,C,D
  3) node scripts/fetch_transport_prices.mjs <city>        # 항공이면 자동, 철도면 사람이 운임 주입
  4) node scripts/price_track.mjs data/<city>
  5) python3 scripts/build_plans.py data/<city> && python3 scripts/validate.py
  6) scripts/daily_price_update.sh 의 도시 목록에 <city> 추가 (일일 갱신 편입)
"""
import argparse, json, os, sys

TEMPLATE_ATTRACTIONS = {
    "_TODO": {
        "name": "예시 관광지 — 실제 데이터로 교체하고 이 키는 지울 것",
        "lat": 0.0, "lon": 0.0, "category": "nature",
        "naver": "", "img": None, "price4": 0, "price_hours": "",
        "official": "", "blurb": "", "kid_fit": ""
    }
}
TEMPLATE_HOTELS = {
    "_TODO": {
        "name": "예시 호텔 — 실제 데이터로 교체",
        "booking_slug": "",   # ⚠️ 필수. --resolve-only 로 검증해 고정 (이름검색 오매칭 방지)
        "area": "", "lat": 0.0, "lon": 0.0,
        "nightly": 0,          # 실측 전 폴백 추정치. hotel-prices.json 이 생기면 그쪽이 우선
        "price_range": "", "pool": "", "buffet": None,
        "family_note": "", "phone": "", "naver_map": "", "booking": "", "img": None, "photo": None
    }
}
TEMPLATE_RESTAURANTS = {
    "_TODO": {
        "name": "예시 맛집 — 실제 별점 데이터로 교체(날조 금지)",
        "area": "", "lat": 0.0, "lon": 0.0, "category": "한식",
        "menu": "", "price": "", "naver": "", "review": "", "phone": "",
        "rating": None, "reviews": None, "rsource": None, "kid_note": "", "wait": "", "sentiment": ""
    }
}


def plan_specs(city, name, budget, intercity_label, intercity_amount, arrival_ref, local, food, misc, home_transfer):
    return {
        "meta": {
            "region": name,
            "budget": budget,
            # 계산기·플랜이 어떤 날짜창/객실/조식을 기본으로 쓸지 — 부산·제주와 동일 규약
            "price_window": "A",
            "price_config": "one-room",
            "price_breakfast": "without_breakfast",
            "intercity": {"cat": intercity_label, "detail": "어른2+어린이2", "amount": intercity_amount, "type": "추정"},
            "food": food, "misc": misc, "local": local, "home_transfer": home_transfer,
            "book_note": "성수기 조기 예매(D-30 전후)",
            "local_note": "현지 교통 추정",
        },
        "plans": [{
            "id": f"{city}-classic",
            "short": "기본",
            "title": f"{name} 2박3일 · 기본 코스",
            "subtitle": "실제 데이터로 교체",
            "base_hotel": "_TODO",
            "chips": ["기본 추천"],
            "days": [
                {"day": 1, "label": "도착", "stops": [
                    {"ref": arrival_ref, "time": "10:00", "note": "도착"},
                    {"ref": "hotel:_TODO", "time": "17:00", "note": "체크인"}]},
                {"day": 2, "label": "둘째 날", "stops": [
                    {"ref": "hotel:_TODO", "time": "09:00", "note": "출발"}]},
                {"day": 3, "label": "귀가", "stops": [
                    {"ref": arrival_ref, "time": "14:00", "note": "귀가"}]},
            ],
            "intro": "이 소개글을 실제 코스 설명으로 교체하세요.",
        }],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("city", help="도시 id (영문 소문자, 예: gangneung)")
    ap.add_argument("--name", required=True, help="표시 이름 (예: 강릉)")
    ap.add_argument("--emoji", default="📍")
    ap.add_argument("--arrival", default="", help="도착 안내 문구")
    ap.add_argument("--arrival-ref", default="station", help="도착 POI id (station/airport 등)")
    ap.add_argument("--intercity-label", default="교통 왕복")
    ap.add_argument("--intercity", type=int, default=0, help="도시간 교통비 초기 추정(실측되면 대체됨)")
    ap.add_argument("--budget", type=int, default=4000000)
    ap.add_argument("--local", type=int, default=80000)
    ap.add_argument("--food", type=int, default=420000)
    ap.add_argument("--misc", type=int, default=100000)
    ap.add_argument("--home-transfer", type=int, default=36000)
    a = ap.parse_args()

    d = os.path.join("data", a.city)
    if os.path.exists(d):
        print(f"이미 존재: {d} — 덮어쓰지 않습니다", file=sys.stderr)
        return 1
    os.makedirs(d)

    def w(fn, obj):
        with open(os.path.join(d, fn), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")

    w("attractions.json", TEMPLATE_ATTRACTIONS)
    w("hotels.json", TEMPLATE_HOTELS)
    w("restaurants.json", TEMPLATE_RESTAURANTS)
    w("plan-specs.json", plan_specs(a.city, a.name, a.budget, a.intercity_label, a.intercity,
                                    a.arrival_ref, a.local, a.food, a.misc, a.home_transfer))

    # cities.json 엔트리 추가
    cp = os.path.join("data", "cities.json")
    cities = json.load(open(cp, encoding="utf-8"))
    arr = cities if isinstance(cities, list) else cities.get("cities", [])
    if any(c.get("id") == a.city for c in arr):
        print(f"cities.json 에 이미 {a.city} 있음 — 건너뜀", file=sys.stderr)
    else:
        arr.append({
            "id": a.city, "name": a.name, "emoji": a.emoji, "arrival": a.arrival,
            "dir": d, "arrival_ref": a.arrival_ref,
            "transport": {"has_subway": False, "taxi_base": 4800, "taxi_per_km": 900},
            "cost": {"intercity": a.intercity, "intercity_label": a.intercity_label,
                     "food": a.food, "misc": a.misc, "local": a.local,
                     "home_transfer": a.home_transfer, "budget": a.budget},
            "packing": {"common": [], "specific": []},
            "intro": "",
        })
        with open(cp, "w", encoding="utf-8") as f:
            json.dump(cities, f, ensure_ascii=False, indent=2)
            f.write("\n")

    print(json.dumps({"created": d, "files": sorted(os.listdir(d)), "cities_entry": a.city}, ensure_ascii=False))
    print("\n다음 순서(고정):\n"
          "  1) attractions/hotels/restaurants 를 실제 데이터로 채우기 (_TODO 키 제거)\n"
          f"  2) node scripts/fetch_hotel_prices.mjs {d} --resolve-only   # booking_slug 검증·고정\n"
          f"  3) node scripts/fetch_hotel_prices.mjs {d} --dates A,B,C,D\n"
          f"  4) node scripts/fetch_transport_prices.mjs {a.city}\n"
          f"  5) node scripts/price_track.mjs {d}\n"
          f"  6) python3 scripts/build_plans.py {d} && python3 scripts/validate.py\n"
          f"  7) scripts/daily_price_update.sh 의 도시 목록에 {a.city} 추가", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
