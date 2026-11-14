import test from 'node:test';
import assert from 'node:assert/strict';
import {board,node,demo,validateBoard,History,zoomAt,worldPoint,exportSVG} from '../client/core.mjs';
test('示例和空白看板符合导入格式',()=>{validateBoard(board());validateBoard(demo());});
test('缩放保持鼠标下的世界坐标不变，并限制缩放范围',()=>{const c={x:-120,y:300,z:.7},p=worldPoint(320,240,c);const next=zoomAt(c,320,240,2);const q=worldPoint(320,240,next);assert.ok(Math.abs(p.x-q.x)<1e-10);assert.ok(Math.abs(p.y-q.y)<1e-10);assert.equal(zoomAt(c,0,0,1000).z,8);assert.equal(zoomAt(c,0,0,.00001).z,.1);});
test('撤销不共享对象引用，重做和分支编辑正确',()=>{const h=new History(2),b=board();h.push(b);b.nodes.push(node('text',0,0));const old=h.undo(b);assert.equal(old.nodes.length,0);const next=h.redo(old);assert.equal(next.nodes.length,1);h.push(next);next.nodes[0].text='改变';assert.equal(h.past.at(-1).nodes[0].text,'双击编辑文字');assert.equal(h.future.length,0);});
test('拒绝非有限坐标、重复对象标识和可执行图片地址',()=>{for(const mutate of [b=>b.nodes[0].x=NaN,b=>b.nodes.push({...b.nodes[0]}),b=>b.nodes.push(node('image',0,0,{src:'javascript:alert(1)'})),b=>b.nodes[0].color='red" onload="evil()',b=>b.camera.z=0]){const b=demo();mutate(b);assert.throws(()=>validateBoard(b));}});
test('导出的文字转义，旋转对象被完整包含',()=>{const b=board();b.nodes=[node('text',10,20,{text:'<script>alert("x")</script>',w:300,h:100,rotation:90})];const svg=exportSVG(b);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;'));assert.ok(svg.includes('rotate(90'));const values=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);assert.ok(values[2]>300&&values[3]>300);});
