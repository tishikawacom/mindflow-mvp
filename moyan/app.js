(()=>{'use strict';
const KEY='moyan-mvp-v1';
const categories=['仕事','人間関係','恋愛・家族','健康','お金','将来','その他'];
const outcomes={pending:'確認前',yes:'現実化',partial:'一部現実化',no:'起きなかった',unknown:'未確認',unjudgeable:'判定不能'};
const actionKinds={practice:'練習',preparation:'準備',communication:'相談・連絡',research:'情報収集',rest:'休息・切り替え',other:'その他'};
const $=s=>document.querySelector(s);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte=>byte.toString(16).padStart(2,'0')).join('');
const date=v=>v?new Date(v).toLocaleDateString('ja-JP',{year:'numeric',month:'short',day:'numeric'}):'未設定';
const fmt=m=>m>=60?`${Math.floor(m/60)}時間${m%60?` ${m%60}分`:''}`:`${m}分`;
const dtLocal=iso=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const toIso=v=>v?new Date(v).toISOString():null;
const initial=()=>({version:1,events:[],timer:null});
let storageReadable=true;
function load(){try{const raw=localStorage.getItem(KEY);const value=raw?JSON.parse(raw):initial();if(!Array.isArray(value?.events)||value.events.some(e=>!Array.isArray(e?.predictions)||!Array.isArray(e.sessions)||!Array.isArray(e.actions)))throw Error('bad data');return value}catch{storageReadable=false;alert('保存データを読み込めませんでした。既存データは上書きせず、表示を初期状態にします。');return initial()}}
let db=load(),view='home',selected=null,modalTrigger=null;
function persist(){try{localStorage.setItem(KEY,JSON.stringify(db));return true}catch{alert('保存に失敗しました。ストレージの空き容量やプライベートブラウズ設定を確認してください。');return false}}
let account=null, configured=false, checking=false, saving=false, syncMessage='';
let recordTerm='', recordCategory='';
const timerKey= scope=>KEY+'-timer-'+scope;
function readAccountTimer(scope){
 try{return JSON.parse(sessionStorage.getItem(timerKey(scope)))}
 catch{return null}
}
function rememberAccountTimer(timer){
 try{
  if(timer)sessionStorage.setItem(timerKey(account.scope),JSON.stringify(timer));
  else sessionStorage.removeItem(timerKey(account.scope));
 }catch{}
}
const loginResult=new URLSearchParams(location.search).get('login');
if(loginResult){
 history.replaceState(null,'',location.pathname);
 view='settings';
 if(loginResult==='failed')syncMessage='Googleログインを完了できませんでした。もう一度お試しください。';
}
async function refreshAccount(interactive=false){
 if(checking||saving||!$('#modal').hidden)return;
 checking=true;
 try{
  const response=await fetch('/api/journal',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error('read');
  const remote=await response.json();
  if(typeof remote.configured!=='boolean'||!$('#modal').hidden)return;
  configured=remote.configured;
  if(remote.signedIn){
   const sameAccount=account?.scope===remote.scope;
   const timer=sameAccount?db.timer:readAccountTimer(remote.scope);
   if(!sameAccount||!remote.events.some(e=>e.id===selected))selected=null;
   account={scope:remote.scope,revision:remote.revision};
   db={version:1,events:remote.events,timer:remote.events.some(e=>e.id===timer?.eventId)?timer:null};
  }else if(account){
   account=null;
   selected=null;
   db=load();
  }
  if(interactive)syncMessage=remote.signedIn?'最新の記録を取得しました。':'';
  updatePrivacyLabel();
  if($('#modal').hidden)render();
 }catch{
  if(interactive){syncMessage='記録を取得できませんでした。接続を確認してください。';render()}
 }finally{checking=false}
}

function commit(update){
 if(account&&(checking||saving)){
  alert('同期中です。少し待ってからもう一度お試しください。');
  return false;
 }
 if(!account&&!storageReadable){
  alert('既存の保存データを保護するため、この画面からは変更できません。');
  return false;
 }
 const previous=JSON.stringify(db);
 const previousView=view;
 const previousSelection=selected;
 const restore=()=>{
  db=JSON.parse(previous);
  view=previousView;
  selected=previousSelection;
  hideModal();
  render();
 };
 update();
 if(!account){
  if(!persist()){restore();return false}
 }else if(previous!==JSON.stringify(db)){
  if(JSON.stringify(JSON.parse(previous).events)!==JSON.stringify(db.events)){
   saveAccount(restore);
  }else rememberAccountTimer(db.timer);
 }
 render();
 return true;
}

async function saveAccount(restore){
 saving=true;
 syncMessage='同期しています…';
 try{
  const response=await fetch('/api/journal',{
   method:'PUT',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({...account,events:db.events}),
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){
   if(response.status===409)throw Error('conflict');
   if(response.status===401)throw Error('session');
   throw Error('save');
  }
  account.revision=(await response.json()).revision;
  rememberAccountTimer(db.timer);
  syncMessage='同期しました。';
  if(view==='settings'&&$('#modal').hidden)render();
 }catch(error){
  syncMessage=error.message==='conflict'?'別の端末またはタブで記録が更新されました。最新の記録を取得してから入力し直してください。'
   :error.message==='session'?'ログインの有効期限が切れました。再読み込みしてからログインしてください。'
   :'同期を確認できませんでした。最新の記録を取得してから、変更が反映されたか確認してください。';
  restore();
  alert(syncMessage);
 }finally{saving=false}
}

function updatePrivacyLabel(){
 const label=$('#storageLabel');
 if(label)label.textContent=account?'Googleアカウントで同期':'この端末に保存';
}

async function logout(){
 if(saving||checking)return;
 checking=true;
 try{
  const response=await fetch('/api/auth/logout',{method:'POST'});
  if(!response.ok)throw Error('logout');
  rememberAccountTimer(null);
  location.replace('/');
 }catch{checking=false;alert('ログアウトできませんでした。接続を確認してください。')}
}

function importLocal(){
 if(!account||!storageReadable)return;
 const local=load().events;
 if(!storageReadable)return;
 if(!local.length){syncMessage='取り込める端末内の記録はありません。';render();return}
 if(!confirm('この端末の記録をアカウントにコピーし、Cloudflareに保存しますか？'))return;
 const known=new Set(db.events.map(e=>e.id));
 commit(()=>{db.events.push(...local.filter(e=>!known.has(e.id)))});
}

function accountSettings(){
 const controls=account
  ? '<button class="btn ghost" id="refreshAccount">最新の記録を取得</button><button class="btn ghost" id="importLocal">端末内の記録を取り込む</button><button class="btn ghost" id="logoutAccount">ログアウト</button>'
  : configured
   ? '<a class="btn" href="/api/auth/login">Googleでログイン</a>'
   : '<p class="small">Googleログインは現在利用できません。</p>';
 return `<h2>アカウントと同期</h2><p class="small">${account?'Googleでログイン中です。アカウントの記録はCloudflareに保存され、同じアカウントでログインした端末から使えます。':'ログインせずに使えます。Googleでログインすると、そのアカウントで作成した記録が別の端末でも使えるようになります。同期する記録はCloudflareに保存されます。'} 未ログイン時の記録は、ログイン後に取り込みを選ぶまで端末内に残ります。</p><div class="btn-row">${controls}</div><p role="status" class="small">${safe(syncMessage)}</p><hr>`;
}
const durationOf=e=>e.sessions.reduce((s,x)=>s+x.minutes,0);
const actionsTotal=e=>e.actions.reduce((s,a)=>s+a.minutes,0);
const efind=id=>db.events.find(e=>e.id===id);
let pageMotion;
const views=['home','worries','insights','settings'];
function enterView(direction=0){
 const content=$('#appContent');
 window.scrollTo(0,0);
 content.focus({preventScroll:true});
 pageMotion?.cancel();
 if(matchMedia('(prefers-reduced-motion: no-preference)').matches){
  const offset=direction?`translateX(${Math.sign(direction)*10}px)`:'translateY(7px)';
  pageMotion=content.animate(
   [{opacity:.4,transform:offset},{opacity:1,transform:'translate(0,0)'}],
   {duration:300,easing:'cubic-bezier(.2,0,0,1)'}
  );
 }
}
function nav(to){
 if(view===to&&!selected)return;
 const direction=views.indexOf(to)-views.indexOf(view);
 view=to;
 selected=null;
 render();
 enterView(direction);
}
function setNav(){
 $('#bottomNav').style.setProperty('--tab',views.indexOf(view));
 document.querySelectorAll('[data-view]').forEach(button=>{
  const active=button.dataset.view===view;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
  button.onclick=()=>nav(button.dataset.view);
 });
}
function page(heading,body){
 return `<div class="page-intro"><h1 class="page-title">${heading[0]}</h1>${heading[1]?`<p class="sub">${heading[1]}</p>`:''}</div>${body}`;
}
const byNewest=(a,b)=>b.createdAt.localeCompare(a.createdAt);
const awaitingResult=p=>!p.outcome||p.outcome==='pending'||p.outcome==='unknown';

function eventRow(e){
 const complete=e.predictions.filter(p=>!awaitingResult(p)).length;
 return `<button type="button" class="list-row click-row" data-open="${safe(e.id)}"><span class="row-left"><span class="tiny-icon" aria-hidden="true"></span><span><strong>${safe(e.title)}</strong><span class="row-meta">${safe(e.category)} · ${e.predictions.length}件の波及効果 · ${date(e.eventAt)}</span></span></span><span class="row-end">${e.predictions.length?`<span class="badge ${complete?'':'gray'}">${complete?complete+'件確認済み':'確認待ち'}</span>`:''}<span class="chevron" aria-hidden="true"></span></span></button>`;
}

function home(){
 const es=db.events.slice().sort(byNewest);
 const minutes=es.reduce((total,e)=>total+durationOf(e),0);
 const actions=es.reduce((total,e)=>total+actionsTotal(e),0);
 const pending=es.filter(e=>e.predictions.some(awaitingResult));
 const active=efind(db.timer?.eventId);
 return `<section class="home-header">
  <h1>不安の記録</h1>
  <button class="btn" id="newWorry"><span class="plus" aria-hidden="true"></span>不安を記録</button>
 </section>
 ${active?`<section class="active-timer"><div><span class="small">計測中</span><strong>${safe(active.title)}</strong></div><button class="btn ghost" data-open="${safe(active.id)}">タイマーを開く</button></section>`:''}
 <section class="overview">
  <div class="section-head"><h2>記録の概要</h2><button class="text-btn" id="goInsights">分析を見る<span class="chevron" aria-hidden="true"></span></button></div>
  <div class="overview-grid">
   <div class="metric"><span class="stat-label">不安の記録</span><strong class="stat-num">${es.length}<span class="unit">件</span></strong></div>
   <div class="metric"><span class="stat-label">反芻時間</span><strong class="stat-num">${fmt(minutes)}</strong></div>
   <div class="metric"><span class="stat-label">行動時間</span><strong class="stat-num">${fmt(actions)}</strong></div>
  </div>
 </section>
 <div class="home-collections">
  <section><div class="section-head"><h2>最近の記録</h2>${es.length?`<button class="text-btn" id="allWorries">すべて見る<span class="chevron" aria-hidden="true"></span></button>`:''}</div><div class="card collection">${es.length?es.slice(0,4).map(eventRow).join(''):'<div class="empty">まだ記録がありません。</div>'}</div></section>
  <section><div class="section-head"><h2>答え合わせ</h2></div><div class="card collection">${pending.length?pending.slice(0,4).map(e=>`<div class="list-row"><div><strong>${safe(e.title)}</strong><p>${e.predictions.filter(awaitingResult).length}件が確認待ち</p></div><button class="btn soft sm" data-open="${safe(e.id)}">結果を確認</button></div>`).join(''):'<div class="empty">確認待ちの記録はありません。</div>'}</div></section>
 </div>`;
}

function recordList(){
 recordTerm=$('#recordSearch').value;
 recordCategory=$('#recordCategory').value;
 const term=recordTerm.trim().normalize('NFKC').toLocaleLowerCase();
 const category=recordCategory;
 const matches=db.events.filter(e=>(!category||e.category===category)&&
  (!term||[e.title,...e.predictions.map(p=>p.text)].some(t=>t.normalize('NFKC').toLocaleLowerCase().includes(term)))).sort(byNewest);
 $('#recordMatches').textContent=matches.length+'件';
 $('#recordList').innerHTML=matches.length?matches.map(eventRow).join(''):`<div class="empty">${db.events.length?'条件に合う記録はありません。':'まだ記録がありません。'}</div>`;
}
function worries(){
 return page(['不安の記録'],`<div class="record-toolbar"><button class="btn" id="newWorry"><span class="plus" aria-hidden="true"></span>不安を記録</button><label class="record-search"><span class="search-icon" aria-hidden="true"></span><input type="search" id="recordSearch" aria-label="記録を検索" placeholder="記録を検索"></label><select id="recordCategory" aria-label="カテゴリで絞り込む"><option value="">全カテゴリ</option>${categories.map(c=>`<option>${c}</option>`).join('')}</select></div><p class="small result-count" id="recordMatches" role="status"></p><div class="card collection" id="recordList"></div>`);
}
function outcomeBadge(p){return `<span class="badge ${p.outcome==='yes'||p.outcome==='partial'?'orange':p.outcome==='no'?'':'gray'}">${outcomes[p.outcome||'pending']}</span>`}
function detail(e){const tm=durationOf(e),action=actionsTotal(e),effective=e.actions.filter(a=>a.review?.reuse===true).reduce((s,a)=>s+a.minutes,0);return `<button class="back" id="backList">一覧へ戻る</button><div class="detail-head"><div><h2>${safe(e.title)}</h2><div class="small">${safe(e.category)} ・ ${date(e.eventAt)} ・ 不安強度 ${e.intensity}/10</div></div><button class="btn ghost sm" id="editWorry">編集</button></div><div class="three-col" style="margin:25px 0 0"><div class="card"><div class="stat-label">反芻した時間</div><div class="stat-num">${fmt(tm)}</div></div><div class="card"><div class="stat-label">取った行動</div><div class="stat-num">${e.actions.length}件</div><div class="stat-hint">${fmt(action)} 実行</div></div><div class="card"><div class="stat-label">次回も使いたい行動</div><div class="stat-num">${fmt(effective)}</div><div class="stat-hint">自己評価による</div></div></div><div class="section-head"><h2>想定する波及効果</h2><button class="btn soft sm" id="addPrediction">波及効果を追加</button></div><section class="card">${e.predictions.length?e.predictions.map((p,i)=>`<div class="prediction"><div class="prediction-top"><strong>${i+1}. ${safe(p.text)}</strong>${outcomeBadge(p)}</div><p class="small" style="margin:6px 0 10px">事前予測：${p.probability==null?'未設定':safe(p.probability)+'%'} ${p.outcomeNote?`・ 実際：${safe(p.outcomeNote)}`:''}</p><div class="btn-row"><button class="btn ghost sm" data-review-pred="${safe(p.id)}">結果を記録・修正</button><button class="btn ghost sm" data-edit-pred="${safe(p.id)}">編集</button></div></div>`).join(''):`<p class="small">起こると心配している波及効果を追加できます。</p>`}</section><div class="section-head"><h2>反芻した時間</h2><div class="btn-row"><button class="btn ghost sm" id="addRumination">手動で追加</button><button class="btn soft sm" id="startTimer">タイマーを開始</button></div></div>${timerBlock(e)}<section class="card">${e.sessions.length?e.sessions.slice().reverse().map(s=>`<div class="list-row"><div><strong>${fmt(s.minutes)}</strong><p>${s.method==='timer'?'タイマー':'手動'} ・ ${date(s.createdAt)} ${s.note?'・ '+safe(s.note):''}</p></div><button class="btn ghost sm" data-delete-session="${safe(s.id)}">削除</button></div>`).join(''):`<div class="empty"><strong>反芻時間はまだありません</strong><p>考え続けていた時間を、概算でも記録できます。</p></div>`}</section><div class="section-head"><h2>実行したアクション</h2><button class="btn soft sm" id="addAction">アクションを追加</button></div><section class="card">${e.actions.length?e.actions.map(a=>`<div class="list-row"><div style="max-width:75%"><strong>${safe(a.title)}</strong><p>${fmt(a.minutes)} ・ ${actionKinds[a.kind]||'その他'}${a.purpose?' ・ 目的：'+safe(a.purpose):''}</p><p>${a.review?`不安軽減 ${a.review.relief===null?'未評価':a.review.relief+'/5'} ／ 結果への貢献 ${a.review.contribution===null?'未評価':a.review.contribution+'/5'} ／ 次回 ${a.review.reuse===true?'使いたい':a.review.reuse===false?'見直す':'未判断'}`:'事後評価はまだありません'}</p></div><div class="btn-row"><button class="btn ghost sm" data-review-action="${safe(a.id)}">評価</button><button class="btn ghost sm" data-edit-action="${safe(a.id)}">編集</button></div></div>`).join(''):`<div class="empty"><strong>行動の記録はありません</strong><p>準備・練習・相談など、実際に行ったことを記録しましょう。</p></div>`}</section><div class="section-head"><h2>記録の管理</h2></div><div class="card"><p class="small">記録を削除すると、関連する予測・反芻時間・アクションも削除されます。</p><div class="btn-row"><button class="btn ghost sm" id="deleteEvent">この記録を削除</button></div></div>`}
function timerBlock(e){const t=db.timer;if(!t)return '';if(t.eventId!==e.id)return `<div class="note">別の不安でタイマーが動作中です。そちらで終了してから使えます。</div>`;const secs=Math.floor((Date.now()-new Date(t.startedAt).getTime())/1000);return `<div class="timer-live"><div><small>反芻タイマー記録中</small><strong id="timerClock">${clock(Math.max(0,secs))}</strong></div><button class="btn sm" id="stopTimer">終了して確認</button></div>`}
const clock=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
function insights(){const es=db.events;const rum=es.reduce((s,e)=>s+durationOf(e),0);const act=es.reduce((s,e)=>s+actionsTotal(e),0);const useful=es.reduce((s,e)=>s+e.actions.filter(a=>a.review?.reuse===true).reduce((r,a)=>r+a.minutes,0),0);const preds=es.flatMap(e=>e.predictions);const counts={yes:0,partial:0,no:0,unknown:0};preds.forEach(p=>{if(counts[p.outcome]!==undefined)counts[p.outcome]++});const byCat=categories.map(c=>({name:c,minutes:es.filter(e=>e.category===c).reduce((s,e)=>s+durationOf(e),0)})).filter(x=>x.minutes>0);const max=Math.max(1,...byCat.map(x=>x.minutes));return page(['分析'],`<div class="three-col"><div class="card"><div class="stat-label">反芻に使った時間</div><div class="stat-num">${fmt(rum)}</div><div class="stat-hint">概算を含む累計</div></div><div class="card"><div class="stat-label">実行した行動の時間</div><div class="stat-num">${fmt(act)}</div><div class="stat-hint">準備・練習・相談など</div></div><div class="card"><div class="stat-label">次回も使いたい行動</div><div class="stat-num">${fmt(useful)}</div><div class="stat-hint">イベント後の自己評価</div></div></div><div class="two-col" style="margin-top:18px"><div class="card"><h2>波及効果の現実化</h2><p class="small">予測ごとに、実際の結果を集計しています。</p><div style="display:grid;gap:12px;margin-top:23px">${[{key:'yes',name:'起きた',color:'#0071e3'},{key:'partial',name:'一部起きた',color:'#2997ff'},{key:'no',name:'起きなかった',color:'#0066cc'},{key:'unknown',name:'まだ不明',color:'#768699'}].map(x=>`<div><div class="subline"><span>${x.name}</span><strong>${counts[x.key]}件</strong></div><div class="meter"><div style="width:${Math.round(counts[x.key]/Math.max(preds.length,1)*100)}%;background:${x.color}"></div></div></div>`).join('')}</div><p class="muted-line">確認前・判定不能は上記に含めていません。</p></div><div class="card"><h2>カテゴリ別の反芻時間</h2><p class="small">どのテーマに時間を使っていたかを確認できます。</p>${byCat.length?`<div class="chart-bars">${byCat.map(x=>`<div class="bar-col"><em>${x.minutes}分</em><div style="height:${Math.max(x.minutes/max*100,2)}%"></div><span>${x.name}</span></div>`).join('')}</div>`:`<div class="empty">反芻時間の記録はありません。</div>`}</div></div><div class="section-head"><h2>次回に引き継ぎたい行動</h2></div><div class="card">${es.flatMap(e=>e.actions.filter(a=>a.review?.reuse===true).map(a=>({...a,eventTitle:e.title}))).slice(-7).reverse().map(a=>`<div class="list-row"><div><strong>${safe(a.title)}</strong><p>${safe(a.eventTitle)} ・ ${fmt(a.minutes)}</p></div><span class="badge">次回も使いたい</span></div>`).join('')||`<div class="empty"><p>イベント終了後にアクションを評価すると、ここに表示されます。</p></div>`}</div><div class="attention">「役立った時間」は行動についての自己評価であり、結果との因果関係を証明するものではありません。休息や何もしない時間も大切です。</div>`)}
function settings(){return page(['設定'],`<section class="card">${accountSettings()}<h2>プライバシー</h2><p class="small">記録をGoogleに送信することはありません。未ログイン時の記録は、このブラウザのサイトデータを削除すると失われる場合があります。共有端末では利用後にログアウトしてください。</p><div class="btn-row"><button class="btn ghost" id="exportData">記録をJSONで書き出す</button><button class="btn danger" id="clearData">すべての記録を削除</button></div><hr><h2>セルフケアに関する注意</h2><p class="small">moyanは医療機器・診断・治療サービスではありません。不安が長く続く、眠れない、生活に支障が出る場合は医師や心理専門職への相談を検討してください。差し迫った危険がある場合は地域の緊急サービスへ連絡してください。</p></section>`)}
function render(){setNav();$('#appContent').innerHTML=selected&&view==='worries'&&efind(selected)?detail(efind(selected)):{home,worries,insights,settings}[view]();if($('#recordList')){
 $('#recordSearch').value=recordTerm;
 $('#recordCategory').value=recordCategory;
 recordList();
 $('#recordSearch').oninput=recordList;
 $('#recordCategory').onchange=recordList;
 }
 const bind=(id,fn)=>{const el=$('#'+id);if(el)el.onclick=fn};bind('newWorry',()=>eventForm());bind('emptyNew',()=>eventForm());bind('allWorries',()=>nav('worries'));bind('goInsights',()=>nav('insights'));if(selected&&view==='worries'){const e=efind(selected);bind('backList',()=>{nav('worries')});bind('editWorry',()=>eventForm(e));bind('addPrediction',()=>predictionForm(e));bind('addRumination',()=>rumForm(e));bind('addAction',()=>actionForm(e));bind('startTimer',()=>startTimer(e));bind('stopTimer',()=>stopTimer(e));bind('deleteEvent',()=>{if(confirm('この不安とすべての関連記録を削除しますか？'))commit(()=>{db.events=db.events.filter(x=>x.id!==e.id);if(db.timer?.eventId===e.id)db.timer=null;selected=null})});document.querySelectorAll('[data-review-pred]').forEach(b=>b.onclick=()=>predictionReview(e,b.dataset.reviewPred));document.querySelectorAll('[data-edit-pred]').forEach(b=>b.onclick=()=>predictionForm(e,b.dataset.editPred));document.querySelectorAll('[data-review-action]').forEach(b=>b.onclick=()=>actionReview(e,b.dataset.reviewAction));document.querySelectorAll('[data-edit-action]').forEach(b=>b.onclick=()=>actionForm(e,b.dataset.editAction));document.querySelectorAll('[data-delete-session]').forEach(b=>b.onclick=()=>{if(confirm('この反芻記録を削除しますか？'))commit(()=>e.sessions=e.sessions.filter(x=>x.id!==b.dataset.deleteSession))})}bind('refreshAccount',()=>refreshAccount(true));bind('importLocal',importLocal);bind('logoutAccount',logout);bind('exportData',exportData);bind('clearData',()=>{if(confirm(account?'アカウントの記録をすべて削除しますか？ 同期している端末にも反映されます。':'このブラウザ内の記録をすべて削除しますか？'))commit(()=>{db=initial();selected=null})})}
function showModal(html,init){modalTrigger=document.activeElement;$('#modalContent').innerHTML=`<div class="modal-head"><h2 id="modalTitle">${html.title}</h2><button class="close" id="closeModal" type="button" aria-label="閉じる"><span class="close-icon" aria-hidden="true"></span></button></div>${html.body}`;$('#modal').hidden=false;$('#closeModal').onclick=hideModal;$('.app').inert=true;document.body.classList.add('modal-open');init?.();$('#modalContent').focus({preventScroll:true})}
function hideModal(){
  if($('#modal').hidden)return;
  $('#modal').hidden=true;
  $('#modalContent').innerHTML='';
  $('.app').inert=false;
  document.body.classList.remove('modal-open');
  (modalTrigger?.isConnected?modalTrigger:$('#appContent')).focus({preventScroll:true});
  modalTrigger=null;
 }
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')hideModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')hideModal()});
function eventForm(e){showModal({title:e?'不安の内容を編集':'新しい不安を記録',body:`<form id="eventForm"><div class="field"><label for="e-title">心配している出来事 *</label><textarea id="e-title" maxlength="250" required placeholder="例：次の英語会議でうまく発言できない">${safe(e?.title||'')}</textarea></div><div class="form-grid"><div class="field"><label for="e-cat">カテゴリ</label><select id="e-cat">${categories.map(c=>`<option ${c===(e?.category||'仕事')?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label for="e-date">イベント日時（任意）</label><input id="e-date" type="datetime-local" value="${dtLocal(e?.eventAt)}"></div></div><div class="field"><label for="e-intensity">今の不安の強さ：<span id="e-level">${e?.intensity??7}</span> /10</label><input id="e-intensity" type="range" min="0" max="10" value="${e?.intensity??7}"></div><div class="field"><label for="e-review">結果を確認する日時（任意）</label><input id="e-review" type="datetime-local" value="${dtLocal(e?.reviewDueAt)}"><small>イベント直後にわからない結果は、後日に確認できます。</small></div></div><button class="btn full" type="submit">${e?'変更を保存':'記録を作成'}</button></form>`},()=>{$('#e-intensity').oninput=ev=>$('#e-level').textContent=ev.target.value;$('#eventForm').onsubmit=ev=>{ev.preventDefault();const title=$('#e-title').value.trim();if(!title)return;const id=e?.id||uid();commit(()=>{if(e){Object.assign(e,{title,category:$('#e-cat').value,eventAt:toIso($('#e-date').value),reviewDueAt:toIso($('#e-review').value),intensity:Number($('#e-intensity').value)})}else db.events.unshift({id,title,category:$('#e-cat').value,eventAt:toIso($('#e-date').value),reviewDueAt:toIso($('#e-review').value),intensity:Number($('#e-intensity').value),createdAt:new Date().toISOString(),predictions:[],sessions:[],actions:[]});selected=id;view='worries'});hideModal();if(!e&&efind(id)){window.scrollTo(0,0);predictionForm(efind(id))}}})}
function predictionForm(e,id){const p=e.predictions.find(x=>x.id===id);showModal({title:p?'波及効果を編集':'どんなことが起きると心配？',body:`<form id="p-form"><div class="field"><label for="p-text">心配している波及効果 *</label><textarea id="p-text" maxlength="250" required placeholder="例：上司から怒られる">${safe(p?.text||'')}</textarea></div><div class="field"><label for="p-prob">起こると思う確率：<span id="p-prob-label">${p?.probability===null?'未設定':(p?.probability??50)+'%'}</span></label><label style="font-weight:normal"><input style="width:auto" type="checkbox" id="p-use" ${p?.probability===null?'':'checked'}> 確率を記録する（任意）</label><input id="p-prob" type="range" min="0" max="100" step="5" value="${p?.probability??50}"></div><p class="note">具体的な予測にすると、あとから実際の結果と比較しやすくなります。入力は1件でも十分です。</p><button type="submit" class="btn full">${p?'保存':'波及効果を追加'}</button></form>${p?`<button id="p-delete" class="btn danger sm" style="margin-top:12px">この波及効果を削除</button>`:''}`},()=>{$('#p-prob').oninput=ev=>$('#p-prob-label').textContent=ev.target.value+'%';$('#p-use').onchange=ev=>{$('#p-prob').disabled=!ev.target.checked;$('#p-prob-label').textContent=ev.target.checked?$('#p-prob').value+'%':'未設定'};$('#p-prob').disabled=!$('#p-use').checked;$('#p-form').onsubmit=ev=>{ev.preventDefault();const val=$('#p-text').value.trim();if(!val)return;commit(()=>{const upd={text:val,probability:$('#p-use').checked?Number($('#p-prob').value):null};if(p)Object.assign(p,upd);else e.predictions.push({id:uid(),...upd,outcome:'pending',outcomeNote:'',createdAt:new Date().toISOString()})});hideModal()};if(p)$('#p-delete').onclick=()=>{if(confirm('この波及効果を削除しますか？')){commit(()=>{e.predictions=e.predictions.filter(x=>x.id!==p.id);e.actions.forEach(a=>{if(a.targetPredictionId===p.id)a.targetPredictionId=null})});hideModal()}}})}
function predictionReview(e,id){const p=e.predictions.find(x=>x.id===id);if(!p)return;showModal({title:'波及効果の答え合わせ',body:`<form id="pr-form"><p class="note">${safe(p.text)}<br>事前の予測確率：${p.probability==null?'未設定':safe(p.probability)+'%'}</p><div class="field"><label for="pr-status">実際にはどうなりましたか？</label><select id="pr-status" required><option value="">結果を選択</option>${Object.entries(outcomes).filter(([k])=>k!=='pending').map(([k,v])=>`<option value="${k}" ${p.outcome===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="pr-note">実際に起こったこと・確認できた事実（任意）</label><textarea id="pr-note" maxlength="1000" placeholder="事実と推測を分けて記録しましょう">${safe(p.outcomeNote||'')}</textarea></div><button type="submit" class="btn full">答え合わせを保存</button></form>`},()=>{$('#pr-form').onsubmit=ev=>{ev.preventDefault();commit(()=>{p.outcome=$('#pr-status').value;p.outcomeNote=$('#pr-note').value.trim();p.reviewedAt=new Date().toISOString()});hideModal()}})}
function rumForm(e,initMinutes=15){showModal({title:'反芻時間を記録',body:`<form id="rum-form"><div class="field"><label for="r-min">反芻していた時間（分）</label><input type="number" id="r-min" required min="1" max="10080" value="${initMinutes}"><small>考え続けていた時間の概算で構いません。準備や練習は「アクション」に記録してください。</small></div><div class="field"><label for="r-note">メモ（任意）</label><textarea id="r-note" maxlength="250" placeholder="例：上司の反応を想像していた"></textarea></div><button type="submit" class="btn full">反芻時間を保存する</button></form>`},()=>{$('#rum-form').onsubmit=ev=>{ev.preventDefault();const m=Number($('#r-min').value);if(!Number.isInteger(m)||m<1||m>10080)return;commit(()=>e.sessions.push({id:uid(),minutes:m,method:'manual',note:$('#r-note').value.trim(),createdAt:new Date().toISOString()}));hideModal()}})}
function startTimer(e){if(db.timer){alert('ほかのタイマーが計測中です。先に終了してください。');return}commit(()=>db.timer={eventId:e.id,startedAt:new Date().toISOString()})}
function stopTimer(e){const t=db.timer;if(!t||t.eventId!==e.id)return;const mins=Math.max(1,Math.round((Date.now()-new Date(t.startedAt).getTime())/60000));showModal({title:'タイマーを終了',body:`<form id="stop-form"><p class="small">経過時間は約${mins}分です。実際に反芻していた時間に修正できます。</p><div class="field"><label for="stop-min">反芻していた時間（分）</label><input id="stop-min" type="number" min="1" max="10080" required value="${Math.min(mins,10080)}"></div><div class="btn-row"><button type="submit" class="btn">記録して終了</button><button type="button" class="btn ghost" id="cancel-timer">記録せず終了</button></div></form>`},()=>{$('#stop-form').onsubmit=ev=>{ev.preventDefault();const v=Number($('#stop-min').value);if(!Number.isInteger(v)||v<1||v>10080)return;commit(()=>{e.sessions.push({id:uid(),minutes:v,method:'timer',createdAt:new Date().toISOString(),note:''});db.timer=null});hideModal()};$('#cancel-timer').onclick=()=>{commit(()=>db.timer=null);hideModal()}})}
function actionForm(e,id){const a=e.actions.find(x=>x.id===id);showModal({title:a?'アクションを編集':'実行したアクションを記録',body:`<form id="a-form"><div class="field"><label for="a-title">具体的に何をしましたか？ *</label><input required id="a-title" maxlength="180" placeholder="例：想定質問を英語で練習した" value="${safe(a?.title||'')}"></div><div class="form-grid"><div class="field"><label for="a-min">所要時間（分） *</label><input required type="number" id="a-min" min="1" max="10080" value="${a?.minutes??30}"></div><div class="field"><label for="a-kind">アクションの種類</label><select id="a-kind">${Object.entries(actionKinds).map(([k,v])=>`<option value="${k}" ${a?.kind===k?'selected':''}>${v}</option>`).join('')}</select></div></div><div class="field"><label for="a-purpose">この行動の目的（任意）</label><input id="a-purpose" maxlength="200" placeholder="例：会議中に質問へ答えられるようになる" value="${safe(a?.purpose||'')}"></div><div class="field"><label for="a-target">主に対応した波及効果（任意）</label><select id="a-target"><option value="">特に指定しない</option>${e.predictions.map(p=>`<option value="${safe(p.id)}" ${a?.targetPredictionId===p.id?'selected':''}>${safe(p.text)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label for="a-before">行動前の不安（任意）</label><select id="a-before"><option value="">未入力</option>${Array.from({length:11},(_,i)=>`<option value="${i}" ${a?.anxietyBefore===i?'selected':''}>${i} / 10</option>`).join('')}</select></div><div class="field"><label for="a-after">行動後の不安（任意）</label><select id="a-after"><option value="">未入力</option>${Array.from({length:11},(_,i)=>`<option value="${i}" ${a?.anxietyAfter===i?'selected':''}>${i} / 10</option>`).join('')}</select></div></div><button type="submit" class="btn full">アクションを保存</button></form>${a?`<button class="btn danger sm" id="a-delete" style="margin-top:12px">このアクションを削除</button>`:''}`},()=>{$('#a-form').onsubmit=ev=>{ev.preventDefault();const title=$('#a-title').value.trim(),minutes=Number($('#a-min').value);if(!title||!Number.isInteger(minutes)||minutes<1||minutes>10080)return;const opt=v=>v===''?null:Number(v);commit(()=>{const change={title,minutes,kind:$('#a-kind').value,purpose:$('#a-purpose').value.trim(),targetPredictionId:$('#a-target').value||null,anxietyBefore:opt($('#a-before').value),anxietyAfter:opt($('#a-after').value)};if(a)Object.assign(a,change);else e.actions.push({id:uid(),...change,createdAt:new Date().toISOString(),review:null})});hideModal()};if(a)$('#a-delete').onclick=()=>{if(confirm('このアクションを削除しますか？')){commit(()=>e.actions=e.actions.filter(x=>x.id!==a.id));hideModal()}}})}
function actionReview(e,id){const a=e.actions.find(x=>x.id===id);if(!a)return;showModal({title:'アクションの有効性を評価',body:`<form id="ar-form"><div class="note" style="margin-bottom:15px">${safe(a.title)} ・ ${fmt(a.minutes)}<br>効果は自己評価です。結果への貢献を断定するものではありません。</div><div class="form-grid"><div class="field"><label for="ar-relief">不安の軽減への役立ち度</label><select id="ar-relief"><option value="">未評価</option>${Array.from({length:6},(_,i)=>`<option value="${i}" ${a.review?.relief===i?'selected':''}>${i} / 5</option>`).join('')}</select></div><div class="field"><label for="ar-contrib">実際の結果への貢献</label><select id="ar-contrib"><option value="">未評価</option>${Array.from({length:6},(_,i)=>`<option value="${i}" ${a.review?.contribution===i?'selected':''}>${i} / 5</option>`).join('')}</select></div></div><div class="field"><label for="ar-reuse">次回も実施したいですか？</label><select id="ar-reuse"><option value="" ${a.review?.reuse==null?'selected':''}>まだわからない</option><option value="yes" ${a.review?.reuse===true?'selected':''}>次回も使いたい</option><option value="no" ${a.review?.reuse===false?'selected':''}>次回は見直したい</option></select></div><div class="field"><label for="ar-note">理由・学び（任意）</label><textarea id="ar-note" maxlength="400" placeholder="実際にどう役立ったか、次回の改善点">${safe(a.review?.reason||'')}</textarea></div><button type="submit" class="btn full">有効性を保存</button></form>`},()=>{$('#ar-form').onsubmit=ev=>{ev.preventDefault();const n=v=>v===''?null:Number(v);commit(()=>a.review={relief:n($('#ar-relief').value),contribution:n($('#ar-contrib').value),reuse:$('#ar-reuse').value===''?null:$('#ar-reuse').value==='yes',reason:$('#ar-note').value.trim(),reviewedAt:new Date().toISOString()});hideModal()}})}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`moyan-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
setInterval(()=>{if(db.timer){const el=$('#timerClock');if(el)el.textContent=clock(Math.max(0,Math.floor((Date.now()-new Date(db.timer.startedAt).getTime())/1000)))}},1000);
$('#appContent').addEventListener('click',event=>{
 const opener=event.target.closest('[data-open]');
 if(!opener)return;
 selected=opener.dataset.open;
 view='worries';
 render();
 enterView();
});
render();
refreshAccount();
window.addEventListener('focus',()=>refreshAccount());
})();
