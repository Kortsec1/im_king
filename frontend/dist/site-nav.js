(()=>{
  function mount(){
    if(document.querySelector('#siteNavigation'))return;
    const widget=document.querySelector('#lookalikeAuthWidget'),account=document.querySelector('[data-account-label]');
    const old=document.querySelectorAll('body>.site-header,body>.topbar,body>.app-global-header');
    const header=document.createElement('header');header.id='siteNavigation';header.className='app-global-header unified-nav';
    header.innerHTML='<a class="unified-brand" href="/" aria-label="LOOKALIKE LAB 홈">LOOKALIKE <span>LAB</span></a><nav aria-label="주요 메뉴"><a href="/">닮은꼴 찾기</a><a href="/feed">결과 피드</a><a href="/gallery">데이터셋</a><a href="/exhibit">자동 전시</a></nav>';
    header.querySelector('a[href="/exhibit"]').textContent='인물 슬라이드쇼';
    const path=location.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/';
    header.querySelectorAll('nav a').forEach(a=>{if(a.pathname===path||path==='/detail'&&a.pathname==='/gallery'||path==='/share'&&a.pathname==='/feed')a.setAttribute('aria-current','page');});
    const accountLink=account||document.createElement('a');if(!account){accountLink.href='/account';accountLink.textContent='내 계정';accountLink.className='page-account';accountLink.dataset.accountLabel='';}accountLink.classList.add('unified-account');
    header.append(widget||accountLink);old.forEach(el=>{el.classList.add('legacy-navigation');el.setAttribute('aria-hidden','true');});document.body.prepend(header);
    if(widget)accountLink.remove();
    // Auth can finish mounting after the deferred navigation script.
    const observer=new MutationObserver(()=>{const auth=document.querySelector('#lookalikeAuthWidget');if(auth&&!header.contains(auth)){header.querySelector('.unified-account')?.remove();header.append(auth);}});observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
