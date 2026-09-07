const qs=(selector)=>document.querySelector(selector);
const params=new URLSearchParams(location.search);
const view=params.get('view')||'competencies';
const query=(params.get('q')||'').trim().toLowerCase();

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function firstName(name,email){
  const value=String(name||email||'Employee').trim();
  return value.split(/\s+|@/)[0]||'Employee';
}

function initials(name,email){
  const source=String(name||email||'GS').replace(/@.*/, '').trim();
  const parts=source.split(/\s+/).filter(Boolean);
  return parts.length>=2?(parts[0][0]+parts[1][0]).toUpperCase():source.slice(0,2).toUpperCase();
}

function status(message,error=false){
  const box=qs('#workspace-status');
  box.textContent=message;
  box.classList.toggle('is-error',error);
  box.classList.add('is-visible');
}

function setHeading(eyebrow,title,subtitle){
  qs('#workspace-eyebrow').textContent=eyebrow;
  qs('#workspace-title').textContent=title;
  qs('#workspace-subtitle').textContent=subtitle;
}

function icon(id){return `<svg><use href="./ui/gyansetu-icons.svg#${id}"></use></svg>`;}

function emptyState(title,copy,href,label){
  return `<div class="empty-state">${icon('icon-bulb')}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p><a href="${href}">${escapeHtml(label)}</a></div>`;
}

function courseTiles(courses){
  if(!courses.length)return emptyState('No courses match this search','Try another skill or complete the baseline assessment for recommendations.','./assessment.html','Start assessment');
  return `<div class="course-grid">${courses.map((course)=>`<article class="course-tile"><div class="course-icon">${icon('icon-book')}</div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.provider||'GyanSetu prototype catalog')}</p><div class="course-meta"><span>${escapeHtml(course.duration||'Self paced')}</span><span>${escapeHtml(course.level||'Learning')}</span></div></article>`).join('')}</div>`;
}

function renderCompetencies(data,role){
  setHeading('COMPETENCY PROFILE','Your Role-Based Competency Profile','Required capabilities are mapped to your role. Assessment scores appear here after the baseline diagnostic.');
  const scores=new Map((data.assessment?.competencies||[]).map((item)=>[item.id,item.scorePercentage]));
  const overall=data.assessment?.overallScore;
  const cards=role.competencies.map((competency)=>{
    const score=scores.get(competency.id);
    return `<article class="competency-card"><div class="competency-head"><strong>${escapeHtml(competency.name)}</strong><span>${score==null?`Required L${competency.requiredLevel}`:`${Math.round(score)}%`}</span></div><p>${escapeHtml(competency.description)}</p><div class="sub-list">${competency.subCompetencies.map((sub)=>`<div class="sub-row"><strong>${escapeHtml(sub.name)}</strong><span>${escapeHtml(sub.definition)}</span>${score==null?'':`<div class="mini-bar"><i style="width:${Math.max(0,Math.min(100,score))}%"></i></div>`}</div>`).join('')}</div></article>`;
  }).join('');
  qs('#workspace-body').innerHTML=`<section class="role-banner"><div class="role-icon">${icon('icon-chart')}</div><div><h2>${escapeHtml(role.name)}</h2><p>${escapeHtml(role.description)}</p></div><div class="score-badge">${overall==null?'Baseline pending':`${Math.round(overall)}% overall`}</div></section><section class="competency-grid">${cards}</section>`;
}

function renderLearning(data,catalog,profileData){
  setHeading('MY LEARNING','Learning Resources','Browse the prototype course catalog and the training already recorded in your profile.');
  const filtered=catalog.filter((course)=>!query||`${course.title} ${course.provider} ${course.level} ${(course.competencyIds||[]).join(' ')}`.toLowerCase().includes(query));
  const completed=profileData.completedCourses||[];
  qs('#workspace-body').innerHTML=`${query?`<div class="workspace-status is-visible">Showing learning results for “${escapeHtml(params.get('q'))}”.</div>`:''}${courseTiles(filtered)}<div style="height:16px"></div><article class="workspace-card"><h2>Courses already completed</h2><p>These were supplied in your profile and remain separate from prototype recommendations.</p><div class="completed-list">${completed.length?completed.map((course)=>`<div class="completed-row"><strong>${escapeHtml(course.course_title)}</strong><span>${escapeHtml(course.provider||'Provider not specified')}${course.score!=null?` · Score ${escapeHtml(course.score)}%`:''}</span></div>`).join(''):'<div class="completed-row"><strong>No completed courses recorded yet.</strong><span>Add them from Profile.</span></div>'}</div></article>`;
}

function renderRecommendations(data,catalog){
  setHeading('RECOMMENDATIONS','Personalized Learning Recommendations','Courses are selected from a fixed prototype catalog using your assessed competency gaps.');
  const courses=data.assessment?.recommendations||[];
  if(!data.assessment?.completed){
    qs('#workspace-body').innerHTML=emptyState('Complete your baseline first','Recommendations need competency evidence. The assessment engine generates, validates and scores your diagnostic before suggesting learning.','./assessment.html','Start baseline assessment');
    return;
  }
  const resolved=courses.map((course)=>catalog.find((item)=>item.id===course.id)||course);
  qs('#workspace-body').innerHTML=`<div class="workspace-status is-visible">Recommendations are currently ranked from your weakest assessed competencies. OpenRouter also selects from this same controlled catalog during assessment submission.</div>${courseTiles(resolved)}`;
}

