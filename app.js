/* ===== أكاديمية الجامعيين — منطق النموذج التجريبي ===== */
'use strict';
const App = document.getElementById('app');
const Toast = document.getElementById('toast');
let state = { role:'student', lessonFilter:'الكل', answers:{}, addType:'video', notifAud:'all', editId:null, leaderMetric:'points' };
window.state = state;   // إتاحته لوحدة Firebase (إضافة الدروس/الإشعارات/تسليم التمارين)
const PTS_PER_CORRECT = 10;

/* ---------- حفظ البيانات محلياً (نموذج تجريبي مستقل) ---------- */
const DB_KEY='aljamieen_demo_v2';
(function loadDB(){ try{ const s=localStorage.getItem(DB_KEY); if(s){ const d=JSON.parse(s); for(const k in d) DB[k]=d[k]; } }catch(e){} })();
function saveDB(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(e){} }
function resetDemo(){ try{ localStorage.removeItem(DB_KEY); }catch(e){} location.reload(); }

/* ---------- أدوات ---------- */
function toast(msg){ Toast.textContent=msg; Toast.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>Toast.classList.remove('show'),2400); }
function go(route){ location.hash=route; }
function logout(){
  if(!confirm('هل تريد تسجيل الخروج؟')) return;
  if(window.firebaseSignOut){ window.firebaseSignOut(); }   // الموقع الحقيقي: خروج فعلي من Firebase
  else { go('#/login'); }                                   // النموذج المحلي: العودة لصفحة الدخول
}
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function dPart(v){ return (v||'').slice(0,10); }
function lessonDT(v){ return (v||'').includes('T') ? new Date(v) : new Date(dPart(v)+'T00:00:00'); }
function daysFrom(v){ const d=new Date(dPart(v)+'T00:00:00'), t=new Date(); t.setHours(0,0,0,0); return Math.round((t-d)/86400000); }
function isFuture(v){ return lessonDT(v).getTime() > Date.now(); }  // يقارن بالتاريخ والوقت معاً
function fmtTime(v){ if(!(v||'').includes('T')) return ''; const d=new Date(v); let h=d.getHours(); const m=String(d.getMinutes()).padStart(2,'0'); const ap=h<12?'ص':'م'; h=h%12||12; return ' • '+h+':'+m+' '+ap; }
function fmtDate(v){
  const diff=daysFrom(v);
  if(diff===0) return 'اليوم'; if(diff===1) return 'أمس';
  if(diff>1&&diff<7) return 'قبل '+diff+' أيام';
  if(diff<0){ const n=-diff; return n===1?'غداً':'بعد '+n+' أيام'; }
  const d=new Date(dPart(v)+'T00:00:00'); return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
}
function dtLocalValue(v){ const d=v?lessonDT(v):new Date(); const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes()); }
function courseActive(name){ const c=DB.courses.find(x=>x.name===name); return c?c.active:false; }
function isPublished(l){ return courseActive(l.course) && !isFuture(l.date); }
function studentLessons(){ return DB.lessons.filter(isPublished).slice().sort((a,b)=>b.date.localeCompare(a.date)); }
function activeCourses(){ return DB.courses.filter(c=>c.active); }
function courseById(id){ return DB.courses.find(c=>c.id===id); }
function subjectProgress(name){
  const ls=DB.lessons.filter(l=>l.course===name && !isFuture(l.date) && courseActive(name));
  const done=ls.filter(l=>l.done).length;
  return { done, total:ls.length, pct: ls.length?Math.round(done/ls.length*100):0 };
}
function certEarned(c){ if(!c||!c.cert||!c.cert.enabled||!c.active) return false; const p=subjectProgress(c.name); return p.total>0 && p.done===p.total; }
function certCourses(){ return DB.courses.filter(c=>c.cert&&c.cert.enabled&&c.active); }
function certDate(){ const d=new Date(DB.today+'T00:00:00'); return d.getDate()+' / '+(d.getMonth()+1)+' / '+d.getFullYear(); }
function adminLessons(){ return DB.lessons.slice().sort((a,b)=>b.date.localeCompare(a.date)); }
function exCount(id){ return (DB.exercises[id]||[]).length; }
function unreadCount(){ return visibleNotifs().filter(n=>n.unread).length; }

/* ---------- إشعارات: وقت نسبي + مسح من الطالب ---------- */
function arUnit(x, one, two, few, many){
  if(x===1) return one;
  if(x===2) return two;
  if(x>=3 && x<=10) return x+' '+few;
  return x+' '+many;
}
function notifTime(n){
  const ms = (n && n.createdAt && n.createdAt.seconds) ? n.createdAt.seconds*1000 : (n && n.ts ? n.ts : 0);
  if(!ms) return esc((n&&n.time)||'');
  const diff=Math.max(0, Date.now()-ms), MIN=60000, HR=3600000, DAY=86400000;
  if(diff < MIN) return 'الآن';
  if(diff < HR)  return 'قبل '+arUnit(Math.floor(diff/MIN),'دقيقة','دقيقتين','دقائق','دقيقة');
  if(diff < DAY) return 'قبل '+arUnit(Math.floor(diff/HR),'ساعة','ساعتين','ساعات','ساعة');
  if(diff < 7*DAY) return 'قبل '+arUnit(Math.floor(diff/DAY),'يوم','يومين','أيام','يوماً');
  const d=new Date(ms); return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
}
function notifDismissKey(){ return 'aljamieen_dismissed_'+((DB.me&&DB.me.id)||'local'); }
function getDismissed(){ try{ return JSON.parse(localStorage.getItem(notifDismissKey())||'[]'); }catch(e){ return []; } }
function saveDismissed(a){ try{ localStorage.setItem(notifDismissKey(), JSON.stringify(a)); }catch(e){} }
function visibleNotifs(){ const d=getDismissed(); return DB.notifications.filter(n=> d.indexOf(n.id)<0); }
function dismissNotif(id){ const d=getDismissed(); if(d.indexOf(id)<0){ d.push(id); saveDismissed(d); } toast('حُذف الإشعار'); render(); }
function clearNotifs(){ const d=getDismissed(); visibleNotifs().forEach(n=>{ if(d.indexOf(n.id)<0) d.push(n.id); }); saveDismissed(d); toast('تم مسح كل الإشعارات'); render(); }
function meStudent(){ return DB.students.find(s=>s.id===DB.me.sid); }
function meBlocked(){ const s=meStudent(); return !s || s.status==='معطّل'; }
function meRec(){ return meStudent() || {points:0,progress:0}; }
function mePoints(){ return meRec().points||0; }
function activeStudents(){ return DB.students.filter(s=> s.status!=='معطّل' && !s.status.includes('بانتظار')); }
function lessonStatus(l){
  if(!courseActive(l.course)) return {t:'مخفي',c:'badge-mut'};
  if(isFuture(l.date)) return {t:'مجدول '+fmtDate(l.date)+fmtTime(l.date),c:'badge-gold'};
  return {t:'منشور',c:'badge-green'};
}

/* ---------- إطار الشاشة ---------- */
function appbar(title, sub, opts={}){
  const back = opts.back ? `<button class="ab-btn ab-back" onclick="history.back()">‹</button>` : '';
  const brand = '';
  const bell = opts.bell ? `<button class="ab-btn" onclick="go('#/notifications')">🔔${unreadCount()?`<span class="ab-badge">${unreadCount()}</span>`:''}</button>` : '';
  return `<div class="appbar">${back}${brand}
    <div style="flex:1">${sub?`<span class="ab-sub">${esc(sub)}</span>`:''}<span class="ab-title">${esc(title)}</span></div>${bell}</div>`;
}
function studentTabs(a){ const t=(r,i,l)=>`<button class="tab ${a===r?'active':''}" onclick="go('#/${r}')"><span class="ti">${i}</span>${l}</button>`;
  return `<nav class="tabbar">${t('home','🏠','الرئيسية')}${t('lessons','📚','الدروس')}${t('leaders','🏆','المتصدّرون')}${t('notifications','🔔','الإشعارات')}${t('me','👤','حسابي')}</nav>`; }
