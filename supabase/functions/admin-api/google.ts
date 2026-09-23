import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const origins=new Set(['https://im-king-lookalike.vercel.app','http://127.0.0.1:8080','http://localhost:8080']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://im-king-lookalike.vercel.app','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(origin&&!origins.has(origin))return json({detail:'허용되지 않은 요청입니다.'},403);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return json({detail:'Google 로그인이 필요합니다.'},401);
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:auth,error:authError}=await service.auth.getUser(token);
  if(authError||!auth.user)return json({detail:'Google 로그인 세션이 만료되었습니다.'},401);
  const {data:role,error:roleError}=await userClient.rpc('my_admin_role');
  if(roleError||!['owner','moderator'].includes(role))return json({detail:'관리자 권한이 없습니다.'},403);
  const path=new URL(req.url).pathname.split('/admin-api')[1]||'/';
  if(path==='/me'&&req.method==='GET')return json({role,user_id:auth.user.id});
  if(path==='/users'&&req.method==='GET'){
   if(role!=='owner')return json({detail:'최고 관리자만 사용자 목록을 볼 수 있습니다.'},403);
   const {data,error}=await userClient.rpc('owner_list_users');if(error)throw error;return json({users:data});
  }
  const userMatch=path.match(/^\/users\/([0-9a-f-]{36})$/);
  if(userMatch&&req.method==='PATCH'){
   if(role!=='owner')return json({detail:'최고 관리자만 권한을 변경할 수 있습니다.'},403);
   const body=await req.json();
   if(!['user','moderator'].includes(body.role))return json({detail:'허용되지 않은 권한입니다.'},400);
   const {error}=await userClient.rpc('owner_set_role',{target_user:userMatch[1],new_role:body.role});
   if(error)return json({detail:'최고 관리자 계정은 변경할 수 없거나 대상이 없습니다.'},400);
   return json({ok:true});
  }
  if(path==='/posts'&&req.method==='GET'){
   const {data,error}=await service.from('posts').select('*,profiles!posts_user_id_fkey(nickname)').order('created_at',{ascending:true}).limit(500);
   if(error)throw error;
   const posts=await Promise.all((data||[]).map(async p=>({...p,nickname:p.profiles?.nickname||'사용자',image_url:p.image_path?(await service.storage.from('community-posts').createSignedUrl(p.image_path,900)).data?.signedUrl:null})));
   return json({posts});
  }
  const postMatch=path.match(/^\/posts\/([0-9a-f-]{36})$/);
  if(postMatch&&req.method==='DELETE'){
   const {data:p,error}=await service.from('posts').select('image_path').eq('id',postMatch[1]).single();if(error)return json({detail:'게시물을 찾지 못했습니다.'},404);
   if(p.image_path){const {error:e}=await service.storage.from('community-posts').remove([p.image_path]);if(e)throw e;}
   const {error:e}=await service.from('posts').delete().eq('id',postMatch[1]);if(e)throw e;
   return json({ok:true});
  }
  if(postMatch&&req.method==='PATCH'){
   const body=await req.json();
   if(!['approved','changes','rejected','hidden'].includes(body.action))return json({detail:'올바르지 않은 상태입니다.'},400);
   const note=String(body.note||'').trim().slice(0,500);
   if(body.action!=='approved'&&!note)return json({detail:'처리 사유를 입력해 주세요.'},400);
   const {data:post,error}=await service.from('posts').update({status:body.action,moderation_note:body.action==='approved'?null:note,approved_at:body.action==='approved'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',postMatch[1]).select().single();if(error)throw error;
   return json({post});
  }
  return json({detail:'Not found'},404);
 }catch(error){console.error(error);return json({detail:'요청을 처리하지 못했습니다. 다시 시도해 주세요.'},500);}
});
