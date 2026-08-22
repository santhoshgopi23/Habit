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

const GOALS_KEY = 'foundation_goals_v4';
const OLD_GOALS_KEY = 'foundation_goals_v3'; // previous Main Goal / Sub-Goal structure
const SETTINGS_KEY = 'foundation_settings_v2';
const OLD_HABITS_KEY = 'foundation_habits_v2';

let goals = []; // [{id,name,icon,colorIdx,createdAt,notes,log:{},type,unit,targetType,target,reminderOn,reminderTime}]
let settings = { dark:false, fontSize:'medium', lockEnabled:false, lockPin:null };
let currentSort = 'streak-desc';
let editingGoalId = null;
let actionTargetId = null;
let currentPage = 'today';
let detailGoalId = null;
let goalDetailReturnPage = 'today';
let measureTargetId = null;
let measureTargetDate = null;
let perfTab = 'daily';        // daily | weekly | monthly
let historyRange = '12w';     // 1m | 12w | 3m | 1y
let notifiedReminders = {};

/* ---------- storage (browser localStorage — persists on this device/browser) ---------- */
let storageAvailable = true;
function checkStorage(){
  try{ const k='__fnd_test__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return true; }
  catch(e){ return false; }
}
function flattenLegacyGoals(oldGoals){
  // old format: [{id,name,icon,colorIdx,createdAt,subgoals:[{id,name,notes,createdAt,log}]}]
  const flat = [];
  (oldGoals||[]).forEach(g=>{
    if(Array.isArray(g.subgoals) && g.subgoals.length){
      g.subgoals.forEach(s=>{
        flat.push({ id: s.id, name: s.name, icon: g.icon, colorIdx: g.colorIdx, createdAt: s.createdAt || g.createdAt, notes: s.notes||'', log: s.log||{} });
      });
    } else {
      flat.push({ id: g.id, name: g.name, icon: g.icon, colorIdx: g.colorIdx, createdAt: g.createdAt, notes: '', log: {} });
    }
  });
  return flat;
}
async function loadAll(){
  storageAvailable = checkStorage();
  if(!storageAvailable){ goals = []; return; }
  try{ const raw = localStorage.getItem(GOALS_KEY); goals = raw ? JSON.parse(raw) : []; }
  catch(e){ goals = []; }
  try{ const raw = localStorage.getItem(SETTINGS_KEY); if(raw) settings = Object.assign(settings, JSON.parse(raw)); }
  catch(e){ /* defaults */ }

  if(goals.length===0){
    // one-time migration from the old Main Goal / Sub-Goal structure, if present
    try{
      const raw = localStorage.getItem(OLD_GOALS_KEY);
      if(raw){
        const oldGoals = JSON.parse(raw);
        if(Array.isArray(oldGoals) && oldGoals.length){
          goals = flattenLegacyGoals(oldGoals);
          saveGoals();
        }
      }
    }catch(e){ /* ignore */ }
  }
  if(goals.length===0){
    // one-time migration from the original single-list habit tracker, if present
    try{
      const raw = localStorage.getItem(OLD_HABITS_KEY);
      if(raw){
        const oldHabits = JSON.parse(raw);
        if(Array.isArray(oldHabits) && oldHabits.length){
          goals = oldHabits.map((h,i)=>({ id: h.id || ('g_'+Date.now()+'_'+i), name: h.name, icon: h.icon || ICONS[i % ICONS.length], colorIdx: h.colorIdx!=null ? h.colorIdx : (i % COLORS.length), createdAt: h.createdAt||todayStr(), notes: h.notes||'', log: h.log||{} }));
          saveGoals();
        }
      }
    }catch(e){ /* no old data, ignore */ }
  }
}
function saveGoals(){
  if(!storageAvailable) return;
  try{ localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); }
  catch(e){ console.error(e); storageAvailable=false; toast("Couldn't save — storage full or blocked"); }
}
function saveSettings(){
  if(!storageAvailable) return;
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch(e){ console.error(e); }
}

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
function colorFor(goal){ return COLORS[goal.colorIdx % COLORS.length]; }

/* ---------- yes/no vs measurable helpers ---------- */
function isDoneValue(goal, raw){
  if(raw===undefined || raw===null || raw==='') return false;
  if(goal.type==='measurable'){
    if(typeof raw !== 'number' || isNaN(raw)) return false;
    return goal.targetType==='max' ? raw<=goal.target : raw>=goal.target;
  }
  return !!raw;
}
function isDone(goal, dateStr){ return isDoneValue(goal, goal.log[dateStr]); }

