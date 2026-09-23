import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {validateAttributes} from './src/photo-attributes.js';
const compiled=await build({entryPoints:['src/dataset.js'],bundle:true,format:'esm',write:false});
const {datasetRoute}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
for(const bad of [null,[],{glasses:'yes'},{note:'x'.repeat(201)},JSON.parse('{"constructor":1}'),{beard:1}])assert.equal(validateAttributes(bad),null);
assert.equal(validateAttributes({}).glasses,'unknown');
const original=globalThis.fetch;
try{
 for(const role of ['user','moderator','owner']){
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/auth/v1/user')?{id:'verified-user'}:role);
  const writes=[];
  const env={DB:{prepare(sql){return {bind(...values){return {first:async()=>({item_id:'test-person'}),run:async()=>writes.push({sql,values})};}};}}};
  const url=new URL('https://local.test/dataset/photos/test-photo/attributes');
  const run=body=>datasetRoute(new Request(url,{method:'POST',headers:{Authorization:'Bearer test-only'},body:JSON.stringify(body)}),env,url,'',(data,status)=>Response.json(data,{status}));
  const response=await run({glasses:'eyeglasses',beard:'none',note:'사진별 확인'});
  assert.equal(response.status,role==='user'?403:200);
  if(role==='user'){assert.equal(writes.length,0);continue;}
  const result=await response.json();assert.equal(result.sample_id,'test-photo');assert.equal(result.attributes.glasses,'eyeglasses');
  assert.equal(writes.length,1);assert.equal(writes[0].values[0],'test-photo');assert.equal(writes[0].values[4],'verified-user');
  assert.equal((await run({glasses:'invalid'})).status,400);assert.equal(writes.length,1);
  assert.equal((await run({note:'x'.repeat(4000)})).status,413);
 }
 console.log('PASS: per-photo attributes, owner/moderator authorization, user denial, validation, actor and photo isolation.');
}finally{globalThis.fetch=original;}
