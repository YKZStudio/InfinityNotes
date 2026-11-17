// 可选浏览器回归：先启动 server/app.py，再安装 playwright 后运行此文件。
const {chromium}=require(require.resolve('playwright',{paths:[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
  const out=process.env.WUJI_QA_OUT||path.join(process.cwd(),'test-results');await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.WUJI_CHROMIUM||undefined,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8787');await page.locator('#settingsDialog[open]').waitFor();
  await page.screenshot({path:path.join(out,'welcome.png')});
  await page.locator('#saveSettings').click();await page.locator('#settingsDialog').waitFor({state:'hidden'});
  await page.locator('.library-card').first().click();
  assert.equal(await page.locator('#world > g[data-id]').count(),6);
  await page.screenshot({path:path.join(out,'desktop.png')});
  await page.locator('#newBoard').click();
  await page.locator('[data-tool=note]').click();const box=await page.locator('#stage').boundingBox();
  await page.mouse.click(box.x+300,box.y+220);await page.locator('#editorDialog[open]').waitFor();
  await page.locator('#textEditor').fill('这是可保存的真实便笺');await page.locator('#editorDialog button[value=save]').click();
  assert.equal(await page.locator('#world > g[data-id]').count(),1);
  await page.locator('#undo').click();assert.equal(await page.locator('#world > g[data-id]').count(),1);
  await page.locator('#undo').click();assert.equal(await page.locator('#world > g[data-id]').count(),0);
  await page.locator('#redo').click();await page.locator('#redo').click();assert.equal(await page.locator('#world > g[data-id]').count(),1);
  await page.mouse.click(box.x+350,box.y+270);await page.locator('#width').fill('280');await page.locator('#width').press('Tab');
  assert.equal(await page.locator('#world > g[data-id] > rect').first().getAttribute('width'),'280');
  await page.locator('#lock').click();assert.equal(await page.locator('#width').isDisabled(),true);await page.locator('#lock').click();
  const g=page.locator('#world > g[data-id]').first();const before=await g.getAttribute('transform');
  await page.mouse.move(box.x+350,box.y+280);await page.mouse.down();await page.mouse.move(box.x+450,box.y+350,{steps:5});await page.mouse.up();
  assert.notEqual(await g.getAttribute('transform'),before);
  await page.locator('[data-tool=path]').click();await page.mouse.move(box.x+200,box.y+500);await page.mouse.down();await page.mouse.move(box.x+320,box.y+550,{steps:12});await page.mouse.up();
  assert.equal(await page.locator('#world polyline').count(),1);
  const z=await page.locator('#zoomValue').textContent();await page.mouse.wheel(0,-100);await page.waitForTimeout(100);assert.notEqual(await page.locator('#zoomValue').textContent(),z);
  page.once('dialog',d=>d.accept('我的第一个场景'));await page.locator('#addScene').click();assert.equal(await page.locator('#scenes > div').count(),1);
  await page.locator('#settings').click();await page.locator('#keyboardEnabled').check();await page.locator('#serverToken').fill('prototype-test-key-not-for-production');await page.locator('#saveSettings').click();
  await page.locator('[data-tool=select]').click();const target=await g.boundingBox();await page.mouse.click(target.x+50,target.y+50);await page.locator('#editText').click();
  await page.locator('#textEditor').fill('');for(const letter of 'hello')await page.locator('#keyboard').getByRole('button',{name:letter,exact:true}).click();
  assert.equal(await page.locator('#textEditor').inputValue(),'hello');await page.locator('#editorDialog button[value=save]').click();
  await page.locator('#sync').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已上传'));
  const token='prototype-test-key-not-for-production';const list=await(await context.request.get('http://127.0.0.1:8787/api/boards',{headers:{Authorization:'Bearer '+token}})).json();assert.ok(list.boards.length>0);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();await page.locator('#exportJSON').click();const download=await downloadPromise;
  const file=await download.path();const b=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(b.nodes.find(n=>n.type==='note').text,'hello');assert.equal(b.nodes.filter(n=>n.type==='path').length,1);
  await page.locator('#exportDialog button').getByText('关闭',{exact:true}).click();await page.waitForTimeout(600);await page.reload();await page.locator('.library-card').first().click();await page.locator('#world polyline').waitFor();assert.equal(await page.locator('#world > g[data-id]').count(),2);
  await page.locator('#settings').click();assert.equal(await page.locator('#serverToken').inputValue(),'');await page.locator('#saveSettings').click();
  for(const [name,width,height] of [['tablet',1024,768],['phone',390,844]]){
    const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8787');await p.locator('#saveSettings').click();await p.locator('.library-card').first().click();await p.screenshot({path:path.join(out,name+'.png')});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const id of ['newBoard','settings']){if(width<820)await p.locator('#menu').click();await p.locator('#'+id).click();if(id==='settings')await p.locator('#saveSettings').click();}
    if(width<820){const session=await c.newCDPSession(p);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:80,y:300},{id:2,x:200,y:300}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:60,y:300},{id:2,x:240,y:300}]});await p.screenshot({path:path.join(out,'phone-gesture.png')});await p.waitForFunction(()=>document.querySelector('#zoomValue').textContent!=='100%',null,{timeout:3000});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await p.locator('#zoomValue').textContent(),'100%');}
    await c.close();
  }
  assert.deepEqual(errors,[]);await browser.close();console.log('浏览器验证通过：首次设置、编辑、撤销、锁定、拖动、手绘、缩放、场景、内置键盘、同步、导出、重启恢复、平板/手机、双指缩放。');
})().catch(e=>{console.error(e);process.exit(1);});
