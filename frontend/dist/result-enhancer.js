(() => {
  const QUEUE_URL = "https://im-king-analysis-queue.im-king-analysis-queue.workers.dev";
  const LOCAL_ANALYSIS_URL = "/api/v1/matches";
  const originalFetch = window.fetch.bind(window);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await originalFetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  let lastAnalysisResult = null;
  let analysisPhotoUrl = null;
  function keepAnalysisPhoto(blob) {
    if (analysisPhotoUrl) URL.revokeObjectURL(analysisPhotoUrl);
    analysisPhotoUrl = URL.createObjectURL(blob);
  }
  let draftImageReady = Promise.resolve();
  let cachedDraftImage = false;
  const validModes = ["human", "character", "animal"];
  const modeLabels = { human: "인물", character: "애니 캐릭터", animal: "동물" };
  const modeCounts = { human: 317, character: 62, animal: 38 };
  let activeMode = new URLSearchParams(location.search).get("mode") || localStorage.getItem("lookalike-mode") || "human";
  if (!validModes.includes(activeMode)) activeMode = "human";
  let matchGender='auto';
  const loadingSteps = ["사진 크기 최적화", "얼굴 영역 찾기", "얼굴 특징 벡터 생성", "데이터셋 비교", "후보 점수 재정렬"];

  function saveCommunityImage(blob) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("lookalike-community", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put(blob, "latest-image");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }

  function prepareCommunityImage(file) {
    if (!file) return;
    cachedDraftImage = false;
    draftImageReady = compress(file)
      .then((blob) => saveCommunityImage(blob))
      .then(() => { cachedDraftImage = true; })
      .catch(() => { cachedDraftImage = false; });
  }

  function setLoadingStage(index, detail) {
    const panel = document.querySelector(".logic-loader");
    if (!panel) return;
    panel.querySelectorAll("li").forEach((item, itemIndex) => {
      item.classList.toggle("is-active", itemIndex === index);
      item.classList.toggle("is-done", itemIndex < index);
      item.setAttribute("aria-current", itemIndex === index ? "step" : "false");
    });
    panel.querySelector(".logic-detail").textContent = detail;
    panel.querySelector(".logic-progress i").style.transform = `scaleX(${Math.min(1, (index + .45) / loadingSteps.length)})`;
  }

  function selectMode(mode) {
    if (!validModes.includes(mode)) return;
    const changed = activeMode !== mode;
    activeMode = mode;
    const genderPicker=document.querySelector('.match-gender-picker');
    if(genderPicker&&genderPicker.hidden!==(mode!=='human'))genderPicker.hidden=mode!=='human';
    if (changed) {
      localStorage.setItem("lookalike-mode", mode);
      const url = new URL(location.href);
      if (mode === "human") url.searchParams.delete("mode"); else url.searchParams.set("mode", mode);
      history.replaceState(null, "", url);
    }
    document.querySelectorAll(".dataset-mode-links button").forEach(button => {
      const pressed = String(button.dataset.mode === mode);
      if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
    });
    const badge = document.querySelector(".gallery-count-badge span");
    const badgeText = `${modeLabels[mode]} ${modeCounts[mode]}개 기준으로 비교`;
    if (badge && badge.textContent !== badgeText) badge.textContent = badgeText;
    const galleryLink = document.querySelector(".dataset-link");
    if (galleryLink && !galleryLink.href.endsWith(`/gallery?type=${mode}`)) galleryLink.href = `/gallery?type=${mode}`;
    const intro = document.querySelector(".intro");
    const heading = intro?.querySelector("h1");
    const copy = intro?.querySelector("p:not(.privacy)");
    const headings = { human: "나와 닮은 인물 찾기", character: "나와 닮은 애니 캐릭터 찾기", animal: "나와 닮은 동물 찾기" };
    const copies = { human: "얼굴 특징이 비슷한 인물을 찾아드려요.", character: "얼굴의 선과 인상을 애니 캐릭터와 비교해요.", animal: "눈매와 얼굴 윤곽을 동물의 인상과 비교해요." };
    if (heading && heading.textContent !== headings[mode]) heading.textContent = headings[mode];
    if (copy && copy.textContent !== copies[mode]) copy.textContent = copies[mode];
  }

  async function compress(file) {
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.88;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 1500 * 1024) {
        bitmap.close();
        return blob;
      }
      scale *= 0.78;
      quality = Math.max(0.68, quality - 0.06);
    }
    bitmap.close();
    throw new Error("사진을 전송 가능한 크기로 줄이지 못했습니다.");
  }

  async function runQueuedAnalysis(file,gender) {
    setLoadingStage(0, "브라우저에서 사진을 안전한 전송 크기로 줄이고 있어요");
    const image = await compress(file);
    keepAnalysisPhoto(image);
    setLoadingStage(1, "사진을 분석 대기열에 전달하고 있어요");
    const created = await fetchWithTimeout(`${QUEUE_URL}/jobs?gender=${encodeURIComponent(gender)}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: image,
    }, 15000);
    const createdData = await created.json().catch(() => ({}));
    if (!created.ok) throw new Error(createdData.detail || "분석 요청을 시작하지 못했습니다.");
    setLoadingStage(2, "내 차례를 기다리며 얼굴 영역을 준비하고 있어요");
    const deadline = Date.now() + 60000;
    let consecutivePollErrors = 0;
    while (Date.now() < deadline) {
      await wait(850);
      try {
        const response = await fetchWithTimeout(`${QUEUE_URL}/jobs/${createdData.id}`, { cache: "no-store" }, 8000);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "분석 상태를 확인하지 못했습니다.");
        consecutivePollErrors = 0;
        if (data.status === "pending") setLoadingStage(2, "분석 순서를 기다리고 있어요. 요청마다 독립적으로 처리됩니다");
        if (data.status === "processing") setLoadingStage(3, `${modeLabels[activeMode]} 기준 ${modeCounts[activeMode]}개와 특징을 비교하고 있어요`);
        if (data.status === "complete") { setLoadingStage(4, "가장 비슷한 후보를 다시 정렬하고 있어요"); await wait(420); return data.result; }
        if (data.status === "failed" || data.status === "expired") throw new Error(data.detail || "분석을 완료하지 못했습니다.");
      } catch (error) {
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= 3) throw error;
      }
    }
    throw new Error("분석 서버가 60초 안에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }

  async function runLocalAnalysis(file,gender) {
    setLoadingStage(0, "사진을 빠르게 전송할 수 있도록 준비하고 있어요.");
    const image = await compress(file);
    keepAnalysisPhoto(image);
    const form = new FormData();
    form.append("image", image, "capture.jpg");
    form.append('match_gender',gender);
    setLoadingStage(1, "이 PC에서 얼굴 영역과 특징을 찾고 있어요.");
    setLoadingStage(2, "눈, 코, 윤곽의 특징 벡터를 비교하고 있어요.");
    const response = await fetchWithTimeout(LOCAL_ANALYSIS_URL, {
      method: "POST",
      body: form,
    }, 120000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "로컬 분석을 완료하지 못했습니다.");
    setLoadingStage(4, "가장 닮은 후보를 정리하고 있어요.");
    await wait(250);
    return data;
  }

  window.fetch = async (...args) => {
    const target = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (!target.includes("/matches")) return originalFetch(...args);
    try {
      const body = args[1]?.body;
      const file = body instanceof FormData ? body.get("image") : null;
      if (!(file instanceof Blob)) throw new Error("분석할 사진을 찾지 못했습니다.");
      lastAnalysisResult = null;
      const requestMode=activeMode,gender=requestMode==='human'?matchGender:'auto';
      const result = await (['localhost', '127.0.0.1'].includes(location.hostname) ? runLocalAnalysis(file,gender) : runQueuedAnalysis(file,gender));
      const selected = requestMode === "human" ? result.matches : requestMode === "character" ? result.character_matches : result.animal_matches;
      lastAnalysisResult = { ...result, matches: selected || [] };
      return Response.json(lastAnalysisResult, { status: 200 });
    } catch (error) {
      return Response.json({ detail: error instanceof Error ? error.message : "분석에 실패했습니다." }, { status: 502 });
    }
  };

  const percent = (value) => `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`;
  const htmlText = value => String(value??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\'":"&#39;"}[c]));
  const localImage = (item) => item.image_url?.startsWith("https://im-king-analysis-queue.im-king-analysis-queue.workers.dev/dataset/image/") || /^\/(people|nonhuman)\/[a-zA-Z0-9_-]+\.jpg$/.test(item.image_url||'') ? item.image_url : (item.type ? `/nonhuman/${item.id}.jpg` : `/people/${item.id}.jpg`);

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
    });
  }

  function drawCover(context, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const sourceWidth = width / scale, sourceHeight = height / scale;
    context.drawImage(image, (image.width-sourceWidth)/2, (image.height-sourceHeight)/2, sourceWidth, sourceHeight, x, y, width, height);
  }


  function roundRect(context, x, y, width, height, radius) {
    context.beginPath(); context.roundRect(x, y, width, height, radius); context.clip();
  }

  let festivalCard;
  async function createShareCard() {
    if(!festivalCard)throw Error('저장할 결과를 찾지 못했어요.');
    return festivalCard.save();
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "lookalike-result.png"; anchor.hidden = true;
    document.body.append(anchor);
    try { anchor.click(); }
    finally { anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000); }
  }

  function resultGroup(title, subtitle, items) {
    const section = document.createElement("section"); section.className="alternate-results";
    const heading = document.createElement("div"); heading.className="alternate-heading"; heading.innerHTML=`<div><small>전용 시각 모델</small><h2>${title}</h2><p>${subtitle}</p></div>`;
    const list = document.createElement("ol"); list.className="alternate-list";
    items.forEach((item,index)=>{ const row=document.createElement("li"); row.innerHTML=`<span class="alt-rank">${index+1}</span><img src="${localImage(item)}" alt="${htmlText(item.name)}"><div><strong>${htmlText(item.name)}</strong><small>${htmlText(item.group||"")}</small></div><b>${percent(item.similarity)}</b>`; list.append(row); });
    section.append(heading,list); return section;
  }

  function enhanceResults() {
    const results = document.querySelector(".results");
    if (!results || !lastAnalysisResult || results.dataset.insightsEnhanced) return;
    results.dataset.insightsEnhanced="true";
    const top=lastAnalysisResult.matches?.[0];
    const submittedSource=results.querySelector(".submitted img")?.src;
    const submittedImage=results.querySelector(".submitted img");
    const topRow=results.querySelector(".match-row");
    if(top&&submittedImage&&topRow){
      const hero=document.createElement("section");
      festivalCard?.destroy?.();
      festivalCard=window.lookalikeFestivalCards.mount(hero,{name:top.name,category:top.category||top.group,matchImage:localImage(top),similarity:top.similarity});
      results.querySelector(".results-heading")?.after(hero);
      topRow.hidden=true;
    }
    results.querySelectorAll(".match-row").forEach((row,index)=>{
      const match=lastAnalysisResult.matches?.[index]||{};
      const name=row.querySelector("strong");
      if (name && match.category) {
        const identity=document.createElement("span"); identity.className="match-identity";
        const category=document.createElement("small"); category.className="match-category"; category.textContent=match.category;
        name.replaceWith(identity); identity.append(name,category);
      }
      const explanations=match.explanations||[];
      if (!explanations.length) return;
      const detail=document.createElement("span"); detail.className="match-explanation"; detail.textContent=explanations.join(" · "); row.append(detail);
    });
    const extras=document.createElement("div"); extras.className="result-extras";
    const geometry = lastAnalysisResult.face_geometry;
    const mapCard = document.createElement('section');
    mapCard.className = 'user-face-analysis';
    mapCard.innerHTML = '<header><div><small>내 사진 분석</small><h2>얼굴의 어떤 부분을 봤을까요?</h2></div></header>';
    const points = geometry?.landmarks?.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) || [];
    if (points.length && analysisPhotoUrl) {
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'face-points-toggle';
      toggle.setAttribute('aria-pressed', 'true'); toggle.textContent = '분석점 켜짐';
      const photo = document.createElement('div'); photo.className = 'user-face-photo';
      const img = document.createElement('img'); img.src = analysisPhotoUrl; img.alt = '내가 분석한 사진';
      photo.append(img);
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true'); svg.id = 'user-face-points';
      points.forEach(([x, y], pointIndex) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.classList.add('analysis-point', ['pink','amber','mint','blue','violet','orange'][pointIndex % 6]);
        circle.setAttribute('cx', x * 1000); circle.setAttribute('cy', y * 1000);
        circle.setAttribute('r', '3'); svg.append(circle);
      });
      photo.append(svg);
      toggle.setAttribute('aria-controls', svg.id);
      toggle.addEventListener('click', () => {
        const on = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.setAttribute('aria-pressed', String(on)); toggle.textContent = on ? '분석점 켜짐' : '분석점 꺼짐';
        svg.style.display = on ? '' : 'none';
      });
      mapCard.querySelector('header').append(toggle);
      mapCard.append(photo);
      const note = document.createElement('p');
      note.textContent = `실제 검출한 ${points.length}개 포인트 · 눈썹, 눈, 코, 입, 얼굴 윤곽의 위치입니다. 여러 얼굴이 있으면 가장 큰 얼굴을 분석해요. 점의 표시는 닮은꼴의 정확도를 보증하지 않아요.`;
      mapCard.append(note);
    } else {
      const note = document.createElement('p'); note.textContent = '이번 결과에는 얼굴 포인트 정보가 없어요. 다시 분석하면 확인할 수 있어요.'; mapCard.append(note);
    }
    extras.append(mapCard);
    const profile=lastAnalysisResult.profile_estimates;
    if (profile) {
      const summary=document.createElement("details"); summary.className="profile-estimates";
      const cues=profile.visual_cues||{};summary.innerHTML=`<summary><span><small>DETAIL ANALYSIS</small><strong>사진에서 측정한 특징</strong></span><i aria-hidden="true"></i></summary><div class="profile-copy"><p>${profile.notice}</p></div><dl><div><dt>연령대</dt><dd>${profile.age_range}</dd></div><div><dt>외형 표현</dt><dd>${profile.presentation}</dd></div><div><dt>얼굴형</dt><dd>${profile.face_shape}</dd></div><div><dt>두상 비율</dt><dd>${profile.head_shape||"균형형"}</dd></div><div><dt>눈매</dt><dd>${profile.eye_style}</dd></div><div><dt>눈썹</dt><dd>${profile.eyebrow_style||"균형형"}</dd></div><div><dt>코 모양</dt><dd>${profile.nose_shape||"균형형"}</dd></div><div><dt>사진 피부 톤</dt><dd>${profile.photo_tone||"중간 밝기"}</dd></div><div><dt>안경</dt><dd>${cues.glasses||"확인 필요"}</dd></div><div><dt>수염·턱 음영</dt><dd>${cues.beard||"확인 필요"}</dd></div><div><dt>헤어 실루엣</dt><dd>${cues.hair||"확인 필요"}</dd></div><div><dt>액세서리</dt><dd>${cues.accessory||"확인 필요"}</dd></div><div><dt>전체 인상</dt><dd>${profile.impression}</dd></div></dl>`;
      extras.append(summary);
    }
    const actions=document.createElement("div"); actions.className="share-actions"; actions.innerHTML='<button type="button" class="button primary share-card">선택한 카드 저장</button><button type="button" class="button community-share">결과 피드에 공유</button>';
    const saveStatus=document.createElement('p');saveStatus.className='festival-save-status';saveStatus.setAttribute('role','status');
    const actionHelp=document.createElement('p');actionHelp.className='festival-save-status';actionHelp.textContent='카드 저장은 PNG 이미지 다운로드만 진행해요. 피드 공유는 작성·제출 후 관리자 승인을 거쳐 공개돼요.';
    actions.querySelector(".share-card").addEventListener("click",async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='카드 준비 중';saveStatus.textContent='';try{const blob=await createShareCard();downloadBlob(blob);saveStatus.textContent='PNG 다운로드를 요청했어요. 기기의 다운로드 목록을 확인해 주세요.';}catch(error){saveStatus.textContent=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';}finally{button.disabled=false;button.textContent='선택한 카드 저장';}});
    actions.querySelector(".community-share").addEventListener("click",async()=>{
      const button=actions.querySelector(".community-share");
      button.disabled=true; button.textContent="피드 작성 준비 중";
      try {
        await draftImageReady;
        if(submittedSource&&!cachedDraftImage){ const response=await fetch(submittedSource); await saveCommunityImage(await response.blob()); cachedDraftImage=true; }
        sessionStorage.setItem("lookalike-share-draft",JSON.stringify({name:top?.name||"나의 닮은꼴",category:activeMode,score:Math.round((top?.similarity||0)*100),createdAt:Date.now(),hasImage:Boolean(submittedSource)}));
        location.href="/share";
      } catch {
        button.disabled=false; button.textContent="결과 피드에 공유";
        alert("공유 화면을 준비하지 못했습니다. 다시 시도해 주세요.");
      }
    });
    const festival=results.querySelector('.festival-results');if(festival){festival.after(actions);actions.after(actionHelp,saveStatus);}else extras.append(actions,actionHelp,saveStatus);results.querySelector(".reset-button")?.before(extras);
  }

  function enhance() {
    document.querySelectorAll('input[type="file"]').forEach((input) => {
      input.removeAttribute("capture");
      if (!input.dataset.communityCache) {
        input.dataset.communityCache = "true";
        input.addEventListener("change", () => prepareCommunityImage(input.files?.[0]));
      }
    });
    if (!document.querySelector(".dataset-link")) {
      const link = document.createElement("a");
      link.className = "dataset-link";
      link.href = `/gallery?type=${activeMode}`;
      link.textContent = "데이터셋 보기";
      document.body.append(link);
    }
    if (!document.querySelector(".community-link")) {
      const link = document.createElement("a");
      link.className = "community-link";
      link.href = "/feed";
      link.textContent = "결과 피드";
      document.body.append(link);
    }
    if (!document.querySelector(".app-global-header")) {
      const header=document.createElement("header");
      header.className="app-global-header";
      header.innerHTML='<a class="app-global-brand" href="/">LOOKALIKE <span>LAB</span></a><nav aria-label="주요 메뉴"><a href="/" aria-current="page">닮은꼴 찾기</a><a href="/feed">결과 피드</a><a href="/gallery">데이터셋</a><a href="/account">내 계정</a></nav>';
      document.body.prepend(header);
      const account=document.querySelector('#lookalikeAuthWidget');if(account)header.append(account);
    }
    const intro = document.querySelector(".intro");
    if (intro && !intro.querySelector(".gallery-count-badge")) {
      const badge = document.createElement("div");
      badge.className = "gallery-count-badge";
      badge.innerHTML = '<span></span>';
      intro.append(badge);
    }
    if (intro && !intro.querySelector(".dataset-mode-links")) {
      const modes = document.createElement("nav");
      modes.className = "dataset-mode-links";
      modes.setAttribute("aria-label", "닮은꼴 데이터 유형");
      modes.innerHTML = '<button type="button" data-mode="human">인물</button><button type="button" data-mode="character">애니 캐릭터</button><button type="button" data-mode="animal">동물</button>';
      modes.querySelectorAll("button").forEach(button => button.addEventListener("click", () => selectMode(button.dataset.mode)));
      intro.append(modes);
    }
    if(intro&&!intro.querySelector('.match-gender-picker')){
      const picker=document.createElement('section');picker.className='match-gender-picker';picker.setAttribute('aria-label','인물 성별 선택');
      picker.innerHTML='<span class="match-gender-label">비교할 인물</span><div class="match-gender-options" role="group" aria-label="성별 비교 범위"><button type="button" data-gender="auto" aria-pressed="true">자동</button><button type="button" data-gender="male" aria-pressed="false">남성</button><button type="button" data-gender="female" aria-pressed="false">여성</button></div><small>직접 선택하면 사진의 자동 추정보다 우선해요.</small>';
      picker.querySelectorAll('button').forEach(button=>button.onclick=()=>{matchGender=button.dataset.gender;picker.querySelectorAll('button').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));});
      intro.append(picker);
    }
    selectMode(activeMode);
    const loading = document.querySelector(".loading-overlay");
    if (loading && !loading.dataset.queueEnhanced) {
      loading.dataset.queueEnhanced = "true";
      loading.replaceChildren();
      const panel = document.createElement("section");
      panel.className = "logic-loader";
      panel.innerHTML = `<div class="logic-scan" aria-hidden="true"><span></span><i></i><i></i><i></i><i></i><i></i></div><div class="logic-copy"><small>실제 분석 과정</small><h2>사진 한 장을 특징 값으로 바꾸는 중</h2><ol>${loadingSteps.map(step => `<li><b></b><span>${step}</span></li>`).join("")}</ol><div class="logic-progress"><i></i></div><p class="logic-detail" aria-live="polite">분석을 준비하고 있어요</p></div>`;
      loading.append(panel);
      setLoadingStage(0, "브라우저에서 사진을 안전한 전송 크기로 줄이고 있어요");
    }
    enhanceResults();
  }

  new MutationObserver(enhance).observe(document.getElementById("root"), { childList: true, subtree: true });
  enhance();
})();
