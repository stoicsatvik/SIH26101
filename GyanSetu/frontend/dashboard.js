const qs=(s)=>document.querySelector(s);

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

async function loadDashboard(){
  try{
    const response=await fetch('/api/profile',{credentials:'include'});
    if(response.status===401)return location.replace('/login.html');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not load profile.');

    const user=data.user||{};
    const profile=data.profile||{};
    const name=user.full_name||user.email||'Employee';
    const role=profile.current_job_title||profile.designation||'Employee';
    const org=profile.ministry_or_organisation||profile.organization||'National Statistical Office (NSO)';

    qs('#employee-name').textContent=firstName(name,user.email);
    qs('#header-name').textContent=name;
    qs('#avatar').textContent=initials(name,user.email);
    qs('#role-line').textContent=`${role}  •  ${org}  •  MoSPI`;
    qs('#role-card-copy').textContent=profile.designation?`Mapped to ${profile.designation}`:'Mapped to your role';
  }catch(error){
    const box=qs('#dashboard-error');
    box.textContent=error.message||'Dashboard data could not be loaded.';
    box.classList.add('show');
  }
}

qs('#logout-button').addEventListener('click',async()=>{
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'include'});}finally{location.replace('/login.html');}
});

qs('#start-assessment').addEventListener('click',()=>{
  const box=qs('#dashboard-error');
  box.textContent='Baseline assessment UI is the next connected screen. Your profile and competency engine data are ready.';
  box.classList.add('show');
  box.scrollIntoView({behavior:'smooth',block:'center'});
});

loadDashboard();