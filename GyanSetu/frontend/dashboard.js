const qs=(selector)=>document.querySelector(selector);

function firstName(name,email){
  const value=(name||email||'Employee').trim();
  return value.split(/\s+|@/)[0]||'Employee';
}

function initials(name,email){
  const source=(name||email||'GS').replace(/@.*/, '').trim();
  const parts=source.split(/\s+/).filter(Boolean);
  if(parts.length>=2)return (parts[0][0]+parts[1][0]).toUpperCase();
  return source.slice(0,2).toUpperCase();
}

function setBanner(message,good=false){
  const banner=qs('#service-banner');
  qs('#service-banner-text').textContent=message;
  banner.classList.toggle('is-good',good);
}

function markJourney(completed){
  const steps=[...document.querySelectorAll('.journey-step')];
  if(!completed)return;
  steps.forEach((step,index)=>{
    step.classList.toggle('is-complete',index<2);
    step.classList.toggle('is-current',index===2);
  });
}

async function loadDashboard(){
  try{
    const response=await fetch('/api/dashboard/state',{credentials:'include'});
    if(response.status===401)return location.replace('/login.html');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not load dashboard.');

    const user=data.user||{};
    const profile=data.profile||{};
    const assessment=data.assessment||{};
    const services=data.services||{};
    const name=user.full_name||user.email||'Employee';
    const role=profile.current_job_title||profile.designation||assessment.role?.name||'Employee';
    const org=profile.ministry_or_organization||'National Statistical Office (NSO)';

    qs('#employee-name').textContent=firstName(name,user.email);
    qs('#header-name').textContent=firstName(name,user.email);
    qs('#avatar').textContent=initials(name,user.email);
    qs('#role-line').textContent=`${role}  •  ${org}  •  MoSPI`;
    qs('#role-card-copy').textContent=`${assessment.role?.name||role} · 4 competency areas`;

    if(assessment.completed){
      const rounded=Math.round(Number(assessment.overallScore||0));
      qs('#assessment-status').textContent=`Completed · ${rounded}% overall`;
      qs('#journey-status').textContent='Learning plan ready';
      qs('#hero-title').textContent='Your Competency Profile Is Ready';
      qs('#hero-copy').textContent='Your baseline assessment has been scored. Review your competency gaps and continue with personalized learning recommendations.';
      qs('#start-assessment').innerHTML='Review Assessment & Recommendations <svg><use href="./ui/gyansetu-icons.svg#icon-arrow"></use></svg>';
      qs('#start-assessment').href='./workspace.html?view=competencies';
      markJourney(true);
    }

    if(services.openRouterConfigured){
      setBanner(assessment.completed?'Assessment engine, semantic validation and recommendations are connected.':'AI assessment generation and semantic validation are ready.',true);
    }else{
      setBanner('OpenRouter is not configured. Assessment generation is temporarily unavailable.',false);
    }
  }catch(error){
    setBanner(error.message||'Dashboard services could not be loaded.',false);
  }
}

qs('#logout-button').addEventListener('click',async()=>{
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'include'});}finally{location.replace('/login.html');}
});

qs('#dismiss-banner').addEventListener('click',()=>qs('#service-banner').remove());

qs('#global-search').addEventListener('submit',(event)=>{
  event.preventDefault();
  const query=qs('#search-input').value.trim();
  if(!query)return;
  location.assign(`./workspace.html?view=learning&q=${encodeURIComponent(query)}`);
});

const date=new Date();
qs('#today-label').textContent=date.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
loadDashboard();
