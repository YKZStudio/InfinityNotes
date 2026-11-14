"""Bounded optional CPU speech worker. Model path must be provisioned by the operator."""
import io
import os
import threading
import wave
class SpeechError(Exception):
    def __init__(self,message,status=400):super().__init__(message);self.status=status
class SpeechWorker:
    def __init__(self):self.lock=threading.Lock();self.model=None
    def transcribe(self,raw,language):
        if language not in ('zh','en'):raise SpeechError('仅支持中文或英文')
        path=os.environ.get('WUJI_ASR_MODEL','')
        if not path:raise SpeechError('服务端未配置语音模型',503)
        try:
            with wave.open(io.BytesIO(raw),'rb') as audio:
                if audio.getnchannels()!=1 or audio.getsampwidth()!=2 or not 8000<=audio.getframerate()<=48000 or not 0<audio.getnframes()/audio.getframerate()<=61:raise SpeechError('请上传不超过 60 秒的单声道 16 位 WAV 音频')
        except (wave.Error,EOFError):raise SpeechError('音频格式无效')
        if not self.lock.acquire(blocking=False):raise SpeechError('语音服务忙，请稍后重试',429)
        try:
            if self.model is None:
                try:from faster_whisper import WhisperModel
                except ImportError:raise SpeechError('语音依赖未安装',503)
                self.model=WhisperModel(path,device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
            segments,_=self.model.transcribe(io.BytesIO(raw),language=language,beam_size=1,vad_filter=False)
            return ''.join(s.text for s in segments).strip()
        except SpeechError:raise
        except Exception:raise SpeechError('语音模型暂不可用，请检查服务配置',503)
        finally:self.lock.release()
