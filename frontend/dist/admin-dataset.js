(()=>{
 const $=s=>document.querySelector(s),form=$('#datasetImportForm');
 if(!form)return;
 let all=[],removed=new Set(),visible=30,loading=false,activeJob=null,previousExisting='';
 const labels={human:'인물',character:'애니 캐릭터',animal:'동물'},progress=$('#importProgress');
 const genderLabel=document.createElement('label');genderLabel.textContent='성별';const genderFilter=document.createElement('select');genderFilter.id='datasetGender';[['all','전체'],['male','남성'],['female','여성'],['unknown','미분류']].forEach(([value,label])=>genderFilter.add(new Option(label,value)));genderLabel.append(genderFilter);$('#datasetReload').before(genderLabel);genderFilter.onchange=()=>{visible=30;render();};
 function message(text,state='working'){progress.hidden=false;progress.dataset.state=state;progress.textContent=text;}
 function existingOptions(){
  const selected=form.elements.existing_id.value;
  form.elements.existing_id.replaceChildren(new Option('새 대상 추가',''));
  all.filter(x=>x.type===form.elements.category.value&&!removed.has(x.id)).sort((a,b)=>a.name.localeCompare(b.name,'ko')).forEach(x=>form.elements.existing_id.add(new Option(x.name+' · 사진 추가',x.id)));
  if([...form.elements.existing_id.options].some(x=>x.value===selected))form.elements.existing_id.value=selected;
  setExisting();
 }
 function setExisting(){
  const item=all.find(x=>x.id===form.elements.existing_id.value);
  form.elements.name.readOnly=Boolean(item);
  form.elements.group.readOnly=Boolean(item);form.elements.description.readOnly=Boolean(item);
  if(item){form.elements.name.value=item.name;form.elements.group.value=item.group||'';form.elements.description.value=item.description||'';}
  else if(previousExisting){form.elements.name.value='';form.elements.group.value='';form.elements.description.value='';}
  previousExisting=item?.id||'';
 }
 function render(){
  const q=$('#datasetSearch').value.trim().toLowerCase(),type=$('#datasetType').value,state=$('#datasetVisibility').value;
  const items=all.filter(x=>(!q||x.name.toLowerCase().includes(q))&&(type==='all'||x.type===type)&&(genderFilter.value==='all'||x.type==='human'&&(x.gender||'unknown')===genderFilter.value)&&(state==='all'||removed.has(x.id)===(state==='removed')));
  items.sort($('#datasetSort').value==='name'?(a,b)=>a.name.localeCompare(b.name,'ko'):(a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0)||a.name.localeCompare(b.name,'ko'));
  const list=$('#datasetList');list.replaceChildren();
  for(const item of items.slice(0,visible)){
   const row=document.createElement('div');row.className='dataset-row';
   const img=document.createElement('img');img.src=item.image;img.alt=item.name;img.loading='lazy';img.width=54;img.height=64;
   const info=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');
   name.textContent=item.name;meta.textContent=labels[item.type]+(item.type==='human'?' · '+({male:'남성',female:'여성'}[item.gender]||'미분류')+(item.gender_source==='model_estimate'?' (추정)':''):'')+' · '+item.sample_count+'장'+(removed.has(item.id)?' · 삭제됨':'')+(item.sample_count===0?' · 사진 없음':'');info.append(name,meta);
   const link=document.createElement('a');link.href='/detail?id='+encodeURIComponent(item.id);link.textContent='사진·정보 관리';
   if(removed.has(item.id)){link.removeAttribute('href');link.textContent='복원 후 조회 가능';}
   const action=document.createElement('button');action.type='button';const gone=removed.has(item.id);action.className='reset'+(gone?'':' remove');action.textContent=gone?'복원':'삭제';
   action.onclick=async()=>{
    if(!gone&&!confirm(item.name+'을 공개 목록과 닮은꼴 비교에서 제외할까요? 나중에 복원할 수 있습니다.'))return;
    action.disabled=true;
    try{
     const c=window.lookalikeSupabaseClient;
     const {error}=gone?await c.from('dataset_exclusions').delete().eq('item_id',item.id):await c.from('dataset_exclusions').insert({item_id:item.id});
     if(error)throw error;
     gone?removed.delete(item.id):removed.add(item.id);render();existingOptions();
    }catch{$('#datasetStatus').textContent='변경하지 못했습니다. 로그인과 관리자 권한을 확인해 주세요.';action.disabled=false;}
   };row.append(img,info,link,action);list.append(row);
  }
  if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent='조건에 맞는 데이터셋이 없습니다.';list.append(p);}
  $('#datasetStatus').textContent=items.length+'개 중 '+Math.min(visible,items.length)+'개 표시 · 삭제한 대상은 복원할 수 있습니다.';
  $('#datasetMore').hidden=visible>=items.length;
 }
 async function load(){
  if(loading)return;loading=true;$('#datasetStatus').textContent='데이터셋을 불러오는 중…';
  try{const [data,state]=await Promise.all([window.lookalikeDatasetLoad({includeEmpty:true}),window.lookalikeDatasetState()]);all=data.items;removed=state;render();existingOptions();}
  catch(e){$('#datasetStatus').textContent=e.message||'목록을 불러오지 못했습니다. 새로고침을 눌러 주세요.';}
  finally{loading=false;}
 }
 async function request(path,options={}){
  const {data:{session}}=await window.lookalikeSupabaseClient.auth.getSession();
  if(!session)throw Error('관리자 계정으로 다시 로그인해 주세요.');
  const r=await fetch(window.lookalikeDatasetQueue+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(!r.ok)throw Error(data.detail||'요청을 처리하지 못했습니다.');return data;
 }
 async function watch(job){
  const button=form.querySelector('[type=submit]');button.disabled=true;activeJob=job;
  const until=Date.now()+310000;
  try{
   while(Date.now()<until){
    const data=await request('/jobs/'+job);
    if(data.status==='complete'){
     message(data.result.item.name+' 등록 완료. 공개 데이터셋과 실제 비교에 반영했습니다.','success');
     const link=document.createElement('a');link.href=data.result.detail_url;link.textContent='상세 분석 보기 ↗';link.target='_blank';link.rel='noopener';progress.append(link);
     sessionStorage.removeItem('dataset-import-job');activeJob=null;
     form.elements.image_url.value='';await load();return;
    }
    if(['failed','expired'].includes(data.status)){sessionStorage.removeItem('dataset-import-job');activeJob=null;throw Error(data.detail||'등록 시간이 초과되었습니다. 분석 PC가 켜져 있는지 확인해 주세요.');}
    message(data.status==='pending'?'접수 완료 · 분석 PC의 처리 순서를 기다리고 있습니다.':'이미지 검증 · 특징 분석 · 데이터셋 저장을 처리 중입니다. 완료되면 상세 링크가 표시됩니다.');
    await new Promise(resolve=>setTimeout(resolve,2000));
   }
   throw Error('처리 확인이 지연되고 있습니다. 아래 버튼으로 상태를 다시 확인해 주세요.');
  }catch(e){
   message(e.message,'error');
   if(activeJob){const retry=document.createElement('button');retry.type='button';retry.className='reset';retry.textContent='등록 상태 다시 확인';retry.onclick=()=>watch(job);progress.append(document.createElement('br'),retry);}
  }finally{button.disabled=Boolean(activeJob);}
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(activeJob)return;
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const payload=Object.fromEntries(new FormData(form));
   if(!payload.existing_id){
    const duplicate=all.find(x=>x.type===payload.category&&x.name.trim().toLowerCase()===payload.name.trim().toLowerCase());
    if(duplicate){if(removed.has(duplicate.id))throw Error('동일한 이름의 삭제된 대상이 있습니다. 먼저 복원해 주세요.');payload.existing_id=duplicate.id;}
   }
   message('관리자 권한과 이미지 주소를 확인하고 있습니다.');
   const job=await request('/dataset/import',{method:'POST',body:JSON.stringify(payload)});
   sessionStorage.setItem('dataset-import-job',job.id);await watch(job.id);
  }catch(e){message(e.message,'error');button.disabled=false;}
 };
 form.elements.category.onchange=existingOptions;form.elements.existing_id.onchange=setExisting;
 ['datasetSearch','datasetType','datasetVisibility','datasetSort'].forEach(id=>$('#'+id).addEventListener(id==='datasetSearch'?'input':'change',()=>{visible=30;render();}));
 $('#datasetMore').onclick=()=>{visible+=30;render();};$('#datasetReload').onclick=load;
 window.addEventListener('admin-section',event=>{if(event.detail==='dataset'){load();const job=sessionStorage.getItem('dataset-import-job');if(job&&!activeJob)watch(job);}});
 if(window.lookalikeAdminSection==='dataset'){load();const job=sessionStorage.getItem('dataset-import-job');if(job)watch(job);}
})();
