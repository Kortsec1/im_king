(()=>{
 'use strict';const F=window.lookalikeFrames,$=s=>document.querySelector(s),art=$('#frameArt');
 let rows=[],current=null,layout=F.normalize(),active='score',url='',pending=null,dirty=false,busy=false,allowed=false,loadVersion=0;
 const sample={name:'결과 이름',category:'직업 · 분류',similarity:.93,matchImage:''};
 const controls={x:'#blockX',y:'#blockY',w:'#blockW',h:'#blockH',size:'#blockSize',color:'#blockColor',align:'#blockAlign'};
 function status(s){$('#frameStatus').textContent=s;}
 $('#frameForm').addEventListener('invalid',e=>{status('입력 범위를 확인해 주세요: '+(e.target.closest('label')?.textContent.trim()||'입력값'));},true);
 function scale(){art.style.transform=`scale(${($('#framePreview').clientWidth||F.WIDTH)/F.WIDTH})`;}
 function draw(){F.render(art,{url,layout},{...sample,copy:$('#sampleCopy').value});art.querySelectorAll('[data-block]').forEach(b=>{b.tabIndex=0;b.setAttribute('role','button');b.setAttribute('aria-label',({score:'싱크로율',brand:'브랜드',copy:'문구',person:'인물 정보'})[b.dataset.block]+' 위치 조정');b.dataset.selected=String(b.dataset.block===active)});scale();}
 function sync(){for(const [k,id] of Object.entries(controls))$(id).value=layout[active][k];$('#blockVisible').checked=layout[active].visible;$('#brandTextField').hidden=active!=='brand';$('#brandText').value=layout.brand.text??'LOOKALIKE LAB';$('.frame-tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.block===active)));
  document.querySelectorAll('[data-copy-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.copyMode===layout.copy.mode)));document.querySelectorAll('[data-person-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.personVariant===layout.person.variant)));$('#sampleCopyField').hidden=layout.copy.mode!=='custom';$('#sampleCopy').disabled=busy||layout.copy.mode!=='custom';$('#copyStyleHelp').textContent=layout.copy.mode==='custom'?'자유 문구는 결과 화면에서 사용자가 입력한 글로 바뀝니다.':layout.copy.mode==='question'?'결과 이름의 받침에 따라 “이세요?” 또는 “세요?”를 자동으로 붙입니다.':'실제 결과 인물의 이름으로 “야, 이름.” 문구를 자동으로 만듭니다.';
 }
 function select(key){active=key;sync();art.querySelectorAll('[data-block]').forEach(b=>b.dataset.selected=String(b.dataset.block===key));}
 function setURL(next){if(url.startsWith('blob:'))URL.revokeObjectURL(url);url=next;}
 function list(){const node=$('#frameList');node.replaceChildren();for(const row of rows){const b=document.createElement('button');b.type='button';b.textContent=row.name+' · '+(row.published?'공개':'비공개');b.setAttribute('aria-pressed',String(row.id===current?.id));b.onclick=()=>open(row);node.append(b);}if(!rows.length)node.textContent='아직 등록된 프레임이 없습니다.';}
 function canLeave(){return !busy&&(!dirty||confirm('저장하지 않은 변경 사항을 버릴까요?'));}
 function fresh(){if(!canLeave())return;loadVersion++;current=null;pending=null;layout=F.normalize();setURL('');$('#frameForm').reset();$('#frameName').value='';$('#frameFit').value=layout.fit;$('#frameBackground').value=layout.background;dirty=false;select('score');draw();list();status('배경 이미지를 올려 새 프레임을 만들어 주세요. 기본은 비공개입니다.');}
 async function open(row){if(!canLeave())return;const v=++loadVersion;lock(true);status('배경을 불러오는 중…');try{const next=await F.imageURL(row.image_path);if(v!==loadVersion){URL.revokeObjectURL(next);return;}current=row;pending=null;setURL(next);layout=F.normalize(row.layout);$('#frameName').value=row.name;$('#framePublished').checked=row.published;$('#frameFit').value=layout.fit;$('#frameBackground').value=layout.background;$('#frameFile').value='';dirty=false;sync();draw();list();status('배치를 수정한 뒤 저장해 주세요.');}catch(e){status(e.message);}finally{lock(false);}}
 function lock(value){busy=value;$('#frameForm').querySelectorAll('input,select,button').forEach(n=>n.disabled=value);$('#newFrame').disabled=value;$('#reloadFrames').disabled=value;if(!value)sync();}
 async function reload(){rows=await F.list();list();}
 $('.frame-tabs').onclick=e=>{const b=e.target.closest('button[data-block]');if(b&&!busy)select(b.dataset.block);};
 document.querySelectorAll('[data-copy-mode]').forEach(button=>button.onclick=()=>{if(busy)return;layout.copy.mode=button.dataset.copyMode;dirty=true;select('copy');draw();});
 document.querySelectorAll('[data-person-variant]').forEach(button=>button.onclick=()=>{if(busy)return;const b=layout.person,variant=button.dataset.personVariant,center=b.x+b.w/2,bottom=b.y+b.h;const [w,h,size]=({horizontal:[520,140,32],vertical:[240,270,32],photo:[240,310,30],text:[400,110,40]})[variant];Object.assign(b,{variant,w,h,size,x:Math.round(center-w/2),y:Math.round(bottom-h),align:variant==='horizontal'?'left':'center'});layout=F.normalize(layout);dirty=true;select('person');draw();});
 for(const [key,id] of Object.entries(controls))$(id).addEventListener('input',()=>{layout[active][key]=['color','align'].includes(key)?$(id).value:Number($(id).value);layout=F.normalize(layout);dirty=true;draw();});
 for(const id of Object.values(controls))$(id).addEventListener('change',sync);
 $('#blockVisible').onchange=()=>{layout[active].visible=$('#blockVisible').checked;dirty=true;draw()};
 $('#frameFit').onchange=()=>{layout.fit=$('#frameFit').value;dirty=true;draw()};$('#frameBackground').oninput=()=>{layout.background=$('#frameBackground').value;dirty=true;draw()};$('#sampleCopy').oninput=draw;
 $('#frameName').oninput=$('#framePublished').onchange=()=>dirty=true;
 $('#brandText').oninput=()=>{layout.brand.text=$('#brandText').value.slice(0,40);dirty=true;draw();};
 $('#frameFile').onchange=async()=>{
  const file=$('#frameFile').files[0];if(!file)return;if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){status('8MB 이하의 PNG, JPG, WebP 이미지를 선택해 주세요.');$('#frameFile').value='';return;}
  lock(true);status('이미지 크기를 맞추는 중…');let bitmap;
  try{bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000)throw Error('이미지가 너무 큽니다. 4천만 화소 이하로 줄여 주세요.');const factor=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.94));if(!blob||blob.size>8*1024*1024)throw Error('이미지를 변환하지 못했어요.');pending=blob;setURL(URL.createObjectURL(blob));dirty=true;draw();status('원본 비율을 유지해 최적화했어요. 정보를 배치하고 저장하세요.');}catch(e){status(e.message||'이미지를 읽지 못했어요.');}finally{bitmap?.close();lock(false);}
 };
 let drag=null;
 art.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-block]');if(!b||busy)return;select(b.dataset.block);drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:layout[active].x,startY:layout[active].y,key:active};art.setPointerCapture(e.pointerId);e.preventDefault();});
 art.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const s=$('#framePreview').clientWidth/F.WIDTH;layout[drag.key].x=Math.round(drag.startX+(e.clientX-drag.x)/s);layout[drag.key].y=Math.round(drag.startY+(e.clientY-drag.y)/s);layout=F.normalize(layout);dirty=true;draw();sync();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])art.addEventListener(type,()=>drag=null);
 art.addEventListener('keydown',e=>{const b=e.target.closest('[data-block]');if(!b||busy||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();select(b.dataset.block);const step=e.shiftKey?10:1;layout[active].x+=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;layout[active].y+=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;layout=F.normalize(layout);dirty=true;draw();sync();art.querySelector(`[data-block="${active}"]`).focus();});
 $('#frameForm').onsubmit=async e=>{e.preventDefault();if(busy||!allowed)return;const name=$('#frameName').value.trim();if(!name||!url){status('이름과 배경 이미지를 먼저 넣어 주세요.');return;}lock(true);status('프레임 저장 중…');try{
   if(!['owner','moderator'].includes(await F.role()))throw Error('관리자 권한이 필요합니다.');
   const id=current?.id||crypto.randomUUID();let path=current?.image_path;
   if(pending){path=id+'/'+crypto.randomUUID()+'.webp';const {error}=await F.client().storage.from('card-frames').upload(path,pending,{contentType:'image/webp',upsert:false,cacheControl:'0'});if(error)throw Error('배경 업로드에 실패했어요. 다시 시도해 주세요.');}
   const payload={name,image_path:path,layout:F.normalize(layout),published:$('#framePublished').checked};
   const query=current?F.client().from('card_frames').update(payload).eq('id',id).eq('revision',current.revision):F.client().from('card_frames').insert({...payload,id});
   const {data,error}=await query.select().abortSignal(AbortSignal.timeout(15000));if(error){const reason=/Invalid (layout|canvas)/i.test(error.message||'')?'서버의 프레임 규격 검증에 실패했어요.':error.code==='42501'?'관리자 저장 권한을 확인하지 못했어요. 다시 로그인해 주세요.':'프레임 저장에 실패했어요.';throw Error(reason+' (오류 코드: '+(error.code||'network')+')');}if(data.length!==1)throw Error('다른 관리자가 먼저 수정했어요. 목록을 새로고침하고 다시 열어 주세요.');
   current=data[0];pending=null;dirty=false;rows=[current,...rows.filter(r=>r.id!==current.id)];list();status(current.published?'저장했습니다. 일반 사용자 결과 화면에 공개됩니다.':'저장했습니다. 관리자에게만 보이는 비공개 프레임입니다.');
  }catch(e){status(e.message);}finally{lock(false);}
 };
 $('#frameExport').onclick=async()=>{if(busy||!url)return;lock(true);const clean=art.cloneNode(true),holder=document.createElement('div');holder.style.cssText='position:fixed;left:-10000px;top:0';holder.append(clean);document.body.append(holder);try{const blob=await window.lookalikeFestivalCards.exportArt(clean);const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='frame-preview.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);status('미리보기 PNG 다운로드를 요청했어요.');}catch(e){status(e.message);}finally{holder.remove();lock(false);}};
 $('#newFrame').onclick=fresh;$('#reloadFrames').onclick=async()=>{if(!canLeave())return;try{await reload();status('목록을 새로고침했어요. 프레임을 다시 선택해 주세요.');}catch(e){status(e.message)}};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});new ResizeObserver(scale).observe($('#framePreview'));
 (async()=>{try{allowed=['owner','moderator'].includes(await F.role());if(!allowed){status('관리자 계정만 이용할 수 있습니다. 내 계정에서 로그인해 주세요.');return;}$('#frameWorkspace').hidden=false;await reload();fresh();document.fonts.load('900 100px PosterBlack','가나다').then(draw).catch(()=>{});try{const r=await fetch('/dataset-v2.json');if(r.ok){const data=await r.json(),item=data.items?.find(x=>x.type==='human');if(item){sample.name=item.name;sample.category=item.group||'분류';sample.matchImage=item.image||'';draw();}}}catch{}}catch(e){status(e.message);}})();
})();
