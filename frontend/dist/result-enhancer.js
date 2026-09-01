(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const target = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (!target.includes("/matches")) return originalFetch(...args);
    const started = performance.now();
    const response = await originalFetch(...args);
    const remaining = 9800 - (performance.now() - started);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    return response;
  };
  let galleryCount = 128;
  originalFetch("/api/v1/health").then(r => r.json()).then(data => { galleryCount = data.people || galleryCount; }).catch(() => {});
  const bonusPrefixes = ["동물상 ·", "진격의 거인 ·", "귀멸의 칼날 ·", "원피스 ·"];

  function card(label, image, name, score, winner = false) {
    const figure = document.createElement("figure");
    figure.className = `compare-card${winner ? " winner" : ""}`;
    const badge = winner ? '<span class="winner-badge">가장 닮은 사람</span>' : "";
    figure.innerHTML = `${badge}<figcaption>${label}</figcaption><img alt="${name}" /><strong>${name}</strong>${score ? `<span>${score}</span>` : ""}`;
    figure.querySelector("img").src = image;
    return figure;
  }

  function enhance() {
    enhanceLoading();
    const results = document.querySelector(".results");
    if (!results || results.dataset.comparisonEnhanced) return;
    const submitted = results.querySelector(".submitted img");
    const list = results.querySelector(".match-list");
    const rows = [...(list?.querySelectorAll(".match-row") || [])];
    if (!submitted || rows.length < 3) return;

    results.dataset.comparisonEnhanced = "true";
    const first = rows[0];
    const firstImage = first.querySelector("img");
    const firstName = first.querySelector("strong")?.textContent || "1위 닮은꼴";
    const firstScore = first.querySelector(".similarity")?.textContent || "";

    const stage = document.createElement("div");
    stage.className = "comparison-stage";
    stage.append(card("내 사진", submitted.src, "내 사진", ""));
    const arrow = document.createElement("div"); arrow.className = "compare-arrow"; arrow.textContent = "≈"; stage.append(arrow);
    stage.append(card("TOP 1", firstImage.src, firstName, firstScore, true));
    results.querySelector(".results-heading").after(stage);
    const science = document.createElement("section");
    science.className = "science-summary";
    science.innerHTML = `<div class="science-orbit"><i></i><i></i><i></i><span>512D</span></div><div><small>FACE ANALYSIS REPORT</small><h2>얼굴 특징 벡터 비교 완료</h2><p>정렬된 얼굴에서 특징을 추출하고 전체 갤러리의 코사인 분포를 기준으로 상대 유사도를 계산했어요.</p></div><dl><div><dt>모델</dt><dd>ArcFace</dd></div><div><dt>비교 방식</dt><dd>Cosine</dd></div><div><dt>검색 후보</dt><dd>${galleryCount}명</dd></div><div><dt>보존 데이터</dt><dd>없음</dd></div></dl>`;
    stage.after(science);
    first.remove();

    const bonus = [...list.querySelectorAll(".match-row")].find(row => {
      const name = row.querySelector("strong")?.textContent || "";
      return bonusPrefixes.some(prefix => name.startsWith(prefix));
    });
    if (bonus) {
      const showcase = document.createElement("section");
      showcase.className = "bonus-showcase";
      const image = bonus.querySelector("img");
      const name = bonus.querySelector("strong")?.textContent || "오늘의 닮은꼴";
      const score = bonus.querySelector(".similarity")?.textContent || "";
      showcase.innerHTML = `<div><small>또 다른 닮은꼴</small><h2>${name}</h2><p>재미로 확인하는 동물상·캐릭터상 결과예요.</p><strong>${score}</strong></div><img alt="${name}" />`;
      showcase.querySelector("img").src = image.src;
      list.after(showcase);
      bonus.remove();
    }
  }

  function enhanceLoading() {
    const loading = document.querySelector(".loading-overlay");
    if (!loading || loading.dataset.analysisEnhanced) return;
    loading.dataset.analysisEnhanced = "true";
    const stages = [
      ["얼굴 위치를 찾는 중", "사진 속에서 가장 큰 얼굴을 검출하고 있어요"],
      ["얼굴을 정렬하는 중", "눈·코·입의 기준점을 맞추고 있어요"],
      ["얼굴 특징을 만드는 중", "512차원 Face Embedding을 생성하고 있어요"],
      ["128명의 얼굴과 비교 중", "Cosine Similarity를 한 번에 계산하고 있어요"],
      ["가장 닮은 TOP 3 선정 중", "유사도가 높은 순서로 결과를 정리하고 있어요"],
    ];
    loading.innerHTML = `<div class="analysis-visual">
      <div class="scan-card"><div class="face-outline"><i></i><i></i><i></i><i></i><i></i><span></span></div></div>
      <div class="vector-cloud">${Array.from({length:24},(_,i)=>`<b style="--i:${i}"></b>`).join("")}</div>
      <div class="match-bars"><em></em><em></em><em></em></div>
    </div><div class="analysis-copy"><span class="analysis-kicker">INSIGHTFACE · ARCFACE</span><strong id="analysisStage"></strong><small id="analysisDetail"></small><div class="analysis-progress"><i></i></div><div class="analysis-steps">${stages.map((_,i)=>`<b>${i+1}</b>`).join("")}</div></div>`;
    let current = 0;
    const title = loading.querySelector("#analysisStage");
    const detail = loading.querySelector("#analysisDetail");
    const progress = loading.querySelector(".analysis-progress i");
    const dots = [...loading.querySelectorAll(".analysis-steps b")];
    const render = () => {
      title.textContent = stages[current][0]; detail.textContent = stages[current][1];
      progress.style.width = `${14 + current * 20}%`;
      dots.forEach((dot,i)=>dot.classList.toggle("active",i<=current));
      loading.dataset.stage = String(current);
    };
    render();
    const timer = setInterval(() => { if (!document.body.contains(loading)) return clearInterval(timer); current = Math.min(current + 1, stages.length - 1); render(); }, 1900);
  }

  new MutationObserver(enhance).observe(document.getElementById("root"), { childList: true, subtree: true });
  enhance();
})();
