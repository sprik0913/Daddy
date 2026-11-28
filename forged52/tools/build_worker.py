# Pack the site into a single Cloudflare Pages advanced-mode _worker.js (no separate asset upload needed).
# Usage: python3 tools/build_worker.py <site dir> <out _worker.js>
# Only the deployable files are included (see INCLUDE); content sources, tools, tests and supabase are skipped.
import base64, json, os, sys
src, out = sys.argv[1], sys.argv[2]
TYPES = {'.webmanifest':'application/manifest+json','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'}
INCLUDE_DIRS = ('assets', 'css', 'js', 'data')
EXCLUDE = {'assets/icon-1024.png', 'assets/topo.png'}  # source art, unused at runtime
INCLUDE_ROOT = ('index.html', 'sw.js', 'manifest.webmanifest', 'robots.txt')
files = {}
for root, dirs, fs in os.walk(src):
    relroot = os.path.relpath(root, src).replace(os.sep, '/')
    top = relroot.split('/')[0]
    if relroot != '.' and top not in INCLUDE_DIRS: dirs[:] = []; continue
    for f in fs:
        if relroot == '.' and f not in INCLUDE_ROOT: continue
        if (relroot + '/' + f) in EXCLUDE: continue
        path = os.path.join(root, f); rel = '/' + os.path.relpath(path, src).replace(os.sep, '/')
        ext = os.path.splitext(f)[1]; t = TYPES.get(ext, 'application/octet-stream')
        data = open(path, 'rb').read()
        if t.startswith('text') or 'json' in t or 'javascript' in t: files[rel] = {'t': t, 'd': data.decode('utf-8')}
        else: files[rel] = {'t': t, 'b': base64.b64encode(data).decode()}
js = 'const FILES=' + json.dumps(files, ensure_ascii=False, separators=(',', ':')) + ''';
const bin={};
export default {
  async fetch(req){
    const u=new URL(req.url); let p=decodeURIComponent(u.pathname); if(p==='/'||p==='') p='/index.html';
    const f=FILES[p]; if(!f) return new Response('Not found',{status:404,headers:{'content-type':'text/plain'}});
    let body=f.d; if(f.b){ body=bin[p]||(bin[p]=Uint8Array.from(atob(f.b),c=>c.charCodeAt(0))) }
    return new Response(body,{headers:{'content-type':f.t,'cache-control':(p==='/index.html'||p==='/sw.js'||p==='/manifest.webmanifest')?'no-cache':'public, max-age=86400','x-content-type-options':'nosniff'}});
  }
};
'''
open(out, 'w', encoding='utf-8').write(js)
print(len(js.encode()), 'bytes')
