const SUPABASE = 'https://dphiuepbsullrscuuzrc.supabase.co';
import basePhotos from './base-photos.json';
import {validateAttributes} from './photo-attributes.js';
const KEY = 'sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq';
export const IMPORT_TYPE = 'application/vnd.lookalike.dataset+json';
export async function adminIdentity(request, allowedRoles=['owner','moderator']) {
 const authorization = request.headers.get('Authorization');
 if (!authorization?.startsWith('Bearer ')) return null;
 const headers = {apikey: KEY, Authorization: authorization};
 const user = await fetch(SUPABASE+'/auth/v1/user', {headers, signal: AbortSignal.timeout(10000)});
 if (!user.ok) return null;
 const identity = await user.json();
 const role = await fetch(SUPABASE+'/rest/v1/rpc/my_admin_role', {method:'POST', headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
 if (!role.ok || !allowedRoles.includes(await role.json())) return null;
 return identity.id;
}
export async function datasetRoute(request, env, url, origin, json) {
 if(request.method==='GET'&&url.pathname==='/dataset/admin-logs'){
  if(!await adminIdentity(request,['owner']))return json({detail:'최고 관리자만 로그를 볼 수 있습니다.'},403,origin);
  const before=url.searchParams.get('before')||'9223372036854775807',prefix=url.searchParams.get('action')||'',q=url.searchParams.get('q')||'';
  if(!/^\d{1,19}$/.test(before)||prefix.length>40||q.length>100)return json({detail:'검색 조건을 확인해 주세요.'},400,origin);
  const {results}=await env.DB.prepare("SELECT CAST(id AS TEXT) AS id,created_at,actor_id,action,target_id,details,outcome FROM activity_audit WHERE id<CAST(? AS INTEGER) AND substr(action,1,length(?))=? AND (?='' OR instr(lower(coalesce(actor_id,'')||' '||target_id),lower(?))>0) ORDER BY id DESC LIMIT 51").bind(before,prefix,prefix,q,q).all();
  return json({items:results.map(x=>({...x,details:JSON.parse(x.details)}))},200,origin);
 }
 if(request.method==='GET'&&url.pathname==='/dataset/photo-state'){
  const {results}=await env.DB.prepare('SELECT sample_id,item_id FROM dataset_photo_exclusions').all();
  const metadata=await env.DB.prepare('SELECT item_id,name,group_name AS "group",description,updated_at FROM dataset_metadata').all();
  const genders=await env.DB.prepare('SELECT item_id,gender,updated_at FROM dataset_gender').all();
  const attributes=await env.DB.prepare('SELECT sample_id,item_id,attributes,updated_at FROM dataset_photo_attributes').all();
  return json({removed:results,metadata:metadata.results,genders:genders.results,attributes:attributes.results.map(row=>({...row,attributes:JSON.parse(row.attributes)}))},200,origin);
 }
 const edit=url.pathname.match(/^\/dataset\/items\/([a-zA-Z0-9_-]+)$/);
 if(request.method==='POST'&&edit){
  const actor=await adminIdentity(request);if(!actor)return json({detail:'관리자 권한이 필요합니다.'},403,origin);
  const target=basePhotos.some(x=>x.item_id===edit[1])||await env.DB.prepare('SELECT item_id FROM dataset_samples WHERE item_id=? LIMIT 1').bind(edit[1]).first();
  if(!target)return json({detail:'대상을 찾을 수 없습니다.'},404,origin);
  const raw=await request.text();if(raw.length>6000)return json({detail:'입력 내용이 너무 깁니다.'},413,origin);
  let data;try{data=JSON.parse(raw)}catch{return json({detail:'입력 형식을 확인해 주세요.'},400,origin)}
  if(!data||typeof data.name!=='string'||!data.name.trim()||data.name.length>80||typeof data.group!=='string'||data.group.length>80||typeof data.description!=='string'||data.description.length>500)return json({detail:'이름 1~80자, 분류 80자, 설명 500자 이내로 입력해 주세요.'},400,origin);
  if(data.gender!==undefined&&!['male','female','unknown'].includes(data.gender))return json({detail:'성별 분류를 확인해 주세요.'},400,origin);
  const item={item_id:edit[1],name:data.name.trim(),group:data.group.trim(),description:data.description.trim(),updated_at:Date.now()};
  if(data.gender!==undefined)item.gender=data.gender;
  const statements=[env.DB.prepare('INSERT INTO dataset_metadata(item_id,name,group_name,description,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET name=excluded.name,group_name=excluded.group_name,description=excluded.description,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(item.item_id,item.name,item.group,item.description,item.updated_at,actor)];
  if(data.gender!==undefined)statements.push(env.DB.prepare('INSERT INTO dataset_gender(item_id,gender,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET gender=excluded.gender,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(item.item_id,data.gender,item.updated_at,actor));
  await env.DB.batch(statements);
  return json({ok:true,item},200,origin);
 }
 const attributeEdit=url.pathname.match(/^\/dataset\/photos\/([a-zA-Z0-9_-]+)\/attributes$/);
 if(request.method==='POST'&&attributeEdit){
  const actor=await adminIdentity(request);if(!actor)return json({detail:'관리자 권한이 필요합니다.'},403,origin);
  const sampleId=attributeEdit[1],target=basePhotos.find(x=>x.sample_id===sampleId)||await env.DB.prepare('SELECT item_id FROM dataset_samples WHERE sample_id=?').bind(sampleId).first();
  if(!target)return json({detail:'사진을 찾을 수 없습니다.'},404,origin);
  const raw=await request.text();if(raw.length>3000)return json({detail:'입력 내용이 너무 깁니다.'},413,origin);
  let data;try{data=JSON.parse(raw)}catch{return json({detail:'입력 형식을 확인해 주세요.'},400,origin)}
  const attributes=validateAttributes(data);if(!attributes)return json({detail:'사진 특징의 선택값과 메모(200자 이내)를 확인해 주세요.'},400,origin);
  const updated_at=Date.now();
  await env.DB.prepare('INSERT INTO dataset_photo_attributes(sample_id,item_id,attributes,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(sample_id) DO UPDATE SET attributes=excluded.attributes,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(sampleId,target.item_id,JSON.stringify(attributes),updated_at,actor).run();
  return json({ok:true,sample_id:sampleId,attributes,updated_at},200,origin);
 }
 const photoAction=url.pathname.match(/^\/dataset\/photos\/([a-zA-Z0-9_-]+)\/(delete|restore)$/);
 if(request.method==='POST'&&photoAction){
  const actor=await adminIdentity(request);if(!actor)return json({detail:'관리자 권한이 필요합니다.'},403,origin);
  const sampleId=photoAction[1];
  const target=basePhotos.find(x=>x.sample_id===sampleId)||await env.DB.prepare('SELECT item_id FROM dataset_samples WHERE sample_id=?').bind(sampleId).first();
  if(!target)return json({detail:'사진을 찾을 수 없습니다.'},404,origin);
  if(photoAction[2]==='delete')await env.DB.prepare('INSERT OR IGNORE INTO dataset_photo_exclusions(sample_id,item_id,removed_at,removed_by) VALUES(?,?,?,?)').bind(sampleId,target.item_id,Date.now(),actor).run();
  else await env.DB.batch([
   env.DB.prepare("INSERT INTO activity_audit(created_at,actor_id,action,target_id,details) SELECT ?,?,'photo.restored',sample_id,json_object('item_id',item_id) FROM dataset_photo_exclusions WHERE sample_id=?").bind(Date.now(),actor,sampleId),
   env.DB.prepare('DELETE FROM dataset_photo_exclusions WHERE sample_id=?').bind(sampleId)
  ]);
  return json({ok:true,item_id:target.item_id,sample_id:sampleId},200,origin);
 }
 const photos=url.pathname.match(/^\/dataset\/photos\/([a-zA-Z0-9_-]+)$/);
 if(request.method==='GET'&&photos){
  const {results}=await env.DB.prepare('SELECT sample_id,metadata,detail,created_at FROM dataset_samples WHERE item_id=? ORDER BY created_at,sample_id').bind(photos[1]).all();
  return json({photos:results.map(x=>({sample_id:x.sample_id,item_id:photos[1],image:JSON.parse(x.metadata).image,detail:JSON.parse(x.detail),created_at:x.created_at}))},200,origin);
 }
 if (request.method==='POST' && url.pathname==='/dataset/import') {
  const actor=await adminIdentity(request);
  if (!actor) return json({detail:'Google 관리자 계정으로 로그인해 주세요.'},403,origin);
  const body=await request.text();
  if(body.length>6000) return json({detail:'입력 내용이 너무 깁니다.'},413,origin);
  let data;try{data=JSON.parse(body)}catch{return json({detail:'입력 형식을 확인해 주세요.'},400,origin)}
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80||!['human','character','animal'].includes(data.category))return json({detail:'이름과 카테고리를 확인해 주세요.'},400,origin);
  let image;try{image=new URL(data.image_url)}catch{return json({detail:'올바른 이미지 주소를 입력해 주세요.'},400,origin)}
  if(image.protocol!=='https:'||image.username||image.password||image.port&&image.port!=='443')return json({detail:'공개 HTTPS 이미지 주소만 사용할 수 있습니다.'},400,origin);
  const now=Date.now();
  const recent=await env.DB.prepare('SELECT COUNT(*) AS count FROM jobs WHERE client_hash=? AND created_at>?').bind('admin:'+actor,now-60000).first();
  if(recent.count>=5)return json({detail:'한 번에 5장까지 등록할 수 있습니다. 잠시 후 다시 시도해 주세요.'},429,origin);
  const clean={name:data.name.trim(),category:data.category,image_url:image.href,existing_id:String(data.existing_id||'').slice(0,100),group:String(data.group||'').slice(0,80),description:String(data.description||'').slice(0,500)};
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO jobs(id,status,created_at,updated_at,expires_at,client_hash,image,content_type) VALUES(?,?,?,?,?,?,?,?)').bind(id,'pending',now,now,now+300000,'admin:'+actor,new TextEncoder().encode(JSON.stringify(clean)).buffer,IMPORT_TYPE).run();
  return json({id,status:'pending'},202,origin);
 }
 if(request.method==='GET'&&url.pathname==='/dataset'){
  const {results}=await env.DB.prepare('SELECT sample_id,metadata,created_at FROM dataset_samples ORDER BY created_at,sample_id').all();
  const items=new Map();
  for(const row of results){const item=JSON.parse(row.metadata);const prior=items.get(item.id);if(prior){prior.sample_count++;prior.updated_at=row.created_at;}else items.set(item.id,{...item,sample_count:1,created_at:row.created_at,updated_at:row.created_at});}
  return json({items:[...items.values()],photos:results.map(x=>({sample_id:x.sample_id,item_id:JSON.parse(x.metadata).id,image:JSON.parse(x.metadata).image,created_at:x.created_at}))},200,origin);
 }
 const detail=url.pathname.match(/^\/dataset\/detail\/([a-zA-Z0-9_-]+)$/);
 if(request.method==='GET'&&detail){
  const row=await env.DB.prepare('SELECT detail FROM dataset_samples WHERE item_id=? ORDER BY created_at,sample_id LIMIT 1').bind(detail[1]).first();
  return row?json(JSON.parse(row.detail),200,origin):json({detail:'상세 정보가 없습니다.'},404,origin);
 }
 const image=url.pathname.match(/^\/dataset\/image\/([a-zA-Z0-9_-]+)$/);
 if(request.method==='GET'&&image){
  const row=await env.DB.prepare('SELECT image FROM dataset_samples WHERE sample_id=?').bind(image[1]).first();
  if(!row)return json({detail:'사진을 찾지 못했습니다.'},404,origin);
  return new Response(new Uint8Array(row.image),{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*'}});
 }
 // Caller has already verified WORKER_SECRET for all /worker/* paths.
 if(request.method==='GET'&&url.pathname==='/worker/dataset'){
  const cursor=url.searchParams.get('after')||'';
  const {results}=await env.DB.prepare('SELECT sample_id,record FROM dataset_samples WHERE sample_id>? ORDER BY sample_id LIMIT 25').bind(cursor).all();
  return json({records:results.map(x=>JSON.parse(x.record)),next:results.length===25?results.at(-1).sample_id:null});
 }
 if(request.method==='POST'&&url.pathname==='/worker/dataset/publish'){
  const data=await request.json(),record=data.record;
  if(!record||!/^sample-[a-f0-9]{32}$/.test(record.sample_id)||!record.item?.id||typeof data.image!=='string'||data.image.length>700000)return json({detail:'등록 데이터가 올바르지 않습니다.'},400);
  const bytes=Uint8Array.from(atob(data.image),c=>c.charCodeAt(0));
  if(bytes.byteLength>500000)return json({detail:'저장용 사진이 너무 큽니다.'},413);
  await env.DB.prepare('INSERT OR IGNORE INTO dataset_samples(sample_id,item_id,metadata,detail,record,image,created_at) VALUES(?,?,?,?,?,?,?)').bind(record.sample_id,record.item.id,JSON.stringify(record.item),JSON.stringify(record.detail),JSON.stringify(record),bytes.buffer,Date.now()).run();
  return json({ok:true,id:record.item.id});
 }
 return null;
}
