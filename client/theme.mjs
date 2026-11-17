export const presets=[['烟紫','#ad7c96'],['海蓝','#477cbb'],['松绿','#4d8777'],['琥珀','#bd873b'],['石墨','#737780']];
const rgb=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16));
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*t+rgb(b)[i]*(1-t)).toString(16).padStart(2,'0')).join('');
const lum=h=>rgb(h).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
export function colors(seed,dark){
 if(!/^#[\da-f]{6}$/i.test(seed))seed=presets[0][1];
 const c=dark?{background:mix(seed,'#171619',.10),solid:mix(seed,'#242125',.10),raised:mix(seed,'#302c31',.16),text:'#f5f0f3',muted:'#c0b5be',canvas:mix(seed,'#201e22',.04)}:{background:mix(seed,'#faf6f7',.12),solid:mix(seed,'#fffdfd',.035),raised:mix(seed,'#faf6f7',.17),text:'#292629',muted:'#736970',canvas:mix(seed,'#ffffff',.025)};
 let accent=seed,selection=seed;
 for(let i=0;contrast(accent,c.solid)<4.5&&i<100;i++)accent=mix(accent,dark?'#ffffff':'#171217',.96);
 for(let i=0;contrast(selection,'#ffffff')<4.5&&i<100;i++)selection=mix(selection,'#171217',.96);
 return {...c,accent,selection,seed};
}
export function applyTheme(s){
 const dark=s.theme==='dark'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),c=colors(s.accent,dark),root=document.documentElement;
 root.dataset.theme=dark?'dark':'light';root.dataset.glass=s.reduced?'reduced':'full';
 for(const [key,value] of Object.entries(c))root.style.setProperty('--'+key,value);
 document.querySelector('meta[name="theme-color"]').content=c.background;return dark;
}
