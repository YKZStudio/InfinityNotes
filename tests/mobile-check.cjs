// Regression of mobile journeys; native insets are mocked, not a physical-device acceptance test.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
  const out=process.env.WUJI_QA_OUT||path.join(process.cwd(),'test-results');await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.WUJI_CHROMIUM||undefined,args:['--no-sandbox']});
  const errors=[];
  for(const [name,width,height,dark] of [['small-phone',320,640,false],['phone-safe-area',390,844,false],['phone-dark',390,844,true],['tablet-safe-area',768,1024,false]]){
    const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,colorScheme:dark?'dark':'light'});
    await c.addInitScript(()=>{
      window.__qaInsets={top:32,right:0,bottom:24,left:0};
      window.__TAURI__={core:{invoke:async(command)=>{
        if(command==='native_status')return {folder:{uri:'qa://folder',name:'测试工作区'},updateConfigured:false};
        if(command==='window_insets')return window.__qaInsets;
        if(command==='read_workspace')return null;
        if(['app_ready','write_workspace'].includes(command))return null;
        throw Error('Unexpected command: '+command);
      }}};
    });
    const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8787');
    await p.locator('#saveSettings').click();
    await p.locator('#settingsDialog').waitFor({state:'hidden'});
    await p.screenshot({path:path.join(out,name+'-library.png'),animations:'disabled'});
    await p.locator('.library-card').first().click();
    await p.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--native-safe-top')==='32px');
    const top=await p.locator('.topbar').boundingBox(),bar=await p.locator('#toolbar').boundingBox();
    assert.ok(top.y>=32);assert.ok(bar.y+bar.height<=height-24);
    assert.ok(bar.x>=0&&bar.x+bar.width<=width);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.locator('#menu').click();assert.equal(await p.locator('#main').evaluate(el=>el.inert),true);
    await p.keyboard.press('Escape');assert.equal(await p.locator('#sidebar').evaluate(el=>el.inert),true);
    await p.locator('#menu').click();await p.locator('#newBoard').click();
    await p.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().right<=0);
    console.log('Mobile variant:',name);
    const session=await c.newCDPSession(p);
    const touch=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
    await p.locator('[data-tool=note]').tap();await p.touchscreen.tap(50,230);
    if(!await p.locator('#editorDialog').evaluate(el=>el.open)){
      await p.screenshot({path:path.join(out,name+'-placement-failure.png'),animations:'disabled'});
      console.log('Placement diagnostic:',await p.evaluate(()=>({at:document.elementFromPoint(50,230)?.outerHTML,tool:document.querySelector('#toolbar .active')?.outerHTML,mainInert:document.querySelector('#main').inert})));
    }
    await p.locator('#editorDialog[open]').waitFor();await p.locator('#textEditor').fill('周末的灵感\n散步、阅读、画一张地图。');
    await p.locator('#editorDialog button[value=save]').click();
    assert.equal(await p.locator('#world > g[data-id]').count(),1);
    const inspector=await p.locator('#inspector').boundingBox();assert.ok(inspector.height<80);assert.ok(inspector.y+inspector.height<=bar.y);
    await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
    await p.locator('#toggleInspector').tap();assert.equal(await p.locator('#width').isVisible(),true);
    await p.locator('#duplicate').tap();assert.equal(await p.locator('#world > g[data-id]').count(),2);
    await p.locator('#undo').tap();assert.equal(await p.locator('#world > g[data-id]').count(),1);
    // A selection tap itself must not add an undo entry.
    await p.touchscreen.tap(80,260);await p.locator('#deselect').tap();
    const camera=await p.locator('#world').getAttribute('transform');
    await touch('touchStart',[[1,width-30,190]]);await touch('touchMove',[[1,width-60,210]]);await touch('touchEnd',[]);
    assert.notEqual(await p.locator('#world').getAttribute('transform'),camera);
    const object=await p.locator('#world > g[data-id]').first().getAttribute('transform');
    // The second finger cancels a provisional object move, preserving its coordinates.
    await touch('touchStart',[[1,70,270]]);await touch('touchMove',[[1,80,280]]);
    await touch('touchStart',[[1,80,280],[2,190,280]]);await touch('touchMove',[[1,60,280],[2,220,280]]);await touch('touchEnd',[]);
    assert.equal(await p.locator('#world > g[data-id]').first().getAttribute('transform'),object);
    // Pinch remains available with an insertion/drawing tool, without stray nodes or dialogs.
    for(const tool of ['note','path']){
      await p.locator('[data-tool='+tool+']').tap();
      await touch('touchStart',[[1,60,200],[2,190,200]]);await touch('touchMove',[[1,50,200],[2,220,200]]);await touch('touchEnd',[]);
      assert.equal(await p.locator('#world > g[data-id]').count(),1);assert.equal(await p.locator('dialog[open]').count(),0);
    }
    await p.locator('[data-tool=select]').tap();
    await p.locator('#insertMenu').tap();await p.locator('[data-tool=ellipse]').tap();await p.touchscreen.tap(100,180);
    assert.equal(await p.locator('#world ellipse').count(),1);
    await p.locator('#boardMenu').tap();await p.locator('#menuExport').tap();await p.locator('#exportDialog[open]').waitFor();
    await p.locator('#exportDialog button').getByText('关闭',{exact:true}).click();
    if(name==='phone-safe-area'){
      // Rotate into a display-cutout landscape viewport; controls must avoid both side edges.
      await p.evaluate(()=>{window.__qaInsets={top:0,bottom:18,left:44,right:20};window.dispatchEvent(new CustomEvent('infinity-insets',{detail:window.__qaInsets}));});
      await p.setViewportSize({width:844,height:390});
      await p.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--native-safe-left')==='44px');
      assert.equal(await p.locator('#sidebar').evaluate(el=>el.inert),true);
      const t=await p.locator('#toolbar').boundingBox();assert.ok(t.x>=44&&t.x+t.width<=824);assert.ok(t.y+t.height<=372);
      await p.screenshot({path:path.join(out,'phone-landscape.png'),animations:'disabled'});
    }
    await c.close();
  }
  assert.deepEqual(errors,[]);await browser.close();console.log('手机回归通过：安全边距、320px 小屏、深色、平板、横屏、抽屉、折叠属性、空白拖动、手势取消、插入与导出。');
})().catch(e=>{console.error(e);process.exit(1);});
