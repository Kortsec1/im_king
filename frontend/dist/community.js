const SUPABASE_URL="https://dphiuepbsullrscuuzrc.supabase.co";
const SUPABASE_KEY="sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq";
const client=window.lookalikeSupabaseClient||window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const categoryLabel={human:"인물",character:"애니 캐릭터",animal:"동물"},statusLabel={pending:"검토 중",approved:"공개됨",changes:"수정 요청",rejected:"반려됨",hidden:"숨김"};
let session=null,profile=null,draft=JSON.parse(sessionStorage.getItem("lookalike-share-draft")||"null"),draftImage=null,draftImageUrl=null;

function toast(message){const node=$("#communityToast");node.textContent=message;node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),2800)}
function openDraftDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open("lookalike-community",1);request.onupgradeneeded=()=>request.result.createObjectStore("drafts");request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result)})}
async function getDraftImage(){const db=await openDraftDb();return new Promise((resolve,reject)=>{const request=db.transaction("drafts").objectStore("drafts").get("latest-image");request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}
async function clearDraft(){sessionStorage.removeItem("lookalike-share-draft");draft=null;draftImage=null;if(draftImageUrl)URL.revokeObjectURL(draftImageUrl);draftImageUrl=null;try{const db=await openDraftDb();db.transaction("drafts","readwrite").objectStore("drafts").delete("latest-image")}catch{}}
async function googleLogin(){const{error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${location.origin}/community`}});if(error)toast("Google 로그인을 시작하지 못했습니다.")}
async function loadProfile(){if(!session)return profile=null;const{data,error}=await client.from("profiles").select("nickname").eq("user_id",session.user.id).single();if(error)throw error;profile=data}

async function renderAccount(){
  const area=$("#accountArea");
  if(!session){area.innerHTML="";$("#myPosts").innerHTML="";return}
  area.innerHTML=`<div class="account-card"><div><small>로그인 중</small><strong>${esc(profile?.nickname||"닉네임 준비 중")}</strong></div><button class="account-button edit-nickname" type="button">닉네임 수정</button></div>`;
  area.querySelector(".edit-nickname").onclick=renderNicknameEditor;
}
function renderNicknameEditor(){
  const area=$("#accountArea");
  area.innerHTML=`<form class="nickname-form"><label>공개 닉네임<input value="${esc(profile.nickname)}" minlength="2" maxlength="16"></label><button class="account-button" type="submit">저장</button></form>`;
  area.querySelector("form").onsubmit=async event=>{event.preventDefault();const nickname=area.querySelector("input").value.trim(),{error}=await client.from("profiles").update({nickname,updated_at:new Date().toISOString()}).eq("user_id",session.user.id);if(error)return toast(error.code==="23505"?"이미 사용 중인 닉네임입니다.":"닉네임을 저장하지 못했습니다.");profile.nickname=nickname;await renderAccount();window.dispatchEvent(new CustomEvent("lookalike-profile-updated"));toast("닉네임을 변경했습니다.")};
}
async function prepareDraftImage(){if(!draft?.hasImage)return;try{draftImage=await getDraftImage();if(draftImage)draftImageUrl=URL.createObjectURL(draftImage)}catch{}}
function renderComposer(){
  const composer=$("#composer");
  if(!session){composer.innerHTML='<div class="composer-empty"><div><strong>로그인 후 결과를 공유할 수 있어요.</strong><p>사진은 선택한 경우에만 게시물용으로 업로드됩니다.</p></div><button class="login-button" type="button">Google로 로그인</button></div>';composer.querySelector("button").onclick=googleLogin;return}
  if(!draft){composer.innerHTML='<div class="composer-empty"><div><strong>공유할 결과가 없습니다.</strong><p>닮은꼴 검사 결과에서 ‘결과 피드에 공유’를 눌러주세요.</p></div><a href="/">닮은꼴 검사하기</a></div>';return}
  composer.innerHTML=`<div class="draft"><div class="draft-result"><div><small>${categoryLabel[draft.category]||"결과"}</small><b>${esc(draft.name)}</b></div><strong>${draft.score}%</strong></div><form class="draft-form"><label for="postMessage">결과 이야기</label><div class="message-wrap"><textarea id="postMessage" maxlength="80" placeholder="결과를 본 첫 느낌을 짧게 남겨주세요." required></textarea><span><b>0</b>/80</span></div>${draftImageUrl?`<label class="photo-option"><input type="checkbox" id="includePhoto"><img src="${draftImageUrl}" alt="이번 검사에서 사용한 사진 미리보기"><span><b>내 사진도 함께 공개</b><small>선택할 때만 게시물용으로 업로드됩니다.</small></span></label>`:""}<div class="draft-actions"><button class="cancel-draft" type="button">취소</button><button class="submit-post" type="submit">검토 요청</button></div></form></div>`;
  const form=composer.querySelector("form"),textarea=form.querySelector("textarea");textarea.oninput=()=>form.querySelector(".message-wrap b").textContent=textarea.value.length;form.querySelector(".cancel-draft").onclick=async()=>{await clearDraft();renderComposer()};form.onsubmit=submitPost;
}
async function imageForUpload(blob){const bitmap=await createImageBitmap(blob),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.82))}
async function submitPost(event){
  event.preventDefault();const form=event.currentTarget,button=form.querySelector(".submit-post"),includePhoto=Boolean(form.querySelector("#includePhoto")?.checked&&draftImage);button.disabled=true;button.textContent="제출 중";
  const{data:post,error:insertError}=await client.from("posts").insert({user_id:session.user.id,result_name:draft.name,result_category:draft.category,result_score:draft.score,message:form.querySelector("textarea").value.trim()}).select("id").single();
  if(insertError){button.disabled=false;button.textContent="검토 요청";return toast("게시물을 제출하지 못했습니다.")}
  if(includePhoto){const path=`${session.user.id}/${post.id}.jpg`,image=await imageForUpload(draftImage),{error:uploadError}=await client.storage.from("community-posts").upload(path,image,{contentType:"image/jpeg",upsert:false});if(uploadError){await client.from("posts").delete().eq("id",post.id);button.disabled=false;button.textContent="검토 요청";return toast("사진 업로드에 실패했습니다. 다시 시도해 주세요.")}const{error:updateError}=await client.from("posts").update({image_path:path}).eq("id",post.id);if(updateError){await client.storage.from("community-posts").remove([path]);await client.from("posts").delete().eq("id",post.id);return toast("사진 연결에 실패했습니다.")}}
  await clearDraft();renderComposer();toast("검토 요청을 보냈습니다.");await Promise.all([loadFeed(),loadMyPosts()]);
}
async function signedImage(path){if(!path)return null;const{data}=await client.storage.from("community-posts").createSignedUrl(path,3600);return data?.signedUrl||null}
async function loadFeed(){
  const feed=$("#feed");feed.innerHTML='<div class="feed-loading">결과를 불러오는 중</div>';
  const{data,error}=await client.from("posts").select("id,result_name,result_category,result_score,message,image_path,approved_at,profiles(nickname)").eq("status","approved").order("approved_at",{ascending:false}).limit(50);
  if(error)return feed.innerHTML='<div class="feed-empty">결과 피드를 불러오지 못했습니다.</div>';if(!data.length)return feed.innerHTML='<div class="feed-empty">아직 공개된 결과가 없습니다. 첫 결과를 공유해 보세요.</div>';
  const posts=await Promise.all(data.map(async post=>({...post,image_url:await signedImage(post.image_path)})));
  feed.innerHTML=posts.map(post=>`<article class="post ${post.image_url?"has-photo":""}">${post.image_url?`<img class="post-photo" src="${post.image_url}" alt="${esc(post.profiles?.nickname||"사용자")}가 공개한 사진" loading="lazy">`:""}<div class="post-result"><small>${categoryLabel[post.result_category]||"결과"} · <span class="score">${post.result_score}%</span></small><b>${esc(post.result_name)}</b></div><p class="post-message">${esc(post.message)}</p><div class="post-author"><b>${esc(post.profiles?.nickname||"익명")}</b><time>${new Intl.DateTimeFormat("ko",{month:"short",day:"numeric"}).format(new Date(post.approved_at))}</time></div></article>`).join("");
}
async function deletePost(post){if(!confirm("이 게시물을 삭제할까요? 사진이 있다면 함께 삭제됩니다."))return;if(post.image_path){const{error}=await client.storage.from("community-posts").remove([post.image_path]);if(error)return toast("사진을 삭제하지 못했습니다.")}const{error}=await client.from("posts").delete().eq("id",post.id);if(error)return toast("게시물을 삭제하지 못했습니다.");toast("게시물을 삭제했습니다.");await Promise.all([loadMyPosts(),loadFeed()])}
async function loadMyPosts(){
  const root=$("#myPosts");if(!session)return root.innerHTML="";
  const{data,error}=await client.from("posts").select("id,result_name,status,image_path,moderation_note,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(20);
  if(error||!data.length)return root.innerHTML="";
  root.innerHTML=`<section class="my-posts"><h2>내 공유 내역</h2>${data.map(post=>`<div class="my-post"><div><b>${esc(post.result_name)}</b><small>${statusLabel[post.status]||post.status}${post.moderation_note?` · ${esc(post.moderation_note)}`:""}</small></div><button type="button" data-post="${post.id}">삭제</button></div>`).join("")}</section>`;
  root.querySelectorAll("[data-post]").forEach(button=>button.onclick=()=>deletePost(data.find(post=>post.id===button.dataset.post)));
}
async function init(){
  const draftTask=(async()=>{if(draft&&(!draft.createdAt||Date.now()-draft.createdAt>3600000))await clearDraft();await prepareDraftImage()})();
  const sessionTask=client.auth.getSession();
  const [{data}]=await Promise.all([sessionTask,draftTask]);
  session=data.session;
  if(session)try{await loadProfile()}catch{toast("프로필을 불러오지 못했습니다.")}
  renderAccount();renderComposer();
  await Promise.all([loadFeed(),session?loadMyPosts():Promise.resolve()]);
}
client.auth.onAuthStateChange((_event,nextSession)=>{setTimeout(async()=>{session=nextSession;if(session&&!profile)try{await loadProfile()}catch{}renderAccount();renderComposer();if(session)loadMyPosts()},0)});
$("#refreshFeed").onclick=loadFeed;init();
