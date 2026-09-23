(()=>{
 'use strict';
 const WIDTH=720,HEIGHT=850;
 const defaults={fit:'contain',background:'#ffffff',score:{x:40,y:40,w:300,h:72,size:26,color:'#172019',align:'left',visible:true},brand:{x:370,y:40,w:190,h:50,size:20,color:'#172019',align:'right',visible:true},copy:{x:40,y:230,w:520,h:410,size:100,color:'#172019',align:'left',visible:true},person:{x:40,y:710,w:520,h:140,size:32,color:'#172019',align:'left',visible:true}};
 const keys=['score','brand','copy','person'];
 const personVariants=['horizontal','vertical','photo','text'];
 function copyText(name,mode='custom',text=''){
  name=String(name||'결과 이름').trim().slice(0,100);const last=name.charCodeAt(name.length-1),batchim=last>=0xAC00&&last<=0xD7A3&&(last-0xAC00)%28!==0;
  return mode==='question'?'혹시\n'+name+(batchim?'이세요?':'세요?'):mode==='hey'?'야,\n'+name+'.':String(text.trim()||'문구를 입력해보세요').slice(0,100);
 }
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(+v)?+v:min));
 function normalize(value={}){
  const out={canvas:{width:WIDTH,height:HEIGHT},fit:value.fit==='cover'?'cover':'contain',background:/^#[\da-f]{6}$/i.test(value.background)?value.background:defaults.background};
  for(const key of keys){const b={...defaults[key],...value[key]};const source=value[key]?value.canvas:null,sx=WIDTH/(Number(source?.width)||600),sy=HEIGHT/(Number(source?.height)||900);b.x=Math.round(b.x*sx);b.w=Math.round(b.w*sx);b.y=Math.round(b.y*sy);b.h=Math.round(b.h*sy);b.w=clamp(b.w,40,WIDTH);b.h=clamp(b.h,30,HEIGHT);b.x=clamp(b.x,0,WIDTH-b.w);b.y=clamp(b.y,0,HEIGHT-b.h);b.size=clamp(b.size,12,160);b.color=/^#[\da-f]{6}$/i.test(b.color)?b.color:'#172019';b.align=['left','center','right'].includes(b.align)?b.align:'left';b.visible=b.visible!==false;out[key]=b;}
  out.copy.mode=['question','hey','custom'].includes(out.copy.mode)?out.copy.mode:'custom';out.person.variant=personVariants.includes(out.person.variant)?out.person.variant:'horizontal';return out;
 }
 function render(art,frame,data={}){
  const layout=normalize(frame.layout);art.className='poster-art frame-art';art.replaceChildren();art.style.backgroundColor=layout.background;
  const bg=document.createElement('img');bg.className='frame-background';bg.alt='';if(frame.url)bg.src=frame.url;else bg.hidden=true;bg.style.objectFit=layout.fit;art.append(bg);
  for(const key of keys){const b=layout[key],box=document.createElement('div');box.className='frame-block frame-'+key;box.dataset.block=key;box.hidden=!b.visible;Object.assign(box.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px',fontSize:b.size+'px',color:b.color,textAlign:b.align});
   if(key==='person'){
    box.dataset.variant=b.variant;
    const img=document.createElement('img');if(data.matchImage)img.src=data.matchImage;img.alt=data.name||'인물 사진';if(!data.matchImage||b.variant==='text')img.hidden=true;img.onerror=()=>{img.hidden=true};const stacked=['vertical','photo'].includes(b.variant),side=stacked?Math.min(128,b.w*.75,b.h*(b.variant==='photo'?.34:.5)):Math.min(b.h,108,b.w*.3);img.style.width=side+'px';img.style.height=(b.variant==='photo'?side*4/3:side)+'px';
    const caption=document.createElement('div'),name=document.createElement('strong'),job=document.createElement('span');name.textContent=String(data.name||'결과 이름').slice(0,100);job.textContent=String(data.category||'직업 · 분류').slice(0,100);caption.append(name,job);box.append(img,caption);box.style.justifyContent=stacked?'flex-start':{left:'flex-start',center:'center',right:'flex-end'}[b.align];if(stacked)box.style.alignItems={left:'flex-start',center:'center',right:'flex-end'}[b.align];
   }else if(key==='score'){
    const score=document.createElement('strong'),context=document.createElement('small');score.textContent='싱크로율 '+Math.round(clamp(data.similarity||0,0,1)*100)+'%';context.textContent='닮은꼴 분석 결과';box.append(score,context);
   }else if(key==='brand')box.textContent=String(b.text??'LOOKALIKE LAB').trim().slice(0,40)||'LOOKALIKE LAB';
   else{const text=copyText(data.name,layout.copy.mode,data.copy||'');box.dataset.mode=layout.copy.mode;if(layout.copy.mode==='custom')box.textContent=text;else for(const textLine of text.split('\n')){const line=document.createElement('span');line.textContent=textLine;line.style.cssText='display:block;white-space:nowrap';box.append(line);}}
   art.append(box);
  }fit(art);return art;
 }
 function fit(art){for(const block of art.querySelectorAll('.frame-block:not([hidden])')){let size=parseFloat(block.style.fontSize);while(size>10&&(block.scrollWidth>block.clientWidth||block.scrollHeight>block.clientHeight)){size--;block.style.fontSize=size+'px';}}}
 function client(){if(!window.lookalikeSupabaseClient)throw Error('로그인 연결을 준비하지 못했어요. 새로고침해 주세요.');return window.lookalikeSupabaseClient;}
 async function list(){const {data,error}=await client().from('card_frames').select('*').order('created_at',{ascending:false}).limit(100).abortSignal(AbortSignal.timeout(12000));if(error)throw Error('프레임을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');return data;}
 async function imageURL(path){const {data,error}=await client().storage.from('card-frames').download(path);if(error)throw Error('프레임 배경을 불러오지 못했어요.');return URL.createObjectURL(data);}
 async function role(){const c=client(),{data:{session}}=await c.auth.getSession();if(!session)return 'user';const {data,error}=await c.rpc('my_admin_role');if(error)throw Error('관리자 권한을 확인하지 못했어요.');return data;}
 window.lookalikeFrames={WIDTH,HEIGHT,keys,personVariants,copyText,normalize,render,fit,client,list,imageURL,role};
})();
