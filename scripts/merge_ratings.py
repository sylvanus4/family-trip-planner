#!/usr/bin/env python3
"""Merge ratings JSON (keyed by Korean name) into a city's attractions + restaurants.
Usage: python3 scripts/merge_ratings.py data/jeju /tmp/jeju_ratings.json"""
import json,sys,re
def norm(s): return re.sub(r"\s|\(.*?\)","",s or "")
d=sys.argv[1]; rat=json.load(open(sys.argv[2],encoding="utf-8"))
rmap={norm(k):v for k,v in rat.items()}
applied=0
for f in ("attractions.json","restaurants.json"):
    fp=f"{d}/{f}"; obj=json.load(open(fp,encoding="utf-8"))
    for k,o in obj.items():
        r=rmap.get(norm(o.get("name","")))
        if r and r.get("rating") is not None:
            o["rating"]=r["rating"]; o["reviews"]=r.get("reviews"); o["rsource"]=r.get("source"); o["sentiment"]=r.get("sentiment"); applied+=1
        elif r and r.get("sentiment"):
            o["sentiment"]=r["sentiment"]
    json.dump(obj,open(fp,"w",encoding="utf-8"),ensure_ascii=False,indent=2)
print(f"{d}: applied ratings to {applied} items")
