const API="https://dphiuepbsullrscuuzrc.supabase.co/functions/v1/admin-api";
const $=s=>document.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const labels={pending:"검토 대기",approved:"게시됨",changes:"수정 요청",rejected:"반려됨",hidden:"숨김"},categories={human:"인물",character:"애니 캐릭터",animal:"동물"};
let token=null,posts=[],status="pending",selected=null;
async function applyRoleGate(){const button=$("#userManageButton");if(!button||!window.lookalikeSupabaseClient)return;try{const{data:{session}}=await window.lookalikeSupabaseClient.auth.getSession();if(!session){button.hidden=true;return}const{data:role}=await window.lookalikeSupabaseClient.rpc("my_admin_role");button.hidden=role!=="owner"}catch{button.hidden=true}}
function toast(message){const node=$("#toast");node.textContent=message;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2600)}
async function call(path,options={}){const {data:{session}}=await window.lookalikeSupabaseClient.auth.getSession();token=session?.access_token;const response=await fetch(API+path,{...options,signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}}),data=await response.json();if(!response.ok)throw new Error(data.detail||"요청에 실패했습니다.");return data}
function loginScreen(message=""){
  document.querySelector('.admin-id').textContent='관리자 전용';
  document.querySelector(".shell").innerHTML=`<main class="admin-login"><form><h1>관리자 로그인</h1><p>관리자로 지정된 Google 계정으로 로그인하세요.</p>${message?`<div class="login-error">${esc(message)}</div>`:""}<button type="submit">Google 계정 선택</button><a href="/account">내 계정으로 돌아가기</a></form></main>`;
  document.querySelector(".admin-login form").onsubmit=async event=>{event.preventDefault();await window.lookalikeSupabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/admin',queryParams:{prompt:'select_account'}}})};
}
function filtered(){const query=$("#searchInput").value.trim().toLowerCase(),category=$("#categoryFilter").value;return posts.filter(post=>post.status===status&&(!query||(post.nickname+post.message+post.result_name).toLowerCase().includes(query))&&(category==="all"||categories[post.result_category]===category)).sort((a,b)=>($("#sortSelect").value==="newest"?-1:1)*(new Date(a.created_at)-new Date(b.created_at)))}
function renderNav(){const counts=Object.fromEntries(Object.keys(labels).map(key=>[key,posts.filter(post=>post.status===key).length]));$("#statusNav").innerHTML=Object.entries(labels).filter(([key])=>key!=="hidden").map(([key,label])=>`<button class="nav-button ${key===status?"active":""}" data-status="${key}" type="button"><span>${label}</span><span>${counts[key]||0}</span></button>`).join("");document.querySelectorAll("[data-status]").forEach(button=>button.onclick=()=>{status=button.dataset.status;selected=null;render()});$("#todayApproved").textContent=counts.approved||0;$("#todayRejected").textContent=counts.rejected||0;$("#todayChanges").textContent=counts.changes||0}
function renderQueue(){const rows=filtered();if(rows.length&&!rows.some(post=>post.id===selected))selected=rows[0].id;$("#queueTitle").textContent=labels[status];$("#queueCount").textContent=`${rows.length}개의 제출물`;$("#emptyState").hidden=Boolean(rows.length);$("#queueList").innerHTML=rows.map(post=>`<button class="queue-item ${post.id===selected?"selected":""}" data-id="${post.id}" type="button"><span class="submission"><span class="text-avatar">${esc(post.nickname.slice(0,1))}</span><span><b>${esc(post.nickname)}</b><small>${esc(post.result_name)} · ${post.result_score}%${post.image_path?" · 사진":""}</small></span></span><span class="category">${categories[post.result_category]}</span><span class="risk" data-risk="낮음">낮음</span></button>`).join("");document.querySelectorAll("[data-id]").forEach(button=>button.onclick=()=>{selected=button.dataset.id;renderQueue();renderReview()})}
function renderReview(){
  const post=posts.find(item=>item.id===selected);if(!post){$("#reviewPanel").innerHTML='<div class="review-empty"><b>검토할 제출물을 선택해 주세요</b></div>';return}
  const active=["pending","changes"].includes(post.status);
  $("#reviewPanel").innerHTML=`<header class="review-header"><div><h2>제출 상세 정보</h2><p>${post.id} · ${new Date(post.created_at).toLocaleString("ko")}</p></div><span class="status-mark">${labels[post.status]}</span></header><div class="review-body text-review"><div class="content-stack">${post.image_url?`<section class="section-box review-photo"><h3>사용자가 공개 선택한 사진</h3><img src="${post.image_url}" alt="검토용 사용자 첨부 사진"></section>`:""}<section class="result-summary"><small>${categories[post.result_category]}</small><h2>${esc(post.result_name)}</h2><strong>${post.result_score}%</strong></section><section class="section-box"><h3>결과 이야기</h3><p class="intro">${esc(post.message)}</p></section><section class="section-box"><h3>공개 닉네임</h3><p class="intro">${esc(post.nickname)}</p></section><section class="section-box"><h3>관리자 메모</h3><textarea class="note" id="moderatorNote" maxlength="500" placeholder="반려 또는 수정 요청 사유를 입력하세요.">${esc(post.moderation_note||"")}</textarea></section></div><div class="safety-stack"><section class="section-box"><h3>개인정보 확인</h3><div class="check-list"><div class="check">사진은 사용자가 공개를 직접 선택함</div><div class="check">Google 이메일 공개 안 함</div><div class="check">결과와 이야기만 공개</div></div></section></div></div><footer class="actionbar"><button class="admin-delete" data-delete type="button">영구 삭제</button><button class="reject" data-action="rejected" ${active?"":"disabled"}>반려</button><button class="changes" data-action="changes" ${active?"":"disabled"}>수정 요청</button><button class="approve" data-action="approved" ${active?"":"disabled"}>승인 후 게시</button></footer>`;
  document.querySelectorAll("[data-action]").forEach(button=>button.onclick=()=>moderate(post,button.dataset.action));
  document.querySelector("[data-delete]").onclick=()=>deletePost(post);
}
async function moderate(post,action){const note=$("#moderatorNote").value.trim();if(action!=="approved"&&!note)return toast("처리 사유를 입력해 주세요.");try{await call(`/posts/${post.id}`,{method:"PATCH",body:JSON.stringify({action,note})});toast(`${labels[action]} 처리했습니다.`);await load()}catch(error){toast(error.message)}}
async function deletePost(post){if(!confirm(`‘${post.result_name}’ 게시물을 영구 삭제할까요? 사진과 좋아요도 함께 삭제됩니다.`))return;try{await call(`/posts/${post.id}`,{method:"DELETE"});toast("게시물을 삭제했습니다.");await load()}catch(error){toast(error.message)}}
function render(){renderNav();renderQueue();renderReview()}
async function loadUsers(){
 const list=$("#userList"); list.textContent="사용자를 불러오는 중";
 try{
  const {users=[]}=await call("/users");
  list.replaceChildren();
  for(const user of users){
   const row=document.createElement("div");row.className="user-row";
   const identity=document.createElement("div"),name=document.createElement("b"),email=document.createElement("small");
   name.textContent=user.nickname||"사용자";email.textContent=user.email||"";identity.append(name,email);
   const badge=document.createElement("span");badge.className="user-role";badge.textContent=user.role==="owner"?"최고 관리자":user.role==="moderator"?"운영 관리자":"사용자";
   row.append(identity,badge);
   if(user.role==="owner"){const locked=document.createElement("span");locked.textContent="변경 불가";row.append(locked);}
   else{
    const select=document.createElement("select");select.setAttribute("aria-label",(user.nickname||user.email)+" 권한");
    for(const [value,label] of [["user","사용자"],["moderator","운영 관리자"]]){const option=new Option(label,value);select.add(option);}select.value=user.role;
    select.onchange=async()=>{select.disabled=true;try{await call("/users/"+user.user_id,{method:"PATCH",body:JSON.stringify({role:select.value})});toast("권한을 변경했습니다.");}catch(e){toast(e.message);}await loadUsers();};
    row.append(select);
   }
   list.append(row);
  }
  if(!users.length)list.textContent="가입한 사용자가 없습니다.";
 }catch(error){list.textContent=error.message;}
}
let adminRole=null;
function showSection(){
 if(!adminRole)return;
 let section=location.hash.slice(1)||'posts';
 if(!['posts','dataset','users'].includes(section)||(section==='users'&&adminRole!=='owner'))section='posts';
 document.querySelectorAll('[data-admin-panel]').forEach(p=>p.hidden=p.dataset.adminPanel!==section);
 document.querySelectorAll('[data-section]').forEach(a=>{if(a.dataset.section===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(section==='users')loadUsers();
 window.lookalikeAdminSection=section;
 window.dispatchEvent(new CustomEvent('admin-section',{detail:section}));
}
window.addEventListener('hashchange',showSection);
document.querySelector('.owner-setup')?.remove();
async function load(){try{const data=await call("/posts");posts=data.posts||[];selected=null;render()}catch(error){$("#queueCount").textContent=error.message;toast("게시물을 불러오지 못했습니다. 페이지를 새로고침해 주세요.")}}
["searchInput","categoryFilter"].forEach(id=>$("#"+id).addEventListener(id==="searchInput"?"input":"change",()=>{selected=null;renderQueue();renderReview()}));$("#sortSelect").onchange=()=>{renderQueue();renderReview()};$("#resetFilters").onclick=()=>{$("#searchInput").value="";$("#categoryFilter").value="all";render()};
async function boot(){document.querySelector('.shell').hidden=true;try{const me=await call('/me');adminRole=me.role;$('#auditLogsLink').hidden=me.role!=='owner';$('#userManageButton').hidden=me.role!=='owner';document.querySelector('.user-manager-note').textContent='최고 관리자만 다른 가입자를 운영 관리자로 지정하거나 일반 사용자로 변경할 수 있습니다.';document.querySelector('.admin-id').textContent=me.role==='owner'?'최고 관리자':'운영 관리자';await load();showSection()}catch(error){loginScreen(error.message)}finally{document.querySelector('.shell').hidden=false}}
boot();