/* ---------- streak / consistency math (per goal) ---------- */
function computeStreak(goal){
  let streak=0, d=new Date();
  if(!isDone(goal, todayStr(d))) d.setDate(d.getDate()-1);
  while(isDone(goal, todayStr(d))){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function longestStreak(goal){
  const dates = Object.keys(goal.log).filter(k=>isDone(goal,k)).sort();
  if(!dates.length) return 0;
  let longest=1, run=1;
  for(let i=1;i<dates.length;i++){
    const prev = new Date(dates[i-1]+'T00:00:00'), cur = new Date(dates[i]+'T00:00:00');
    if((cur-prev)/86400000===1){ run++; longest=Math.max(longest,run); } else run=1;
  }
  return longest;
}
function totalCompletions(goal){ return Object.keys(goal.log).filter(k=>isDone(goal,k)).length; }
function totalMeasurableSum(goal){
  return Object.values(goal.log).reduce((s,v)=> s + (typeof v==='number' ? v : 0), 0);
}
function fmtNum(n){
  return (Number.isInteger(n)) ? String(n) : (Math.round(n*100)/100).toString();
}
function consistency(goal){
  const pct = Math.round(totalCompletions(goal) / daysElapsedInclusive(goal.createdAt) * 100);
  return Math.min(100, Math.max(0, pct));
}
function goalTodayDone(goal){ return isDone(goal, todayStr()); }
function overallConsistency(){
  if(!goals.length) return 0;
  return Math.round(goals.reduce((s,g)=>s+consistency(g),0)/goals.length);
}
function overallStreak(){
  let streak=0, d=new Date();
  const anyOn = ds => goals.some(g=>isDone(g,ds));
  if(!anyOn(todayStr(d))) d.setDate(d.getDate()-1);
  while(goals.length && anyOn(todayStr(d))){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function overallBestStreak(){
  const allDates = new Set();
  goals.forEach(g=>Object.keys(g.log).forEach(k=>{ if(isDone(g,k)) allDates.add(k); }));
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
function dayStats(goal, dateStr){
  const eligible = goal.createdAt<=dateStr ? 1 : 0;
  const raw = goal.log[dateStr];
  const done = eligible && isDoneValue(goal, raw) ? 1 : 0;
  return { done, eligible, pct: eligible ? done*100 : 0, full: eligible>0 && done===eligible, value: raw };
}
function rangeToWeeks(range){
  if(range==='1m') return 5;
  if(range==='12w') return 12;
  if(range==='3m') return 13;
  if(range==='1y') return 52;
  return 12;
}
function rangeLabel(range){
  if(range==='1m') return 'Last month';
  if(range==='12w') return 'Last 12 weeks';
  if(range==='3m') return 'Last 3 months';
  if(range==='1y') return 'Last year';
  return '';
}
function goalDailySeries(goal, days){
  const arr=[];
  for(let i=days-1;i>=0;i--){
    const d = dateNDaysAgo(i);
    arr.push(Object.assign({date:d, label:new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'})}, dayStats(goal,d)));
  }
  return arr;
}
function goalWeeklySeries(goal, weeks){
  const arr=[];
  for(let w=weeks-1; w>=0; w--){
    let done=0, eligible=0;
    for(let i=0;i<7;i++){
      const d = dateNDaysAgo(w*7+i);
      const s = dayStats(goal, d);
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
      const s = dayStats(goal, d);
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
    cells.push(Object.assign({date:ds}, dayStats(goal, ds)));
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
    const s = dayStats(goal, todayStr(d));
    if(!s.eligible) continue;
    stats[d.getDay()].done += s.done; stats[d.getDay()].eligible += s.eligible;
  }
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return stats.map((s,i)=>({ dow:i, name:names[i], pct: s.eligible ? Math.round(s.done/s.eligible*100) : null, eligible:s.eligible }));
}
function goalPerfectDays(goal, days){
  let count=0;
  for(let i=0;i<days;i++){ if(dayStats(goal, dateNDaysAgo(i)).full) count++; }
  return count;
}
const REDHEX = '#C0392B';
function goalMeasurableTotal(goal){
  if(goal.type!=='measurable') return 0;
  return Object.values(goal.log).reduce((s,v)=> s + (typeof v==='number' ? v : 0), 0);
}
function goalMeasurableOverDays(goal){
  if(goal.type!=='measurable') return 0;
  return Object.keys(goal.log).filter(k=> typeof goal.log[k]==='number' && !isDoneValue(goal, goal.log[k])).length;
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

/* ---------- toggle today / any date ---------- */
function toggleGoalToday(id){ toggleGoalDate(id, todayStr()); }
function toggleGoalDate(id, dateStr){
  const g = findGoal(id); if(!g) return;
  if(dateStr > todayStr() || dateStr < g.createdAt) return;
  if(g.type==='measurable'){ openMeasureEntry(id, dateStr); return; }
  if(g.log[dateStr]) delete g.log[dateStr]; else g.log[dateStr]=true;
  saveGoals(); renderCurrentPage();
}

/* ---------- measurable value entry ---------- */
function openMeasureEntry(id, dateStr){
  const g = findGoal(id); if(!g) return;
  dateStr = dateStr || todayStr();
  if(dateStr > todayStr() || dateStr < g.createdAt) return;
  measureTargetId = id;
  measureTargetDate = dateStr;
  const isToday = dateStr === todayStr();
  document.getElementById('measureTitle').textContent = g.name;
  document.getElementById('measureSub').textContent = `${isToday ? '' : fmtDate(dateStr)+' · '}Goal: ${g.targetType==='max'?'at most':'at least'} ${g.target}${g.unit?' '+g.unit:''}`;
  document.getElementById('measureUnitLabel').textContent = g.unit ? `${isToday?"Today's":"That day's"} value (${g.unit})` : (isToday ? "Today's value" : "That day's value");
  const existing = g.log[dateStr];
  document.getElementById('measureValue').value = (typeof existing==='number') ? existing : '';
  showOverlay('measureOverlay');
}
function saveMeasureEntry(){
  const g = findGoal(measureTargetId); if(!g) return;
  const d = measureTargetDate || todayStr();
  const raw = document.getElementById('measureValue').value;
  const v = parseFloat(raw);
  if(raw===''||isNaN(v)){ toast('Enter a number'); return; }
  g.log[d] = v;
  saveGoals();
  hideOverlay('measureOverlay');
  renderCurrentPage();
}
function clearMeasureEntry(){
  const g = findGoal(measureTargetId); if(!g) return;
  const d = measureTargetDate || todayStr();
  delete g.log[d];
  saveGoals();
  hideOverlay('measureOverlay');
  renderCurrentPage();
}

/* ---------- goal form ---------- */
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

function setTypeToggle(type){
  document.querySelectorAll('#typeToggle .seg-btn').forEach(b=> b.classList.toggle('active', b.dataset.type===type));
  document.getElementById('measurableFields').style.display = type==='measurable' ? 'block' : 'none';
}
function getTypeToggle(){ const sel = document.querySelector('#typeToggle .seg-btn.active'); return sel ? sel.dataset.type : 'yesno'; }
function setTargetTypeToggle(tt){
  document.querySelectorAll('#targetTypeToggle .seg-btn').forEach(b=> b.classList.toggle('active', b.dataset.targetType===tt));
}
function getTargetTypeToggle(){ const sel = document.querySelector('#targetTypeToggle .seg-btn.active'); return sel ? sel.dataset.targetType : 'min'; }
function setReminderUI(on, time){
  document.getElementById('gReminderToggle').classList.toggle('on', !!on);
  document.getElementById('reminderTimeField').style.display = on ? 'block' : 'none';
  document.getElementById('gReminderTime').value = time || '20:00';
}

function openAddGoalForm(){
  editingGoalId = null;
  document.getElementById('goalFormTitle').textContent = 'New Goal';
  document.getElementById('goalFormSub').textContent = 'One small, daily-trackable goal.';
  document.getElementById('gName').value = '';
  document.getElementById('gNotes').value = '';
  document.getElementById('gUnit').value = '';
  document.getElementById('gTarget').value = '';
  setTypeToggle('yesno');
  setTargetTypeToggle('min');
  setReminderUI(false, '20:00');
  buildIconPicker(ICONS[0]);
  buildColorPicker(goals.length % COLORS.length);
  showOverlay('goalFormOverlay');
}
function openEditGoalForm(id){
  const g = findGoal(id); if(!g) return;
  editingGoalId = id;
  document.getElementById('goalFormTitle').textContent = 'Edit Goal';
  document.getElementById('goalFormSub').textContent = 'Update this goal.';
  document.getElementById('gName').value = g.name;
  document.getElementById('gNotes').value = g.notes||'';
  document.getElementById('gUnit').value = g.unit||'';
  document.getElementById('gTarget').value = (g.target!=null) ? g.target : '';
  setTypeToggle(g.type==='measurable' ? 'measurable' : 'yesno');
  setTargetTypeToggle(g.targetType==='max' ? 'max' : 'min');
  setReminderUI(!!g.reminderOn, g.reminderTime);
  buildIconPicker(g.icon);
  buildColorPicker(g.colorIdx);
  showOverlay('goalFormOverlay');
}
function saveGoalForm(){
  const name = document.getElementById('gName').value.trim();
  if(!name){ toast('Give your goal a name'); return; }
  const icon = getIconPicker();
  const colorIdx = getColorPicker();
  const notes = document.getElementById('gNotes').value.trim();
  const type = getTypeToggle();

  let unit='', targetType='min', target=null;
  if(type==='measurable'){
    unit = document.getElementById('gUnit').value.trim();
    targetType = getTargetTypeToggle();
    const targetRaw = document.getElementById('gTarget').value;
    target = parseFloat(targetRaw);
    if(targetRaw===''||isNaN(target)){ toast('Enter a target amount'); return; }
  }

  const reminderOn = document.getElementById('gReminderToggle').classList.contains('on');
  const reminderTime = reminderOn ? document.getElementById('gReminderTime').value : '';

  if(editingGoalId){
    const g = findGoal(editingGoalId);
    Object.assign(g, { name, icon, colorIdx, notes, type, unit, targetType, target, reminderOn, reminderTime });
    toast('Goal updated');
  } else {
    goals.push({ id:'g_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, icon, colorIdx, createdAt: todayStr(), notes, log:{}, type, unit, targetType, target, reminderOn, reminderTime });
    toast('Goal added');
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
  if(currentPage==='goal-detail' && detailGoalId===id) switchPage(goalDetailReturnPage || 'today');
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
  else if(currentPage==='goal-detail') renderGoalDetail();
}
function openGoalDetail(id, returnPage){
  const g = findGoal(id); if(!g) return;
  detailGoalId = id;
  goalDetailReturnPage = returnPage || currentPage;
  switchPage('goal-detail');
}

/* ---------- TODAY ---------- */
function sortedGoals(list){
  list = list.slice();
  const dir = currentSort.endsWith('asc') ? 1 : -1;
  if(currentSort.startsWith('streak')) list.sort((a,b)=> dir*(computeStreak(a)-computeStreak(b)));
  else if(currentSort==='name-asc') list.sort((a,b)=> a.name.localeCompare(b.name));
  else if(currentSort==='created-asc') list.sort((a,b)=> a.createdAt.localeCompare(b.createdAt));
  return list;
}
function renderToday(){
  document.getElementById('habitCount').textContent = goals.length + ' goal' + (goals.length===1?'':'s');

  const oc = overallConsistency(), cs = overallStreak(), bs = overallBestStreak();
  document.getElementById('consistencyValue').textContent = oc+'%';
  document.getElementById('consistencyRing').style.background = `conic-gradient(${consistencyColor(oc)} 0% ${oc}%, #EEEAE0 ${oc}% 100%)`;
  const todayDone = goals.filter(g=>isDone(g, todayStr())).length;
  document.getElementById('sumToday').textContent = todayDone+'/'+goals.length;
  document.getElementById('curStreak').textContent = cs+' day'+(cs===1?'':'s');
  document.getElementById('bestStreak').textContent = bs+' day'+(bs===1?'':'s');

  const listsEl = document.getElementById('lists');
  listsEl.innerHTML = '';

  if(goals.length===0){
    listsEl.innerHTML = `<div class="empty-state"><div class="glyph">🎯</div><p>No goals yet.<br>Tap + to create your first goal.</p></div>`;
    return;
  }

  const list = sortedGoals(goals);
  const wrap = document.createElement('div');
  wrap.className = 'group';
  list.forEach(g=>{
    const done = isDone(g, todayStr());
    const streak = computeStreak(g);
    const c = colorFor(g);
    const todayVal = g.log[todayStr()];
    const missedToday = g.type==='measurable' && typeof todayVal==='number' && !isDoneValue(g, todayVal);
    const valNote = (g.type==='measurable' && typeof todayVal==='number') ? ` · <span class="${missedToday?'val-miss':''}">Today: ${todayVal}${g.unit?' '+g.unit:''}</span>` : '';
    const totalNote = g.type==='measurable' ? `Total: ${fmtNum(totalMeasurableSum(g))}${g.unit?' '+g.unit:''}` : '';
    const row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML = `
      <div class="status-toggle ${done?'done':'notdone'}" data-check="${g.id}">
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <svg class="x-icon" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
      <div class="entry-icon" style="background:${c.hex}">${g.icon}</div>
      <div class="entry-main" data-open="${g.id}">
        <div class="entry-name">${escapeHtml(g.name)}</div>
        <div class="entry-sub">${streak>0 ? '🔥 '+streak+'-day streak' : 'Start today'} · ${consistency(g)}% consistency${valNote}</div>
        ${totalNote ? `<div class="entry-sub2">${totalNote}</div>` : ''}
      </div>
      <button class="week-toggle" data-week="${g.id}" aria-label="Toggle 7-day view">▾</button>
    `;
    wrap.appendChild(row);

    const strip = document.createElement('div');
    strip.className = 'week-strip';
    strip.id = 'week-'+g.id;
    strip.innerHTML = last7Html(g);
    wrap.appendChild(strip);
  });
  listsEl.appendChild(wrap);

  wireTodayEvents();
}
function last7Html(g){
  let html = '<div class="week-boxes">';
  for(let i=6;i>=0;i--){
    const d = dateNDaysAgo(i);
    const future = d > todayStr();
    const before = d < g.createdAt;
    const disabled = before || future;
    let cls = 'week-box';
    if(disabled) cls += ' week-box-empty';
    else cls += isDone(g, d) ? ' week-box-yes' : ' week-box-no';
    const label = new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'});
    html += `<span class="${cls}" ${disabled?'':`data-editday="${g.id}" data-date="${d}"`} title="${label}"></span>`;
  }
  html += '</div>';
  return html;
}
function wireTodayEvents(){
  document.querySelectorAll('[data-check]').forEach(el=>{
    el.addEventListener('click', e=>{ e.stopPropagation(); toggleGoalToday(el.dataset.check); });
  });
  document.querySelectorAll('[data-open]').forEach(el=>{
    el.addEventListener('click', ()=>{ openGoalDetail(el.dataset.open, 'today'); });
  });
  document.querySelectorAll('[data-week]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const strip = document.getElementById('week-'+el.dataset.week);
      const open = strip.classList.toggle('open');
      el.classList.toggle('open', open);
    });
  });
  document.querySelectorAll('[data-editday]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      toggleGoalDate(el.dataset.editday, el.dataset.date);
    });
  });
}

/* ---------- PROGRESS ---------- */
function renderProgress(){
  const el = document.getElementById('progressContent');
  if(goals.length===0){
    el.innerHTML = `<div class="empty-state"><div class="glyph">📈</div><p>Add a few goals to see your progress here.</p></div>`;
    return;
  }
  const days = [];
  for(let i=6;i>=0;i--) days.push(dateNDaysAgo(i));
  const dayNames = days.map(d=> new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'}));

  let weekHtml = `<div class="stat-card"><h3>Completed per day</h3>`;
  days.forEach((d,i)=>{
    const eligible = goals.filter(g=>g.createdAt<=d);
    const done = eligible.filter(g=>isDone(g,d)).length;
    const pct = eligible.length ? Math.round(done/eligible.length*100) : 0;
    weekHtml += `<div class="bar-row"><div class="bar-row-top"><span class="bn">${dayNames[i]}</span><span class="bv">${done}/${eligible.length}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  });
  weekHtml += `</div>`;

  const sorted = goals.slice().sort((a,b)=>computeStreak(b)-computeStreak(a));
  const maxStreak = Math.max(1, ...sorted.map(g=>computeStreak(g)));
  let streakHtml = `<div class="stat-card"><h3>Current streaks</h3>`;
  sorted.forEach(g=>{
    const s = computeStreak(g);
    const c = colorFor(g);
    const pct = Math.round(s/maxStreak*100);
    streakHtml += `<div class="bar-row"><div class="bar-row-top"><span class="bn">${g.icon} ${escapeHtml(g.name)}</span><span class="bv">${s}d</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.hex}"></div></div></div>`;
  });
  streakHtml += `</div>`;

  el.innerHTML = weekHtml + streakHtml;
}

/* ---------- GOALS OVERVIEW ---------- */
function renderGoalsOverview(){
  const el = document.getElementById('pillarsContent');
  if(goals.length===0){
    el.innerHTML = `<div class="empty-state"><div class="glyph">🧭</div><p>No goals yet.<br>Tap + on Today to create your first one.</p></div>`;
    return;
  }
  const totals = goals.map(g=>({g, count: totalCompletions(g)}));
  const grand = totals.reduce((s,t)=>s+t.count,0);

  let donutHtml;
  if(grand===0){
    donutHtml = `<div class="stat-card" style="text-align:center;"><div class="glyph" style="font-size:30px;">🧭</div><p style="color:var(--gray);font-size:13.5px;margin-top:8px;">Complete a few goals to see your breakdown.</p></div>`;
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
    const pct = consistency(g);
    const streak = computeStreak(g);
    return `<div class="pillar-card" data-goaldetail="${g.id}">
      <div class="pillar-avatar" style="background:${c.hex}">${g.icon}</div>
      <div class="pillar-main"><div class="pillar-cname">${escapeHtml(g.name)}</div><div class="pillar-csub">${streak>0 ? '🔥 '+streak+'-day streak':'Start today'} · ${pct}% consistency</div></div>
      <div class="pillar-cnet" style="color:${c.hex}">${done?'✓':'—'}</div>
      <div class="pillar-chevron">›</div>
    </div>`;
  }).join('');

  el.innerHTML = donutHtml + cardsHtml;

  el.querySelectorAll('[data-goaldetail]').forEach(c=>{
    c.addEventListener('click', ()=>{ openGoalDetail(c.dataset.goaldetail, 'pillars'); });
  });
}

/* ---------- GOAL DETAIL ---------- */
function renderGoalDetail(){
  const g = findGoal(detailGoalId);
  const el = document.getElementById('goalDetailContent');
  if(!g){ el.innerHTML = `<div class="empty-state"><p>Goal not found.</p></div>`; return; }
  const c = colorFor(g);
  const pct = consistency(g);
  const streak = computeStreak(g);
  const best = longestStreak(g);
  const total = totalCompletions(g);

  const days = []; for(let i=6;i>=0;i--) days.push(dateNDaysAgo(i));
  const weekHtml = days.map(d=>{
    const on = isDone(g, d);
    const label = new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'narrow'});
    return `<div class="week-cell ${on?'on':'off'}" style="${on?`background:${c.hex}`:''}">${label}</div>`;
  }).join('');

  el.innerHTML = `
    <div class="gd-header">
      <div class="gd-avatar" style="background:${c.hex}">${g.icon}</div>
      <div class="gd-headtext">
        <h2>${escapeHtml(g.name)}</h2>
        <p>Started ${fmtDate(g.createdAt)}</p>
      </div>
      <button class="group-iconbtn" id="gdMenuBtn" title="Manage goal">⋯</button>
    </div>

    <div class="summary-card" style="margin-top:14px;text-align:center;">
      <div class="consistency-hero" style="justify-content:center;">
        <div class="consistency-ring" style="background:conic-gradient(${c.hex} 0% ${pct}%, #EEEAE0 ${pct}% 100%)">
          <div class="consistency-hole"><div class="cr-value">${pct}%</div><div class="cr-label">Consistency</div></div>
        </div>
      </div>
      <div class="week-strip">${weekHtml}</div>
    </div>

    <div class="detail-list" style="margin-top:14px;">
      <div class="detail-row"><span class="detail-label">Current streak</span><span class="detail-value">${streak} day${streak===1?'':'s'}</span></div>
      <div class="detail-row"><span class="detail-label">Best streak</span><span class="detail-value">${best} day${best===1?'':'s'}</span></div>
      <div class="detail-row"><span class="detail-label">Total completions</span><span class="detail-value">${total}</span></div>
      ${g.type==='measurable' ? `<div class="detail-row"><span class="detail-label">Total ${g.unit||'logged'}</span><span class="detail-value">${fmtNum(totalMeasurableSum(g))}${g.unit?' '+g.unit:''}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Started</span><span class="detail-value">${fmtDate(g.createdAt)}</span></div>
      ${g.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${escapeHtml(g.notes)}</span></div>` : ''}
    </div>

    ${renderGoalCharts(g, c)}

    <div class="detail-actions">
      <button class="btn-cancel" id="gdEditBtn" style="flex:1;">Edit</button>
      <button class="btn-cancel" id="gdDeleteBtn" style="flex:1;color:var(--red);">Delete</button>
    </div>
  `;

  wireGoalDetailEvents(g);
}

function renderGoalCharts(g, c){
  const daily = goalDailySeries(g, 7);
  const weekly = goalWeeklySeries(g, 6);
  const monthly = goalMonthlySeries(g, 6);
  const heatWeeks = rangeToWeeks(historyRange);
  const heatRows = goalHeatmapWeeks(g, heatWeeks);
  const weekday = goalWeekdaySeries(g).filter(w=>w.eligible>0);
  const bestDay = weekday.length ? weekday.slice().sort((a,b)=>b.pct-a.pct)[0] : null;
  const perfect30 = goalPerfectDays(g, 30);

  const isMeasurable = g.type==='measurable';

  const bv = d => {
    if(!d.eligible) return '';
    if(isMeasurable) return (typeof d.value==='number') ? `${d.value}${g.unit?' '+g.unit:''}` : '—';
    return d.done ? '✓' : '—';
  };

  const dailyBody = daily.map(d=>{
    const missed = isMeasurable && typeof d.value==='number' && !d.done;
    return `<div class="bar-row"><div class="bar-row-top"><span class="bn">${d.label}</span><span class="bv ${missed?'bv-miss':''}">${bv(d)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${missed?100:d.pct}%;background:${missed?REDHEX:c.hex}"></div></div></div>`;
  }).join('');
  const weeklyBody = weekly.map(w=>`<div class="bar-row"><div class="bar-row-top"><span class="bn">${w.label}</span><span class="bv">${w.pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${w.pct}%;background:${c.hex}"></div></div></div>`).join('');
  const monthlyBody = monthly.map(m=>`<div class="bar-row"><div class="bar-row-top"><span class="bn">${m.label}</span><span class="bv">${m.pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${m.pct}%;background:${c.hex}"></div></div></div>`).join('');

  const perfLabels = { daily:'Last 7 days', weekly:'Last 6 weeks', monthly:'Last 6 months' };
  const perfBody = perfTab==='daily' ? dailyBody : (perfTab==='weekly' ? weeklyBody : monthlyBody);

  const perfHtml = `<div class="stat-card">
    <h3>Performance <span class="stat-card-sub">${perfLabels[perfTab]}</span></h3>
    <div class="seg-control" id="perfTabs">
      <button type="button" class="seg-btn ${perfTab==='daily'?'active':''}" data-perf="daily">Daily</button>
      <button type="button" class="seg-btn ${perfTab==='weekly'?'active':''}" data-perf="weekly">Weekly</button>
      <button type="button" class="seg-btn ${perfTab==='monthly'?'active':''}" data-perf="monthly">Monthly</button>
    </div>
    <div style="margin-top:14px;">${perfBody}</div>
  </div>`;

  const dayLabels = ['S','M','T','W','T','F','S'];
  const heatHtml = `<div class="stat-card">
    <h3>Tracking history <span class="stat-card-sub">${rangeLabel(historyRange)}</span></h3>
    <div class="seg-control wrap4" id="historyTabs">
      <button type="button" class="seg-btn ${historyRange==='1m'?'active':''}" data-range="1m">1 Month</button>
      <button type="button" class="seg-btn ${historyRange==='12w'?'active':''}" data-range="12w">12 Weeks</button>
      <button type="button" class="seg-btn ${historyRange==='3m'?'active':''}" data-range="3m">3 Months</button>
      <button type="button" class="seg-btn ${historyRange==='1y'?'active':''}" data-range="1y">1 Year</button>
    </div>
    <div class="heatmap-daylabels" style="margin-top:14px;">${dayLabels.map(l=>`<span>${l}</span>`).join('')}</div>
    <div class="heatmap-grid">
      ${heatRows.map(row=>`<div class="heatmap-row">${row.map(cell=>{
        const isFuture = cell.date > todayStr();
        const noData = cell.eligible===0;
        const hasValue = typeof cell.value==='number';
        const missedLogged = isMeasurable && !noData && hasValue && !cell.done;
        let style = 'background:#EEEAE0;';
        if(!isFuture && !noData){
          style = missedLogged ? `background:${hexToRgba(REDHEX, 0.8)};` : `background:${hexToRgba(c.hex, cell.done ? 0.9 : 0.12)};`;
        }
        let title = '';
        if(!isFuture){
          if(noData) title = `${fmtDate(cell.date)}: not started yet`;
          else if(missedLogged) title = `${fmtDate(cell.date)}: ${cell.value}${g.unit?' '+g.unit:''} — over target`;
          else if(isMeasurable && cell.done) title = `${fmtDate(cell.date)}: ${cell.value}${g.unit?' '+g.unit:''}`;
          else title = `${fmtDate(cell.date)}: ${cell.done ? 'done' : 'not done'}`;
        }
        return `<div class="heatmap-cell ${isFuture?'future':''}" style="${style}" title="${title}"></div>`;
      }).join('')}</div>`).join('')}
    </div>
    <div class="heatmap-legend"><span>Less</span>
      <span class="heatmap-cell" style="background:${hexToRgba(c.hex,0.12)}"></span>
      <span class="heatmap-cell" style="background:${hexToRgba(c.hex,0.9)}"></span>
      <span>More</span>
    </div>
    ${isMeasurable ? `<div class="heatmap-legend" style="margin-top:8px;"><span class="heatmap-cell" style="background:${hexToRgba(REDHEX,0.8)}"></span><span>Logged, over target</span></div>` : ''}
  </div>`;

  const insightCards = [];
  if(bestDay) insightCards.push({icon:'📅', label:'Best day of week', value:bestDay.name+'day', sub:bestDay.pct+'% completion'});
  insightCards.push({icon:'✅', label:'Perfect days', value:perfect30+' / 30', sub:'completed, last 30 days'});
  insightCards.push({icon:'📊', label:'Total completions', value:String(totalCompletions(g)), sub:'since you started'});
  if(isMeasurable){
    insightCards.push({icon:'🔢', label:'Total logged', value:`${goalMeasurableTotal(g)}${g.unit?' '+g.unit:''}`, sub:'sum of every entry, all-time'});
    insightCards.push({icon:'⚠️', label:'Days over target', value:String(goalMeasurableOverDays(g)), sub:'logged, but missed the goal'});
  }

  const insightHtml = `<div class="stat-card"><h3>Other useful analysis</h3>
    <div class="insight-grid">
      ${insightCards.map(i=>`<div class="insight-card"><div class="insight-icon">${i.icon}</div><div class="insight-label">${i.label}</div><div class="insight-value">${escapeHtml(i.value)}</div><div class="insight-sub">${i.sub}</div></div>`).join('')}
    </div>
  </div>`;

  return perfHtml + heatHtml + insightHtml;
}

function wireGoalDetailEvents(g){
  document.getElementById('gdMenuBtn').addEventListener('click', ()=> openActionSheet(g.id));
  document.getElementById('gdEditBtn').addEventListener('click', ()=> openEditGoalForm(g.id));
  document.getElementById('gdDeleteBtn').addEventListener('click', ()=>{
    if(confirm('Delete "'+g.name+'" and all its history?')) deleteGoal(g.id);
  });
  document.querySelectorAll('[data-perf]').forEach(b=> b.addEventListener('click', ()=>{ perfTab = b.dataset.perf; renderGoalDetail(); }));
  document.querySelectorAll('[data-range]').forEach(b=> b.addEventListener('click', ()=>{ historyRange = b.dataset.range; renderGoalDetail(); }));
}

/* ---------- action sheet ---------- */
function openActionSheet(id){
  actionTargetId = id;
  const g = findGoal(id);
  document.getElementById('actionTitle').textContent = 'Manage goal';
  document.getElementById('actionSub').textContent = g ? g.name : '';
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
        // support both flat goals and legacy Main Goal / Sub-Goal backups
        const hasSubgoals = data.goals.some(g=>Array.isArray(g.subgoals));
        goals = hasSubgoals ? flattenLegacyGoals(data.goals) : data.goals;
        if(data.settings) settings = Object.assign(settings, data.settings);
        saveGoals(); saveSettings(); applySettings();
        toast('Backup restored');
        renderCurrentPage();
      } else if(Array.isArray(data.habits)){
        // legacy single-list habit backup
        goals = data.habits.map((h,i)=>({ id: h.id || ('g_'+Date.now()+'_'+i), name: h.name, icon: h.icon || ICONS[i % ICONS.length], colorIdx: h.colorIdx!=null ? h.colorIdx : (i % COLORS.length), createdAt: h.createdAt||todayStr(), notes: h.notes||'', log: h.log||{} }));
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
  document.querySelectorAll('.seg-btn[data-fs]').forEach(b=> b.classList.toggle('active', b.dataset.fs===settings.fontSize));
}

/* ---------- init & events ---------- */
document.getElementById('fabBtn').addEventListener('click', openAddGoalForm);

document.getElementById('goalFormCancel').addEventListener('click', ()=>hideOverlay('goalFormOverlay'));
document.getElementById('goalFormSave').addEventListener('click', saveGoalForm);

document.getElementById('actionEdit').addEventListener('click', ()=>{
  hideOverlay('actionOverlay');
  openEditGoalForm(actionTargetId);
});
document.getElementById('actionDelete').addEventListener('click', ()=>{
  const g = findGoal(actionTargetId);
  if(g && confirm('Delete "'+g.name+'" and all its history?')) deleteGoal(actionTargetId);
});
document.getElementById('actionCancel').addEventListener('click', ()=>hideOverlay('actionOverlay'));

document.getElementById('settingsBtn').addEventListener('click', ()=>showOverlay('settingsOverlay'));
document.getElementById('moreSettingsBtn').addEventListener('click', ()=>showOverlay('settingsOverlay'));
document.getElementById('settingsClose').addEventListener('click', ()=>hideOverlay('settingsOverlay'));
document.getElementById('darkToggle').addEventListener('click', ()=>{ settings.dark=!settings.dark; saveSettings(); applySettings(); renderCurrentPage(); });
document.querySelectorAll('.seg-btn[data-fs]').forEach(b=> b.addEventListener('click', ()=>{ settings.fontSize=b.dataset.fs; saveSettings(); applySettings(); }));

document.getElementById('sortBtn').addEventListener('click', ()=>showOverlay('sortOverlay'));
document.getElementById('sortCloseX').addEventListener('click', ()=>hideOverlay('sortOverlay'));
document.querySelectorAll('[data-sort-radio]').forEach(r=>{
  r.addEventListener('change', ()=>{ currentSort = r.dataset.sortRadio; hideOverlay('sortOverlay'); renderToday(); });
});
function syncSortRadios(){ document.querySelectorAll('[data-sort-radio]').forEach(r=> r.checked = r.dataset.sortRadio===currentSort); }

/* ---------- new-goal form: type toggle / target-type toggle / reminder ---------- */
document.querySelectorAll('#typeToggle .seg-btn').forEach(b=> b.addEventListener('click', ()=> setTypeToggle(b.dataset.type)));
document.querySelectorAll('#targetTypeToggle .seg-btn').forEach(b=> b.addEventListener('click', ()=> setTargetTypeToggle(b.dataset.targetType)));
document.getElementById('gReminderToggle').addEventListener('click', ()=>{
  const on = !document.getElementById('gReminderToggle').classList.contains('on');
  document.getElementById('gReminderToggle').classList.toggle('on', on);
  document.getElementById('reminderTimeField').style.display = on ? 'block' : 'none';
  if(on) ensureNotificationPermission();
});

/* ---------- measurable value-entry sheet ---------- */
document.getElementById('measureCancel').addEventListener('click', ()=>hideOverlay('measureOverlay'));
document.getElementById('measureSave').addEventListener('click', saveMeasureEntry);
document.getElementById('measureClear').addEventListener('click', clearMeasureEntry);

document.querySelectorAll('.nav-item').forEach(n=> n.addEventListener('click', ()=> switchPage(n.dataset.page)));
document.getElementById('goalDetailBackBtn').addEventListener('click', ()=> switchPage(goalDetailReturnPage || 'today'));

document.getElementById('moreExportBtn').addEventListener('click', exportBackup);
document.getElementById('moreImportBtn').addEventListener('click', ()=> document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e=>{ if(e.target.files[0]) importBackup(e.target.files[0]); e.target.value=''; });
document.getElementById('moreResetBtn').addEventListener('click', ()=>{
  if(confirm('Clear every goal and all history? This cannot be undone.')){
    goals = []; saveGoals(); toast('All data cleared'); renderCurrentPage();
  }
});

// close overlays on backdrop click
document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.classList.remove('show'); });
});

/* ---------- daily reminders ---------- */
function ensureNotificationPermission(){
  if('Notification' in window && Notification.permission==='default'){
    Notification.requestPermission();
  }
}
function notifyReminder(g){
  const msg = `Don't forget to log "${g.name}" today`;
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification('Foundation', { body: msg, icon: 'assets/icons/icon-192.png' }); }
    catch(e){ toast(msg); }
  } else {
    toast(msg);
  }
}
function checkReminders(){
  const now = new Date();
  const cur = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const today = todayStr();
  goals.forEach(g=>{
    if(!g.reminderOn || !g.reminderTime || g.reminderTime!==cur) return;
    const key = g.id+'_'+today;
    if(notifiedReminders[key]) return;
    if(isDone(g, today)) return;
    notifiedReminders[key] = true;
    notifyReminder(g);
  });
}

