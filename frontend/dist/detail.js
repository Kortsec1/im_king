const root=document.querySelector("#detailRoot"),id=new URLSearchParams(location.search).get("id");
const typeLabels={human:"인물",character:"애니 캐릭터",animal:"동물"};
const traitMeta={outline:["얼굴 윤곽","폭 대비 세로 윤곽","짧은 윤곽","긴 윤곽"],head_width:["두상 너비","랜드마크 기준 두상 폭","좁은 편","넓은 편"],jaw_depth:["턱 깊이","눈선부터 턱끝까지","짧은 편","긴 편"],eye_gap:["눈 간격","두 눈 중심 사이 거리","가까운 편","먼 편"],eye_tilt:["눈 기울기","양 눈꼬리의 상승 각도","수평형","상승형"],eye_width:["눈 너비","얼굴 폭 대비 눈 너비","짧은 편","긴 편"],eye_height:["눈 높이","눈 너비 대비 세로 개방도","낮은 편","높은 편"],brow_span:["눈썹 길이","얼굴 폭 대비 눈썹 범위","짧은 편","긴 편"],brow_arch:["눈썹 아치","눈썹 곡선의 높이 변화","직선형","곡선형"],nose_position:["코 위치","얼굴 상단 대비 코끝 위치","위쪽","아래쪽"],nose_width:["코 너비","얼굴 폭 대비 콧방울 폭","좁은 편","넓은 편"],nose_length:["코 길이","미간부터 코끝까지","짧은 편","긴 편"],mouth_width:["입 너비","얼굴 폭 대비 입꼬리 거리","좁은 편","넓은 편"],lip_height:["입술 높이","입 너비 대비 입술 높이","얇은 편","도톰한 편"],skin_lightness:["촬영 밝기","볼 영역의 명도 표본","어둡게 촬영","밝게 촬영"],skin_warmth:["촬영 온기","볼 영역의 색온도 표본","차가운 조명","따뜻한 조명"]};
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function percentile(all,key,value){const values=Object.values(all).map(entry=>entry.traits?.[key]).filter(Number.isFinite).sort((a,b)=>a-b);if(!values.length)return 50;return Math.round(values.filter(item=>item<=value).length/values.length*100)}
function faceSvg(detail){if(!detail?.landmarks?.length)return"";const colors=['pink','amber','mint','blue','violet','orange'];const points=detail.landmarks.map(([x,y],index)=>`<circle class="landmark ${colors[index%colors.length]}" cx="${x*1000}" cy="${y*1000}" r="${index%7===0?3.7:2.25}"/>`).join("");const keys=(detail.keypoints||[]).map(([x,y])=>[x*1000,y*1000]);const guides=[];if(keys.length>=5){guides.push(`<line x1="${keys[0][0]}" y1="${keys[0][1]}" x2="${keys[1][0]}" y2="${keys[1][1]}"/><line x1="${keys[3][0]}" y1="${keys[3][1]}" x2="${keys[4][0]}" y2="${keys[4][1]}"/>`,keys.map(([x,y])=>`<circle class="key" cx="${x}" cy="${y}" r="5"/>`).join(""))}if(detail.bbox){const [x1,y1,x2,y2]=detail.bbox.map(v=>v*1000);guides.push(`<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}"/><text x="${x1+8}" y="${Math.max(24,y1-10)}">FACE ROI</text>`)}return`<svg class="face-map" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${guides.join("")}${points}</svg>`}
function traitRows(detail,all){return Object.entries(traitMeta).map(([key,meta])=>{const value=detail.traits?.[key];if(!Number.isFinite(value))return"";const rank=percentile(all,key,value),reading=rank<35?meta[2]:rank>65?meta[3]:"중간 범위";return`<div class="trait-row"><div class="trait-label"><strong>${meta[0]}</strong><small>${meta[1]}</small></div><div class="track" title="데이터셋 내 ${rank}백분위"><i style="width:${rank}%"></i></div><div class="trait-value">${value.toFixed(3)}<small>${reading} · P${rank}</small></div></div>`}).join("")}
function pipeline(item){const human=item.type==="human";return`<section class="pipeline"><h2>실제 분석 파이프라인</h2><div class="pipeline-grid"><article class="step"><b>1</b><h3>${human?"얼굴 검출":"대상 영역 정규화"}</h3><p>이미지에서 비교할 주 피사체를 찾고 품질과 크기를 표준화합니다.</p></article><article class="step"><b>2</b><h3>${human?"106점 랜드마크 정렬":"시각 특징 추출"}</h3><p>${human?"눈·코·입과 윤곽 좌표를 검출하고 5점 기준으로 얼굴 방향을 정렬합니다.":"윤곽, 배치, 색, 질감 특징을 전용 벡터로 변환합니다."}</p></article><article class="step"><b>3</b><h3>${human?"ArcFace 임베딩":"다중 참조 앙상블"}</h3><p>${human?"정렬된 얼굴을 512차원 벡터로 인코딩하며 원본 벡터는 웹에 공개하지 않습니다.":"같은 대상의 여러 기준 이미지 점수를 함께 계산해 한 장의 편향을 줄입니다."}</p></article><article class="step"><b>4</b><h3>유사도 재정렬</h3><p>${human?"코사인 유사도에 구조 특징, 연령대·외형 표현 차이를 보조적으로 반영합니다.":"전체 후보 분포에서 상대 점수를 계산해 가장 가까운 인상을 정렬합니다."}</p></article></div><p class="notice">촬영 밝기와 색온도 값은 사진의 조명·카메라 환경을 설명하기 위한 값이며, 개인의 피부색이나 정체성을 판정하지 않습니다. 결과는 신원 확인이 아닌 오락용 시각 유사도입니다.</p></section><div class="source-row"><span>공개 데이터셋 기준 이미지</span>${item.source?`<a href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">이미지 출처 확인 ↗</a>`:""}</div>`}
function humanPage(item,detail,all){const category=item.group||item.category||"인물",samples=item.sample_count?`기준 사진 ${item.sample_count}장`:"얼굴 기준 이미지";return`<a class="back" href="/gallery?type=human">← 데이터셋으로 돌아가기</a><div class="analysis-hero"><div class="portrait-column"><div class="portrait-stage"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)} 얼굴 기준 사진">${faceSvg(detail)}<button class="overlay-toggle" type="button" aria-pressed="true">분석점 <i></i></button></div><div class="map-legend"><span><i></i>106점 얼굴 랜드마크</span><span><i></i>5점 정렬 기준·검출 영역</span></div></div><div><section class="identity"><h1>${escapeHtml(item.name)}</h1><div class="identity-meta"><span>${escapeHtml(category)}</span><span>${samples}</span></div><code class="identity-id">DATASET ID · ${escapeHtml(item.id)}</code><p>${escapeHtml(item.description||"정면 얼굴의 구조적 특징과 ArcFace 임베딩을 닮은꼴 비교 기준으로 사용합니다.")}</p></section><section><div class="trait-head"><h2>구조적 특징 분석</h2><p>원시 측정값 · 데이터셋 백분위</p></div><div class="trait-list">${traitRows(detail,all)}</div></section></div></div>${pipeline(item)}`}
function visualPage(item){const type=typeLabels[item.type],criteria=item.type==="character"?["얼굴 실루엣","눈·코·입 배치","색 분포","방향성 질감","다중 참조 평균"]:["머리 윤곽","눈 위치와 간격","주둥이 비율","귀·얼굴 실루엣","색과 질감 분포"];return`<a class="back" href="/gallery?type=${item.type}">← 데이터셋으로 돌아가기</a><div class="analysis-hero"><div class="portrait-column"><div class="portrait-stage"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)} 기준 이미지"></div></div><div><section class="identity"><h1>${escapeHtml(item.name)}</h1><div class="identity-meta"><span>${type}</span><span>${escapeHtml(item.group||type)}</span></div><code class="identity-id">DATASET ID · ${escapeHtml(item.id)}</code><p>${escapeHtml(item.description||"전용 시각 특징 모델의 비교 기준 이미지입니다.")}</p></section><section><div class="trait-head"><h2>${type} 전용 비교 기준</h2><p>사람 얼굴 ArcFace와 분리된 모델</p></div><div class="trait-list">${criteria.map(label=>`<div class="trait-row"><div class="trait-label"><strong>${label}</strong><small>시각 특징 벡터 구성 요소</small></div><div class="track"><i style="width:72%"></i></div><div class="trait-value">ACTIVE<small>비교 반영</small></div></div>`).join("")}</div></section></div></div>${pipeline(item)}`}
let item,allDetails={},photos=[],position=0,admin=false,showDeleted=false,showPoints=true,busy=false;
let editDraft=null,editOpen=false,editMessage='';
function renderEditor(){
 const draft=editDraft||{name:item.name,group:item.group||'',description:item.description||'',gender:item.gender||'unknown'};
 const panel=document.createElement('details');panel.className='dataset-editor';panel.open=editOpen;
 panel.innerHTML='<summary>데이터셋 정보 수정</summary><form><label>이름<input name="name" required maxlength="80" value="'+escapeHtml(draft.name)+'"></label><label>분류·소속<input name="group" maxlength="80" value="'+escapeHtml(draft.group)+'"></label><label>소개·설명<textarea name="description" rows="4" maxlength="500">'+escapeHtml(draft.description)+'</textarea></label><p class="editor-hint">'+escapeHtml(typeLabels[item.type])+' 유형과 사진 분석값은 유지됩니다. 수정 내용은 공개 목록과 이후 분석 결과에 반영됩니다.</p><div class="editor-buttons"><button type="submit">정보 저장</button><button type="button" data-cancel>취소</button></div><p role="status" class="editor-message">'+escapeHtml(editMessage)+'</p></form>';
 panel.ontoggle=()=>{editOpen=panel.open;};const form=panel.querySelector('form');
 if(item.type==='human'){const label=document.createElement('label');label.textContent='비교 대상 성별';const select=document.createElement('select');select.name='gender';[['male','남성'],['female','여성'],['unknown','미분류 · 성별별 비교 제외']].forEach(([value,text])=>select.add(new Option(text,value)));select.value=draft.gender||'unknown';select.style.cssText='min-height:44px;font-size:16px';label.append(select);form.querySelector('.editor-hint').before(label);const note=document.createElement('p');note.textContent='분류 근거: '+({metadata:'기존 인물 정보',model_estimate:'사진 모델 추정 · 관리자 확인 권장',admin:'관리자 확인'}[item.gender_source]||'미확인')+'. 저장하면 이 인물의 모든 기준 사진에 적용됩니다.';label.after(note);}
 for(const field of form.elements)field.disabled=busy;
 form.oninput=()=>{editDraft=Object.fromEntries(new FormData(form));};
 panel.querySelector('[data-cancel]').onclick=()=>{editDraft=null;editOpen=false;editMessage='';renderPhoto();};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;editDraft=Object.fromEntries(new FormData(form));busy=true;editOpen=true;editMessage='저장 중…';renderPhoto();
  try{
   const {data:{session}}=await window.lookalikeSupabaseClient.auth.getSession();if(!session)throw Error('다시 로그인해 주세요.');
   const response=await fetch(window.lookalikeDatasetQueue+'/dataset/items/'+encodeURIComponent(id),{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(editDraft),signal:AbortSignal.timeout(15000)});
   const result=await response.json();if(!response.ok)throw Error(result.detail||'저장하지 못했습니다.');
   Object.assign(item,result.item);editDraft=null;editMessage='저장했습니다.';document.title=item.name+' 얼굴 분석 · LOOKALIKE LAB';
  }catch(error){editMessage=error.message;}finally{busy=false;renderPhoto();}
 };
 root.querySelector('.identity').after(panel);
}
async function adminRole(){
 try{
  const client=window.lookalikeSupabaseClient;if(!client)return false;
  const {data:{session}}=await client.auth.getSession();if(!session)return false;
  const r=await fetch('https://dphiuepbsullrscuuzrc.supabase.co/rest/v1/rpc/my_admin_role',{method:'POST',headers:{apikey:'sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq',Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
  return r.ok&&['owner','moderator'].includes(await r.json());
 }catch{return false;}
}
function visiblePhotos(){return photos.filter(p=>showDeleted||!p.removed);}
const photoFields={
 glasses:['안경',{unknown:'미확인',none:'없음',eyeglasses:'일반 안경',sunglasses:'선글라스'}],
 beard:['수염',{unknown:'미확인',none:'없음',stubble:'짧은 수염',moustache:'콧수염',full:'턱수염·전체 수염'}],
 hair_length:['머리 길이',{unknown:'미확인',bald:'머리카락 없음',short:'짧음',medium:'중간',long:'김'}],
 bangs:['앞머리',{unknown:'미확인',none:'없음',present:'있음'}],
 headwear:['모자·머리 덮개',{unknown:'미확인',none:'없음',present:'있음'}]
};
const attributeDrafts=new Map(),attributeMessages=new Map();let attributesOpen=false;
function renderPhotoAttributes(photo){
 if(item.type!=='human'&&item.type!=='character')return;
 const known=Object.entries(photoFields).filter(([key])=>photo.attributes?.[key]&&photo.attributes[key]!=='unknown');
 if(known.length){const summary=document.createElement('p');summary.className='photo-attribute-summary';summary.textContent='관리자가 확인한 사진 특징 · '+known.map(([key,[label,options]])=>label+': '+options[photo.attributes[key]]).join(' / ');root.querySelector('.photo-note').after(summary);}
 if(!admin)return;
 const panel=document.createElement('details');panel.className='photo-attribute-editor';panel.open=attributesOpen;panel.ontoggle=()=>attributesOpen=panel.open;
 const heading=document.createElement('summary');heading.textContent='현재 사진의 특징 수정';panel.append(heading);
 const hint=document.createElement('p');hint.textContent='안경·수염 등은 사진마다 다릅니다. 현재 사진에만 저장됩니다. 확인하기 어려운 값은 미확인으로 두세요.';panel.append(hint);
 const form=document.createElement('form'),grid=document.createElement('div');grid.className='photo-attribute-grid';const draft=attributeDrafts.get(photo.sample_id)||photo.attributes||{};
 for(const [key,[name,options]] of Object.entries(photoFields)){
  const label=document.createElement('label');label.textContent=name;const select=document.createElement('select');select.name=key;for(const [value,text] of Object.entries(options))select.add(new Option(text,value));select.value=draft[key]||'unknown';label.append(select);grid.append(label);
 }
 const noteLabel=document.createElement('label');noteLabel.textContent='공개 사진 메모 (선택)';const note=document.createElement('textarea');note.name='note';note.maxLength=200;note.rows=2;note.value=draft.note||'';noteLabel.append(note);
 const save=document.createElement('button');save.type='submit';save.textContent='사진 특징 저장';const message=document.createElement('p');message.className='attribute-message';message.setAttribute('role','status');message.textContent=attributeMessages.get(photo.sample_id)||'';
 form.append(grid,noteLabel,save,message);panel.append(form);root.querySelector('.dataset-editor').after(panel);
 for(const field of form.elements)field.disabled=busy;
 form.oninput=()=>attributeDrafts.set(photo.sample_id,Object.fromEntries(new FormData(form)));
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const payload=Object.fromEntries(new FormData(form));attributeDrafts.set(photo.sample_id,payload);attributesOpen=true;busy=true;attributeMessages.set(photo.sample_id,'저장 중…');renderPhoto();
  try{
   const {data:{session}}=await window.lookalikeSupabaseClient.auth.getSession();if(!session)throw Error('다시 로그인해 주세요.');
   const response=await fetch(window.lookalikeDatasetQueue+'/dataset/photos/'+encodeURIComponent(photo.sample_id)+'/attributes',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   const data=await response.json();if(!response.ok)throw Error(data.detail||'저장하지 못했습니다.');
   photo.attributes=data.attributes;attributeDrafts.delete(photo.sample_id);attributeMessages.set(photo.sample_id,'현재 사진의 특징을 저장했습니다.');
  }catch(error){attributeMessages.set(photo.sample_id,error.message);}finally{busy=false;renderPhoto();}
 };
}
function renderPhoto(focusDirection){
 const active=visiblePhotos();position=Math.max(0,Math.min(position,active.length-1));
 const photo=active[position];if(!photo){root.innerHTML='<div class="error-state"><strong>공개 중인 사진이 없습니다.</strong><a href="/gallery">데이터셋으로 돌아가기</a></div>';return;}
 const detail=photo.detail||{},current={...item,image:photo.image,sample_count:photos.filter(x=>!x.removed).length};
 root.innerHTML=item.type==='human'?humanPage(current,detail,allDetails):visualPage(current);
 const stage=root.querySelector('.portrait-stage'),img=stage.querySelector('img'),toggle=stage.querySelector('.overlay-toggle');
 stage.classList.add('photo-loading');if(!showPoints)stage.classList.add('overlay-off');
 if(detail.width&&detail.height){img.width=detail.width;img.height=detail.height;}
 const controls=document.createElement('div');controls.className='photo-controls';
 controls.innerHTML='<button type="button" data-prev aria-label="이전 사진">‹</button><span role="status" aria-live="polite">'+(position+1)+' / '+active.length+'</span><button type="button" data-next aria-label="다음 사진">›</button>';
 stage.after(controls);
 controls.querySelector('[data-prev]').disabled=position===0||busy;controls.querySelector('[data-next]').disabled=position===active.length-1||busy;
 controls.querySelector('[data-prev]').onclick=()=>{position--;renderPhoto('prev');};
 controls.querySelector('[data-next]').onclick=()=>{position++;renderPhoto('next');};
 const note=document.createElement('p');note.className='photo-note';note.textContent=photo.removed?'삭제된 사진 · 현재 비교에 사용되지 않습니다.':item.type==='human'?'현재 사진에서 측정한 분석점과 수치입니다.':'이 사진은 전용 시각 특징으로 비교합니다. 사람용 얼굴 분석점은 적용하지 않습니다.';controls.after(note);
 const finish=()=>stage.classList.remove('photo-loading');img.onload=finish;
 img.onerror=()=>{stage.classList.add('photo-loading');note.textContent='사진을 불러오지 못했습니다. 다른 사진을 보거나 새로고침해 주세요.';if(toggle)toggle.disabled=true;};
 if(img.complete&&img.naturalWidth)finish();
 if(toggle){
  toggle.hidden=!detail.landmarks?.length;
  toggle.setAttribute('aria-pressed',String(showPoints));toggle.firstChild.textContent=showPoints?'분석점 ':'분석점 끔 ';
  toggle.onclick=()=>{showPoints=!showPoints;stage.classList.toggle('overlay-off',!showPoints);toggle.setAttribute('aria-pressed',String(showPoints));toggle.firstChild.textContent=showPoints?'분석점 ':'분석점 끔 ';};
  if(!detail.landmarks?.length){root.querySelector('.map-legend').textContent='이 사진에서는 얼굴 분석점을 검출하지 못했습니다.';}
 }
 if(admin){
  const actions=document.createElement('div');actions.className='photo-admin';
  const button=document.createElement('button');button.type='button';button.className='photo-delete';button.textContent=photo.removed?'이 사진 복원':'이 사진 삭제';button.disabled=busy;
  button.onclick=()=>changePhoto(photo,!photo.removed);
  const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=showDeleted;checkbox.disabled=busy;
  label.append(checkbox,document.createTextNode('삭제된 사진 보기'));checkbox.onchange=()=>{showDeleted=checkbox.checked;position=0;renderPhoto();};
  actions.append(button,label);note.after(actions);
  renderEditor();
 }
 renderPhotoAttributes(photo);
 if(focusDirection){const button=controls.querySelector('[data-'+focusDirection+']');if(!button.disabled)button.focus();}
}
async function changePhoto(photo,remove){
 if(busy)return;
 const remaining=photos.filter(p=>!p.removed).length;
 if(remove&&!confirm(remaining===1?'마지막 사진입니다. 삭제하면 이 대상은 공개 목록과 닮은꼴 비교에서 빠집니다. 삭제할까요?':'현재 사진만 삭제할까요? 이 사진의 비교 특징도 제외되며, 다른 사진은 유지됩니다.'))return;
 busy=true;renderPhoto();
 try{
  const {data:{session}}=await window.lookalikeSupabaseClient.auth.getSession();if(!session)throw Error('다시 로그인해 주세요.');
  const response=await fetch(window.lookalikeDatasetQueue+'/dataset/photos/'+encodeURIComponent(photo.sample_id)+(remove?'/delete':'/restore'),{method:'POST',headers:{Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Error(data.detail||'사진을 변경하지 못했습니다.');
  photo.removed=remove;if(!photos.some(p=>!p.removed))showDeleted=true;
  busy=false;renderPhoto();
  root.querySelector('.photo-note').textContent=remove?'이 사진을 삭제했습니다. 이후 비교에서는 제외됩니다. 원본은 복원할 수 있도록 보관됩니다.':'사진을 복원했습니다. 목록과 비교에 다시 포함됩니다.';
 }catch(error){busy=false;renderPhoto();root.querySelector('.photo-note').textContent=error.message;}
}
try{
 const [dataset,detailResponse,allowed]=await Promise.all([window.lookalikeDatasetLoad({includeEmpty:true}),fetch('/detail-data.json?v=1'),adminRole()]);
 admin=allowed;item=dataset.items.find(entry=>entry.id===id);const excluded=await window.lookalikeDatasetState();
 if(excluded.has(id))throw Error('삭제된 데이터셋 항목입니다.');
 if(!item)throw Error('데이터셋에서 해당 항목을 찾지 못했습니다.');
 allDetails=detailResponse.ok?(await detailResponse.json()).items:{};
 const basePhotos=item.photos.filter(p=>p.sample_id.startsWith('base-'));
 const [baseDetail,custom]=await Promise.all([
  basePhotos.length?fetch('/photo-details/'+encodeURIComponent(id)+'.json',{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('사진별 분석 정보를 불러오지 못했습니다.');return r.json();}):Promise.resolve({}),
  fetch(window.lookalikeDatasetQueue+'/dataset/photos/'+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('추가 사진을 불러오지 못했습니다.');return r.json();})
 ]);
 photos=item.photos.map(p=>({...p,detail:baseDetail[p.sample_id]||custom.photos.find(x=>x.sample_id===p.sample_id)?.detail||{}}));
 if(!photos.some(p=>!p.removed)){if(admin&&photos.length)showDeleted=true;else throw Error('공개 중인 사진이 없습니다.');}
 document.title=item.name+' 얼굴 분석 · LOOKALIKE LAB';renderPhoto();
}catch(error){root.innerHTML='<div class="error-state"><strong>상세 분석을 열지 못했습니다.</strong><p>'+escapeHtml(error.message)+'</p><a href="/gallery">데이터셋으로 돌아가기</a></div>';}
