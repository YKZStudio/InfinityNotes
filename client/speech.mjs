// Real offline (Vosk/WASM) and private-server speech paths. No microphone access on import.
let vendor;
async function vosk(){if(window.Vosk)return window.Vosk;if(!vendor)vendor=new Promise((ok,no)=>{const script=document.createElement('script');script.src='./vendor/vosk.js';script.onload=()=>ok(window.Vosk);script.onerror=()=>no(Error('离线推理组件未安装，请先执行 npm run prepare'));document.head.append(script);});return vendor;}
export function wav16(chunks,sampleRate){const length=chunks.reduce((n,a)=>n+a.length,0),buf=new ArrayBuffer(44+length*2),view=new DataView(buf);const text=(offset,s)=>[...s].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);let i=44;for(const chunk of chunks)for(const s of chunk){view.setInt16(i,Math.max(-1,Math.min(1,s))*(s<0?32768:32767),true);i+=2;}return new Blob([buf],{type:'audio/wav'});}
export async function startSpeech({signal,mode,modelURL,language,server,token,onText,onStatus}){
  let model,recognizer,stream,context,processor,source,gain,timer,ended=false,stopping=false;const aborter=new AbortController(),chunks=[];
  const release=async()=>{clearTimeout(timer);processor?.disconnect();source?.disconnect();gain?.disconnect();stream?.getTracks().forEach(t=>t.stop());await context?.close().catch(()=>{});};
  const finish=()=>{ended=true;recognizer?.remove();model?.terminate();};
  const ensureActive=()=>{if(signal?.aborted)throw Error("录音已取消");};
  signal?.addEventListener("abort",()=>{ended=true;aborter.abort();release();finish();},{once:true});
  try{
    if(mode==='offline'){if(!modelURL)throw Error('请先导入当前语言的 Vosk 离线模型（.tar.gz）');onStatus('正在加载离线模型…');model=await(await vosk()).createModel(modelURL,-1);}
    else {const url=new URL(server);if(url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))throw Error('服务器语音需要 HTTPS 地址');if(!token)throw Error('请先填写服务器访问密钥');}
    ensureActive();stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
    ensureActive();context=new AudioContext();await context.resume();processor=context.createScriptProcessor(4096,1,1);gain=context.createGain();gain.gain.value=0;source=context.createMediaStreamSource(stream);
    if(model){recognizer=new model.KaldiRecognizer(context.sampleRate);recognizer.on('result',m=>{if(!ended&&m.result.text)onText(m.result.text);if(stopping){finish();onStatus('离线识别已停止');}});recognizer.on('partialresult',m=>{if(!ended&&!stopping)onStatus(m.result.partial||'正在离线聆听…');});}
    processor.onaudioprocess=e=>{if(ended||stopping)return;if(recognizer)recognizer.acceptWaveform(e.inputBuffer);else chunks.push(e.inputBuffer.getChannelData(0).slice());};
    source.connect(processor);processor.connect(gain);gain.connect(context.destination);onStatus(mode==='offline'?'离线聆听中；录音不会上传':'录音中，点击停止后上传至私人服务器');
    const stop=async(cancel=false)=>{if(ended||stopping)return;stopping=true;await release();
      if(cancel){aborter.abort();finish();return;}
      if(recognizer){recognizer.retrieveFinalResult();timer=setTimeout(finish,2000);return;}
      try{ensureActive();timer=setTimeout(()=>aborter.abort(),120000);onStatus('正在上传并识别…');const response=await fetch(server.replace(/\/$/,'')+'/api/speech/transcribe',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'audio/wav','X-Speech-Language':language==='en-US'?'en':'zh'},body:wav16(chunks,context.sampleRate),signal:aborter.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'识别失败');if(!ended)onText(data.text);onStatus('服务器识别完成');}catch(e){if(!ended)onStatus('识别失败：'+e.message);}finally{finish();}
    };
    timer=setTimeout(()=>stop(),60000);
    return {stop:()=>stop(false),abort:()=>{aborter.abort();ended=true;release();finish();}};
  }catch(e){ended=true;await release();finish();throw e;}
}
