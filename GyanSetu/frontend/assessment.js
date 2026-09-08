const qs=(selector)=>document.querySelector(selector);
const views=['intro','loading','quiz','result'];
const state={assessment:null,index:0,answers:new Map(),role:null};

function showView(name){
  views.forEach((view)=>qs(`#${view}-view`).classList.toggle('is-visible',view===name));
}

function setStage(stage){
  const order=['prepare','generate','validate','answer','result'];
  const target=order.indexOf(stage);
  document.querySelectorAll('.side-step').forEach((step)=>{
    const index=order.indexOf(step.dataset.stage);
    step.classList.toggle('is-active',index===target);
    step.classList.toggle('is-complete',index<target);
  });
}

function setAiChip(text,status){
  const chip=qs('#ai-chip');
  chip.classList.toggle('is-online',status==='online');
  chip.classList.toggle('is-offline',status==='offline');
  chip.lastChild.textContent=` ${text}`;
}

async function loadIntro(){
  try{
    const [aiResponse,competencyResponse]=await Promise.all([
      fetch('/api/ai/health',{credentials:'include'}),
      fetch('/api/competencies',{credentials:'include'}),
    ]);
    if(competencyResponse.status===401)return location.replace('/login.html');
    const competencyData=await competencyResponse.json();
    if(!competencyResponse.ok)throw new Error(competencyData.error||'Could not load role framework.');
    state.role=competencyData.role;
    qs('#role-title').textContent=`${state.role.name} Baseline Assessment`;
    const subCount=state.role.competencies.reduce((sum,item)=>sum+item.subCompetencies.length,0);
    qs('#question-count').textContent=Math.ceil(subCount/10)*10;
    if(aiResponse.ok)setAiChip('OpenRouter ready','online');
    else setAiChip('AI fallback ready','online');
  }catch(error){
    qs('#intro-error').textContent=error.message||'Could not prepare the assessment.';
    setAiChip('Service check failed','offline');
  }
}

function loadingProgress(percent,text){
  qs('#loading-bar').style.width=`${percent}%`;
  qs('#loading-copy').textContent=text;
}

async function generateAssessment(){
  const button=qs('#generate-button');
  button.disabled=true;
  qs('#intro-error').textContent='';
  showView('loading');
  setStage('generate');
  loadingProgress(24,'Preparing your role-based question set...');
  qs('#load-generate').classList.add('is-done');

  const timer=setTimeout(()=>{
    loadingProgress(58,'Checking competency alignment and question-bank coverage...');
    setStage('validate');
    qs('#load-validate').classList.add('is-done');
  },650);

  try{
    const response=await fetch('/api/assessments/start',{method:'POST',credentials:'include'});
    const data=await response.json();
    clearTimeout(timer);
    if(response.status===401)return location.replace('/login.html');
    if(!response.ok)throw new Error(data.error||'Could not generate assessment.');
    state.assessment=data;
    state.index=0;
    state.answers.clear();
    loadingProgress(100,'Assessment ready. Loading your first question...');
    qs('#load-generate').classList.add('is-done');
    qs('#load-validate').classList.add('is-done');
    qs('#load-store').classList.add('is-done');
    setTimeout(()=>{
      showView('quiz');
      setStage('answer');
      renderQuestion();
    },120);
  }catch(error){
    clearTimeout(timer);
    showView('intro');
    setStage('prepare');
    qs('#intro-error').textContent=error.message||'Assessment generation failed.';
    button.disabled=false;
  }
}