function adminTabs(a){ const t=(r,i,l)=>`<button class="tab ${a===r?'active':''}" onclick="go('#/${r}')"><span class="ti">${i}</span>${l}</button>`;
  return `<nav class="tabbar">${t('admin','📊','اللوحة')}${t('admin/subjects','📂','المواد')}${t('admin/lessons','📚','الدروس')}${t('admin/students','👥','الطلاب')}${t('admin/notify','📣','إشعار')}</nav>`; }

/* ================= شاشات الطالب ================= */
function viewLogin(){
  return `<div class="auth">
    <h1 style="margin-top:10px;font-size:2.4rem">أكاديمية الجامعيين</h1>
    <p class="auth-sub" style="margin-top:8px">منصّة المتابعة العلمية الخاصة</p>
    <div class="auth-card">
      <button class="btn btn-primary btn-block" id="googleBtn">
        <span style="display:inline-flex;align-items:center;gap:10px;justify-content:center">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 16.3 2 9.7 6.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 46c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.5 36.4 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 41.6 16.2 46 24 46z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C40.9 36.3 44 30.7 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
          الدخول بحساب Google
        </span>
      </button>
      <p class="auth-note">دخول بنقرة واحدة وبدون كلمة سر. الدخول خاص بالأعضاء المعتمدين فقط — للانضمام تواصل مع المشرف.</p>
      <div class="divider"></div>
      <div class="field"><label>أو عبر رابط البريد</label><input type="email" id="loginEmail" inputmode="email" autocomplete="email" placeholder="example@mail.com"></div>
      <button class="btn btn-outline btn-block" id="emailLinkBtn">إرسال رابط الدخول</button>
    </div></div>`;
}

function viewBlocked(){
  const removed = !meStudent();
  const title = removed ? 'تم إنهاء حسابك' : 'حسابك معطّل مؤقتاً';
  const icon = removed ? '⛔' : '⏸️';
  return `<div class="auth" style="text-align:center;justify-content:center">
    <div style="font-size:3.6rem;margin-bottom:6px">${icon}</div>
    <h1>${title}</h1>
    <p class="auth-sub">يُرجى مراجعة المشرف</p>
    <div class="auth-card">
      <p class="muted">${removed?'تم إيقاف وصولك إلى المنصّة.':'تم إيقاف حسابك مؤقتاً من قِبل إدارة الأكاديمية.'} للاستفسار أو إعادة التفعيل، يُرجى التواصل مع المشرف.</p>
      <button class="btn btn-outline btn-block mt" onclick="go('#/login')">العودة لتسجيل الدخول</button>
    </div>
  </div>`;
}

function viewHome(){
  const me=DB.me, pub=studentLessons(), done=pub.filter(l=>l.done).length;
  const pct = pub.length?Math.round(done/pub.length*100):0;
  const top3 = activeStudents().slice().sort((a,b)=>b.points-a.points).slice(0,3);
  const medals=['🥇','🥈','🥉'];
  return appbar('السلام عليكم، '+me.name.split(' ')[0], 'أكاديمية الجامعيين', {bell:true, brand:true})
  + `<div class="screen">
    ${pushPrompt()}
    <div class="hero-card mb">
      <div style="font-weight:700">تقدّمك في البرنامج</div>
      <p class="aya">﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾</p>
      <div class="progress-row"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div><b style="color:var(--gold-400)">${pct}%</b></div>
    </div>
    <div class="stat-grid mb">
      <div class="stat"><b>${done}</b><span>درس مكتمل</span></div>
      <div class="stat"><b>${mePoints()}</b><span>نقاطي</span></div>
      <div class="stat"><b>${pub.length-done}</b><span>متبقٍ</span></div>
    </div>
    <div class="section-title"><h2>المتصدّرون</h2><a onclick="go('#/leaders')">الكل</a></div>
    <div class="card mb">${top3.map((s,i)=>`<div class="list-row" ${s.id===DB.me.sid?'style="background:var(--cream-50)"':''}>
        <span style="font-size:1.3rem;width:28px;text-align:center">${medals[i]}</span>
        <div class="avatar" style="background:${avatarColor(s.name)};width:36px;height:36px;font-size:.95rem">${esc(s.name[0])}</div>
        <div class="row-main"><h4>${esc(s.name)}${s.id===DB.me.sid?' <span class="badge badge-gold">أنت</span>':''}</h4></div>
        <b style="color:var(--gold-600)">${s.points} نقطة</b></div>`).join('')}</div>
    ${certCourses().length?`<div class="section-title"><h2>شهاداتي</h2><a onclick="go('#/certificates')">الكل</a></div>
    <div class="card card-pad mb" onclick="go('#/certificates')" style="display:flex;align-items:center;gap:12px;cursor:pointer">
      <div class="cert-ribbon earned">🎓</div>
      <div class="row-main"><h4>${certCourses().filter(certEarned).length} شهادة محصّلة</h4><p class="muted" style="font-size:.84rem">من ${certCourses().length} مواد فيها شهادات</p></div><span>›</span>
    </div>`:''}
    <div class="section-title"><h2>أحدث الدروس</h2><a onclick="go('#/lessons')">الكل</a></div>
    ${pub.length?`<div class="card">${pub.slice(0,4).map(lessonRow).join('')}</div>`
      :'<div class="empty"><div class="ei">📭</div>لا توجد دروس متاحة بعد</div>'}
  </div>` + studentTabs('home');
}

function lessonRow(l){
  const ico=l.type==='video'?'▶':'📖', cls=l.type==='video'?'thumb-video':'thumb-book';
  const solved = DB.me.quiz[l.id];
  return `<div class="lesson" onclick="go('#/lesson/${l.id}')">
    <div class="lesson-thumb ${cls}">${ico}</div>
    <div class="lesson-body"><h3>${esc(l.title)}</h3>
      <div class="lesson-meta">
        <span class="badge">${esc(l.course)}</span>
        <span class="badge ${l.type==='video'?'badge-red':'badge-gold'}">${l.type==='video'?l.minutes+' دقيقة':'قراءة'}</span>
        ${solved?`<span class="badge badge-green">حُلّت ${solved.correct}/${solved.total}</span>`:''}
        <span class="lesson-date">${fmtDate(l.date)}</span>
      </div></div>
    <div class="lesson-check ${l.done?'done':''}">✓</div></div>`;
}

function viewLessons(){
  const courses=['الكل', ...activeCourses().map(c=>c.name)];
  const active=courses.includes(state.lessonFilter)?state.lessonFilter:'الكل';
  let list=studentLessons(); if(active!=='الكل') list=list.filter(l=>l.course===active);
  let html='', last='';
  list.forEach(l=>{ const d=fmtDate(l.date); if(d!==last){ html+=`<div class="date-sep">${d}</div>`; last=d; } html+=`<div class="card mb">${lessonRow(l)}</div>`; });
  return appbar('الدروس','مرتّبة حسب التاريخ',{bell:true})
  + `<div class="screen">
      <div class="chip-row">${courses.map(c=>`<button class="chip ${active===c?'active':''}" onclick="setFilter('${esc(c)}')">${esc(c)}</button>`).join('')}</div>
      ${list.length?html:'<div class="empty"><div class="ei">📭</div>لا توجد دروس في هذه المادة بعد</div>'}
    </div>` + studentTabs('lessons');
}
function setFilter(c){ state.lessonFilter=c; render(); }

