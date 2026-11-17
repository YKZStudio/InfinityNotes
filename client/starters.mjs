import {board,node,demo} from './core.mjs';
export function starters(){
 const first=demo();first.title='周末灵感';
 const study=board('学习计划');study.nodes=[node('ellipse',20,150,{text:'学习计划',w:220,h:130,fill:'#efdeea'}),...['复习笔记','刷题练习','整理错题'].flatMap((text,i)=>[node('arrow',245,65+i*135,{w:70,h:70,color:'#96647f'}),node('note',325,50+i*135,{text,w:190,h:90,fill:['#fff0ad','#dceee4','#efdef0'][i]})])];
 const travel=board('旅行清单');travel.nodes=[node('note',35,40,{text:'旅行清单\n\n机票  已完成\n酒店  已完成\n行程  待安排\n证件  待检查',w:235,h:285,fill:'#f0dfee',rotation:-3}),node('note',315,50,{text:'目的地\n海边的慢生活',w:220,h:130,fill:'#dce8fa',rotation:5}),node('note',330,240,{text:'带上相机\n记录沿途风景',w:200,h:120,fill:'#dcebe4'})];
 const ideas=board('新的想法');ideas.nodes=[node('ellipse',130,155,{text:'新的想法',w:280,h:135,fill:'#f0e1ed',color:'#885875'}),node('note',25,20,{text:'功能优化',w:185,h:95,rotation:-7}),node('note',355,20,{text:'协作',w:165,h:95,fill:'#dcebe4',rotation:5}),node('note',355,345,{text:'模板',w:165,h:95,fill:'#efdef0'})];
 travel.updated-=86400000;ideas.updated-=86400000;
 for(const b of [study,travel,ideas])b.camera={x:30,y:120,z:.6};
 return [first,study,travel,ideas];
}
