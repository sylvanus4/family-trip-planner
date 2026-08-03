import os,sys,json,base64
from openai import OpenAI
c=OpenAI()
man=json.load(open(sys.argv[1]))
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ok=skip=fail=0
for i,it in enumerate(man,1):
    out=os.path.join(root,it["out"])
    if os.path.exists(out) and os.path.getsize(out)>10000: skip+=1; print(i,"skip",it["out"],flush=True); continue
    os.makedirs(os.path.dirname(out),exist_ok=True)
    try:
        r=c.images.generate(model="gpt-image-2",prompt=it["prompt"],size=it["size"])
        open(out,"wb").write(base64.b64decode(r.data[0].b64_json)); ok+=1; print(i,"OK",it["out"],flush=True)
    except Exception as e:
        fail+=1; print(i,"FAIL",it["out"],str(e)[:140],flush=True)
print(f"DONE ok={ok} skip={skip} fail={fail}",flush=True)
