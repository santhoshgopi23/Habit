/* ---------- palettes ---------- */
const COLORS = [
  {hex:'#2D6A4A', bg:'#DCEEDD'}, // green
  {hex:'#3B6EA0', bg:'#DCE7F4'}, // blue
  {hex:'#B5722C', bg:'#F4E3D0'}, // amber
  {hex:'#7B5EA7', bg:'#E7DFF4'}, // purple
  {hex:'#1F8A8A', bg:'#D8F0EF'}, // teal
  {hex:'#B23A5C', bg:'#F4DCE3'}, // rose
  {hex:'#4A6741', bg:'#E3EBD9'}, // olive
  {hex:'#6B5842', bg:'#EDE3D6'}, // brown
];
const ICONS = ['🎯','🏃','💪','❤️','🧠','📚','💰','🌱','🧘','💤','🍎','🚭','🎨','🎵','💧','☀️','🧹','🕐'];

const GOALS_KEY = 'foundation_goals_v3';
const SETTINGS_KEY = 'foundation_settings_v2';
const OLD_HABITS_KEY = 'foundation_habits_v2';

let goals = []; // [{id,name,icon,colorIdx,createdAt,subgoals:[{id,name,notes,createdAt,log:{}}]}]
let settings = { dark:false, fontSize:'medium', hideNumbers:false };
let currentFilter = 'all'; // 'all' or goal id
let currentSort = 'streak-desc';
let collapsed = {};
let editingGoalId = null;
let editingSubId = null;
let quickAddGoalId = null; // when adding a sub-goal from a specific goal's + button
let actionTargetId = null;
let actionTargetType = null; // 'goal' | 'sub'
let currentPage = 'today';
let detailSubId = null;
let detailBackTarget = 'today';
let detailGoalId = null;
let goalDetailReturnPage = 'pillars';