function viewLesson(id){
  const l=DB.lessons.find(x=>x.id===id); if(!l) return viewHome();
  const media = l.type==='video'
    ? `<div class="video-wrap mb"><iframe src="https://www.youtube.com/embed/${l.youtube}" allowfullscreen></iframe></div>`
    : `<div class="book-read mb"><div class="book-ico">📖</div><h3 style="color:var(--brown-800)">${esc(l.book)}</h3><p class="muted">الصفحات ${esc(l.pages)}</p><button class="btn btn-brown mt">فتح الكتاب للقراءة</button></div>`;
  const exs=DB.exercises[id]||[];
  const quiz=DB.me.quiz[id];
  let exHtml='';
  if(exs.length){
    if(quiz){
      const pct=Math.round(quiz.correct/quiz.total*100);
      exHtml = `<div class="section-title"><h2>التمارين</h2><span class="badge badge-green">تم الحل</span></div>
        <div class="card card-pad center mb" style="background:#e9f3ee;border-color:var(--green-600)">
          <div style="font-family:var(--display);font-size:2rem;color:var(--green-600)">${quiz.correct}/${quiz.total}</div>
          <div class="muted">نتيجتك ${pct}% · حصلت على <b style="color:var(--gold-600)">${quiz.points} نقطة</b></div>
        </div>
        ${exs.map((e,i)=>exerciseCard(e,i,id,true,quiz.answers[i])).join('')}
        <p class="auth-note">تُحلّ التمارين مرة واحدة فقط — لا يمكن إعادة الحل.</p>`;
    } else {
      exHtml = `<div class="section-title"><h2>التمارين</h2><span class="badge">${exs.length}</span></div>
        <div id="exWrap">${exs.map((e,i)=>exerciseCard(e,i,id,false)).join('')}</div>
        <button class="btn btn-green btn-block mt" onclick="submitQuiz('${id}')">تسليم الإجابات</button>
        <p class="auth-note">انتبه: تُحلّ مرة واحدة فقط، وتُحتسب لك النقاط (${PTS_PER_CORRECT} نقاط لكل إجابة صحيحة).</p>`;
    }
  }
  return appbar(l.type==='video'?'درس مرئي':'درس قراءة', esc(l.course), {back:true})
  + `<div class="screen">
      ${media}
      <h2 style="font-family:var(--display);color:var(--brown-800);font-size:1.3rem">${esc(l.title)}</h2>
      <p class="muted mb">${esc(l.desc)}</p>
      ${exHtml}
      <button class="btn ${l.done?'btn-outline':'btn-primary'} btn-block mt" onclick="toggleDone('${id}')">${l.done?'✓ تم إكمال هذا الدرس':'وضع علامة: أنهيت الدرس'}</button>
    </div>`;
}
function exerciseCard(e,i,lid,locked,ans){
  const opts=e.opts.map((o,j)=>{
    let cls='opt';
    if(locked){ if(j===e.answer) cls+=' correct'; else if(j===ans) cls+=' wrong'; }
    const click = locked?'style="cursor:default"':`onclick="selectOpt('${lid}',${i},${j})"`;
    const mark = locked&&j===e.answer ? '<span class="badge badge-green" style="margin-inline-start:auto">✓</span>'
               : (locked&&j===ans&&j!==e.answer ? '<span class="badge badge-red" style="margin-inline-start:auto">إجابتك</span>':'');
    return `<div class="${cls}" ${click} data-opt="${j}"><span class="dot"></span><span>${esc(o)}</span>${mark}</div>`;
  }).join('');
  return `<div class="exercise" data-ex="${i}"><h4>${i+1}. ${esc(e.q)}</h4>${opts}</div>`;
}
function selectOpt(lid,exi,opt){ state.answers[lid+'_'+exi]=opt;
  document.querySelectorAll(`[data-ex="${exi}"] .opt`).forEach(el=>{ el.classList.toggle('sel',+el.dataset.opt===opt); }); }
function submitQuiz(lid){
  const exs=DB.exercises[lid]||[]; if(!exs.length) return;
  for(let i=0;i<exs.length;i++){ if(state.answers[lid+'_'+i]===undefined){ toast('أجب على جميع الأسئلة قبل التسليم'); return; } }
  let correct=0; const answers={};
  exs.forEach((e,i)=>{ const a=state.answers[lid+'_'+i]; answers[i]=a; if(a===e.answer) correct++; });
  const points=correct*PTS_PER_CORRECT;
  DB.me.quiz[lid]={ answers, correct, total:exs.length, points };
  const ms=meRec(); if(ms.points!==undefined) ms.points+=points;
  // مسح الاختيارات المؤقتة لهذا الدرس
  exs.forEach((e,i)=>{ delete state.answers[lid+'_'+i]; });
  toast(`نتيجتك ${correct}/${exs.length} · +${points} نقطة`); render();
}
function toggleDone(id){ const l=DB.lessons.find(x=>x.id===id); l.done=!l.done; toast(l.done?'أحسنت! تم إكمال الدرس':'أُلغيت العلامة'); render(); }

/* ---------- المتصدّرون ---------- */
function viewLeaders(){
  const metric=state.leaderMetric;
  const all=activeStudents().slice().sort((a,b)=> metric==='points' ? b.points-a.points : b.progress-a.progress);
  const top=all.slice(0,5);
  const myRank=all.findIndex(s=>s.id===DB.me.sid)+1;
  const medal=r=> r===1?'🥇':r===2?'🥈':r===3?'🥉':`<span class="muted">#${r}</span>`;
  return appbar('المتصدّرون','أفضل ٥ طلاب',{bell:false})
  + `<div class="screen">
      <div class="hero-card mb center">
        <div class="muted" style="color:var(--cream-200)">ترتيبك ${metric==='points'?'بالنقاط':'بالالتزام'}</div>
        <div style="font-family:var(--display);font-size:2.4rem;color:var(--gold-400)">#${myRank}</div>
        <div class="muted" style="color:var(--cream-200)">${metric==='points'?mePoints()+' نقطة':meRec().progress+'% التزام'} · من ${all.length} طالب</div>
      </div>
      <div class="seg">
        <button class="${metric==='points'?'active':''}" onclick="setLeaderMetric('points')">🏆 الأكثر نقاطاً</button>
        <button class="${metric==='commitment'?'active':''}" onclick="setLeaderMetric('commitment')">🔥 الأكثر التزاماً</button>
      </div>
      <div class="card">${top.map((s,i)=>{ const r=i+1; const me=s.id===DB.me.sid;
        return `<div class="list-row" ${me?'style="background:var(--cream-50)"':''}>
          <span style="font-size:1.25rem;width:30px;text-align:center">${medal(r)}</span>
          <div class="avatar" style="background:${avatarColor(s.name)}">${esc(s.name[0])}</div>
          <div class="row-main"><h4>${esc(s.name)}${me?' <span class="badge badge-gold">أنت</span>':''}</h4>
            <p>${metric==='points'?'الالتزام '+s.progress+'%':s.points+' نقطة'} · ${s.lessonsDone} دروس</p></div>
          <b style="color:var(--gold-600)">${metric==='points'?s.points+' نقطة':s.progress+'%'}</b>
        </div>`;}).join('')}</div>
      <p class="auth-note mt">النقاط تُحتسب من حل التمارين (${PTS_PER_CORRECT} نقاط لكل إجابة صحيحة). الالتزام = نسبة إكمال الدروس.</p>
    </div>` + studentTabs('leaders');
}
function setLeaderMetric(m){ state.leaderMetric=m; render(); }

function viewNotifications(){
  const list = visibleNotifs();
  list.forEach(n=>n.unread=false);
  const clearBar = list.length>1
    ? `<div style="display:flex;justify-content:flex-start;margin-bottom:10px"><button class="btn btn-outline" style="padding:6px 14px;font-size:.84rem" onclick="clearNotifs()">🗑️ مسح الكل</button></div>`
    : '';
  const body = list.length
    ? `<div class="card">${list.map(n=>`
      <div class="notif ${n.unread?'unread':''}">
        <div class="notif-ico ${n.type==='private'?'private':''}">${n.type==='private'?'✉️':'📣'}</div>
        <div class="notif-body"><h4>${esc(n.title)} ${n.type==='private'?'<span class="badge badge-gold">خاص</span>':''}</h4>
        <p>${esc(n.body)}</p><div class="notif-time">${notifTime(n)}</div></div>
        <button title="حذف" onclick="dismissNotif('${n.id}')" style="flex-shrink:0;align-self:flex-start;background:none;border:0;color:var(--muted);font-size:1.05rem;cursor:pointer;padding:2px 4px;line-height:1">✕</button>
      </div>`).join('')}</div>`
    : `<div class="empty"><div class="ei">🔔</div>لا توجد إشعارات</div>`;
  return appbar('الإشعارات','من المشرف')
  + `<div class="screen">${clearBar}${body}</div>`
  + studentTabs('notifications');
}

