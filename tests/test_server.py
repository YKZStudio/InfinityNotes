import concurrent.futures
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.app import Server, Store

def sample(id='board-1'):
    return {'format':'wuxianji.board','schema':1,'id':id,'title':'测试看板','updated':1,'camera':{'x':0,'y':0,'z':1},'nodes':[],'scenes':[]}

class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.token='test-only-long-token-123456789'
        self.server=Server(('127.0.0.1',0),self.temp.name,self.token)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def call(self,path,body=None,revision=0,token=True,extra=None):
        headers={'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+self.token
        if revision is not None:headers['If-Match']=str(revision)
        headers.update(extra or {})
        request=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method='PUT' if body is not None else 'GET')
        try:
            with urllib.request.urlopen(request,timeout=5) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def test_auth_and_config(self):
        self.assertEqual(self.call('/api/boards',token=False)[0],401)
        self.assertEqual(self.call('/api/health')[0],200)
        self.assertEqual(self.call('/api/boards',extra={'Origin':'https://untrusted.example'})[0],403)
    def test_roundtrip_conflict_and_missing_revision(self):
        b=sample();self.assertEqual(self.call('/api/boards/board-1',b)[1]['revision'],1)
        self.assertEqual(self.call('/api/boards/board-1',b)[0],409)
        self.assertEqual(self.call('/api/boards/board-1',b,revision=None)[0],428)
        self.assertEqual(self.call('/api/boards/board-1')[1]['board'],b)
        self.assertEqual(self.call('/api/boards/board-1',b,revision=1)[1]['revision'],2)
    def test_invalid_and_static_traversal(self):
        b=sample();b['camera']['z']=0
        self.assertEqual(self.call('/api/boards/board-1',b)[0],400)
        self.assertEqual(self.call('/../server/app.py')[0],404)
        self.assertEqual(self.call('/api/boards/other',sample())[0],400)
    def test_concurrent_writes_only_one_succeeds(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            codes=list(pool.map(lambda _:self.call('/api/boards/board-1',sample())[0],range(8)))
        self.assertEqual(codes.count(200),1);self.assertEqual(codes.count(409),7)
    def test_database_survives_store_reopen(self):
        self.server.store.write(sample(),0)
        self.assertEqual(Store(self.temp.name).read('board-1')['revision'],1)
if __name__=='__main__':unittest.main()
