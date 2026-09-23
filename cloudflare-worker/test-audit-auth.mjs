import {build} from 'esbuild';
import assert from 'node:assert/strict';
const bundled=await build({entryPoints:['src/dataset.js'],bundle:true,format:'esm',write:false});
const {adminIdentity,datasetRoute}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const original=globalThis.fetch;
try{
 for(const role of ['user','moderator','owner']){
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/auth/v1/user')?{id:'verified-user'}:role);
  const request=new Request('https://local.test',{headers:{Authorization:'Bearer test-only'}});
  assert.equal(await adminIdentity(request,['owner']),role==='owner'?'verified-user':null);
 }
 globalThis.fetch=async()=>new Response('',{status:401});
 assert.equal(await adminIdentity(new Request('https://local.test',{headers:{Authorization:'Bearer expired'}}),['owner']),null);
 console.log('PASS: audit owner allowed; user, moderator and invalid session denied.');
 for(const role of ['user','moderator','owner']){
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/auth/v1/user')?{id:'verified-user'}:role);
  let batches=[];
  const env={DB:{prepare(sql){return {bind(...values){return {sql,values,first:async()=>({item_id:'test-human'})}}}},batch:async statements=>{batches.push(statements)}}};
  const url=new URL('https://local.test/dataset/items/test-human');
  const request=gender=>new Request(url,{method:'POST',headers:{Authorization:'Bearer test-only'},body:JSON.stringify({name:'테스트',group:'배우',description:'설명',gender})});
  const json=(data,status)=>Response.json(data,{status});
  const result=await datasetRoute(request('male'),env,url,'',json);
  assert.equal(result.status,role==='user'?403:200);
  if(role!=='user'){
   assert.equal(batches.length,1);assert.equal(batches[0].length,2);
   assert.equal(batches[0][1].values[1],'male');assert.equal((await result.json()).item.gender,'male');
   assert.equal((await datasetRoute(request('invalid'),env,url,'',json)).status,400);
   assert.equal(batches.length,1);
  }else assert.equal(batches.length,0);
 }
 console.log('PASS: gender edits require owner/moderator, validate enum and atomically save metadata + classification.');
}finally{globalThis.fetch=original;}