function pushPrompt(){
  if(typeof Notification==='undefined') return '';
  if(Notification.permission==='granted') return '';
  const denied = Notification.permission==='denied';
  return `<div class="card card-pad mb" style="border:1px solid var(--gold-500);background:#fdf6e6;text-align:center">
    <div style="font-size:1.7rem">🔔</div>
    <b style="color:var(--brown-800)">فعّل إشعارات الهاتف</b>
    <p class="muted" style="font-size:.84rem;margin:6px 0 10px">${denied?'الإشعارات محظورة في إعدادات المتصفّح — فعّلها من إعدادات الموقع (🔒) ثم أعد المحاولة.':'لتصلك الدروس والرسائل كإشعار على جهازك مباشرة.'}</p>
    <button class="btn btn-primary btn-block" onclick="window.enablePush&&window.enablePush()">تفعيل الإشعارات الآن</button>
  </div>`;
}

function viewMe(){
  const me=DB.me, pub=studentLessons(), done=pub.filter(l=>l.done).length;
  return appbar('حسابي','الملف الشخصي')
  + `<div class="screen">
      <div class="card card-pad center mb">
        <div class="avatar" style="width:74px;height:74px;font-size:1.8rem;margin:0 auto 10px;background:${avatarColor(me.name)}">${esc(me.name[0])}</div>
        <h2 style="font-family:var(--display);color:var(--brown-800)">${esc(me.name)}</h2>
        <p class="muted">عضو منذ ${esc(me.joined)}</p>
      </div>
      <div class="stat-grid mb">
        <div class="stat"><b>${done}</b><span>دروس</span></div>
        <div class="stat"><b>${mePoints()}</b><span>نقاطي</span></div>
        <div class="stat"><b>${pub.length?Math.round(done/pub.length*100):0}%</b><span>الإنجاز</span></div>
      </div>
      ${pushPrompt()}
      <div class="card">
        <div class="list-row" onclick="go('#/certificates')"><span style="font-size:1.2rem">🎓</span><div class="row-main"><h4>شهاداتي</h4><p>الشهادات التي حصلت عليها</p></div><span>›</span></div>
        <div class="list-row" onclick="go('#/badges')"><span style="font-size:1.2rem">🏅</span><div class="row-main"><h4>شاراتي</h4><p>إنجازاتك ووسامك</p></div><span>›</span></div>
        <div class="list-row" onclick="go('#/leaders')"><span style="font-size:1.2rem">🏆</span><div class="row-main"><h4>المتصدّرون</h4><p>ترتيبك بين الطلاب</p></div><span>›</span></div>
        <div class="list-row"><span style="font-size:1.2rem">🔔</span><div class="row-main"><h4>إشعارات الهاتف</h4><p>مفعّلة</p></div><span class="badge badge-green">مُفعّل</span></div>
        <div class="list-row" onclick="logout()" style="cursor:pointer"><span style="font-size:1.2rem">🚪</span><div class="row-main"><h4 style="color:var(--danger)">تسجيل الخروج</h4></div><span>›</span></div>
      </div>
      <p class="auth-note mt">نموذج تجريبي — البيانات وهمية وغير مرتبطة بحساب حقيقي بعد.</p>
    </div>` + studentTabs('me');
}

/* ---------- الشهادات (الطالب) ---------- */
function certBody(c, name){
  return `<div class="cert-inner">
    <div class="cert-acad" style="margin-top:6px">أكاديمية الجامعيين</div>
    <div class="cert-title">${esc(c.cert.title||('شهادة إتمام مادة '+c.name))}</div>
    <div class="cert-orn">۞ ❁ ۞</div>
    <p class="cert-pre">تشهد أكاديمية الجامعيين بأن الطالب</p>
    <div class="cert-name">${esc(name)}</div>
    <p class="cert-pre">قد أتمّ بنجاح متطلبات مادة</p>
    <div class="cert-course">${esc(c.name)}</div>
    <p class="cert-date">بتاريخ ${certDate()}</p>
    <div class="cert-sign"><div>${esc(c.cert.signer||'إدارة الأكاديمية')}</div></div>
    <div class="cert-seal">★</div>
  </div>`;
}
function viewCertificates(){
  const list=certCourses();
  return appbar('شهاداتي','إنجازك العلمي',{back:true})
  + `<div class="screen">
      ${list.length?`<div class="card">${list.map(c=>{
        const earned=certEarned(c), p=subjectProgress(c.name);
        return `<div class="cert-card">
          <div class="cert-ribbon ${earned?'earned':'locked'}">${earned?'🎓':'🔒'}</div>
          <div class="row-main"><h4>${esc(c.cert.title||('شهادة '+c.name))}</h4>
            ${earned?'<span class="badge badge-green">حصلت عليها</span>'
              :`<p class="muted" style="font-size:.82rem">أكمل دروس المادة (${p.done}/${p.total})</p>
                <div class="progress-bar" style="margin-top:6px;background:var(--cream-100)"><div class="progress-fill" style="width:${p.pct}%"></div></div>`}
          </div>
          ${earned?`<button class="btn btn-primary btn-sm" onclick="go('#/certificate/${c.id}')">عرض</button>`:''}
        </div>`;}).join('')}</div>`
        :'<div class="empty"><div class="ei">🎓</div>لا توجد شهادات متاحة بعد</div>'}
    </div>` + studentTabs('me');
}
function viewCertificate(id){
  const c=courseById(id); if(!c||!c.cert) return viewCertificates();
  if(!certEarned(c)) return appbar('الشهادة','',{back:true})+`<div class="screen"><div class="empty"><div class="ei">🔒</div>لم تُكمل متطلبات هذه الشهادة بعد</div></div>`+studentTabs('me');
  return appbar('الشهادة', esc(c.name), {back:true})
  + `<div class="screen">
      <div class="cert">${certBody(c, DB.me.name)}</div>
      <button class="btn btn-primary btn-block mt" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    </div>` + studentTabs('me');
}

/* ---------- الشارات (إنجازات الطالب) ---------- */
const BADGES=[
  {id:'start',   icon:'🌅', title:'البداية المباركة', desc:'أكملت أول درس',          test:()=>studentLessons().filter(l=>l.done).length>=1},
  {id:'five',    icon:'🔥', title:'مُلتزم',           desc:'أكملت ٥ دروس',            test:()=>studentLessons().filter(l=>l.done).length>=5},
  {id:'master',  icon:'📜', title:'حافظ المتن',       desc:'أتممت مادةً كاملة',        test:()=>DB.courses.some(c=>{const p=subjectProgress(c.name);return c.active&&p.total>0&&p.done===p.total;})},
  {id:'perfect', icon:'🎯', title:'مُتقن',            desc:'أجبت تمارين درس كاملةً',   test:()=>Object.values(DB.me.quiz||{}).some(q=>q.total>0&&q.correct===q.total)},
  {id:'star',    icon:'⭐', title:'نجم الأكاديمية',   desc:'تجاوزت ١٠٠ نقطة',          test:()=>mePoints()>=100},
  {id:'top',     icon:'🏅', title:'المتصدّر',         desc:'دخلت أفضل ٣ طلاب',         test:()=>{const a=activeStudents().slice().sort((x,y)=>y.points-x.points);return mePoints()>0 && a.findIndex(s=>s.id===DB.me.sid)<3 && a.findIndex(s=>s.id===DB.me.sid)>=0;}},
];
function earnedBadges(){ return BADGES.filter(b=>{ try{ return b.test(); }catch(e){ return false; } }); }
function viewBadges(){
  const earned=new Set(earnedBadges().map(b=>b.id));
  return appbar('شاراتي','إنجازاتك',{back:true})
  + `<div class="screen">
      <div class="hero-card mb center">
        <div style="font-family:var(--display);font-size:2.2rem;color:var(--gold-400)">${earned.size}/${BADGES.length}</div>
        <div class="muted" style="color:var(--cream-200)">شارة محصّلة</div>
      </div>
      <div class="badge-grid">${BADGES.map(b=>{ const e=earned.has(b.id);
        return `<div class="badge-item ${e?'':'locked'}">
          <div class="badge-emoji">${b.icon}</div>
          <h4>${b.title}</h4><p>${b.desc}</p>
          <span class="badge ${e?'badge-green':'badge-mut'}">${e?'محصّلة ✓':'مقفلة'}</span>
        </div>`;}).join('')}</div>
    </div>` + studentTabs('me');
}

