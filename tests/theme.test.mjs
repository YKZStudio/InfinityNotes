import test from 'node:test';
import assert from 'node:assert/strict';
import {colors,contrast,presets} from '../client/theme.mjs';
import {starters} from '../client/starters.mjs';
import {validateBoard} from '../client/core.mjs';
test('深浅色自定义主题的文字及选中态保持可读',()=>{for(const seed of [...presets.map(x=>x[1]),'#ffffff','#000000','#ffff00','#00ff00','#0000ff'])for(const dark of [true,false]){const c=colors(seed,dark);assert.ok(contrast(c.accent,c.solid)>=4.5);assert.ok(contrast(c.selection,'#ffffff')>=4.5);assert.ok(contrast(c.text,c.background)>=4.5);}assert.notEqual(colors('#ff0000').background,colors('#0000ff').background);});
test('初始卡片内容是真实可编辑的看板',()=>{const b=starters();assert.equal(b.length,4);b.forEach(validateBoard);assert.equal(new Set(b.map(x=>x.id)).size,4);});
