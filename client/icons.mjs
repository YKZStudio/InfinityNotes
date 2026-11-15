// Original line icons share a 24-unit grid; no icon font or platform emoji.
const paths={
  close:'M6 6l12 12M18 6L6 18',
  plus:'M12 5v14M5 12h14',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  sidebar:'M9 4v16M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1',
  undo:'M8 5l-4 4 4 4M4 9h10a6 6 0 0 1 0 12',
  redo:'M16 5l4 4-4 4M20 9H10a6 6 0 0 0 0 12',
  export:'M12 15V2M8 6l4-4 4 4M5 10H4v10h16V10h-1',
  cloud:'M7 18H6a4 4 0 1 1 .6-8A6 6 0 0 1 18 8a5 5 0 0 1 0 10h-1M12 20v-9M9 14l3-3 3 3',
  more:'M5 12h.01M12 12h.01M19 12h.01',
  settings:'M9 3h6l.5 3 2.5 1.5 2.8-1 3 5.2-2.3 2v2.9l2.3 2-3 5.2-2.8-1-2.5 1.5-.5 3H9l-.5-3L6 22.8l-2.8 1-3-5.2 2.3-2v-2.9l-2.3-2 3-5.2 2.8 1L8.5 6 9 3',
  cursor:'M5 3l14 10-7 1-3 7L5 3',
  hand:'M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 4-2 7-6 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l1 1',
  note:'M4 4h16v11l-5 5H4V4M15 20v-5h5',
  text:'M4 5V3h16v2M12 3v18M8 21h8',
  pen:'M4 16L16 4l4 4L8 20l-5 1 1-5M13 7l4 4',
  rect:'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1',
  circle:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  arrow:'M4 20L20 4M9 4h11v11',
  image:'M4 4h16v16H4V4M4 17l5-5 4 4 3-3 4 4M14 8h.01',
  link:'M9 8l3-3a5 5 0 0 1 7 7l-3 3M15 16l-3 3a5 5 0 0 1-7-7l3-3M8 16l8-8',
  external:'M14 3h7v7M21 3L10 14M10 3H3v18h18v-7',
  sliders:'M5 3v4m0 4v10M12 3v10m0 4v4M19 3v4m0 4v10M2 7h6M9 17h6M16 7h6'
};
// Keep the settings gear within the same bounds as the other glyphs.
paths.settings='M10 3h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3l-2-2 2-4 3 1 3-1 1-3';
export function icon(name){
  if(name==='settings')return '<svg class="icon" aria-hidden="true" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path transform="translate(2 0)" d="'+paths.settings+'"/><circle cx="14" cy="13.5" r="3.5"/></svg>';
  return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[name]||paths.plus)+'"/></svg>';
}
export function decorateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
