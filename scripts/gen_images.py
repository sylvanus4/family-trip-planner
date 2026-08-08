#!/usr/bin/env python3
import json,os,subprocess,sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 이미지 생성기는 이 저장소 밖에 있다. 절대경로를 박으면 남의 기계에서 안 돌고,
# 사용자명과 워크스페이스 이름이 공개된다. 환경변수로 받는다.
SKILL=os.environ.get("IMAGE_GEN_SCRIPT","")
GEN_CWD=os.environ.get("IMAGE_GEN_CWD",os.path.dirname(SKILL) or ROOT)
if not SKILL:
    sys.exit("IMAGE_GEN_SCRIPT 를 이미지 생성 스크립트 경로로 설정하세요 "
             "(--prompt/--size/--output 인자를 받는 실행 파일).")
man=json.load(open(sys.argv[1]))
ok=skip=fail=0
for i,it in enumerate(man,1):
    out=os.path.join(ROOT,it["out"])
    if os.path.exists(out) and os.path.getsize(out)>10000: skip+=1; print(f"[{i}/{len(man)}] skip {it['out']}"); continue
    os.makedirs(os.path.dirname(out),exist_ok=True)
    r=subprocess.run(["uv","run",SKILL,"--prompt",it["prompt"],"--size",it["size"],"--output",out],
                     capture_output=True,text=True,cwd=GEN_CWD,timeout=240)
    if os.path.exists(out) and os.path.getsize(out)>10000: ok+=1; print(f"[{i}/{len(man)}] OK {it['out']}")
    else: fail+=1; print(f"[{i}/{len(man)}] FAIL {it['out']} :: {(r.stderr or r.stdout)[-160:]}")
print(f"DONE ok={ok} skip={skip} fail={fail}")
