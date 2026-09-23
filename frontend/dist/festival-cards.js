(()=>{
  const WIDTH=720,HEIGHT=850,styles=['반가운 오해','야, 닮은꼴','직접 입력'];
  const clean=value=>String(value||'닮은꼴').replace(/["“”]/g,'').slice(0,100);
  function hasBatchim(name){const last=[...name].pop()?.charCodeAt(0)||0;return last>=0xAC00&&last<=0xD7A3&&(last-0xAC00)%28>0;}
  function lines(name,index){name=clean(name);return index===0?['혹시',name+(hasBatchim(name)?'이세요?':'세요?')]:index===1?['야,',name+'.']:['문구를','입력해보세요'];}
  let loader,fontCSS;
  async function captureLibrary(){
    if(window.lookalikeDomImage)return window.lookalikeDomImage;
    if(!loader)loader=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/assets/card-dom-export-v1.js';
      const fail=()=>{clearTimeout(timer);script.remove();loader=null;reject(Error('저장 도구를 불러오지 못했습니다. 다시 시도해 주세요.'));};
      const timer=setTimeout(fail,15000);script.onload=()=>{clearTimeout(timer);resolve(window.lookalikeDomImage);};script.onerror=fail;document.head.append(script);
    });return loader;
  }
  async function printFont(){
    await document.fonts.load('900 100px PosterBlack','가나다ABC');
    if(!document.fonts.check('900 100px PosterBlack','가나다ABC'))throw Error('인쇄용 글꼴이 준비되지 않았습니다.');
    if(!fontCSS){
      const response=await fetch('/assets/PosterBlack-v1.woff2',{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('인쇄용 글꼴을 불러오지 못했습니다.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;response.blob().then(blob=>reader.readAsDataURL(blob)).catch(reject);});
      fontCSS="@font-face{font-family:PosterBlack;src:url('"+data+"') format('woff2');font-style:normal;font-weight:900;}";
    }return fontCSS;
  }
  function mount(host,{name,category,matchImage,similarity}){
    let selected=0,customText='',saving=false,destroyed=false;const frameRows=[];host.classList.add('festival-results');
    const title=document.createElement('h2');title.textContent='이 얼굴, 한 장으로.';
    const intro=document.createElement('p');intro.className='festival-intro';intro.textContent='마음에 드는 포스터를 골라 저장하세요.';
    const rail=document.createElement('div');rail.className='festival-rail';rail.setAttribute('aria-label','저장할 카드 디자인');const arts=[];
    const buttons=styles.map((label,index)=>{
      const card=document.createElement('button');card.type='button';card.className='festival-card';card.setAttribute('aria-label',label+' 카드 선택');card.setAttribute('aria-pressed',String(index===0));
      const art=document.createElement('div');art.className='poster-art poster-'+index;arts.push(art);
      const head=document.createElement('div');head.className='poster-head';const score=document.createElement('span');score.className='poster-score';score.textContent='싱크로율 '+Math.round(Math.max(0,Math.min(1,similarity||0))*100)+'%';const context=document.createElement('span');context.className='poster-context';context.textContent='닮은꼴 분석 결과';const scoreBlock=document.createElement('div');scoreBlock.className='poster-score-block';scoreBlock.append(score,context);const brand=document.createElement('span');brand.textContent='LOOKALIKE LAB';head.append(scoreBlock,brand);
      const copy=document.createElement('div');copy.className='poster-copy';lines(name,index).forEach(text=>{const line=document.createElement('span');line.textContent=text;copy.append(line);});
      const portrait=document.createElement('div');portrait.className='poster-person';const img=document.createElement('img');img.src=matchImage;img.alt=clean(name)+' 기준 사진';img.width=108;img.height=108;img.decoding='async';img.onerror=()=>{img.hidden=true;};
      const caption=document.createElement('div'),personName=document.createElement('strong'),group=document.createElement('span');personName.textContent=clean(name);group.textContent=category||'닮은꼴';caption.append(personName,group);portrait.append(img,caption);
      const foot=document.createElement('div');foot.className='poster-foot';foot.textContent='시각 유사도 · 오락용 결과';art.append(head,copy,portrait,foot);
      const ornament=document.createElementNS('http://www.w3.org/2000/svg','svg');ornament.setAttribute('viewBox','0 0 600 900');ornament.setAttribute('aria-hidden','true');ornament.setAttribute('focusable','false');ornament.classList.add('poster-ornament');
      ornament.innerHTML=[
        '<g transform="translate(508 142)"><path d="M-29 0H29M0-29V29M-20-20L20 20M-20 20L20-20"/></g><path d="M42 687H450" stroke-dasharray="3 9"/><path d="M490 677L500 687L490 697M510 677L520 687L510 697M530 677L540 687L530 697"/>',
        '<path d="M42 694H440" stroke-dasharray="12 8"/><circle cx="508" cy="694" r="12"/><path d="M488 694H528M508 674V714"/>',
        '<ellipse cx="489" cy="167" rx="44" ry="18" transform="rotate(-28 489 167)"/><ellipse cx="489" cy="167" rx="44" ry="18" transform="rotate(28 489 167)"/><path d="M420 151V171M410 161H430M42 684H448" stroke-dasharray="3 8"/><path d="M491 672L503 684L491 696M514 672L526 684L514 696"/>'
      ][index];art.append(ornament);
      if(index===1){const star=document.createElementNS('http://www.w3.org/2000/svg','svg');star.setAttribute('viewBox','0 0 100 100');star.setAttribute('aria-hidden','true');star.classList.add('poster-star');star.innerHTML='<path d="M50 0C45 31 31 45 0 50C31 55 45 69 50 100C55 69 69 55 100 50C69 45 55 31 50 0Z" fill="currentColor"/>';art.append(star);}
      card.append(art);card.onclick=()=>{if(saving)return;selected=index;buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===selected)));syncInput();};rail.append(card);return card;
    });
    const label=document.createElement('label');label.className='festival-input-label';label.textContent='카드 문구';
    const input=document.createElement('textarea');input.className='festival-custom-copy';input.rows=2;input.maxLength=42;input.placeholder='문구를 입력해보세요';input.setAttribute('aria-label','카드 문구 직접 입력');input.setAttribute('aria-description','입력한 문구는 기본 파란색 카드와 자유 문구 스타일의 추가 프레임에 함께 반영됩니다.');
    input.oninput=()=>{customText=input.value;if(selected<3)buttons[2].click();const copy=arts[2].querySelector('.poster-copy');copy.classList.toggle('is-custom',Boolean(customText.trim()));copy.replaceChildren();(customText.trim()?customText.trim().split('\n'):lines(name,2)).forEach(text=>{const line=document.createElement('span');line.textContent=text;copy.append(line);});frameRows.forEach((frame,i)=>window.lookalikeFrames.render(arts[i+3],frame,{name,category,matchImage,similarity,copy:customText}));fitCopy();};label.append(input);
    const copyHelp=document.createElement('small');copyHelp.style.cssText='display:block;margin-top:8px;font-weight:400;line-height:1.6;color:#656860';label.append(copyHelp);
    function syncInput(){const automatic=selected>=3&&['question','hey'].includes(frameRows[selected-3]?.layout?.copy?.mode);input.disabled=saving||automatic;copyHelp.textContent=automatic?'이 프레임은 결과 이름으로 문구가 자동 생성돼요. 직접 입력하려면 파란색 카드 또는 자유 문구 프레임을 선택하세요.':'기본 파란색 카드와 자유 문구 프레임에 함께 반영돼요. 자동 문구 카드의 글은 결과 이름으로 만들어집니다.';}syncInput();
    const note=document.createElement('p');note.className='festival-print-note';note.textContent='용지 72 × 85mm · 저장 1440 × 1700px · PC와 모바일 동일';host.append(title,intro,rail,label,note);
    function fitCopy(){
      arts.forEach(art=>{const copy=art.querySelector('.poster-copy');if(!copy){window.lookalikeFrames?.fit(art);return;}
        if(copy.classList.contains('is-custom')){let size=112;copy.style.fontSize=size+'px';while(size>34&&(copy.scrollHeight>copy.clientHeight||copy.scrollWidth>copy.clientWidth)){size-=2;copy.style.fontSize=size+'px';}}
        else{copy.style.fontSize='';[...copy.children].forEach(line=>{line.style.fontSize='';line.style.whiteSpace='nowrap';let size=parseFloat(getComputedStyle(line).fontSize);while(size>28&&line.scrollWidth>copy.clientWidth){size-=1;line.style.fontSize=size+'px';}if(line.scrollWidth>copy.clientWidth)line.style.whiteSpace='normal';});}
      });
    }
    function scalePreview(){buttons.forEach((button,i)=>{const width=button.getBoundingClientRect().width;if(!width)return;button.style.height=(width*HEIGHT/WIDTH)+'px';arts[i].style.transform='scale('+(width/WIDTH)+')';});}
    const resize=new ResizeObserver(scalePreview);buttons.forEach(button=>resize.observe(button));document.fonts.load('900 100px PosterBlack','가나다ABC').then(fitCopy).catch(()=>{});requestAnimationFrame(()=>{fitCopy();scalePreview();});
    const frameSection=document.createElement('section');frameSection.className='festival-frame-section';frameSection.hidden=true;label.before(frameSection);
    let frameGeneration=0;
    async function loadFrames(){
      if(!window.lookalikeFrames||destroyed)return;const generation=++frameGeneration;
      try{
        const rows=await window.lookalikeFrames.list();if(destroyed||generation!==frameGeneration)return;
        while(buttons.length>3){resize.unobserve(buttons.pop());arts.pop();}frameRows.splice(0).forEach(f=>URL.revokeObjectURL(f.url));if(selected>=3)selected=0;buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));syncInput();frameSection.replaceChildren();frameSection.hidden=!rows.length;
        if(!rows.length)return;
        const heading=document.createElement('h3');heading.textContent='프레임 카드';const frameRail=document.createElement('div');frameRail.className='festival-rail';frameRail.setAttribute('aria-label','추가 프레임 선택');frameSection.append(heading,frameRail);
        for(const row of rows){
          let url;try{url=await window.lookalikeFrames.imageURL(row.image_path);}catch{continue;}
          if(destroyed||generation!==frameGeneration){URL.revokeObjectURL(url);return;}
          const frame={...row,url},index=buttons.length;frameRows.push(frame);const wrap=document.createElement('div'),caption=document.createElement('small');caption.className='frame-option-label';caption.textContent=row.name+(row.published?'':' · 관리자 전용');
          const card=document.createElement('button');card.type='button';card.className='festival-card frame-option';card.setAttribute('aria-label',caption.textContent+' 카드 선택');card.setAttribute('aria-pressed','false');const art=document.createElement('div');window.lookalikeFrames.render(art,frame,{name,category,matchImage,similarity,copy:customText});arts.push(art);buttons.push(card);card.append(art);card.onclick=()=>{if(saving)return;selected=index;buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));syncInput();};wrap.append(card,caption);frameRail.append(wrap);resize.observe(card);fitCopy();scalePreview();
        }
      }catch{if(!destroyed){frameSection.hidden=false;frameSection.textContent='추가 프레임을 불러오지 못했어요. 기존 3종 카드는 그대로 저장할 수 있어요.';}}
    }
    loadFrames();const authSubscription=window.lookalikeSupabaseClient?.auth.onAuthStateChange(event=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))setTimeout(()=>{if(!saving)loadFrames();},0);});
    return {async save(){
      if(saving)throw Error('카드를 준비하고 있습니다.');saving=true;input.disabled=true;
      try{const art=arts[selected];const [renderer,font]=await Promise.all([captureLibrary(),printFont()]);fitCopy();await Promise.all([...art.querySelectorAll('img:not([hidden])')].map(img=>img.decode()));
        const blob=await renderer.toBlob(art,{width:WIDTH,height:HEIGHT,pixelRatio:2,fontEmbedCSS:font,style:{transform:'none',margin:'0',position:'relative',inset:'auto',width:WIDTH+'px',height:HEIGHT+'px'}});if(!blob)throw Error('카드 저장에 실패했습니다.');return blob;
      }finally{saving=false;syncInput();}
    },destroy(){destroyed=true;frameGeneration++;resize.disconnect();authSubscription?.data?.subscription?.unsubscribe();frameRows.forEach(f=>URL.revokeObjectURL(f.url));}};
  }
  window.lookalikeFestivalCards={mount,lines,async exportArt(art){const [renderer,font]=await Promise.all([captureLibrary(),printFont()]);window.lookalikeFrames?.fit(art);await Promise.all([...art.querySelectorAll('img:not([hidden])')].map(img=>img.decode()));const blob=await renderer.toBlob(art,{width:WIDTH,height:HEIGHT,pixelRatio:2,fontEmbedCSS:font,style:{transform:'none',margin:'0',position:'relative',inset:'auto',width:WIDTH+'px',height:HEIGHT+'px'}});if(!blob)throw Error('이미지 생성에 실패했어요.');return blob;}};
})();
