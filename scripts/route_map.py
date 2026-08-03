#!/usr/bin/env python3
"""stops.json -> red-numbered family-trip route map PNG (real coords, per-day colored legs).

Network map tiles are blocked in this env, so we draw a styled base (optional coastline
polygon) with real coordinates. Visit order is shown as RED numbered pins; legs colored by day.

stops.json schema:
{
  "title": "부산 가족여행 2박3일 · 동선 지도",
  "stops": [{"n":1,"name":"부산역 (도착·출발)","lon":129.0416,"lat":35.1151},
            {"n":2,"name":"해운대 해수욕장","lon":129.1580,"lat":35.1590}, ...],
  "legs":  [[1,2,1],[2,3,1],[3,4,1],[5,6,2],[7,1,3]],   # [from_n, to_n, day]
  "day_labels": {"1":"1일차 도착·해운대","2":"2일차 기장","3":"3일차 귀가"},
  "coastline": [[lon,lat], ...],          # optional land polygon (styled coast)
  "areas": [{"label":"해운대구","lon":..,"lat":..}]   # optional district hints
}

Usage: python3 route_map.py stops.json --out outputs/family-trip/route-map.png
"""
import argparse, json, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Polygon
from matplotlib.lines import Line2D
from matplotlib import font_manager

DAY_COLORS = ["#334155", "#0E7C7B", "#E15A38", "#DE9A2E", "#6D28D9", "#0369A1"]

def pick_font():
    for c in ("AppleGothic", "Apple SD Gothic Neo", "Pretendard", "NanumGothic", "Malgun Gothic"):
        try:
            font_manager.findfont(c, fallback_to_default=False)
            plt.rcParams["font.family"] = c; return c
        except Exception:
            continue
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stops"); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    d = json.load(open(a.stops, encoding="utf-8"))
    pick_font(); plt.rcParams["axes.unicode_minus"] = False
    stops = {s["n"]: s for s in d["stops"]}
    lons = [s["lon"] for s in d["stops"]]; lats = [s["lat"] for s in d["stops"]]
    mx = (max(lons) - min(lons)) * 0.12 + 0.01; my = (max(lats) - min(lats)) * 0.12 + 0.01
    xmin, xmax = min(lons) - mx, max(lons) + mx
    ymin, ymax = min(lats) - my, max(lats) + my
    fig, ax = plt.subplots(figsize=(12, 8.2), dpi=175)
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax)
    if d.get("coastline"):
        ax.add_patch(plt.Rectangle((xmin, ymin), xmax - xmin, ymax - ymin, fc="#DCEBF5", ec="none", zorder=0))
        ax.add_patch(Polygon(d["coastline"], closed=True, fc="#F3EFE6", ec="#C9BCA0", lw=1.4, zorder=1))
    else:
        ax.add_patch(plt.Rectangle((xmin, ymin), xmax - xmin, ymax - ymin, fc="#F6F3EC", ec="none", zorder=0))
    for ar in d.get("areas", []):
        ax.text(ar["lon"], ar["lat"], ar["label"], fontsize=9.5, color="#8A99A6", ha="center", zorder=2)

    def col(day): return DAY_COLORS[day % len(DAY_COLORS)]
    for i, leg in enumerate(d.get("legs", [])):
        f, t, day = leg[0], leg[1], leg[2]
        A, B = stops[f], stops[t]
        rad = 0.14 if i % 2 == 0 else -0.14
        ax.add_patch(FancyArrowPatch((A["lon"], A["lat"]), (B["lon"], B["lat"]), arrowstyle="-|>",
                     mutation_scale=16, lw=2.4, color=col(day), alpha=.85,
                     connectionstyle=f"arc3,rad={rad}", zorder=3))
    for n, s in sorted(stops.items()):
        ax.scatter([s["lon"]], [s["lat"]], s=580, c="#E11D2E", edgecolors="white", linewidths=2.4, zorder=6)
        ax.text(s["lon"], s["lat"], str(n), color="white", fontsize=14.5, fontweight="bold",
                ha="center", va="center", zorder=7)
        dx, dy = s.get("dx", 12), s.get("dy", 12)
        ax.annotate(s["name"], (s["lon"], s["lat"]), textcoords="offset points", xytext=(dx, dy),
                    fontsize=11, ha=s.get("ha", "left"), fontweight="bold", color="#1f2937", zorder=8,
                    bbox=dict(boxstyle="round,pad=0.28", fc="white", ec="#E5E7EB", alpha=.95))
    handles = []
    for day, lbl in sorted(d.get("day_labels", {}).items(), key=lambda kv: int(kv[0])):
        handles.append(Line2D([0], [0], color=col(int(day)), lw=3, label=lbl))
    handles.append(Line2D([0], [0], marker="o", color="w", markerfacecolor="#E11D2E",
                          markersize=13, label="방문 순서 (빨간 번호)"))
    if handles:
        ax.legend(handles=handles, loc="lower left", fontsize=10, framealpha=.96, edgecolor="#E5E7EB")
    ax.set_title(d.get("title", "가족여행 동선 지도"), fontsize=14.5, fontweight="bold", pad=12)
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values(): sp.set_edgecolor("#D1D5DB")
    plt.tight_layout(); plt.savefig(a.out, bbox_inches="tight")
    print(json.dumps({"out": a.out, "stops": len(stops), "legs": len(d.get("legs", []))}, ensure_ascii=False))

if __name__ == "__main__":
    sys.exit(main())