/* ---------- storage ---------- */
async function loadAll(){
  try{ const r = await window.storage.get(GOALS_KEY, false); goals = r ? JSON.parse(r.value) : []; }
  catch(e){ goals = []; }
  try{ const r = await window.storage.get(SETTINGS_KEY, false); if(r) settings = Object.assign(settings, JSON.parse(r.value)); }
  catch(e){ /* defaults */ }

  // one-time migration from the old single-goal habit tracker, if present and nothing new yet
  if(goals.length===0){
    try{
      const r = await window.storage.get(OLD_HABITS_KEY, false);
      if(r){
        const oldHabits = JSON.parse(r.value);
        if(Array.isArray(oldHabits) && oldHabits.length){
          const migrated = { id:'g_'+Date.now(), name:'General', icon:'🎯', colorIdx:0, createdAt: todayStr(), subgoals:[] };
          oldHabits.forEach(h=>{
            migrated.subgoals.push({ id: h.id || ('s_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)), name: h.name, notes: h.notes||'', createdAt: h.createdAt||todayStr(), log: h.log||{} });
          });
          goals = [migrated];
          await saveGoals();
        }
      }
    }catch(e){ /* no old data, ignore */ }
  }
}
async function saveGoals(){ try{ await window.storage.set(GOALS_KEY, JSON.stringify(goals), false); }catch(e){ console.error(e); } }
async function saveSettings(){ try{ await window.storage.set(SETTINGS_KEY, JSON.stringify(settings), false); }catch(e){ console.error(e); } }

/* ---------- date helpers ---------- */
function todayStr(d=new Date()){ return d.toISOString().slice(0,10); }
function dateNDaysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return todayStr(d); }
function fmtDate(str){ return new Date(str+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function daysElapsedInclusive(dateStr){
  const start = new Date(dateStr+'T00:00:00'), end = new Date(todayStr()+'T00:00:00');
  return Math.max(1, Math.floor((end-start)/86400000)+1);
}

/* ---------- lookups ---------- */
function findGoal(id){ return goals.find(g=>g.id===id); }
function findSub(id){
  for(const g of goals){ const s = g.subgoals.find(x=>x.id===id); if(s) return {goal:g, sub:s}; }
  return null;
}
function allSubs(){ return goals.flatMap(g=>g.subgoals.map(s=>({goal:g, sub:s}))); }
function colorFor(goal){ return COLORS[goal.colorIdx % COLORS.length]; }

/* ---------- streak / consistency math ---------- */
function computeSubStreak(sub){
  let streak=0, d=new Date();
  if(!sub.log[todayStr(d)]) d.setDate(d.getDate()-1);
  while(sub.log[todayStr(d)]){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function longestSubStreak(sub){
  const dates = Object.keys(sub.log).filter(k=>sub.log[k]).sort();
  if(!dates.length) return 0;
  let longest=1, run=1;
  for(let i=1;i<dates.length;i++){
    const prev = new Date(dates[i-1]+'T00:00:00'), cur = new Date(dates[i]+'T00:00:00');
    if((cur-prev)/86400000===1){ run++; longest=Math.max(longest,run); } else run=1;
  }
  return longest;
}
function totalCompletions(sub){ return Object.keys(sub.log).filter(k=>sub.log[k]).length; }
function subConsistency(sub){
  const pct = Math.round(totalCompletions(sub) / daysElapsedInclusive(sub.createdAt) * 100);
  return Math.min(100, Math.max(0, pct));
}
function goalConsistency(goal){
  if(!goal.subgoals.length) return 0;
  return Math.round(goal.subgoals.reduce((s,sub)=>s+subConsistency(sub),0)/goal.subgoals.length);
}
function goalTodayDone(goal){ return goal.subgoals.filter(s=>s.log[todayStr()]).length; }
function overallConsistency(){
  const subs = allSubs();
  if(!subs.length) return 0;
  return Math.round(subs.reduce((s,x)=>s+subConsistency(x.sub),0)/subs.length);
}
function overallStreak(){
  let streak=0, d=new Date();
  const subs = allSubs();
  const anyOn = ds => subs.some(x=>x.sub.log[ds]);
  if(!anyOn(todayStr(d))) d.setDate(d.getDate()-1);
  while(subs.length && anyOn(todayStr(d))){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function overallBestStreak(){
  const allDates = new Set();
  allSubs().forEach(x=>Object.keys(x.sub.log).forEach(k=>{ if(x.sub.log[k]) allDates.add(k); }));
  const dates = Array.from(allDates).sort();
  if(!dates.length) return 0;
  let longest=1, run=1;
  for(let i=1;i<dates.length;i++){
    const prev=new Date(dates[i-1]+'T00:00:00'), cur=new Date(dates[i]+'T00:00:00');
    if((cur-prev)/86400000===1){ run++; longest=Math.max(longest,run); } else run=1;
  }
  return Math.max(longest, overallStreak());
}
function consistencyColor(pct){
  if(pct>=70) return getCss('--green');
  if(pct>=40) return getCss('--amber');
  return getCss('--red');
}
function getCss(varName){ return getComputedStyle(document.body).getPropertyValue(varName).trim(); }

/* ---------- per-goal analytics ---------- */
function eligibleSubsOn(goal, dateStr){ return goal.subgoals.filter(s=>s.createdAt<=dateStr); }
function goalDayStats(goal, dateStr){
  const eligible = eligibleSubsOn(goal, dateStr);
  const done = eligible.filter(s=>s.log[dateStr]).length;
  return { done, eligible: eligible.length, pct: eligible.length ? Math.round(done/eligible.length*100) : 0, full: eligible.length>0 && done===eligible.length };
}
function goalStreak(goal){
  if(!goal.subgoals.length) return 0;
  let streak=0, d=new Date();
  if(!goalDayStats(goal, todayStr(d)).full) d.setDate(d.getDate()-1);
  while(goalDayStats(goal, todayStr(d)).full){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function goalBestStreak(goal){
  if(!goal.subgoals.length) return 0;
  const start = new Date(goal.createdAt+'T00:00:00');
  const end = new Date(todayStr()+'T00:00:00');
  let longest=0, run=0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    if(goalDayStats(goal, todayStr(d)).full){ run++; longest=Math.max(longest,run); } else run=0;
  }
  return Math.max(longest, goalStreak(goal));
}
function goalDailySeries(goal, days){
  const arr=[];
  for(let i=days-1;i>=0;i--){
    const d = dateNDaysAgo(i);
    arr.push(Object.assign({date:d, label:new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'})}, goalDayStats(goal,d)));
  }
  return arr;
}
function goalWeeklySeries(goal, weeks){
  const arr=[];
  for(let w=weeks-1; w>=0; w--){
    let done=0, eligible=0;
    for(let i=0;i<7;i++){
      const d = dateNDaysAgo(w*7+i);
      const s = goalDayStats(goal, d);
      done += s.done; eligible += s.eligible;
    }
    arr.push({ label: w===0 ? 'This week' : (w===1 ? 'Last week' : (w+1)+' wks ago'), pct: eligible ? Math.round(done/eligible*100) : 0, done, eligible });
  }
  return arr;
}
function goalMonthlySeries(goal, months){
  const arr=[]; const now = new Date();
  for(let m=months-1; m>=0; m--){
    const dt = new Date(now.getFullYear(), now.getMonth()-m, 1);
    const y = dt.getFullYear(), mo = dt.getMonth();
    const daysInMonth = new Date(y, mo+1, 0).getDate();
    const lastDay = (y===now.getFullYear() && mo===now.getMonth()) ? now.getDate() : daysInMonth;
    let done=0, eligible=0;
    for(let day=1; day<=lastDay; day++){
      const d = todayStr(new Date(y,mo,day));
      const s = goalDayStats(goal, d);
      done += s.done; eligible += s.eligible;
    }
    arr.push({ label: dt.toLocaleDateString(undefined,{month:'short'}), pct: eligible ? Math.round(done/eligible*100) : 0, done, eligible });
  }
  return arr;
}
function goalHeatmapWeeks(goal, weeks){
  const todayD = new Date(); todayD.setHours(0,0,0,0);
  const start = new Date(todayD); start.setDate(start.getDate() - (weeks*7 - 1));
  start.setDate(start.getDate() - start.getDay()); // back up to Sunday
  const cells=[];
  for(let d=new Date(start); d<=todayD; d.setDate(d.getDate()+1)){
    const ds = todayStr(d);
    cells.push(Object.assign({date:ds}, goalDayStats(goal, ds)));
  }
  const rows=[];
  for(let i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7));
  return rows;
}
function goalWeekdaySeries(goal){
  const stats = [0,1,2,3,4,5,6].map(()=>({done:0,eligible:0}));
  const start = new Date(goal.createdAt+'T00:00:00');
  const end = new Date(todayStr()+'T00:00:00');
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const s = goalDayStats(goal, todayStr(d));
    if(!s.eligible) continue;
    stats[d.getDay()].done += s.done; stats[d.getDay()].eligible += s.eligible;
  }
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return stats.map((s,i)=>({ dow:i, name:names[i], pct: s.eligible ? Math.round(s.done/s.eligible*100) : null, eligible:s.eligible }));
}
function goalPerfectDays(goal, days){
  let count=0;
  for(let i=0;i<days;i++){ if(goalDayStats(goal, dateNDaysAgo(i)).full) count++; }
  return count;
}
function goalTotalCompletions(goal){ return goal.subgoals.reduce((s,sub)=>s+totalCompletions(sub),0); }
function perfTier(pct){
  if(pct>=80) return {cls:'excellent', label:'Excelling'};
  if(pct>=50) return {cls:'steady', label:'Steady'};
  return {cls:'needs', label:'Needs focus'};
}
function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ---------- toggle today ---------- */
function toggleSubToday(id){
  const found = findSub(id); if(!found) return;
  const t = todayStr();
  if(found.sub.log[t]) delete found.sub.log[t]; else found.sub.log[t]=true;
  saveGoals(); renderCurrentPage();
}

/* ---------- add chooser ---------- */
function openAddChoice(){ showOverlay('addChoiceOverlay'); }

/* ---------- main goal form ---------- */
function buildIconPicker(selected){
  const el = document.getElementById('iconPicker');
  el.innerHTML = ICONS.map(ic=>`<div class="icon-opt ${ic===selected?'sel':''}" data-icon="${ic}">${ic}</div>`).join('');
  el.querySelectorAll('.icon-opt').forEach(o=> o.addEventListener('click', ()=>{
    el.querySelectorAll('.icon-opt').forEach(x=>x.classList.remove('sel'));
    o.classList.add('sel');
  }));
}
function buildColorPicker(selectedIdx){
  const el = document.getElementById('colorPicker');
  el.innerHTML = COLORS.map((c,i)=>`<div class="color-opt ${i===selectedIdx?'sel':''}" data-coloridx="${i}" style="background:${c.hex}"></div>`).join('');
  el.querySelectorAll('.color-opt').forEach(o=> o.addEventListener('click', ()=>{
    el.querySelectorAll('.color-opt').forEach(x=>x.classList.remove('sel'));
    o.classList.add('sel');
  }));
}
function getIconPicker(){ const sel = document.querySelector('.icon-opt.sel'); return sel ? sel.dataset.icon : ICONS[0]; }
function getColorPicker(){ const sel = document.querySelector('.color-opt.sel'); return sel ? parseInt(sel.dataset.coloridx,10) : 0; }

function openAddGoalForm(){
  editingGoalId = null;
  document.getElementById('goalFormTitle').textContent = 'New Main Goal';
  document.getElementById('goalFormSub').textContent = "The big outcome you're working toward.";
  document.getElementById('gName').value = '';
  buildIconPicker(ICONS[0]);
  buildColorPicker(goals.length % COLORS.length);
  showOverlay('goalFormOverlay');
}
function openEditGoalForm(id){
  const g = findGoal(id); if(!g) return;
  editingGoalId = id;
  document.getElementById('goalFormTitle').textContent = 'Edit Main Goal';
  document.getElementById('goalFormSub').textContent = 'Update this goal.';
  document.getElementById('gName').value = g.name;
  buildIconPicker(g.icon);
  buildColorPicker(g.colorIdx);
  showOverlay('goalFormOverlay');
}
function saveGoalForm(){
  const name = document.getElementById('gName').value.trim();
  if(!name){ toast('Give your Main Goal a name'); return; }
  const icon = getIconPicker();
  const colorIdx = getColorPicker();
  if(editingGoalId){
    const g = findGoal(editingGoalId);
    g.name = name; g.icon = icon; g.colorIdx = colorIdx;
    toast('Goal updated');
  } else {
    goals.push({ id:'g_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, icon, colorIdx, createdAt: todayStr(), subgoals:[] });
    toast('Main Goal added');
  }
  saveGoals();
  hideOverlay('goalFormOverlay');
  renderCurrentPage();
}
function deleteGoal(id){
  goals = goals.filter(g=>g.id!==id);
  saveGoals();
  hideOverlay('actionOverlay');
  toast('Goal deleted');
  if(currentFilter===id) currentFilter='all';
  if(currentPage==='detail') switchPage('today');
  if(currentPage==='goal-detail' && detailGoalId===id) switchPage('pillars');
  renderCurrentPage();
}

/* ---------- sub-goal form ---------- */
function buildGoalChips(selectedId){
  const el = document.getElementById('goalChipRow');
  if(!goals.length){ el.innerHTML = `<div style="font-size:13px;color:var(--gray);">Create a Main Goal first.</div>`; return; }
  el.innerHTML = goals.map(g=>{
    const c = colorFor(g);
    return `<div class="goal-chip ${g.id===selectedId?'sel':''}" data-goalchip="${g.id}"><span class="gc-icon" style="background:${c.hex}">${g.icon}</span>${escapeHtml(g.name)}</div>`;
  }).join('');
  el.querySelectorAll('[data-goalchip]').forEach(c=>{
    c.addEventListener('click', ()=>{
      el.querySelectorAll('.goal-chip').forEach(x=>x.classList.remove('sel'));
      c.classList.add('sel');
    });
  });
}
function getSelectedGoalChip(){ const sel = document.querySelector('.goal-chip.sel'); return sel ? sel.dataset.goalchip : null; }

function openAddSubForm(preselectGoalId){
  if(goals.length===0){
    toast('Create a Main Goal first');
    openAddGoalForm();
    return;
  }
  editingSubId = null;
  quickAddGoalId = preselectGoalId || null;
  document.getElementById('subFormTitle').textContent = 'New Sub-Goal';
  document.getElementById('subFormSub').textContent = 'One small, daily-trackable action.';
  document.getElementById('sName').value = '';
  document.getElementById('sNotes').value = '';
  const defaultGoal = preselectGoalId || (goals[0] && goals[0].id);
  buildGoalChips(defaultGoal);
  document.getElementById('subGoalPickerField').style.display = preselectGoalId && goals.length===1 ? 'none' : 'block';
  showOverlay('subFormOverlay');
}
function openEditSubForm(id){
  const found = findSub(id); if(!found) return;
  editingSubId = id;
  quickAddGoalId = null;
  document.getElementById('subFormTitle').textContent = 'Edit Sub-Goal';
  document.getElementById('subFormSub').textContent = 'Update this sub-goal.';
  document.getElementById('sName').value = found.sub.name;
  document.getElementById('sNotes').value = found.sub.notes||'';
  buildGoalChips(found.goal.id);
  document.getElementById('subGoalPickerField').style.display = 'block';
  showOverlay('subFormOverlay');
}
function saveSubForm(){
  const name = document.getElementById('sName').value.trim();
  if(!name){ toast('Give your sub-goal a name'); return; }
  const goalId = getSelectedGoalChip();
  if(!goalId){ toast('Choose a Main Goal'); return; }
  const notes = document.getElementById('sNotes').value.trim();
  if(editingSubId){
    const found = findSub(editingSubId);
    found.sub.name = name; found.sub.notes = notes;
    if(found.goal.id !== goalId){
      // move to a different main goal, preserving history
      found.goal.subgoals = found.goal.subgoals.filter(s=>s.id!==editingSubId);
      findGoal(goalId).subgoals.push(found.sub);
    }
    toast('Sub-goal updated');
  } else {
    const g = findGoal(goalId);
    g.subgoals.push({ id:'s_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, notes, createdAt: todayStr(), log:{} });
    toast('Sub-goal added');
  }
  saveGoals();
  hideOverlay('subFormOverlay');
  renderCurrentPage();
}
function deleteSub(id){
  const found = findSub(id); if(!found) return;
  found.goal.subgoals = found.goal.subgoals.filter(s=>s.id!==id);
  saveGoals();
  hideOverlay('actionOverlay');
  toast('Sub-goal deleted');
  if(currentPage==='detail') switchPage(detailBackTarget || 'today');
  else renderCurrentPage();
}

/* ---------- overlays ---------- */
function showOverlay(id){ document.getElementById(id).classList.add('show'); }
function hideOverlay(id){ document.getElementById(id).classList.remove('show'); }

/* ---------- pages ---------- */
function switchPage(page){
  currentPage = page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.page===page));
  const showHead = ['today'].includes(page);
  document.querySelector('.head-row').style.display = showHead ? 'flex':'none';
  renderCurrentPage();
}
function renderCurrentPage(){
  if(currentPage==='today') renderToday();
  else if(currentPage==='progress') renderProgress();
  else if(currentPage==='pillars') renderGoalsOverview();
  else if(currentPage==='detail') renderDetail();
  else if(currentPage==='goal-detail') renderGoalDetail();
}
function openGoalDetail(id, returnPage){
  const g = findGoal(id); if(!g) return;
  detailGoalId = id;
  goalDetailReturnPage = returnPage || (currentPage==='today' ? 'today' : 'pillars');
  switchPage('goal-detail');
}

/* ---------- TODAY ---------- */
function sortedSubs(list){
  list = list.slice();
  const dir = currentSort.endsWith('asc') ? 1 : -1;
  if(currentSort.startsWith('streak')) list.sort((a,b)=> dir*(computeSubStreak(a)-computeSubStreak(b)));
  else if(currentSort==='name-asc') list.sort((a,b)=> a.name.localeCompare(b.name));
  else if(currentSort==='created-asc') list.sort((a,b)=> a.createdAt.localeCompare(b.createdAt));
  return list;
}
function syncFilterOptions(){
  const el = document.getElementById('filterOptions');
  let html = `<label class="check-row"><input type="radio" name="filterRadio" data-filter-radio="all"><span class="radio-box"></span><span class="check-label">All Goals</span></label>`;
  html += goals.map(g=>`<label class="check-row"><input type="radio" name="filterRadio" data-filter-radio="${g.id}"><span class="radio-box"></span><span class="check-label">${g.icon} ${escapeHtml(g.name)}</span></label>`).join('');
  el.innerHTML = html;
  el.querySelectorAll('[data-filter-radio]').forEach(r=>{
    r.checked = r.dataset.filterRadio===currentFilter;
    r.addEventListener('change', ()=>{ currentFilter = r.dataset.filterRadio; hideOverlay('filterOverlay'); renderToday(); });
  });
}
function renderToday(){
  const totalSubs = allSubs().length;
  document.getElementById('habitCount').textContent = totalSubs + ' sub-goal' + (totalSubs===1?'':'s') + ' · ' + goals.length + ' goal' + (goals.length===1?'':'s');

  const oc = overallConsistency(), cs = overallStreak(), bs = overallBestStreak();
  document.getElementById('consistencyValue').textContent = oc+'%';
  document.getElementById('consistencyRing').style.background = `conic-gradient(${consistencyColor(oc)} 0% ${oc}%, #EEEAE0 ${oc}% 100%)`;
  const todayDone = allSubs().filter(x=>x.sub.log[todayStr()]).length;
  document.getElementById('sumToday').textContent = todayDone+'/'+totalSubs;
  document.getElementById('curStreak').textContent = cs+' day'+(cs===1?'':'s');
  document.getElementById('bestStreak').textContent = bs+' day'+(bs===1?'':'s');

  document.getElementById('filterPickerLabel').textContent = currentFilter==='all' ? 'All Goals' : (findGoal(currentFilter) ? findGoal(currentFilter).name : 'All Goals');
  document.getElementById('filtersBtn').classList.toggle('active-filter', currentFilter!=='all');

  const listsEl = document.getElementById('lists');
  listsEl.innerHTML = '';

  if(goals.length===0){
    listsEl.innerHTML = `<div class="empty-state"><div class="glyph">🎯</div><p>No goals yet.<br>Tap + to create your first Main Goal, then add Sub-Goals under it.</p></div>`;
    return;
  }

  const goalsToShow = currentFilter==='all' ? goals : [findGoal(currentFilter)].filter(Boolean);

  goalsToShow.forEach(g=>{
    const c = colorFor(g);
    const list = sortedSubs(g.subgoals);
    const done = goalTodayDone(g);
    const pct = goalConsistency(g);
    const isCollapsed = !!collapsed[g.id];

    const group = document.createElement('div');
    group.className = 'group';
    group.innerHTML = `
      <div class="group-head">
        <span class="caret ${isCollapsed?'collapsed':''}" data-toggle="${g.id}" title="Collapse/expand">▾</span>
        <div class="group-clickable" data-goaldetail="${g.id}">
          <div class="group-badge" style="background:${c.hex}">${g.icon}</div>
          <div class="group-main">
            <div class="group-name">${escapeHtml(g.name)}</div>
            <div class="group-sub">${list.length} sub-goal${list.length===1?'':'s'} · ${done}/${list.length} today</div>
          </div>
        </div>
        <div class="group-pct" style="background:${c.bg};color:${c.hex}">${pct}%</div>
        <button class="group-iconbtn" data-addsub="${g.id}" title="Add sub-goal">+</button>
        <button class="group-iconbtn" data-goalmenu="${g.id}" title="Manage goal">⋯</button>
      </div>
      <div class="group-body ${isCollapsed?'collapsed':''}" id="gb-${g.id}"><div class="group-body-inner"></div></div>
    `;
    listsEl.appendChild(group);

    const body = group.querySelector('.group-body-inner');
    if(list.length===0){
      body.innerHTML = `<div class="empty-state" style="padding:26px 16px;"><p>No sub-goals yet.<br>Tap + above to add one.</p></div>`;
    } else {
      list.forEach(sub=>{
        const done = !!sub.log[todayStr()];
        const streak = computeSubStreak(sub);
        const row = document.createElement('div');
        row.className = 'entry';
        row.innerHTML = `
          <div class="status-toggle ${done?'done':'notdone'}" data-check="${sub.id}">
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <svg class="x-icon" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>
          <div class="entry-main" data-open="${sub.id}">
            <div class="entry-name">${escapeHtml(sub.name)}</div>
            <div class="entry-sub blur-num">${streak>0 ? '🔥 '+streak+'-day streak' : 'Start today'} · ${subConsistency(sub)}% consistency</div>
          </div>
          <button class="entry-menu" data-menu="${sub.id}">⋯</button>
        `;
        body.appendChild(row);
      });
    }
  });

  wireTodayEvents();
}
function wireTodayEvents(){
  document.querySelectorAll('[data-toggle]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); const k=el.dataset.toggle; collapsed[k]=!collapsed[k]; renderToday(); });
  });
  document.querySelectorAll('[data-goaldetail]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); openGoalDetail(el.dataset.goaldetail, 'today'); });
  });
  document.querySelectorAll('[data-check]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); toggleSubToday(el.dataset.check); });
  });
  document.querySelectorAll('[data-open]').forEach(el=>{
    el.addEventListener('click', ()=>{ detailSubId = el.dataset.open; detailBackTarget='today'; switchPage('detail'); });
  });
  document.querySelectorAll('[data-menu]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); openActionSheet(el.dataset.menu, 'sub'); });
  });
  document.querySelectorAll('[data-goalmenu]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); openActionSheet(el.dataset.goalmenu, 'goal'); });
  });
  document.querySelectorAll('[data-addsub]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); openAddSubForm(el.dataset.addsub); });
  });
}

/* ---------- PROGRESS ---------- */
function renderProgress(){
  const el = document.getElementById('progressContent');
  const subs = allSubs();
  if(subs.length===0){
    el.innerHTML = `<div class="empty-state"><div class="glyph">📈</div><p>Add a few sub-goals to see your progress here.</p></div>`;
    return;
  }
  const days = [];
  for(let i=6;i>=0;i--) days.push(dateNDaysAgo(i));
  const dayNames = days.map(d=> new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'}));

  let weekHtml = `<div class="stat-card"><h3>Completed per day</h3>`;
  days.forEach((d,i)=>{
    const eligible = subs.filter(x=>x.sub.createdAt<=d);
    const done = eligible.filter(x=>x.sub.log[d]).length;
    const pct = eligible.length ? Math.round(done/eligible.length*100) : 0;
    weekHtml += `<div class="bar-row"><div class="bar-row-top"><span class="bn">${dayNames[i]}</span><span class="bv">${done}/${eligible.length}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  });
  weekHtml += `</div>`;

  const sorted = subs.slice().sort((a,b)=>computeSubStreak(b.sub)-computeSubStreak(a.sub));
  const maxStreak = Math.max(1, ...sorted.map(x=>computeSubStreak(x.sub)));
  let streakHtml = `<div class="stat-card"><h3>Current streaks</h3>`;
  sorted.forEach(x=>{
    const s = computeSubStreak(x.sub);
    const c = colorFor(x.goal);
    const pct = Math.round(s/maxStreak*100);
    streakHtml += `<div class="bar-row"><div class="bar-row-top"><span class="bn">${x.goal.icon} ${escapeHtml(x.sub.name)}</span><span class="bv">${s}d</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.hex}"></div></div></div>`;
  });
  streakHtml += `</div>`;

  el.innerHTML = weekHtml + streakHtml;
}

/* ---------- GOALS OVERVIEW ---------- */
function renderGoalsOverview(){
  const el = document.getElementById('pillarsContent');
  if(goals.length===0){
    el.innerHTML = `<div class="empty-state"><div class="glyph">🧭</div><p>No goals yet.<br>Tap + on Today to create your first Main Goal.</p></div>`;
    return;
  }
  const totals = goals.map(g=>({g, count: g.subgoals.reduce((s,sub)=>s+totalCompletions(sub),0)}));
  const grand = totals.reduce((s,t)=>s+t.count,0);

  let donutHtml;
  if(grand===0){
    donutHtml = `<div class="stat-card" style="text-align:center;"><div class="glyph" style="font-size:30px;">🧭</div><p style="color:var(--gray);font-size:13.5px;margin-top:8px;">Complete a few sub-goals to see your breakdown.</p></div>`;
  } else {
    let acc=0; const stops=[];
    totals.forEach(t=>{
      const pct = t.count/grand*100;
      const c = colorFor(t.g);
      stops.push(`${c.hex} ${acc}% ${acc+pct}%`);
      acc += pct;
    });
    donutHtml = `<div class="stat-card">
      <h3>All-time completions by goal</h3>
      <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops.join(',')})">
        <div class="donut-hole"><div class="donut-hole-label">Total</div><div class="donut-hole-value">${grand}</div></div>
      </div></div>
      <div class="donut-legend">
        ${totals.map(t=>{ const c=colorFor(t.g); return `<div class="legend-row"><span class="legend-dot" style="background:${c.hex}"></span><span class="legend-name">${t.g.icon} ${escapeHtml(t.g.name)}</span><span class="legend-pct">${grand? Math.round(t.count/grand*100):0}%</span><span class="legend-amt">${t.count}</span></div>`; }).join('')}
      </div>
    </div>`;
  }

  const cardsHtml = goals.map(g=>{
    const c = colorFor(g);
    const done = goalTodayDone(g);
    const pct = goalConsistency(g);
    return `<div class="pillar-card" data-goaldetail="${g.id}">
      <div class="pillar-avatar" style="background:${c.hex}">${g.icon}</div>
      <div class="pillar-main"><div class="pillar-cname">${escapeHtml(g.name)}</div><div class="pillar-csub">${g.subgoals.length} sub-goal${g.subgoals.length===1?'':'s'} · ${pct}% consistency</div></div>
      <div class="pillar-cnet" style="color:${c.hex}">${done}/${g.subgoals.length}</div>
      <div class="pillar-chevron">›</div>
    </div>`;
  }).join('');

  el.innerHTML = donutHtml + cardsHtml;

  el.querySelectorAll('[data-goaldetail]').forEach(c=>{
    c.addEventListener('click', ()=>{ openGoalDetail(c.dataset.goaldetail, 'pillars'); });
  });
}

/* ---------- GOAL DETAIL (main goal) ---------- */
function renderGoalDetail(){
  const g = findGoal(detailGoalId);
  const el = document.getElementById('goalDetailContent');
  if(!g){ el.innerHTML = `<div class="empty-state"><p>Goal not found.</p></div>`; return; }
  const c = colorFor(g);
  const pct = goalConsistency(g);
  const streak = goalStreak(g);
  const best = goalBestStreak(g);
  const todayS = goalDayStats(g, todayStr());
  const subs = g.subgoals.slice().sort((a,b)=> subConsistency(b) - subConsistency(a));

  el.innerHTML = `
    <div class="gd-header">
      <div class="gd-avatar" style="background:${c.hex}">${g.icon}</div>
      <div class="gd-headtext">
        <h2>${escapeHtml(g.name)}</h2>
        <p>${g.subgoals.length} sub-goal${g.subgoals.length===1?'':'s'} · started ${fmtDate(g.createdAt)}</p>
      </div>
      <button class="group-iconbtn" id="gdAddSubBtn" title="Add sub-goal">+</button>
      <button class="group-iconbtn" id="gdMenuBtn" title="Manage goal">⋯</button>
    </div>

    <div class="summary-card" style="margin-top:14px;">
      <div class="consistency-hero">
        <div class="consistency-ring" style="background:conic-gradient(${c.hex} 0% ${pct}%, #EEEAE0 ${pct}% 100%)">
          <div class="consistency-hole"><div class="cr-value">${pct}%</div><div class="cr-label">Consistency</div></div>
        </div>
        <div class="consistency-stats">
          <div class="cstat"><div class="label">Today</div><div class="value">${todayS.done}/${todayS.eligible}</div></div>
          <div class="cstat"><div class="label">Current Streak</div><div class="value">${streak} day${streak===1?'':'s'}</div></div>
          <div class="cstat"><div class="label">Best Streak</div><div class="value">${best} day${best===1?'':'s'}</div></div>
        </div>
      </div>
      <p class="gd-streak-note">Streak = every sub-goal under this goal completed that day.</p>
    </div>

    ${subs.length===0 ? `
    <div class="empty-state" style="padding:30px 16px;"><p>No sub-goals yet.<br>Tap + above to add your first one.</p></div>
    ` : `
    <div class="section-title">Sub-Goals <span>${subs.length}</span></div>
    <div class="gd-sub-list">
      ${subs.map(sub=>{
        const sc = subConsistency(sub);
        const sstreak = computeSubStreak(sub);
        const done = !!sub.log[todayStr()];
        const tier = perfTier(sc);
        return `<div class="gd-sub-row">
          <div class="status-toggle ${done?'done':'notdone'}" data-check="${sub.id}">
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <svg class="x-icon" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>
          <div class="gd-sub-main" data-open="${sub.id}">
            <div class="gd-sub-top"><span class="entry-name">${escapeHtml(sub.name)}</span><span class="perf-badge ${tier.cls}">${tier.label}</span></div>
            <div class="entry-sub">${sstreak>0 ? '🔥 '+sstreak+'-day streak':'Start today'} · ${sc}% consistency</div>
            <div class="bar-track" style="margin-top:6px;"><div class="bar-fill" style="width:${sc}%;background:${c.hex}"></div></div>
          </div>
          <button class="entry-menu" data-menu="${sub.id}">⋯</button>
        </div>`;
      }).join('')}
    </div>
    `}

    ${g.subgoals.length ? renderGoalCharts(g, c) : ''}
  `;

  wireGoalDetailEvents(g);
}

function renderGoalCharts(g, c){
  const daily = goalDailySeries(g, 7);
  const weekly = goalWeeklySeries(g, 6);
  const monthly = goalMonthlySeries(g, 6);
  const heatRows = goalHeatmapWeeks(g, 12);
  const weekday = goalWeekdaySeries(g).filter(w=>w.eligible>0);
  const bestSub = g.subgoals.slice().sort((a,b)=>subConsistency(b)-subConsistency(a))[0];
  const worstSub = g.subgoals.slice().sort((a,b)=>subConsistency(a)-subConsistency(b))[0];
  const bestDay = weekday.length ? weekday.slice().sort((a,b)=>b.pct-a.pct)[0] : null;
  const perfect30 = goalPerfectDays(g, 30);
  const totalDone = goalTotalCompletions(g);

  const dailyHtml = `<div class="stat-card"><h3>Daily performance <span class="stat-card-sub">Last 7 days</span></h3>
    ${daily.map(d=>`<div class="bar-row"><div class="bar-row-top"><span class="bn">${d.label}</span><span class="bv">${d.done}/${d.eligible}</span></div><div class="bar-track"><div class="bar-fill" style="width:${d.pct}%;background:${c.hex}"></div></div></div>`).join('')}
  </div>`;

  const weeklyHtml = `<div class="stat-card"><h3>Weekly performance <span class="stat-card-sub">Last 6 weeks</span></h3>
    ${weekly.map(w=>`<div class="bar-row"><div class="bar-row-top"><span class="bn">${w.label}</span><span class="bv">${w.pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${w.pct}%;background:${c.hex}"></div></div></div>`).join('')}
  </div>`;

  const monthlyHtml = `<div class="stat-card"><h3>Monthly performance <span class="stat-card-sub">Last 6 months</span></h3>
    ${monthly.map(m=>`<div class="bar-row"><div class="bar-row-top"><span class="bn">${m.label}</span><span class="bv">${m.pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${m.pct}%;background:${c.hex}"></div></div></div>`).join('')}
  </div>`;

  const dayLabels = ['S','M','T','W','T','F','S'];
  const heatHtml = `<div class="stat-card">
    <h3>Tracking history <span class="stat-card-sub">Last 12 weeks</span></h3>
    <div class="heatmap-daylabels">${dayLabels.map(l=>`<span>${l}</span>`).join('')}</div>
    <div class="heatmap-grid">
      ${heatRows.map(row=>`<div class="heatmap-row">${row.map(cell=>{
        const isFuture = cell.date > todayStr();
        const noData = cell.eligible===0;
        let style = 'background:#EEEAE0;';
        if(!isFuture && !noData) style = `background:${hexToRgba(c.hex, 0.12 + (cell.pct/100)*0.78)};`;
        const title = isFuture ? '' : (noData ? `${fmtDate(cell.date)}: no sub-goals yet` : `${fmtDate(cell.date)}: ${cell.done}/${cell.eligible} (${cell.pct}%)`);
        return `<div class="heatmap-cell ${isFuture?'future':''}" style="${style}" title="${title}"></div>`;
      }).join('')}</div>`).join('')}
    </div>
    <div class="heatmap-legend"><span>Less</span>
      <span class="heatmap-cell" style="background:${hexToRgba(c.hex,0.12)}"></span>
      <span class="heatmap-cell" style="background:${hexToRgba(c.hex,0.4)}"></span>
      <span class="heatmap-cell" style="background:${hexToRgba(c.hex,0.65)}"></span>
      <span class="heatmap-cell" style="background:${hexToRgba(c.hex,0.9)}"></span>
      <span>More</span>
    </div>
  </div>`;

  const insightCards = [];
  if(bestSub) insightCards.push({icon:'🏆', label:'Best performing', value:bestSub.name, sub:subConsistency(bestSub)+'% consistency'});
  if(worstSub && g.subgoals.length>1) insightCards.push({icon:'🎯', label:'Needs improvement', value:worstSub.name, sub:subConsistency(worstSub)+'% consistency'});
  if(bestDay) insightCards.push({icon:'📅', label:'Best day of week', value:bestDay.name+'day', sub:bestDay.pct+'% completion'});
  insightCards.push({icon:'✅', label:'Perfect days', value:perfect30+' / 30', sub:'fully completed, last 30 days'});
  insightCards.push({icon:'📊', label:'Total completions', value:String(totalDone), sub:'across all sub-goals'});

  const insightHtml = `<div class="stat-card"><h3>Other useful analysis</h3>
    <div class="insight-grid">
      ${insightCards.map(i=>`<div class="insight-card"><div class="insight-icon">${i.icon}</div><div class="insight-label">${i.label}</div><div class="insight-value">${escapeHtml(i.value)}</div><div class="insight-sub">${i.sub}</div></div>`).join('')}
    </div>
  </div>`;

  return dailyHtml + weeklyHtml + monthlyHtml + heatHtml + insightHtml;
}

function wireGoalDetailEvents(g){
  document.getElementById('gdAddSubBtn').addEventListener('click', ()=> openAddSubForm(g.id));
  document.getElementById('gdMenuBtn').addEventListener('click', ()=> openActionSheet(g.id, 'goal'));
  document.querySelectorAll('#goalDetailContent [data-check]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); toggleSubToday(el.dataset.check); });
  });
  document.querySelectorAll('#goalDetailContent [data-open]').forEach(el=>{
    el.addEventListener('click', ()=>{ detailSubId = el.dataset.open; detailBackTarget='goal-detail'; switchPage('detail'); });
  });
  document.querySelectorAll('#goalDetailContent [data-menu]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); openActionSheet(el.dataset.menu, 'sub'); });
  });
}

/* ---------- DETAIL (sub-goal) ---------- */
function renderDetail(){
  const found = findSub(detailSubId);
  const el = document.getElementById('detailContent');
  if(!found){ el.innerHTML = `<div class="empty-state"><p>Sub-goal not found.</p></div>`; return; }
  const { goal: g, sub } = found;
  const c = colorFor(g);
  const streak = computeSubStreak(sub), longest = longestSubStreak(sub), total = totalCompletions(sub), consistency = subConsistency(sub);

  const days = []; for(let i=6;i>=0;i--) days.push(dateNDaysAgo(i));
  const weekHtml = days.map(d=>{
    const on = !!sub.log[d];
    const label = new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'narrow'});
    return `<div class="week-cell ${on?'on':'off'}" style="${on?`background:${c.hex}`:''}">${label}</div>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-header"><h2>${escapeHtml(sub.name)}</h2><p>${g.icon} ${escapeHtml(g.name)} · started ${fmtDate(sub.createdAt)}</p></div>
    <div class="detail-card">
      <div class="detail-avatar" style="background:${c.bg};color:${c.hex}">${streak>0?'🔥':'—'}</div>
      <div class="detail-name">${streak} day streak</div>
      <div class="detail-type" style="color:${c.hex}">Longest: ${longest} days · ${consistency}% consistency</div>
      <div class="week-strip">${weekHtml}</div>
    </div>
    <div class="detail-list">
      <div class="detail-row"><span class="detail-label">Main Goal</span><span class="detail-value">${g.icon} ${escapeHtml(g.name)}</span></div>
      <div class="detail-row"><span class="detail-label">Total completions</span><span class="detail-value">${total}</span></div>
      <div class="detail-row"><span class="detail-label">Started</span><span class="detail-value">${fmtDate(sub.createdAt)}</span></div>
      ${sub.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${escapeHtml(sub.notes)}</span></div>` : ''}
    </div>
    <div class="detail-actions">
      <button class="btn-cancel" id="detailEditBtn" style="flex:1;">Edit</button>
      <button class="btn-cancel" id="detailDeleteBtn" style="flex:1;color:var(--red);">Delete</button>
    </div>
  `;
  document.getElementById('detailEditBtn').addEventListener('click', ()=> openEditSubForm(sub.id));
  document.getElementById('detailDeleteBtn').addEventListener('click', ()=>{
    if(confirm('Delete "'+sub.name+'" and all its history?')) deleteSub(sub.id);
  });
}

/* ---------- action sheet (shared for goal / sub) ---------- */
function openActionSheet(id, type){
  actionTargetId = id;
  actionTargetType = type;
  if(type==='goal'){
    const g = findGoal(id);
    document.getElementById('actionTitle').textContent = 'Manage goal';
    document.getElementById('actionSub').textContent = g ? g.name : '';
    document.getElementById('actionEditLabel').textContent = 'Edit Main Goal';
    document.getElementById('actionEditSub').textContent = 'Change the name, icon, or color';
    document.getElementById('actionDeleteLabel').textContent = 'Delete Main Goal';
    document.getElementById('actionDeleteSub').textContent = 'Removes it and every sub-goal under it';
  } else {
    const found = findSub(id);
    document.getElementById('actionTitle').textContent = 'Manage sub-goal';
    document.getElementById('actionSub').textContent = found ? found.sub.name : '';
    document.getElementById('actionEditLabel').textContent = 'Edit sub-goal';
    document.getElementById('actionEditSub').textContent = 'Change the name, goal, or notes';
    document.getElementById('actionDeleteLabel').textContent = 'Delete sub-goal';
    document.getElementById('actionDeleteSub').textContent = 'Removes it and all its history';
  }
  showOverlay('actionOverlay');
}

/* ---------- misc ---------- */
function escapeHtml(str){ const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

/* ---------- backup ---------- */
function exportBackup(){
  const blob = new Blob([JSON.stringify({goals, settings}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'foundation-backup-'+todayStr()+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup downloaded');
}
function importBackup(file){
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(Array.isArray(data.goals)){
        goals = data.goals;
        if(data.settings) settings = Object.assign(settings, data.settings);
        saveGoals(); saveSettings(); applySettings();
        toast('Backup restored');
        renderCurrentPage();
      } else if(Array.isArray(data.habits)){
        // legacy single-goal backup
        const migrated = { id:'g_'+Date.now(), name:'General', icon:'🎯', colorIdx:0, createdAt: todayStr(), subgoals:[] };
        data.habits.forEach(h=>{
          migrated.subgoals.push({ id: h.id || ('s_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)), name: h.name, notes: h.notes||'', createdAt: h.createdAt||todayStr(), log: h.log||{} });
        });
        goals = [migrated];
        if(data.settings) settings = Object.assign(settings, data.settings);
        saveGoals(); saveSettings(); applySettings();
        toast('Legacy backup restored');
        renderCurrentPage();
      } else { toast("That file doesn't look like a Foundation backup"); }
    }catch(err){ toast('Could not read that file'); }
  };
  reader.readAsText(file);
}

/* ---------- settings apply ---------- */
function applySettings(){
  document.body.classList.toggle('dark', settings.dark);
  document.body.className = document.body.className.replace(/fs-\w+/g,'').trim();
  document.body.classList.add('fs-'+settings.fontSize);
  document.getElementById('darkToggle').classList.toggle('on', settings.dark);
  document.querySelectorAll('.seg-btn').forEach(b=> b.classList.toggle('active', b.dataset.fs===settings.fontSize));
  document.getElementById('eyeBtn').style.opacity = settings.hideNumbers ? '0.6':'1';
}

/* ---------- init & events ---------- */
document.getElementById('fabBtn').addEventListener('click', openAddChoice);
document.getElementById('addChoiceCancel').addEventListener('click', ()=>hideOverlay('addChoiceOverlay'));
document.getElementById('choiceNewGoal').addEventListener('click', ()=>{ hideOverlay('addChoiceOverlay'); openAddGoalForm(); });
document.getElementById('choiceNewSub').addEventListener('click', ()=>{ hideOverlay('addChoiceOverlay'); openAddSubForm(currentFilter!=='all'?currentFilter:null); });

document.getElementById('goalFormCancel').addEventListener('click', ()=>hideOverlay('goalFormOverlay'));
document.getElementById('goalFormSave').addEventListener('click', saveGoalForm);

document.getElementById('subFormCancel').addEventListener('click', ()=>hideOverlay('subFormOverlay'));
document.getElementById('subFormSave').addEventListener('click', saveSubForm);

document.getElementById('actionEdit').addEventListener('click', ()=>{
  hideOverlay('actionOverlay');
  if(actionTargetType==='goal') openEditGoalForm(actionTargetId); else openEditSubForm(actionTargetId);
});
document.getElementById('actionDelete').addEventListener('click', ()=>{
  if(actionTargetType==='goal'){
    const g = findGoal(actionTargetId);
    if(g && confirm('Delete "'+g.name+'" and every sub-goal under it?')) deleteGoal(actionTargetId);
  } else {
    const found = findSub(actionTargetId);
    if(found && confirm('Delete "'+found.sub.name+'" and all its history?')) deleteSub(actionTargetId);
  }
});
document.getElementById('actionCancel').addEventListener('click', ()=>hideOverlay('actionOverlay'));

document.getElementById('settingsBtn').addEventListener('click', ()=>showOverlay('settingsOverlay'));
document.getElementById('moreSettingsBtn').addEventListener('click', ()=>showOverlay('settingsOverlay'));
document.getElementById('settingsClose').addEventListener('click', ()=>hideOverlay('settingsOverlay'));
document.getElementById('darkToggle').addEventListener('click', ()=>{ settings.dark=!settings.dark; saveSettings(); applySettings(); renderCurrentPage(); });
document.querySelectorAll('.seg-btn').forEach(b=> b.addEventListener('click', ()=>{ settings.fontSize=b.dataset.fs; saveSettings(); applySettings(); }));

document.getElementById('filterPickerBtn').addEventListener('click', ()=>{ syncFilterOptions(); showOverlay('filterOverlay'); });
document.getElementById('filtersBtn').addEventListener('click', ()=>{ syncFilterOptions(); showOverlay('filterOverlay'); });
document.getElementById('filterCloseX').addEventListener('click', ()=>hideOverlay('filterOverlay'));
document.getElementById('filterClearBtn').addEventListener('click', ()=>{ currentFilter='all'; hideOverlay('filterOverlay'); renderToday(); });

document.getElementById('sortBtn').addEventListener('click', ()=>showOverlay('sortOverlay'));
document.getElementById('sortCloseX').addEventListener('click', ()=>hideOverlay('sortOverlay'));
document.querySelectorAll('[data-sort-radio]').forEach(r=>{
  r.addEventListener('change', ()=>{ currentSort = r.dataset.sortRadio; hideOverlay('sortOverlay'); renderToday(); });
});
function syncSortRadios(){ document.querySelectorAll('[data-sort-radio]').forEach(r=> r.checked = r.dataset.sortRadio===currentSort); }

document.getElementById('eyeBtn').addEventListener('click', ()=>{ settings.hideNumbers=!settings.hideNumbers; saveSettings(); applySettings(); renderToday(); });
document.getElementById('bellBtn').addEventListener('click', ()=> toast("Set a daily reminder in your phone's clock app"));

document.querySelectorAll('.nav-item').forEach(n=> n.addEventListener('click', ()=> switchPage(n.dataset.page)));
document.getElementById('detailBackBtn').addEventListener('click', ()=> switchPage(detailBackTarget || 'today'));
document.getElementById('goalDetailBackBtn').addEventListener('click', ()=> switchPage(goalDetailReturnPage || 'pillars'));

document.getElementById('moreExportBtn').addEventListener('click', exportBackup);
document.getElementById('moreImportBtn').addEventListener('click', ()=> document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e=>{ if(e.target.files[0]) importBackup(e.target.files[0]); e.target.value=''; });
document.getElementById('moreResetBtn').addEventListener('click', ()=>{
  if(confirm('Clear every goal, sub-goal, and all history? This cannot be undone.')){
    goals = []; saveGoals(); toast('All data cleared'); renderCurrentPage();
  }
});

// close overlays on backdrop click
document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.classList.remove('show'); });
});

(async function init(){
  await loadAll();
  applySettings();
  syncSortRadios();
  document.querySelector('[data-sort-radio="streak-desc"]').checked = true;
  switchPage('today');
})();
