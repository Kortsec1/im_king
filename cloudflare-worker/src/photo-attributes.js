export const attributeOptions={
 glasses:['unknown','none','eyeglasses','sunglasses'],
 beard:['unknown','none','stubble','moustache','full'],
 hair_length:['unknown','bald','short','medium','long'],
 bangs:['unknown','none','present'],
 headwear:['unknown','none','present']
};
export function validateAttributes(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 if(Object.keys(data).some(key=>!Object.hasOwn(attributeOptions,key)&&key!=='note'))return null;
 const clean={};
 for(const [key,options] of Object.entries(attributeOptions)){
  if(data[key]!==undefined&&!options.includes(data[key]))return null;
  clean[key]=data[key]??'unknown';
 }
 if(data.note!==undefined&&(typeof data.note!=='string'||data.note.length>200))return null;
 clean.note=(data.note||'').trim();return clean;
}
