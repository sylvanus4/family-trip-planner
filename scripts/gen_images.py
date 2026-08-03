#!/usr/bin/env python3
import json,os,subprocess,sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL="${IMAGE_GEN_SCRIPT}"
man=json.load(open(sys.argv[1]))
ok=skip=fail=0
for i,it in enumerate(man,1):
    out=os.path.join(ROOT,it["out"])
    if os.path.exists(out) and os.path.getsize(out)>10000: skip+=1; print(f"[{i}/{len(man)}] skip {it['out']}"); continue
    os.makedirs(os.path.dirname(out),exist_ok=True)
    r=subprocess.run(["uv","run",SKILL,"--prompt",it["prompt"],"--size",it["size"],"--output",out],
                     capture_output=True,text=True,cwd="${WORKSPACE_ROOT}",timeout=240)
    if os.path.exists(out) and os.path.getsize(out)>10000: ok+=1; print(f"[{i}/{len(man)}] OK {it['out']}")
    else: fail+=1; print(f"[{i}/{len(man)}] FAIL {it['out']} :: {(r.stderr or r.stdout)[-160:]}")
print(f"DONE ok={ok} skip={skip} fail={fail}")