/* ================= لوحة المشرف ================= */
function viewAdmin(){
  const active=activeStudents();
  const pending=DB.students.filter(s=>s.status.includes('بانتظار')).length;
  const avg=active.length?Math.round(active.reduce((a,s)=>a+s.progress,0)/active.length):0;
  const scheduled=DB.lessons.filter(l=>isFuture(l.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const published=DB.lessons.filter(l=>!isFuture(l.date)).length;
  return appbar('لوحة المشرف','أكاديمية الجامعيين',{brand:true})
  + `<div class="screen">
      ${pushPrompt()}
      <div class="stat-grid mb">
        <div class="stat"><b>${active.length}</b><span>طالب</span></div>
        <div class="stat"><b>${published}</b><span>درس منشور</span></div>
        <div class="stat"><b>${avg}%</b><span>متوسط التقدّم</span></div>
      </div>
      ${pending?`<div class="card card-pad mb" style="border-color:var(--gold-500);background:#fdf6e6">
        <b>⏳ ${pending} طلب انضمام بانتظار موافقتك</b>
        <button class="btn btn-primary btn-sm btn-block mt" onclick="go('#/admin/students')">مراجعة الطلبات</button></div>`:''}
      <div class="section-title"><h2>إجراءات سريعة</h2></div>
      <div class="card mb">
        <div class="list-row" onclick="go('#/admin/lessons')"><span style="font-size:1.3rem">📚</span><div class="row-main"><h4>إدارة الدروس</h4><p>إضافة · تعديل · حذف · التمارين</p></div><span>›</span></div>
        <div class="list-row" onclick="go('#/admin/subjects')"><span style="font-size:1.3rem">📂</span><div class="row-main"><h4>إدارة المواد الظاهرة</h4><p>تفعيل/إخفاء المواد للطلاب</p></div><span>›</span></div>
        <div class="list-row" onclick="go('#/admin/notify')"><span style="font-size:1.3rem">📣</span><div class="row-main"><h4>إرسال إشعار</h4><p>للجميع أو لطالب محدّد</p></div><span>›</span></div>
      </div>
      <div class="section-title"><h2>الدروس المجدولة</h2><span class="badge">${scheduled.length}</span></div>
      ${scheduled.length?`<div class="card">${scheduled.map(l=>`
        <div class="list-row" onclick="go('#/admin/edit/${l.id}')"><span style="font-size:1.2rem">${l.type==='video'?'▶':'📖'}</span>
          <div class="row-main"><h4>${esc(l.title)}</h4><p>${esc(l.course)}</p></div>
          <span class="badge badge-gold">${fmtDate(l.date)}</span></div>`).join('')}</div>`
        :'<div class="empty">لا توجد دروس مجدولة</div>'}
      <button class="btn btn-ghost btn-block" style="margin-top:20px;color:var(--muted);font-size:.84rem" onclick="if(confirm('إعادة كل بيانات النموذج إلى وضعها الأصلي؟'))resetDemo()">↺ إعادة تعيين بيانات النموذج</button>
    </div>` + adminTabs('admin');
}

function viewAdminSubjects(){
  return appbar('المواد والشهادات','إظهار للطلاب · شهادة لكل مادة',{back:true})
  + `<div class="screen">
      <div class="card card-pad mb" style="background:var(--cream-50)">
        <p class="muted" style="font-size:.9rem">المادة <b>المفعّلة</b> تظهر دروسها للطلاب. وأضف <b>شهادة</b> لأي مادة يحصل عليها الطالب عند إكمالها.</p>
      </div>
      ${DB.courses.map(c=>{
        const count=DB.lessons.filter(l=>l.course===c.name).length;
        const hasCert=c.cert&&c.cert.enabled;
        return `<div class="card card-pad mb">
          <div style="display:flex;gap:11px;align-items:center">
            <div class="avatar" style="background:${c.active?'var(--green-600)':'var(--muted)'};font-size:1rem">${esc(c.name[0])}</div>
            <div style="flex:1;min-width:0"><h4 style="color:var(--brown-800)">${esc(c.name)}</h4>
              <p class="muted" style="font-size:.84rem">${count} درس${hasCert?' · 🎓 شهادة مفعّلة':''}</p></div>
          </div>
          <div style="display:flex;gap:7px;margin-top:11px;flex-wrap:wrap">
            <button class="btn btn-sm ${c.active?'btn-green':'btn-outline'}" onclick="toggleSubject('${c.id}')">${c.active?'ظاهرة ✓':'إظهار'}</button>
            <button class="btn btn-outline btn-sm" onclick="go('#/admin/cert/${c.id}')">🎓 الشهادة</button>
          </div>
        </div>`;}).join('')}
      <div class="card card-pad">
        <div class="field"><label>إضافة مادة جديدة</label><input id="newSubj" placeholder="مثال: السيرة النبوية"></div>
        <button class="btn btn-primary btn-block" onclick="addSubject()">إضافة المادة</button>
      </div>
    </div>` + adminTabs('admin/subjects');
}
function toggleSubject(id){ const c=DB.courses.find(x=>x.id===id); c.active=!c.active; toast(c.active?`«${c.name}» صارت ظاهرة للطلاب`:`«${c.name}» أُخفيت عن الطلاب`); render(); }
function viewAdminCert(id){
  const c=courseById(id); if(!c) return viewAdminSubjects();
  if(!c.cert) c.cert={enabled:false,title:'',signer:'إدارة أكاديمية الجامعيين'};
  const title=c.cert.title||('شهادة إتمام مادة '+c.name);
  return appbar('شهادة المادة', esc(c.name), {back:true})
  + `<div class="screen">
      <div class="card card-pad mb">
        <label style="display:flex;align-items:center;gap:10px;font-weight:700;color:var(--brown-700)">
          <input type="checkbox" id="cEnabled" ${c.cert.enabled?'checked':''} style="width:20px;height:20px;accent-color:var(--green-600)">
          تفعيل شهادة لهذه المادة
        </label>
        <div class="field mt"><label>عنوان الشهادة</label><input id="cTitle" value="${esc(title)}"></div>
        <div class="field"><label>جهة التوقيع</label><input id="cSigner" value="${esc(c.cert.signer||'إدارة أكاديمية الجامعيين')}"></div>
        <button class="btn btn-primary btn-block mt" onclick="saveCert('${c.id}')">💾 حفظ</button>
        <p class="auth-note mt">يحصل الطالب على الشهادة تلقائياً عند إكمال جميع دروس المادة المنشورة.</p>
      </div>
      <div class="section-title"><h2>معاينة</h2></div>
      <div class="cert cert-mini">${certBody({name:c.name,cert:{title,signer:c.cert.signer}}, 'اسم الطالب')}</div>
    </div>` + adminTabs('admin/subjects');
}
function saveCert(id){ const c=courseById(id);
  c.cert.enabled=document.getElementById('cEnabled').checked;
  c.cert.title=document.getElementById('cTitle').value.trim()||('شهادة إتمام مادة '+c.name);
  c.cert.signer=document.getElementById('cSigner').value.trim()||'إدارة أكاديمية الجامعيين';
  toast(c.cert.enabled?'تم حفظ الشهادة وتفعيلها':'تم الحفظ (الشهادة غير مفعّلة)'); go('#/admin/subjects');
}
function addSubject(){ const v=document.getElementById('newSubj').value.trim(); if(!v){ toast('اكتب اسم المادة'); return; }
  DB.courses.push({id:'c'+Date.now(),name:v,active:true}); toast('أُضيفت «'+v+'» وهي ظاهرة للطلاب'); render(); }

/* ---------- إدارة الدروس ---------- */
function viewAdminLessons(){
  const list=adminLessons();
  return appbar('إدارة الدروس','إضافة · تعديل · حذف',{back:true})
  + `<div class="screen">
      <button class="btn btn-primary btn-block mb" onclick="go('#/admin/add')">➕ إضافة درس جديد</button>
      ${list.map(l=>{ const st=lessonStatus(l), ico=l.type==='video'?'▶':'📖', cls=l.type==='video'?'thumb-video':'thumb-book';
        return `<div class="card card-pad mb">
          <div style="display:flex;gap:11px;align-items:flex-start">
            <div class="lesson-thumb ${cls}" style="width:46px;height:46px;font-size:1.2rem">${ico}</div>
            <div style="flex:1;min-width:0">
              <h3 style="color:var(--brown-800);font-size:1rem">${esc(l.title)}</h3>
              <div class="lesson-meta"><span class="badge">${esc(l.course)}</span><span class="badge ${st.c}">${st.t}</span></div>
            </div>
          </div>
          <div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="go('#/admin/edit/${l.id}')">✏️ تعديل</button>
            <button class="btn btn-outline btn-sm" onclick="go('#/admin/exercises/${l.id}')">📝 التمارين (${exCount(l.id)})</button>
            <button class="btn btn-danger btn-sm" onclick="deleteLesson('${l.id}')">🗑️ حذف</button>
          </div>
        </div>`;}).join('')}
    </div>` + adminTabs('admin/lessons');
}
function deleteLesson(id){
  const l=DB.lessons.find(x=>x.id===id); if(!l) return;
  if(!window.confirm('حذف الدرس «'+l.title+'»؟ لا يمكن التراجع.')) return;
  DB.lessons=DB.lessons.filter(x=>x.id!==id); delete DB.exercises[id];
  toast('تم حذف الدرس'); render();
}

/* ---------- نموذج إضافة / تعديل ---------- */
function viewLessonForm(editId){
  const ed = editId ? DB.lessons.find(l=>l.id===editId) : null;
  state.editId = ed ? editId : null;
  state.addType = ed ? ed.type : 'video';
  const isV = state.addType==='video';
  const val=(v)=>esc(v||'');
  return appbar(ed?'تعديل الدرس':'إضافة درس', ed?'حفظ التغييرات':'جدولة بالتاريخ', {back:true})
  + `<div class="screen">
      <div class="seg">
        <button class="${isV?'active':''}" id="segVideo" onclick="segType('video')">▶ مقطع يوتيوب</button>
        <button class="${isV?'':'active'}" id="segBook" onclick="segType('book')">📖 قراءة كتاب</button>
      </div>
      <div class="card card-pad">
        <div class="field"><label>عنوان الدرس</label><input id="fTitle" placeholder="مثال: شرح باب الإيمان" value="${val(ed&&ed.title)}"></div>
        <div class="field"><label>المادة (التصنيف)</label>
          <select id="fCourse">${DB.courses.map(c=>`<option value="${esc(c.name)}" ${ed&&ed.course===c.name?'selected':''}>${esc(c.name)}${c.active?'':' (مخفية)'}</option>`).join('')}</select></div>
        <div id="fldVideo" style="display:${isV?'':'none'}"><div class="field"><label>رابط يوتيوب أو المعرّف</label><input id="fYoutube" placeholder="https://youtu.be/..." value="${val(ed&&ed.youtube)}"></div></div>
        <div id="fldBook" style="display:${isV?'none':''}">
          <div class="field"><label>اسم الكتاب</label><input id="fBook" placeholder="مثال: الأصول الثلاثة" value="${val(ed&&ed.book)}"></div>
          <div class="field"><label>الصفحات</label><input id="fPages" placeholder="مثال: 1-8" value="${val(ed&&ed.pages)}"></div>
        </div>
        <div class="field"><label>تاريخ ووقت النشر</label><input id="fDate" type="datetime-local" value="${dtLocalValue((ed&&ed.date)||'')}"></div>
        <div class="field"><label>وصف مختصر</label><textarea id="fDesc" rows="2" placeholder="نبذة عن الدرس...">${val(ed&&ed.desc)}</textarea></div>
        <button class="btn btn-primary btn-block mt" onclick="saveLesson()">${ed?'💾 حفظ التعديلات':'حفظ الدرس'}</button>
        ${ed?`<button class="btn btn-outline btn-block mt" onclick="go('#/admin/exercises/${ed.id}')">📝 إدارة التمارين (${exCount(ed.id)})</button>
             <button class="btn btn-danger btn-block mt" onclick="deleteLesson('${ed.id}')">🗑️ حذف الدرس</button>`:''}
        <p class="auth-note mt">حدّد التاريخ <b>والوقت</b>. لو اخترت موعداً مستقبلياً، يُجدوَل الدرس ويظهر للطلاب تلقائياً في لحظته المحددة — بدون رفع يدوي.</p>
      </div>
    </div>` + adminTabs('admin/lessons');
}
function segType(t){ state.addType=t;
  document.getElementById('segVideo').classList.toggle('active',t==='video');
  document.getElementById('segBook').classList.toggle('active',t==='book');
  document.getElementById('fldVideo').style.display=t==='video'?'':'none';
  document.getElementById('fldBook').style.display=t==='book'?'':'none';
}
function ytId(u){ if(!u) return 'dQw4w9WgXcQ'; const m=u.match(/(?:v=|be\/|embed\/)([\w-]{11})/); return m?m[1]:u.slice(0,11); }
function saveLesson(){
  const t=document.getElementById('fTitle').value.trim(); if(!t){ toast('اكتب عنوان الدرس'); return; }
  const course=document.getElementById('fCourse').value, date=document.getElementById('fDate').value;
  const type=state.addType, desc=document.getElementById('fDesc').value;
  const media = type==='video'
    ? { youtube: ytId(document.getElementById('fYoutube').value), minutes: 20 }
    : { book: document.getElementById('fBook').value||'كتاب', pages: document.getElementById('fPages').value||'—' };
  if(state.editId){
    const l=DB.lessons.find(x=>x.id===state.editId);
    l.title=t; l.course=course; l.date=date; l.type=type; l.desc=desc;
    if(type==='video'){ l.youtube=media.youtube; l.minutes=media.minutes; delete l.book; delete l.pages; }
    else { l.book=media.book; l.pages=media.pages; delete l.youtube; delete l.minutes; }
    toast('تم حفظ التعديلات'); go('#/admin/lessons'); return;
  }
  const l={ id:'l'+Date.now(), type, title:t, course, date, desc, done:false, ...media };
  DB.lessons.unshift(l);
  if(isFuture(date)) toast('تمت جدولة الدرس — يظهر للطلاب '+fmtDate(date)+fmtTime(date));
  else if(!courseActive(course)) toast('حُفظ الدرس، لكن مادة «'+course+'» مخفية — فعّلها ليظهر للطلاب');
  else { DB.notifications.unshift({id:'n'+Date.now(),type:'public',title:'درس جديد متاح',body:'تم نشر «'+t+'».',time:'الآن',ts:Date.now(),unread:true}); toast('تم نشر الدرس وإرسال إشعار للطلاب'); }
  go('#/admin/lessons');
}

/* ---------- محرّر التمارين ---------- */
function viewExercises(id){
  const l=DB.lessons.find(x=>x.id===id); if(!l) return viewAdminLessons();
  const exs=DB.exercises[id]||[];
  return appbar('تمارين الدرس', esc(l.title), {back:true})
  + `<div class="screen">
      ${exs.length?exs.map((e,i)=>`<div class="card card-pad mb">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <h4 style="color:var(--brown-800)">${i+1}. ${esc(e.q)}</h4>
            <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${id}',${i})">حذف</button>
          </div>
          <div class="mt">${e.opts.map((o,j)=>`<div class="opt ${j===e.answer?'correct':''}" style="cursor:default">
            <span class="dot"></span><span>${esc(o)}</span>${j===e.answer?'<span class="badge badge-green" style="margin-inline-start:auto">الإجابة ✓</span>':''}</div>`).join('')}</div>
        </div>`).join('')
        :'<div class="empty"><div class="ei">📝</div>لا توجد تمارين بعد — أضف أول سؤال</div>'}

      <div class="card card-pad mt">
        <h3 style="font-family:var(--display);color:var(--brown-800);margin-bottom:12px">إضافة سؤال جديد</h3>
        <div class="field"><label>نص السؤال</label><textarea id="qText" rows="2" placeholder="اكتب السؤال هنا..."></textarea></div>
        <label style="font-weight:700;font-size:.88rem;color:var(--brown-700)">الخيارات — حدّد الإجابة الصحيحة</label>
        ${[0,1,2,3].map(i=>`<div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input type="radio" name="qCorrect" value="${i}" style="width:20px;height:20px;accent-color:var(--green-600)" ${i===0?'checked':''}>
          <input id="qOpt${i}" placeholder="الخيار ${i+1}${i>1?' (اختياري)':''}" style="flex:1;padding:11px 13px;border:1.5px solid var(--line);border-radius:var(--r-sm)">
        </div>`).join('')}
        <button class="btn btn-green btn-block mt" onclick="addQuestion('${id}')">➕ إضافة السؤال</button>
        <p class="auth-note mt">حدّد الدائرة بجانب الإجابة الصحيحة. الخياران الأولان مطلوبان.</p>
      </div>
    </div>` + adminTabs('admin/lessons');
}
function addQuestion(id){
  const q=document.getElementById('qText').value.trim();
  if(!q){ toast('اكتب نص السؤال'); return; }
  const raw=[0,1,2,3].map(i=>({ v:document.getElementById('qOpt'+i).value.trim(),
    checked:document.querySelector('input[name=qCorrect][value="'+i+'"]').checked }));
  const filled=raw.filter(o=>o.v);
  if(filled.length<2){ toast('أضف خيارين على الأقل'); return; }
  const correctRaw=raw.find(o=>o.checked);
  if(!correctRaw || !correctRaw.v){ toast('حدّد الإجابة الصحيحة (من بين الخيارات المكتوبة)'); return; }
  const answer=filled.indexOf(correctRaw);
  if(!DB.exercises[id]) DB.exercises[id]=[];
  DB.exercises[id].push({ q, opts:filled.map(o=>o.v), answer });
  const l=DB.lessons.find(x=>x.id===id); if(l) l.exercises=DB.exercises[id].length;
  toast('أُضيف السؤال'); render();
}
function deleteQuestion(id,idx){
  if(!DB.exercises[id]) return;
  DB.exercises[id].splice(idx,1);
  const l=DB.lessons.find(x=>x.id===id); if(l) l.exercises=DB.exercises[id].length;
  toast('حُذف السؤال'); render();
}

function viewAdminStudents(){
  const stBadge=(st)=> st==='نشط'?'badge-green': st==='متعثّر'?'badge-red': st==='معطّل'?'badge-mut':'badge-gold';
  const admins=(DB.admins||[]);
  const fae=String(window.FIRST_ADMIN_EMAIL||'').toLowerCase();
  const adminsHtml = admins.length ? `<div class="section-title"><h2>المشرفون (${admins.length})</h2></div>`
    + admins.map(a=>{ const canDemote = a.id!==DB.me.id && (a.email||'').toLowerCase()!==fae;
      return `<div class="card card-pad mb">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="avatar" style="background:var(--gold-600)">👑</div>
          <div style="flex:1;min-width:0"><h4 style="color:var(--brown-800)">${esc(a.name||a.email||'مشرف')} <span class="badge badge-gold">مشرف</span></h4>
          <p class="muted" style="font-size:.84rem">${esc(a.email||'')}</p></div>
        </div>
        ${canDemote?`<div style="margin-top:10px"><button class="btn btn-outline btn-sm" onclick="makeStudent('${a.id}')">↩️ إرجاع إلى طالب</button></div>`
          :`<p class="auth-note">${a.id===DB.me.id?'أنت':'المشرف الرئيسي'}</p>`}
      </div>`;}).join('')
    + `<div class="section-title"><h2>الطلاب (${DB.students.length})</h2></div>` : '';
  return appbar('الطلاب','إدارة · متابعة · صلاحيات',{back:true})
  + `<div class="screen">${adminsHtml}${DB.students.map(s=>{
      const pend=s.status.includes('بانتظار'), off=s.status==='معطّل';
      const nm=esc(s.name.replace('طلب انضمام: ',''));
      let actions;
      if(pend) actions=`<button class="btn btn-green btn-sm" onclick="approve('${s.id}')">قبول</button>
        <button class="btn btn-outline btn-sm" onclick="rejectStudent('${s.id}')">رفض</button>`;
      else if(off) actions=`<button class="btn btn-green btn-sm" onclick="enableStudent('${s.id}')">▶️ تفعيل</button>
        <button class="btn btn-danger btn-sm" onclick="removeStudent('${s.id}')">🚫 طرد</button>`;
      else actions=`<button class="btn btn-gold btn-sm" onclick="makeAdmin('${s.id}')">👑 ترقية لمشرف</button>
        <button class="btn btn-outline btn-sm" onclick="disableStudent('${s.id}')">⏸️ تعطيل</button>
        <button class="btn btn-danger btn-sm" onclick="removeStudent('${s.id}')">🚫 طرد</button>`;
      return `<div class="card card-pad mb" style="${off?'opacity:.65':''}">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="avatar" style="background:${off?'var(--muted)':avatarColor(s.name)}">${esc(nm[0])}</div>
          <div style="flex:1;min-width:0">
            <h4 style="color:var(--brown-800)">${nm} <span class="badge ${stBadge(s.status)}">${esc(s.status)}</span></h4>
            ${pend?`<p class="muted" style="font-size:.84rem">طلب جديد · يحتاج موافقة</p>`
              :`<p class="muted" style="font-size:.84rem">${s.lessonsDone} دروس · ${s.points} نقطة · ${esc(s.last)}</p>
                <div class="progress-bar" style="margin-top:6px;background:var(--cream-100)"><div class="progress-fill" style="width:${s.progress}%"></div></div>`}
          </div>
        </div>
        <div style="display:flex;gap:7px;margin-top:11px;flex-wrap:wrap">${actions}</div>
      </div>`;}).join('')}
      <p class="auth-note">«تعطيل» يوقف دخول الطالب مؤقتاً مع الاحتفاظ ببياناته. «طرد» يحذف الحساب نهائياً.</p>
    </div>` + adminTabs('admin/students');
}
function approve(id){ const s=DB.students.find(x=>x.id===id); if(s){ s.status='نشط'; s.name=s.name.replace('طلب انضمام: ',''); s.last='اليوم'; } toast('تمت الموافقة — أُرسل رابط الدخول تلقائياً للطالب'); render(); }
function rejectStudent(id){ const s=DB.students.find(x=>x.id===id); if(!s) return; if(!window.confirm('رفض طلب «'+s.name.replace('طلب انضمام: ','')+'»؟')) return; DB.students=DB.students.filter(x=>x.id!==id); toast('تم رفض الطلب'); render(); }
function disableStudent(id){ const s=DB.students.find(x=>x.id===id); if(!s) return; s.status='معطّل'; toast('تم تعطيل الحساب — لن يستطيع الطالب الدخول'); render(); }
function enableStudent(id){ const s=DB.students.find(x=>x.id===id); if(!s) return; s.status='نشط'; toast('تم تفعيل الحساب'); render(); }
function removeStudent(id){ const s=DB.students.find(x=>x.id===id); if(!s) return; if(!window.confirm('طرد «'+s.name.replace('طلب انضمام: ','')+'» وحذف حسابه نهائياً؟')) return; DB.students=DB.students.filter(x=>x.id!==id); toast('تم طرد الطالب'); render(); }

function viewAdminNotify(){
  return appbar('إرسال إشعار','يصل كإشعار على الهاتف',{back:true})
  + `<div class="screen">
      <div class="seg">
        <button class="active" id="segAll" onclick="notifAud('all')">📣 للجميع</button>
        <button id="segOne" onclick="notifAud('one')">✉️ لطالب محدّد</button>
      </div>
      <div class="card card-pad">
        <div class="field" id="fldTarget" style="display:none"><label>الطالب</label>
          <select id="nTarget">${activeStudents().map(s=>`<option>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>عنوان الإشعار</label><input id="nTitle" placeholder="مثال: تذكير بالدرس"></div>
        <div class="field"><label>نص الرسالة</label><textarea id="nBody" rows="3" placeholder="اكتب رسالتك..."></textarea></div>
        <button class="btn btn-primary btn-block" onclick="sendNotif()">📲 إرسال الإشعار الآن</button>
        <p class="auth-note mt">في النسخة الحقيقية يُرسَل فوراً كإشعار على هواتف الطلاب عبر Firebase.</p>
      </div>
    </div>` + adminTabs('admin/notify');
}
function notifAud(a){ state.notifAud=a;
  document.getElementById('segAll').classList.toggle('active',a==='all');
  document.getElementById('segOne').classList.toggle('active',a==='one');
  document.getElementById('fldTarget').style.display=a==='one'?'':'none';
}
function sendNotif(){
  const t=document.getElementById('nTitle').value.trim(), b=document.getElementById('nBody').value.trim();
  if(!t||!b){ toast('اكمل العنوان والنص'); return; }
  const aud=state.notifAud==='all'?'لجميع الطلاب':'إلى '+document.getElementById('nTarget').value;
  DB.notifications.unshift({id:'n'+Date.now(),type:state.notifAud==='all'?'public':'private',title:t,body:b,time:'الآن',ts:Date.now(),unread:true});
  toast('تم إرسال الإشعار '+aud); go('#/admin');
}

/* ---------- شعار ---------- */
function logoFallback(img){ const s=+img.dataset.s||56; img.insertAdjacentHTML('afterend', logoSvg(s)); img.remove(); }
// علامة الشمس (للأماكن الصغيرة كالشريط العلوي) — 5 أشعة متماثلة
function logoSvg(s=40){ return `<svg viewBox="0 0 64 64" width="${s}" height="${s}" style="display:inline-block">
  <g stroke="#f0a93b" stroke-width="3.4" stroke-linecap="round" fill="none">
    <line x1="32" y1="16" x2="32" y2="7"/>
    <line x1="43" y1="19" x2="47.5" y2="11.2"/>
    <line x1="21" y1="19" x2="16.5" y2="11.2"/>
    <line x1="51" y1="27" x2="58.8" y2="22.5"/>
    <line x1="13" y1="27" x2="5.2" y2="22.5"/>
    <path d="M14 38 A18 18 0 0 1 50 38" stroke-width="3.6"/>
  </g></svg>`; }
// الشعار الكامل (شمس + كتاب + طائر + الجامعيين + فريق الجامعيين التطوعي) — للأماكن الكبيرة
function logoFull(w=180){ const h=Math.round(w*1.0);
  return `<svg viewBox="0 4 200 196" width="${w}" height="${h}" style="display:block;margin:0 auto">
    <g stroke="#f0a93b" stroke-width="6.2" stroke-linecap="round" fill="none">
      <line x1="92" y1="48" x2="92" y2="26"/>
      <line x1="71.5" y1="52.7" x2="62.2" y2="32.7"/>
      <line x1="54.5" y1="65.8" x2="37.6" y2="51.7"/>
      <line x1="44.5" y1="85.1" x2="23.2" y2="79.4"/>
      <line x1="112.5" y1="52.7" x2="121.8" y2="32.7"/>
      <line x1="129.5" y1="65.8" x2="146.4" y2="51.7"/>
      <path d="M50 98 A42 42 0 0 1 134 98" stroke-width="6.2"/>
    </g>
    <!-- طائر -->
    <path d="M139 60 q6 -7 12 -1 q6 -6 12 1" stroke="#2e8c6e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- كتاب مفتوح -->
    <g stroke="#2e8c6e" stroke-width="2.6" fill="none" stroke-linejoin="round">
      <path d="M158 74 C164 70 172 70 178 73 L178 90 C172 87 164 87 158 90 Z"/>
      <path d="M178 73 C184 70 192 70 196 73 L196 90 C192 87 184 87 178 90 Z"/>
    </g>
    <text x="100" y="152" text-anchor="middle" font-family="'Aref Ruqaa','Lalezar','Tajawal',sans-serif" font-weight="700" font-size="40" fill="#2e8c6e">الجامعيين</text>
    <text x="100" y="184" text-anchor="middle" font-family="'Tajawal',sans-serif" font-weight="700" font-size="13" fill="#2e8c6e">فريق الجامعيين التطوعي</text>
  </svg>`; }

/* ================= الموجّه ================= */
function render(){
  const h=location.hash||'#/login';
  const p=h.replace('#/','').split('/');
  let html='';
  const isAdmin = p[0]==='admin';
  const isLogin = p[0]===''||p[0]==='login';
  if(!isAdmin && !isLogin && meBlocked()) html=viewBlocked();
  else if(p[0]==='lesson') html=viewLesson(p[1]);
  else if(p[0]==='certificate') html=viewCertificate(p[1]);
  else if(p[0]==='certificates') html=viewCertificates();
  else if(p[0]==='badges') html=viewBadges();
  else if(p[0]==='admin'){
    if(p[1]==='subjects') html=viewAdminSubjects();
    else if(p[1]==='cert') html=viewAdminCert(p[2]);
    else if(p[1]==='lessons') html=viewAdminLessons();
    else if(p[1]==='add') html=viewLessonForm(null);
    else if(p[1]==='edit') html=viewLessonForm(p[2]);
    else if(p[1]==='exercises') html=viewExercises(p[2]);
    else if(p[1]==='students') html=viewAdminStudents();
    else if(p[1]==='notify') html=viewAdminNotify();
    else html=viewAdmin();
  } else switch(p[0]){
    case '': case 'login': html=viewLogin(); break;
    case 'home': html=viewHome(); break;
    case 'lessons': html=viewLessons(); break;
    case 'leaders': html=viewLeaders(); break;
    case 'notifications': html=viewNotifications(); break;
    case 'me': html=viewMe(); break;
    default: html=viewHome();
  }
  App.innerHTML=html;
  const sc=App.querySelector('.screen'); if(sc) sc.scrollTop=0;
  document.getElementById('roleLabel').textContent = h.includes('admin')?'المشرف':'الطالب';
  saveDB();
}
function toggleRole(){ if(location.hash.includes('admin')) go('#/home'); else go('#/admin'); }
document.getElementById('roleSwitch').onclick=toggleRole;
window.addEventListener('hashchange', render);
render();
