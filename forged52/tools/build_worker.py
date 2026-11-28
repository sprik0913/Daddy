# Pack the site into a single Cloudflare Pages advanced-mode _worker.js (no separate asset upload needed)
import base64, json, os, sys
src, out = sys.argv[1], sys.argv[2]
TYPES = {'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp'}
files = {}
for root, _, fs in os.walk(src):
    for f in fs:
        path = os.path.join(root, f); rel = '/' + os.path.relpath(path, src).replace(os.sep, '/')
        ext = os.path.splitext(f)[1]; t = TYPES.get(ext, 'application/octet-stream')
        data = open(path, 'rb').read()
        if t.startswith('text') or 'json' in t: files[rel] = {'t': t, 'd': data.decode('utf-8')}
        else: files[rel] = {'t': t, 'b': base64.b64encode(data).decode()}
js = 'const FILES=' + json.dumps(files, ensure_ascii=False, separators=(',', ':')) + ''';
const bin={};
export default {
  async fetch(req){
    const u=new URL(req.url); let p=decodeURIComponent(u.pathname); if(p==='/'||p==='') p='/index.html';
    const f=FILES[p]; if(!f) return new Response('Not found',{status:404,headers:{'content-type':'text/plain'}});
    let body=f.d; if(f.b){ body=bin[p]||(bin[p]=Uint8Array.from(atob(f.b),c=>c.charCodeAt(0))) }
    return new Response(body,{headers:{'content-type':f.t,'cache-control':p==='/index.html'?'no-cache':'public, max-age=86400','x-content-type-options':'nosniff'}});
  }
};
'''
open(out, 'w', encoding='utf-8').write(js)
print(len(js.encode()), 'bytes')
