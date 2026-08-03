#!/usr/bin/env python3
"""Expand concise plan-specs.json into full plans.json with auto-computed cost tables.

Usage: python3 scripts/build_plans.py data/busan
Reads:  <dir>/attractions.json, <dir>/hotels.json, <dir>/plan-specs.json
Writes: <dir>/plans.json  ({ "plans": [...] })

plan-specs.json schema:
{ "meta": { "region":"부산","budget":3000000,
            "intercity":{"cat":"SRT 왕복","detail":"...","amount":311200,"type":"확정"},
            "food":420000, "misc":100000, "local":80000 },
  "plans": [ { "id","short","title","subtitle","base_hotel","chips":[..],
               "days":[ {"day","label","stops":[{"ref","time","note","optional"}]} ] } ] }

Cost = intercity + lodging(hotel.nightly*2) + 입장·체험(sum price4) + 현지교통(local)
       + 식비(food) + 예비(misc). Attractions/hotels supply numeric price4 / nightly.
"""
import json, sys, os

def won(n): return f"{n:,}"

def main():
    d = sys.argv[1].rstrip("/")
    at = json.load(open(f"{d}/attractions.json", encoding="utf-8"))
    ho = json.load(open(f"{d}/hotels.json", encoding="utf-8"))
    spec = json.load(open(f"{d}/plan-specs.json", encoding="utf-8"))
    m = spec["meta"]
    out = []
    for p in spec["plans"]:
        # unique paid attractions in this plan
        seen, paid_names, paid_sum = set(), [], 0
        for day in p["days"]:
            for s in day["stops"]:
                r = s["ref"]
                if r.startswith("hotel:") or r in seen: continue
                seen.add(r)
                a = at.get(r)
                if a and a.get("price4", 0) > 0:
                    paid_sum += a["price4"]; paid_names.append(a["name"])
        hotel = ho.get(p["base_hotel"], {})
        nightly = hotel.get("nightly", 220000); lodging = nightly * 2
        cost = [
            {**m["intercity"]},
            {"cat":"현지 교통","detail":"지하철·택시·버스 3일(구간별 표시)","amount":m["local"],"type":"추정"},
            {"cat":"숙박 2박","detail":f"{hotel.get('name','')} (1박 {won(nightly)}원)","amount":lodging,"type":"추정"},
            {"cat":"입장·체험","detail":", ".join(paid_names) or "무료 위주","amount":paid_sum,"type":"추정"},
            {"cat":"식비","detail":"4인·3일","amount":m["food"],"type":"추정"},
            {"cat":"예비·기념품","detail":"버퍼","amount":m["misc"],"type":"추정"},
        ]
        total = sum(c["amount"] for c in cost)
        # metrics for compare view
        n_stops = sum(1 for day in p["days"] for s in day["stops"] if not s["ref"].startswith("hotel:") and not s["ref"].endswith("station"))
        indoor = {"aquarium","museum","science","mall","view","cave","themepark"}
        n_indoor = sum(1 for r in seen if at.get(r,{}).get("category") in indoor)
        kid = {"상":3,"중":2,"하":1}
        kv = [kid.get(at.get(r,{}).get("kid_fit"),0) for r in seen if at.get(r)]
        kid_avg = round(sum(kv)/len(kv),1) if kv else 0
        out.append({
            "id":p["id"],"short":p["short"],"title":p["title"],"subtitle":p["subtitle"],
            "region":m["region"],"base_hotel":p["base_hotel"],"budget":m["budget"],
            "total":total,"chips":p.get("chips",[]),"days":p["days"],
            "kml":p.get("kml"),"mymaps":p.get("mymaps"),
            "metrics":{"stops":n_stops,"indoor":n_indoor,"kid":kid_avg}
        })
    json.dump({"plans":out}, open(f"{d}/plans.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps({"dir":d,"plans":len(out),
        "totals":{p["id"]:p["total"] for p in out}}, ensure_ascii=False))

if __name__ == "__main__":
    main()
