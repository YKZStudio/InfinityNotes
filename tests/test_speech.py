import io
import os
import unittest
import wave
from unittest.mock import patch
from server.speech import SpeechWorker,SpeechError
class SpeechTests(unittest.TestCase):
    def raw(self,seconds=1):
        buf=io.BytesIO()
        with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*int(seconds*16000))
        return buf.getvalue()
    def test_not_configured(self):
        with patch.dict(os.environ,{'WUJI_ASR_MODEL':''}):
            with self.assertRaises(SpeechError) as c:SpeechWorker().transcribe(self.raw(),'zh')
            self.assertEqual(c.exception.status,503)
    def test_invalid_audio(self):
        with patch.dict(os.environ,{'WUJI_ASR_MODEL':'/not-loaded'}):
            for raw in (b'bad',self.raw(62)):
                with self.assertRaises(SpeechError):SpeechWorker().transcribe(raw,'en')
    def test_busy_does_not_queue_unbounded_work(self):
        with patch.dict(os.environ,{'WUJI_ASR_MODEL':'/not-loaded'}):
            worker=SpeechWorker();worker.lock.acquire()
            try:
                with self.assertRaises(SpeechError) as c:worker.transcribe(self.raw(),'zh')
                self.assertEqual(c.exception.status,429)
            finally:worker.lock.release()
if __name__=='__main__':unittest.main()
