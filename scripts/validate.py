#!/usr/bin/env python3
"""Exit gate for the family-trip-planner build loop. Exit 0 = green.
Checks: cities index, >=10 plans/city, ref integrity, numeric fields, JSON valid, app.js syntax."""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def p(*a): return os.path.join(ROOT, *a)
errs, warns = [], []

def load(fp):
    try: return json.load(open(fp, encoding="utf-8"))
    except Exception as e: errs.append(f"JSON load fail {fp}: {e}"); return None

cities = load(p("data","cities.json"))
if not cities or "cities" not in cities:
    errs.append("cities.json missing/invalid")
    cities = {"cities":[]}

for c in cities["cities"]:
    d = c["dir"]
    plans = load(p(d,"plans.json")); hotels = load(p(d,"hotels.json")); at = load(p(d,"attractions.json"))
    if plans is None or hotels is None or at is None:
        errs.append(f"[{c['id']}] missing data files"); continue
    n = len(plans.get("plans",[]))
    if n < 10: errs.append(f"[{c['id']}] only {n} plans (need >=10)")
    # numeric fields
    for k,v in at.items():
        if "price4" not in v: errs.append(f"[{c['id']}] attraction {k} missing price4")
        if v.get("lat") is None: warns.append(f"[{c['id']}] attraction {k} no lat")
    for k,v in hotels.items():
        if "nightly" not in v: errs.append(f"[{c['id']}] hotel {k} missing nightly")
    # ref integrity + budget
    for pl in plans.get("plans",[]):
        if pl.get("total",0) > pl.get("budget",3000000):
            warns.append(f"[{c['id']}] {pl['id']} over budget ({pl['total']})")
        if pl.get("base_hotel") not in hotels: errs.append(f"[{c['id']}] {pl['id']} base_hotel {pl.get('base_hotel')} missing")
        for day in pl["days"]:
            for s in day["stops"]:
                r=s["ref"]
                if r.startswith("hotel:"):
                    if r[6:] not in hotels: errs.append(f"[{c['id']}] {pl['id']} ref {r} missing")
                elif r not in at: errs.append(f"[{c['id']}] {pl['id']} ref {r} missing")

# app.js syntax
r = subprocess.run(["node","--check",p("assets","app.js")], capture_output=True, text=True)
if r.returncode != 0: errs.append("app.js syntax: "+r.stderr.strip())

print("=== VALIDATE ===")
for w in warns: print("WARN:", w)
if errs:
    for e in errs: print("FAIL:", e)
    print(f"RESULT: RED ({len(errs)} errors, {len(warns)} warns)"); sys.exit(1)
print(f"RESULT: GREEN (0 errors, {len(warns)} warns)"); sys.exit(0)
