import test from 'node:test';
import assert from 'node:assert/strict';
import {wav16} from '../client/speech.mjs';
test('服务器音频封装为单声道 16 位 PCM，不添加录音元数据',async()=>{
  const audio=wav16([Float32Array.from([-1,0,1,.5])],16000),raw=await audio.arrayBuffer(),v=new DataView(raw);
  assert.equal(raw.byteLength,52);assert.equal(new TextDecoder().decode(raw.slice(0,4)),'RIFF');
  assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),16000);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(48,true),32767);
});
test('分段音频按顺序拼接且截断超过范围的采样',async()=>{
  const v=new DataView(await wav16([Float32Array.of(-2),Float32Array.of(2)],48000).arrayBuffer());
  assert.equal(v.getUint32(40,true),4);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(46,true),32767);
});