/* ---------- App Lock (PIN) ---------- */
function hashPin(pin){
  const salted = 'fnd_pin_v1_' + pin + '_salt';
  let h = 5381;
  for(let i=0;i<salted.length;i++){ h = ((h<<5)+h) + salted.charCodeAt(i); h |= 0; }
  return String(h);
}
let lockEntry = '';
let lockBusy = false;
function isAppLocked(){ return !!(settings.lockEnabled && settings.lockPin); }
function showLockScreen(){
  document.getElementById('lockScreen').style.display = 'flex';
  lockEntry = '';
  renderLockDots('lockDots', 0, false);
}
function hideLockScreen(){
  document.getElementById('lockScreen').style.display = 'none';
}
function renderLockDots(containerId, count, err){
  const dots = document.querySelectorAll('#'+containerId+' .lock-dot');
  dots.forEach((d,i)=>{
    d.classList.toggle('filled', i<count && !err);
    d.classList.toggle('err', err);
  });
}
function shakeDots(containerId){
  const el = document.getElementById(containerId);
  el.classList.add('shake');
  setTimeout(()=> el.classList.remove('shake'), 350);
}
document.querySelectorAll('#lockKeypad [data-key]').forEach(btn=>{
  btn.addEventListener('click', ()=> handleLockDigit(btn.dataset.key));
});
document.getElementById('lockDelBtn').addEventListener('click', ()=>{
  lockEntry = lockEntry.slice(0,-1);
  renderLockDots('lockDots', lockEntry.length, false);
});
function handleLockDigit(d){
  if(lockBusy || lockEntry.length>=4) return;
  lockEntry += d;
  renderLockDots('lockDots', lockEntry.length, false);
  if(lockEntry.length===4){
    lockBusy = true;
    setTimeout(()=>{
      if(hashPin(lockEntry)===settings.lockPin){
        hideLockScreen();
        lockEntry=''; lockBusy=false;
      } else {
        renderLockDots('lockDots', 4, true);
        shakeDots('lockDots');
        setTimeout(()=>{ lockEntry=''; renderLockDots('lockDots',0,false); lockBusy=false; }, 380);
      }
    }, 120);
  }
}
document.getElementById('lockForgotBtn').addEventListener('click', ()=>{
  showOverlay('lockResetConfirmOverlay');
});
document.getElementById('lockResetCancelBtn').addEventListener('click', ()=> hideOverlay('lockResetConfirmOverlay'));
document.getElementById('lockResetConfirmBtn').addEventListener('click', ()=>{
  try{
    localStorage.removeItem(GOALS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(OLD_GOALS_KEY);
    localStorage.removeItem(OLD_HABITS_KEY);
  }catch(e){}
  goals = [];
  settings = { dark:false, fontSize:'medium', lockEnabled:false, lockPin:null };
  applySettings();
  updateLockStatusLabel();
  hideOverlay('lockResetConfirmOverlay');
  hideLockScreen();
  switchPage('today');
  toast('All data erased. Lock removed.');
});

/* ---------- App Lock setup sheet ---------- */
let lockSetupEntry = '';
let lockSetupStep = null; // 'create' | 'confirm-create' | 'remove-verify' | 'change-verify' | 'change-create' | 'change-confirm'
let lockSetupPendingPin = null;

function openLockSetup(){
  document.getElementById('lockSetupTitle').textContent = 'App Lock';
  document.getElementById('lockSetupSub').textContent = 'Require a PIN to open Foundation';
  document.getElementById('lockToggle').classList.toggle('on', !!settings.lockEnabled);
  document.getElementById('lockChangeRow').style.display = settings.lockEnabled ? 'flex' : 'none';
  closeLockSetupPad();
  showOverlay('lockSetupOverlay');
}
function closeLockSetupPad(){
  lockSetupStep = null;
  lockSetupEntry = '';
  lockSetupPendingPin = null;
  document.getElementById('lockSetupPad').style.display = 'none';
  document.getElementById('lockSetupMenu').style.display = 'block';
  renderLockDots('lockSetupDots', 0, false);
}
function beginLockSetupStep(step, label){
  lockSetupStep = step;
  lockSetupEntry = '';
  document.getElementById('lockSetupStepLabel').textContent = label;
  document.getElementById('lockSetupPad').style.display = 'flex';
  document.getElementById('lockSetupMenu').style.display = 'none';
  renderLockDots('lockSetupDots', 0, false);
}
document.getElementById('lockToggle').addEventListener('click', ()=>{
  if(settings.lockEnabled){
    beginLockSetupStep('remove-verify', 'Enter your PIN to turn off lock');
  } else {
    beginLockSetupStep('create', 'Choose a 4-digit PIN');
  }
});
document.getElementById('lockChangeBtn').addEventListener('click', ()=>{
  beginLockSetupStep('change-verify', 'Enter your current PIN');
});
document.querySelectorAll('#lockSetupKeypad [data-key]').forEach(btn=>{
  btn.addEventListener('click', ()=> handleLockSetupDigit(btn.dataset.key));
});
document.getElementById('lockSetupDelBtn').addEventListener('click', ()=>{
  lockSetupEntry = lockSetupEntry.slice(0,-1);
  renderLockDots('lockSetupDots', lockSetupEntry.length, false);
});
function handleLockSetupDigit(d){
  if(lockSetupEntry.length>=4) return;
  lockSetupEntry += d;
  renderLockDots('lockSetupDots', lockSetupEntry.length, false);
  if(lockSetupEntry.length===4) processLockSetupEntry();
}
function processLockSetupEntry(){
  const entered = lockSetupEntry;
  setTimeout(()=>{
    switch(lockSetupStep){
      case 'create':
        lockSetupPendingPin = entered;
        beginLockSetupStep('confirm-create', 'Confirm your PIN');
        break;
      case 'confirm-create':
        if(entered===lockSetupPendingPin){
          settings.lockEnabled = true;
          settings.lockPin = hashPin(entered);
          saveSettings();
          toast('App lock enabled');
          closeLockSetupPad();
          document.getElementById('lockToggle').classList.add('on');
          document.getElementById('lockChangeRow').style.display = 'flex';
          updateLockStatusLabel();
        } else {
          shakeDots('lockSetupDots');
          renderLockDots('lockSetupDots', 4, true);
          setTimeout(()=>{ toast("PINs didn't match — try again"); beginLockSetupStep('create', 'Choose a 4-digit PIN'); }, 380);
        }
        break;
      case 'remove-verify':
        if(hashPin(entered)===settings.lockPin){
          settings.lockEnabled = false;
          settings.lockPin = null;
          saveSettings();
          toast('App lock turned off');
          closeLockSetupPad();
          document.getElementById('lockToggle').classList.remove('on');
          document.getElementById('lockChangeRow').style.display = 'none';
          updateLockStatusLabel();
        } else {
          shakeDots('lockSetupDots');
          renderLockDots('lockSetupDots', 4, true);
          setTimeout(()=>{ lockSetupEntry=''; renderLockDots('lockSetupDots',0,false); }, 380);
        }
        break;
      case 'change-verify':
        if(hashPin(entered)===settings.lockPin){
          beginLockSetupStep('change-create', 'Enter a new PIN');
        } else {
          shakeDots('lockSetupDots');
          renderLockDots('lockSetupDots', 4, true);
          setTimeout(()=>{ lockSetupEntry=''; renderLockDots('lockSetupDots',0,false); }, 380);
        }
        break;
      case 'change-create':
        lockSetupPendingPin = entered;
        beginLockSetupStep('change-confirm', 'Confirm your new PIN');
        break;
      case 'change-confirm':
        if(entered===lockSetupPendingPin){
          settings.lockPin = hashPin(entered);
          saveSettings();
          toast('PIN updated');
          closeLockSetupPad();
        } else {
          shakeDots('lockSetupDots');
          renderLockDots('lockSetupDots', 4, true);
          setTimeout(()=>{ toast("PINs didn't match — try again"); beginLockSetupStep('change-create', 'Enter a new PIN'); }, 380);
        }
        break;
    }
  }, 120);
}
document.getElementById('moreLockBtn').addEventListener('click', openLockSetup);
document.getElementById('lockSetupClose').addEventListener('click', ()=> hideOverlay('lockSetupOverlay'));
function updateLockStatusLabel(){
  const el = document.getElementById('lockStatusLabel');
  if(!el) return;
  el.textContent = settings.lockEnabled ? 'On' : 'Off';
  el.classList.toggle('on', !!settings.lockEnabled);
}

(async function init(){
  await loadAll();
  applySettings();
  updateLockStatusLabel();
  syncSortRadios();
  document.querySelector('[data-sort-radio="streak-desc"]').checked = true;
  switchPage('today');
  if(isAppLocked()) showLockScreen();
  if(goals.some(g=>g.reminderOn)) ensureNotificationPermission();
  setInterval(checkReminders, 20000);
})();
