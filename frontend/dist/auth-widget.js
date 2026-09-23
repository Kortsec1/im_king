(()=>{
  if(!window.supabase||document.querySelector("#lookalikeAuthWidget"))return;
  const URL="https://dphiuepbsullrscuuzrc.supabase.co",KEY="sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq";
  const client=window.lookalikeSupabaseClient=window.lookalikeSupabaseClient||window.supabase.createClient(URL,KEY);
  if(!document.querySelector('link[href*="product-ui.css"]')&&!document.querySelector('.topbar')&&!document.body.classList.contains('exhibit-page')){const style=document.createElement("link");style.rel="stylesheet";style.href="/product-ui.css?v=1";document.head.insertBefore(style,document.querySelector('link[href*="mobile-ui.css"]'))}
  if(["/community","/community.html","/feed","/feed.html","/share","/share.html","/account","/account.html"].includes(location.pathname))return;
  const root=document.createElement("div");root.id="lookalikeAuthWidget";root.className="auth-widget";
  const place=()=>{const header=document.querySelector('.app-global-header,.site-header,.topbar');(header||document.body).append(root);};place();
  document.addEventListener('DOMContentLoaded',place,{once:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=root.querySelector('.auth-menu'),trigger=root.querySelector('.auth-trigger');if(menu&&!menu.hidden){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}}});
  document.addEventListener('click',event=>{if(!root.contains(event.target)){const menu=root.querySelector('.auth-menu');if(menu){menu.hidden=true;root.querySelector('.auth-trigger')?.setAttribute('aria-expanded','false');}}});
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function render(){
    const{data:{session}}=await client.auth.getSession();
    if(!session){
      root.innerHTML='<a class="auth-trigger auth-login" href="/account">내 계정</a>';
      return;
    }
    const{data:profile}=await client.from("profiles").select("nickname").eq("user_id",session.user.id).single();
    const{data:roleData}=await client.rpc("my_admin_role");
    const nickname=profile?.nickname||"내 계정";
    const adminLink=(["owner","moderator"].includes(roleData)?'<a class="admin-link" href="/admin">관리자 페이지</a>':"")+(roleData==='owner'?'<a href="/logs">작업 로그</a>':'');
    root.innerHTML=`<button class="auth-trigger" type="button" aria-expanded="false">${esc(nickname)}</button><div class="auth-menu" hidden><small>로그인 중</small><strong>${esc(nickname)}</strong><a href="/account">내 계정 관리</a>${adminLink}<button class="auth-logout" type="button">로그아웃</button></div>`;
    const trigger=root.querySelector(".auth-trigger"),menu=root.querySelector(".auth-menu");
    trigger.onclick=()=>{const open=menu.hidden;menu.hidden=!open;trigger.setAttribute("aria-expanded",String(open))};
    root.querySelector(".auth-logout").onclick=async()=>{await client.auth.signOut();render()};
  }
  client.auth.onAuthStateChange(()=>setTimeout(render,0));window.addEventListener("lookalike-profile-updated",render);render();
})();
