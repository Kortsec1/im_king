(()=>{
 if(!window.supabase)return;
 const client=window.lookalikeSupabaseClient=window.lookalikeSupabaseClient||window.supabase.createClient('https://dphiuepbsullrscuuzrc.supabase.co','sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq');
 let role='user',version=0;
 function mount(){
  const allowed=['owner','moderator'].includes(role);
  document.querySelectorAll('[data-admin-access]').forEach(x=>{if(!allowed)x.remove()});
  if(!allowed)return;
  const nav=document.querySelector('.app-global-header nav,.community-header nav,.site-header nav');
  if(nav&&!nav.querySelector('[data-admin-access]')){const a=document.createElement('a');a.href='/admin';a.textContent='관리자';a.dataset.adminAccess='true';nav.append(a);}
  const panel=document.querySelector('#accountRoot .account-panel');
  if(panel&&!panel.querySelector('[data-admin-access]')){const a=document.createElement('a');a.href='/admin';a.textContent=role==='owner'?'관리자 페이지 · 사용자 권한 관리':'관리자 페이지';a.dataset.adminAccess='true';a.className='primary-button';a.style.cssText='display:flex;align-items:center;justify-content:center;margin:16px 0;text-decoration:none;min-height:48px';panel.append(a);}
 }
 async function refresh(){const current=++version;const {data:{session}}=await client.auth.getSession();let next='user';if(session){const {data,error}=await client.rpc('my_admin_role');if(!error)next=data;}if(current!==version)return;role=next;mount();}
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
 client.auth.onAuthStateChange(()=>setTimeout(refresh,0));window.addEventListener('focus',refresh);refresh();
})();
