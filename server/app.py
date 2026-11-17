"""无限记个人同步原型。Python 3.10+，仅使用标准库。"""
from __future__ import annotations
import argparse
import hmac
import json
import math
import mimetypes
import os
import re
import sqlite3
import time
try:
    from .speech import SpeechWorker, SpeechError
except ImportError:
    from speech import SpeechWorker, SpeechError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

CLIENT = Path(__file__).resolve().parent.parent / 'client'
MAX_BODY = 12 * 1024 * 1024
ID = re.compile(r'^[a-zA-Z0-9-]{1,80}$')

def validate_board(b):
    def finite(value, limit=1e8):
        return type(value) in (int, float) and math.isfinite(value) and abs(value) <= limit
    def camera(c):
        return isinstance(c, dict) and all(finite(c.get(k)) for k in ('x', 'y', 'z')) and .1 <= c['z'] <= 8
    def color(c):
        return isinstance(c, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', c)
    if not isinstance(b, dict) or b.get('format') != 'wuxianji.board' or type(b.get('schema')) is not int or b['schema'] != 1:
        raise ValueError('不支持的看板格式')
    if not isinstance(b.get('id'), str) or not ID.fullmatch(b['id']) or not isinstance(b.get('title'), str) or not 0 < len(b['title'].strip()) <= 200:
        raise ValueError('无效看板标识或名称')
    if not camera(b.get('camera')) or not isinstance(b.get('nodes'), list) or len(b['nodes']) > 5000 or not isinstance(b.get('scenes'), list) or len(b['scenes']) > 100:
        raise ValueError('无效画布数据')
    seen = set()
    for n in b['nodes']:
        if not isinstance(n, dict) or n.get('type') not in ('note','text','rect','ellipse','arrow','path','image','link'):
            raise ValueError('无效对象类型')
        if not isinstance(n.get('id'), str) or len(n['id']) > 80 or n['id'] in seen:
            raise ValueError('重复或无效对象标识')
        seen.add(n['id'])
        if not all(finite(n.get(k)) for k in ('x','y','w','h','rotation')) or not 1 <= n['w'] <= 10000 or not 1 <= n['h'] <= 10000:
            raise ValueError('无效对象坐标')
        if not color(n.get('fill')) or not color(n.get('color')) or not isinstance(n.get('text'), str) or len(n['text']) > 100000 or type(n.get('locked')) is not bool:
            raise ValueError('无效对象属性')
        if n['type'] == 'path':
            pts = n.get('points')
            if not isinstance(pts, list) or len(pts) > 100000 or not all(isinstance(p, list) and len(p) == 2 and all(finite(v) for v in p) for p in pts):
                raise ValueError('无效笔迹')
        if n['type'] == 'image' and (not isinstance(n.get('src'), str) or len(n['src']) > 7e6 or not re.fullmatch(r'data:image/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+', n['src'])):
            raise ValueError('无效图片')
        if n['type'] == 'link' and (not isinstance(n.get('url'), str) or len(n['url']) > 4000 or not re.match(r'^https?://', n['url'], re.I)):
            raise ValueError('无效网页链接')
    for s in b['scenes']:
        if not isinstance(s, dict) or not isinstance(s.get('name'), str) or len(s['name']) > 100 or not camera(s.get('camera')):
            raise ValueError('无效场景')
    return b

class Store:
    def __init__(self, data):
        self.data = Path(data).resolve()
        self.data.mkdir(parents=True, exist_ok=True)
        self.path = self.data / 'wuxianji.sqlite3'
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, body TEXT NOT NULL)')
    def connect(self):
        return sqlite3.connect(self.path, timeout=10)
    def listing(self):
        with self.connect() as db:
            return [dict(zip(('id','title','revision','updated'), row)) for row in db.execute('SELECT id,title,revision,updated FROM boards ORDER BY updated DESC')]
    def read(self, id):
        with self.connect() as db:
            row = db.execute('SELECT revision,body FROM boards WHERE id=?', (id,)).fetchone()
        return {'revision':row[0], 'board':json.loads(row[1])} if row else None
    def write(self, b, expected):
        validate_board(b)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision FROM boards WHERE id=?',(b['id'],)).fetchone()
            revision = row[0] if row else 0
            if revision != expected:
                return None
            revision += 1
            db.execute('INSERT INTO boards VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, revision=excluded.revision, updated=excluded.updated, body=excluded.body',
                       (b['id'],b['title'],revision,int(time.time()*1000),json.dumps(b,ensure_ascii=False,allow_nan=False)))
            return revision

class Server(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, data, token='', origins=()):
        self.store = Store(data)
        self.speech = SpeechWorker()
        self.token = token if len(token) >= 24 else ''
        self.origins = frozenset(origins)
        super().__init__(address, Handler)