function renderQuestion(){
  const assessment=state.assessment;
  const question=assessment.questions[state.index];
  const total=assessment.questions.length;
  const current=state.index+1;
  qs('#question-number').textContent=current;
  qs('#question-total').textContent=total;
  qs('#progress-bar').style.width=`${(current/total)*100}%`;
  const competencyName=state.role?.competencies.find((item)=>item.id===question.competencyId)?.name||question.competencyId;
  const subName=state.role?.competencies.flatMap((item)=>item.subCompetencies).find((item)=>item.id===question.subCompetencyId)?.name||question.subCompetencyId;
  qs('#question-meta').textContent=`${competencyName} · ${subName}`;
  qs('#question-title').textContent=`Question ${current}`;
  qs('#question-text').textContent=question.question;
  const validation=question.validation||{};
  qs('#validation-copy').textContent=validation.status==='validated'
    ? `Semantic validation passed${validation.similarity!=null?` · similarity ${Math.round(validation.similarity*100)}%`:''}`
    : assessment.validationMode==='structural-fallback'?'Structural validation passed · semantic service fallback used':'Question-bank mapping verified · structural validation passed';

  const selected=state.answers.get(question.questionId)||'';
  const letters=['A','B','C','D'];
  qs('#options').innerHTML='';
  question.options.forEach((option,index)=>{
    const letter=letters[index];
    const button=document.createElement('button');
    button.type='button';
    button.className=`option${selected===letter?' is-selected':''}`;
    button.innerHTML=`<b>${letter}</b><span></span>`;
    button.querySelector('span').textContent=option;
    button.addEventListener('click',()=>{
      state.answers.set(question.questionId,letter);
      renderQuestion();
    });
    qs('#options').append(button);
  });
  qs('#prev-button').disabled=state.index===0;
  qs('#next-button').innerHTML=state.index===total-1
    ? 'Submit Assessment <svg><use href="./ui/gyansetu-icons.svg#icon-arrow"></use></svg>'
    : 'Next <svg><use href="./ui/gyansetu-icons.svg#icon-arrow"></use></svg>';
  qs('#quiz-error').textContent='';
}

function goPrevious(){
  if(state.index>0){state.index-=1;renderQuestion();window.scrollTo({top:0,behavior:'smooth'});}
}

async function goNext(){
  const question=state.assessment.questions[state.index];
  if(!state.answers.has(question.questionId)){
    qs('#quiz-error').textContent='Choose an answer before continuing.';
    return;
  }
  if(state.index<state.assessment.questions.length-1){
    state.index+=1;renderQuestion();window.scrollTo({top:0,behavior:'smooth'});return;
  }
  if(state.answers.size!==state.assessment.questions.length){
    qs('#quiz-error').textContent='Answer every question before submitting.';
    return;
  }
  await submitAssessment();
}

async function submitAssessment(){
  const button=qs('#next-button');
  button.disabled=true;
  button.textContent='Scoring...';
  try{
    const answers=state.assessment.questions.map((question)=>({questionId:question.questionId,selectedOption:state.answers.get(question.questionId)}));
    const response=await fetch('/api/assessments/submit',{
      method:'POST',
      credentials:'include',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({assessmentId:state.assessment.assessmentId,answers}),
    });
    const data=await response.json();
    if(response.status===401)return location.replace('/login.html');
    if(!response.ok)throw new Error(data.error||'Could not score assessment.');
    renderResults(data.result);
    showView('result');
    setStage('result');
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(error){
    qs('#quiz-error').textContent=error.message||'Scoring failed.';
    renderQuestion();
  }finally{button.disabled=false;}
}

function renderResults(result){
  const score=Math.round(Number(result.overallScore||0));
  qs('#overall-score').textContent=`${score}%`;
  qs('#score-copy').textContent=`You answered ${result.correctAnswers} of ${result.totalQuestions} questions correctly. Your competency scores now drive the next learning recommendations.`;

  qs('#competency-scores').innerHTML='';
  (result.competencies||[]).forEach((item)=>{
    const row=document.createElement('div');
    row.className='score-row';
    row.innerHTML='<div><strong></strong><div class="bar"><span></span></div></div><b></b>';
    row.querySelector('strong').textContent=item.name;
    row.querySelector('.bar span').style.width=`${Math.max(0,Math.min(100,item.scorePercentage))}%`;
    row.querySelector('b').textContent=`${Math.round(item.scorePercentage)}%`;
    qs('#competency-scores').append(row);
  });

  const recommendationData=result.recommendations||{};
  qs('#recommendation-reason').textContent=recommendationData.reason||(
    recommendationData.aiPersonalized?'Selected by OpenRouter from the GyanSetu prototype catalog.':'Ranked from your lowest competency scores using the prototype catalog.'
  );
  qs('#recommendations').innerHTML='';
  (recommendationData.courses||[]).forEach((course)=>{
    const card=document.createElement('div');
    card.className='course-card';
    card.innerHTML='<strong></strong><span></span>';
    card.querySelector('strong').textContent=course.title;
    card.querySelector('span').textContent=`${course.provider} · ${course.duration} · ${course.level}`;
    qs('#recommendations').append(card);
  });
}

qs('#generate-button').addEventListener('click',generateAssessment);
qs('#prev-button').addEventListener('click',goPrevious);
qs('#next-button').addEventListener('click',goNext);
loadIntro();
