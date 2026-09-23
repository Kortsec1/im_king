window.lookalikeDatasetState=async()=>{
 const r=await fetch('https://dphiuepbsullrscuuzrc.supabase.co/rest/v1/dataset_exclusions?select=item_id',{headers:{apikey:'sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq'},cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('데이터셋 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
 return new Set((await r.json()).map(x=>x.item_id));
};
window.lookalikeDatasetQueue='https://im-king-analysis-queue.im-king-analysis-queue.workers.dev';
window.lookalikePhotoState=async()=>{
 const r=await fetch(window.lookalikeDatasetQueue+'/dataset/photo-state',{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('사진 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
 const data=await r.json();return {removed:new Set(data.removed.map(x=>x.sample_id)),metadata:data.metadata||[],genders:data.genders||[],attributes:data.attributes||[]};
};
window.lookalikeDatasetLoad=async({includeEmpty=false}={})=>{
 const [base,custom,photoIndex,state]=await Promise.all([
  fetch('/dataset-v2.json?v=18',{signal:AbortSignal.timeout(12000)}),
  fetch(window.lookalikeDatasetQueue+'/dataset',{cache:'no-store',signal:AbortSignal.timeout(12000)}),
  fetch('/dataset-photo-index.json',{signal:AbortSignal.timeout(12000)}),window.lookalikePhotoState()
 ]);
 if(!base.ok||!custom.ok||!photoIndex.ok)throw Error('데이터셋을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
 const data=await base.json(),extra=await custom.json(),items=new Map(data.items.map(x=>[x.id,x]));
 const genderResponse=await fetch('/dataset-genders.json',{signal:AbortSignal.timeout(12000)});if(!genderResponse.ok)throw Error('성별 분류를 불러오지 못했습니다.');const genderIndex=(await genderResponse.json()).items;
 for(const x of extra.items){const old=items.get(x.id);items.set(x.id,old?{...old,updated_at:x.updated_at,sample_count:(old.sample_count||1)+x.sample_count}:{...x});}
 const index=(await photoIndex.json()).items;
 for(const item of items.values()){
  const genderInfo=genderIndex[item.id];if(genderInfo){item.gender=genderInfo.gender;item.gender_source=genderInfo.gender_source;}
  const genderOverride=state.genders.find(x=>x.item_id===item.id);if(genderOverride){item.gender=genderOverride.gender;item.gender_source='admin';}
  item.photos=[...(index[item.id]||[]),...(extra.photos||[]).filter(p=>p.item_id===item.id)].map(p=>({...p,removed:state.removed.has(p.sample_id),attributes:state.attributes.find(x=>x.sample_id===p.sample_id)?.attributes||null}));
  const active=item.photos.filter(p=>!p.removed);item.sample_count=active.length;
  item.image=active[0]?.image||item.photos[0]?.image||item.image;
  item.description=item.description?.replace(/ · 등록 사진 \d+장$/, ' · 등록 사진 '+active.length+'장');
  const override=state.metadata.find(x=>x.item_id===item.id);if(override)Object.assign(item,override);
 }
 return {...data,items:[...items.values()].filter(x=>includeEmpty||x.sample_count>0)};
};