class Handler(BaseHTTPRequestHandler):
    server_version = 'WuxianjiPrototype/0.1'
    def setup(self):
        super().setup()
        self.connection.settimeout(15)
    def log_message(self, format, *args):
        # Never log query strings, authorization headers, or documents.
        pass
    def origin_allowed(self):
        origin = self.headers.get('Origin')
        return not origin or origin in self.server.origins or origin in ('http://' + self.headers.get('Host',''), 'https://' + self.headers.get('Host',''))
    def send_body(self, status, body, mime='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body,ensure_ascii=False,allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cache-Control','no-store')
        origin=self.headers.get('Origin')
        if origin and self.origin_allowed():
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
            self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type, If-Match, X-Speech-Language')
            self.send_header('Access-Control-Allow-Methods','GET, PUT, POST, OPTIONS')
        if mime.startswith('text/html'):
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: https: http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)
    def error(self, status, text):
        self.send_body(status,{'error':text})
    def authorize(self):
        if not self.origin_allowed():
            self.error(403,'来源未获允许'); return False
        if not self.server.token:
            self.error(503,'同步未启用：服务端需配置至少 24 字符的访问密钥');return False
        supplied=self.headers.get('Authorization','')
        if not hmac.compare_digest(supplied.encode(), ('Bearer '+self.server.token).encode()):
            self.error(401,'访问密钥无效');return False
        return True
    def do_OPTIONS(self):
        self.send_body(204 if self.origin_allowed() else 403,b'')
    def do_GET(self):
        path=unquote(urlsplit(self.path).path)
        if path == '/api/health':
            return self.send_body(200,{'status':'ok','version':'0.1.0','syncEnabled':bool(self.server.token),'collaboration':False,'nativeShell':False})
        if path.startswith('/api/releases/'):
            name=path.removeprefix('/api/releases/')
            if name=='latest':
                file=self.server.store.data/'releases'/'latest.json'
                if not file.is_file():return self.error(404,'尚未发布更新')
                return self.send_body(200,file.read_bytes())
            if re.fullmatch(r'[a-f0-9]{64}\.zip',name):
                file=self.server.store.data/'releases'/name
                if file.is_file():return self.send_body(200,file.read_bytes(),'application/zip')
            return self.error(404,'未找到更新')
        if path == '/api/boards' or path.startswith('/api/boards/'):
            if not self.authorize():return
            if path == '/api/boards':return self.send_body(200,{'boards':self.server.store.listing()})
            id=path.removeprefix('/api/boards/')
            if not ID.fullmatch(id):return self.error(400,'无效标识')
            result=self.server.store.read(id)
            return self.send_body(200,result) if result else self.error(404,'看板不存在')
        if path.startswith('/api/'):return self.error(404,'接口不存在')
        relative='index.html' if path=='/' else path.lstrip('/')
        file=(CLIENT/relative).resolve()
        if not file.is_relative_to(CLIENT.resolve()) or not file.is_file() or file.suffix not in ('.html','.css','.mjs','.js','.json','.svg','.png','.webp','.woff2'):
            return self.error(404,'资源不存在')
        mime='text/javascript' if file.suffix=='.mjs' else mimetypes.guess_type(file)[0] or 'application/octet-stream'
        self.send_body(200,file.read_bytes(),mime)
    def do_PUT(self):
        if not self.authorize():return
        path=unquote(urlsplit(self.path).path)
        id=path.removeprefix('/api/boards/')
        if not path.startswith('/api/boards/') or not ID.fullmatch(id):return self.error(404,'接口不存在')
        try:
            if self.headers.get('Transfer-Encoding'):raise ValueError('不支持此传输编码')
            length=int(self.headers.get('Content-Length','-1'))
            if not 0 < length <= MAX_BODY:return self.error(413,'看板大小上限为 12 MB')
            expected=int(self.headers.get('If-Match','-1'))
            if expected<0:return self.error(428,'必须提供 If-Match 预期版本号')
            if self.headers.get_content_type()!='application/json':return self.error(415,'需要 JSON 数据')
            body=json.loads(self.rfile.read(length),parse_constant=lambda x: (_ for _ in ()).throw(ValueError('不允许非有限数值')))
            if body.get('id') != id:raise ValueError('路径与看板标识不一致')
            revision=self.server.store.write(body,expected)
        except (ValueError,TypeError,AttributeError,UnicodeError):return self.error(400,'看板数据格式无效')
        except sqlite3.Error:return self.error(503,'存储暂不可用，请重试')
        if revision is None:return self.error(409,'版本冲突，云端内容未被覆盖')
        self.send_body(200,{'revision':revision})
    def do_POST(self):
        if not self.authorize():return
        if urlsplit(self.path).path!='/api/speech/transcribe':return self.error(404,'接口不存在')
        try:
            length=int(self.headers.get('Content-Length','0'))
            if self.headers.get('Transfer-Encoding') or not 0<length<=6*1024*1024:return self.error(413,'音频大小上限 6 MB')
            if self.headers.get_content_type()!='audio/wav':return self.error(415,'需要 WAV 音频')
            text=self.server.speech.transcribe(self.rfile.read(length),self.headers.get('X-Speech-Language','zh'))
            return self.send_body(200,{'text':text})
        except SpeechError as e:return self.error(e.status,str(e))
        except (ValueError,TimeoutError):return self.error(400,'无效音频请求')

def main():
    parser=argparse.ArgumentParser(description='无限记个人同步原型')
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8787)
    parser.add_argument('--strictPort',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--data',default=str(Path.home()/'WuxianjiPrototypeData'))
    args=parser.parse_args()
    origins=tuple(x.strip() for x in os.environ.get('WUJI_ALLOWED_ORIGINS','').split(',') if x.strip())
    token=os.environ.get('WUJI_TOKEN','')
    server=Server((args.host,args.port),args.data,token,origins)
    print(f'无限记原型：http://{args.host}:{server.server_port}',flush=True)
    print('同步已启用（个人共享密钥模式）' if server.token else '仅本地画板；配置 WUJI_TOKEN（至少 24 字符）后可启用同步',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
