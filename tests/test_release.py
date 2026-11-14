import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools.release import keygen,build,verify,publish
class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name)
        self.source=self.root/'source';self.source.mkdir();(self.source/'index.html').write_text('<h1>无限记</h1>')
        self.private=self.root/'private.pem';self.public=self.root/'public.pem';self.archive=self.root/'update.zip'
        keygen(self.private,self.public);build(self.source,self.private,self.archive,2,1)
    def tearDown(self):self.t.cleanup()
    def test_signature_and_publish(self):
        self.assertEqual(verify(self.archive,self.public,1,1)['manifest']['version'],2)
        dest=self.root/'releases';publish(self.archive,self.public,dest,1,1)
        self.assertTrue((dest/'latest.json').is_file())
        with self.assertRaises(ValueError):publish(self.archive,self.public,dest,1,1)
    def test_tamper(self):
        changed=self.root/'changed.zip'
        with zipfile.ZipFile(self.archive) as old,zipfile.ZipFile(changed,'w') as new:
            for name in old.namelist():new.writestr(name,b'changed' if name=='payload/index.html' else old.read(name))
        with self.assertRaises(ValueError):verify(changed,self.public,1,1)
    def test_replay_wrong_key_and_shell_version(self):
        with self.assertRaises(ValueError):verify(self.archive,self.public,2,1)
        with self.assertRaises(ValueError):verify(self.archive,self.public,1,0)
        wrong=self.root/'wrong.pem';keygen(self.root/'wrong-private.pem',wrong)
        with self.assertRaises(Exception):verify(self.archive,wrong,1,1)
    def test_extra_traversal_file(self):
        with zipfile.ZipFile(self.archive,'a') as z:z.writestr('payload/../../escape.js','bad')
        with self.assertRaises(ValueError):verify(self.archive,self.public,1,1)
if __name__=='__main__':unittest.main()