function renderRoadmap(data){
  const profile=data.profile||{};
  const current=profile.current_job_title||profile.designation||'Field Enumerator';
  const target=profile.target_role||'Statistical Officer / Data Analyst';
  setHeading('CAREER ROADMAP','Your Role Progression','Use the competency baseline to move from your current responsibilities toward the next role you selected.');
  qs('#workspace-body').innerHTML=`<section class="roadmap"><article class="roadmap-card current"><small>Current role</small><h3>${escapeHtml(current)}</h3><p>${escapeHtml(profile.current_role_summary||'Current field responsibilities from your profile.')}</p></article><div class="roadmap-arrow">→</div><article class="roadmap-card target"><small>Target role</small><h3>${escapeHtml(target)}</h3><p>Close competency gaps through recommended learning, then reassess to measure readiness.</p></article></section>`;
}

function renderNotifications(data){
  setHeading('NOTIFICATIONS','Notifications','A compact prototype activity feed based on your actual account and assessment state.');
  const items=[
    ['Profile ready',data.user?.onboarding_completed?'Your profile is complete and available to the competency engine.':'Finish your profile to continue.','icon-user-star'],
    [data.assessment?.completed?'Assessment completed':'Baseline assessment pending',data.assessment?.completed?`Your latest competency baseline is ${Math.round(data.assessment.overallScore||0)}% overall.`:'Start the diagnostic to unlock gap analysis and recommendations.','icon-check'],
    ['AI assessment engine',data.services?.openRouterConfigured?'OpenRouter is configured for question generation and recommendations.':'OpenRouter is not configured on this deployment.','icon-bulb'],
  ];
  qs('#workspace-body').innerHTML=`<div class="notification-list">${items.map(([title,copy,iconId])=>`<div class="notice-row">${icon(iconId)}<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div></div>`).join('')}</div>`;
}

function renderSettings(data){
  setHeading('SETTINGS','Account & Prototype Settings','Review your connected services and edit the profile used by the competency engine.');
  const services=[
    ['Database','Neon PostgreSQL connected','icon-dashboard',true],
    ['OpenRouter',data.services?.openRouterConfigured?'Configured':'Not configured','icon-bulb',data.services?.openRouterConfigured],
    ['Email verification',data.services?.emailConfigured?'Configured':'Not configured','icon-mail',data.services?.emailConfigured],
  ];
  qs('#workspace-body').innerHTML=`<div class="settings-list">${services.map(([title,copy,iconId,ok])=>`<div class="setting-row">${icon(iconId)}<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)} · ${ok?'Ready':'Needs attention'}</span></div></div>`).join('')}<div class="setting-row">${icon('icon-user-star')}<div><strong>Profile data</strong><span>Edit role, education, work history and skills.</span></div><a href="./onboarding.html?edit=1">Edit profile</a></div></div>`;
}

async function load(){
  try{
    document.querySelectorAll('.nav-link[data-view]').forEach((link)=>link.classList.toggle('is-active',link.dataset.view===view));
    const [stateResponse,competencyResponse,catalogResponse,profileResponse]=await Promise.all([
      fetch('/api/dashboard/state',{credentials:'include'}),
      fetch('/api/competencies',{credentials:'include'}),
      fetch('/api/catalog',{credentials:'include'}),
      fetch('/api/profile',{credentials:'include'}),
    ]);
    if([stateResponse,competencyResponse,catalogResponse,profileResponse].some((response)=>response.status===401))return location.replace('/login.html');
    const [data,competencyData,catalogData,profileData]=await Promise.all([stateResponse.json(),competencyResponse.json(),catalogResponse.json(),profileResponse.json()]);
    if(!stateResponse.ok)throw new Error(data.error||'Could not load workspace.');
    if(!competencyResponse.ok)throw new Error(competencyData.error||'Could not load competencies.');
    if(!catalogResponse.ok)throw new Error(catalogData.error||'Could not load course catalog.');
    if(!profileResponse.ok)throw new Error(profileData.error||'Could not load profile.');

    const name=data.user?.full_name||data.user?.email||'Employee';
    qs('#workspace-user').textContent=firstName(name,data.user?.email);
    qs('#workspace-avatar').textContent=initials(name,data.user?.email);
    const catalog=catalogData.courses||[];
    const role=competencyData.role;

    if(view==='competencies')renderCompetencies(data,role);
    else if(view==='learning')renderLearning(data,catalog,profileData);
    else if(view==='recommendations')renderRecommendations(data,catalog);
    else if(view==='roadmap')renderRoadmap(data);
    else if(view==='notifications')renderNotifications(data);
    else if(view==='settings')renderSettings(data);
    else{setHeading('GYANSETU','Workspace','Choose a section from the navigation.');qs('#workspace-body').innerHTML=emptyState('Choose a workspace','Use the sidebar to open competencies, learning, recommendations or your career roadmap.','./dashboard.html','Back to dashboard');}
  }catch(error){status(error.message||'Could not load this workspace.',true);}
}

qs('#workspace-logout').addEventListener('click',async()=>{
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'include'});}finally{location.replace('/login.html');}
});

load();
