/* ============================================================
   Grid Life — личный календарь задач.
   Данные хранятся только на этом устройстве (IndexedDB); вход и сеть
   не нужны. Записи готовы к будущей синхронизации: идентификатор
   создаётся на устройстве, у записи есть время изменения, удаление
   мягкое (deletedAt). Общие помощники приходят из grid.html (GridKit).
   ============================================================ */
(function(){
"use strict";
var K=window.GridKit,$=K.$,$$=K.$$,esc=K.esc,ic=K.ic;

/* ═════════ справочники ═════════ */
var LIFE_KINDS=[
  {id:"chores",label:"Дела",icon:"check",color:"gray"},
  {id:"meet",label:"Встреча",icon:"calendar",color:"blue"},
  {id:"health",label:"Здоровье",icon:"heart",color:"red"},
  {id:"sport",label:"Спорт",icon:"target",color:"orange"},
  {id:"shop",label:"Покупки",icon:"cart",color:"yellow"},
  {id:"study",label:"Учёба",icon:"learn",color:"purple"},
  {id:"family",label:"Семья",icon:"users",color:"pink"},
  {id:"money",label:"Финансы",icon:"coin",color:"green"}];
/* порядок кнопок видов слева направо; открывается по умолчанию «Список» (L.view) */
var VIEWS=[{id:"month",label:"Месяц"},{id:"week",label:"Неделя"},{id:"day",label:"День"},{id:"list",label:"Список"}];
var WEEKDAYS=["пн","вт","ср","чт","пт","сб","вс"];
var MONTHS_GEN=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
var HH=48;                           /* высота часа в сетке дня и недели, px */
var WEEK_MS=7*864e5;

/* ═════════ даты ═════════ */
function today(){return K.todayISO();}
function addDays(s,n){var d=K.parseISO(s);d.setDate(d.getDate()+n);return K.iso(d);}
function addMonths(s,n){var d=K.parseISO(s);d.setDate(1);d.setMonth(d.getMonth()+n);return K.iso(d);}
/* понедельник недели — по нему считаются повторы (дни повтора: пн=0) */
function weekStart(s){var d=K.parseISO(s);d.setDate(d.getDate()-(d.getDay()+6)%7);return K.iso(d);}
/* первый день недели на экране — из настроек (понедельник или воскресенье) */
function shownWeek(s){var d=K.parseISO(s),ws=lp().weekStart;d.setDate(d.getDate()-(d.getDay()-ws+7)%7);return K.iso(d);}
function dayOrder(){return lp().weekStart===0?[6,0,1,2,3,4,5]:[0,1,2,3,4,5,6];}
function wd(s){return WEEKDAYS[(K.parseISO(s).getDay()+6)%7];}
function longDate(s){var d=K.parseISO(s);return d.getDate()+" "+MONTHS_GEN[d.getMonth()];}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function relDay(s){var t=today();return s===t?"Сегодня":s===addDays(t,1)?"Завтра":s===addDays(t,-1)?"Вчера":"";}
function minutes(t){var p=t.split(":");return (+p[0])*60+(+p[1]);}
function hhmm(m){return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");}
function pad(n){return String(n).padStart(2,"0");}
/* время на экране: 14:00 или 2:00 PM — по настройке */
function fmtTime(t){
  if(!t||lp().h24) return t;
  var m=minutes(t);
  return (Math.floor(m/60)%12||12)+":"+pad(m%60)+(m<720?" AM":" PM");
}

/* ═════════ хранилище на устройстве ═════════ */
var db=null;
function openDB(){
  return new Promise(function(res,rej){
    if(!window.indexedDB){rej(new Error("браузер не поддерживает хранение данных"));return;}
    var r=indexedDB.open("grid-life",1);
    r.onupgradeneeded=function(){
      var d=r.result;
      d.createObjectStore("tasks",{keyPath:"id"});
      d.createObjectStore("kinds",{keyPath:"id"});
      d.createObjectStore("files",{keyPath:"id"}).createIndex("taskId","taskId");
      d.createObjectStore("meta",{keyPath:"key"});
    };
    r.onsuccess=function(){res(r.result);};
    r.onerror=function(){rej(r.error);};
  });
}
function all(store){
  return new Promise(function(res,rej){
    var r=db.transaction(store).objectStore(store).getAll();
    r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);};
  });
}
function write(store,recs,clear){
  return new Promise(function(res,rej){
    var t=db.transaction(store,"readwrite"),os=t.objectStore(store);
    if(clear) os.clear();
    [].concat(recs).forEach(function(r){os.put(r);});
    t.oncomplete=function(){res();}; t.onerror=t.onabort=function(){rej(t.error);};
  });
}
function saved(p){
  return p.catch(function(e){K.flash("Не удалось сохранить на устройстве"+(e&&e.message?": "+e.message:""));});
}
function newId(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():K.uid("l");}
function touch(r){r.updatedAt=Date.now();return r;}

var L={ready:false,loading:null,el:null,tasks:[],kinds:[],files:[],meta:{},persisted:null,
  view:"list",cursor:today(),selected:today(),listDays:30,shownKey:""};
try{var v=localStorage.getItem("grid.life.view");if(v&&VIEWS.some(function(x){return x.id===v;}))L.view=v;}catch(e){}

/* есть ли на устройстве Face ID, Touch ID или Windows Hello */
function bioCheck(){
  var P=window.PublicKeyCredential;
  if(!P||!P.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
  return P.isUserVerifyingPlatformAuthenticatorAvailable().catch(function(){return false;});
}
function load(){
  return openDB().then(function(d){
    db=d;
    return Promise.all([all("tasks"),all("kinds"),all("files"),all("meta"),bioCheck()]);
  }).then(function(r){
    L.tasks=r[0]; L.kinds=r[1]; L.files=r[2]; L.bioOK=r[4];
    L.meta={}; r[3].forEach(function(m){L.meta[m.key]=m.value;});
    if(!L.meta.firstUseAt) setMeta("firstUseAt",Date.now());
    L.ready=true;
  });
}
function setMeta(key,value){
  L.meta[key]=value;
  saved(write("meta",{key:key,value:value,updatedAt:Date.now()}));
}
/* настройки Grid Life живут на этом устройстве, вместе с задачами.
   view "last" — открывать вид, на котором закончили */
var LPREFS={view:"last",weekStart:1,h24:true,duration:0,overdue:"block",hidePastDone:false,backupEvery:"week"};
function lp(){return Object.assign({},LPREFS,L.meta.prefs||{});}
function setPref(k,v){var p=lp();p[k]=v;setMeta("prefs",p);}
function putTask(t){touch(t);saved(write("tasks",t));askPersist();}
/* постоянное хранение просим при первой записи: без него браузер может
   очистить данные, когда на устройстве кончается место */
var persistAsked=false;
function askPersist(){
  if(persistAsked||!navigator.storage||!navigator.storage.persist) return;
  persistAsked=true;
  navigator.storage.persist().then(function(p){L.persisted=p;K.renderSettings();},function(){});
}
function checkPersist(){
  if(!navigator.storage||!navigator.storage.persisted) return;
  navigator.storage.persisted().then(function(p){L.persisted=p;K.renderSettings();},function(){});
}

/* ═════════ выборки ═════════ */
function live(){return L.tasks.filter(function(t){return !t.deletedAt;});}
function taskById(id){return K.find(L.tasks,id);}
function ownKinds(){return L.kinds.filter(function(k){return !k.deletedAt;}).sort(K.byOrder);}
/* стандартные типы можно переименовать и перекрасить (kindEdits) и убрать
   из выбора (offKinds); у задач с таким типом он остаётся */
function stdKinds(){var ed=L.meta.kindEdits||{};return LIFE_KINDS.map(function(k){return Object.assign({},k,ed[k.id]);});}
function offKinds(){return L.meta.offKinds||[];}
function kindsAll(withOff){
  return stdKinds().filter(function(k){return withOff||offKinds().indexOf(k.id)<0;}).concat(ownKinds());
}
function kindOf(id){return id?K.find(stdKinds(),id)||K.find(ownKinds(),id):null;}
function hiddenKinds(){return L.meta.hidden||[];}
function visible(t){return hiddenKinds().indexOf(kindOf(t.kind)?t.kind:"")<0;}
function filesOf(id){return L.files.filter(function(f){return f.taskId===id&&!f.deletedAt;});}
function prioRank(t){return ["low","med","high","urgent"].indexOf(t.priority||"med");}

/* ═════════ повторы ═════════ */
/* У повторяющейся задачи repeat = {freq:"day"|"week"|"month"|"year", every:N,
   days:[0–6, пн=0] для недель, end:"never"|"until"|"count", until, count}.
   Отдельные повторы живут в occ по исходной дате: {done} — выполнен только
   он, {deleted} — удалён только он, {patch:{…}} — изменён только он
   (patch.date — перенесён на другой день). */
var MAX_STEPS=20000;
function wdIdx(s){return (K.parseISO(s).getDay()+6)%7;}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function plural(n,one,few,many){
  var a=n%10,b=n%100;
  return a===1&&b!==11?one:a>=2&&a<=4&&(b<12||b>14)?few:many;
}
/* Даты серии в [from,to]. Повторы считаются от начала серии, поэтому
   «после N раз» работает и для дат далеко впереди. Если в месяце нет
   нужного числа (31-е, 29 февраля), повтор пропускается, как в Google. */
function seriesDates(t,from,to){
  var r=t.repeat,out=[],n=0,steps=0,every=Math.max(1,+r.every||1);
  var limit=r.end==="until"&&r.until&&r.until<to?r.until:to;
  var max=r.end==="count"?Math.max(1,+r.count||1):Infinity;
  function add(d){n++;if(d>=from)out.push(d);}
  if(r.freq==="day"){
    for(var d=t.date;d<=limit&&n<max&&steps++<MAX_STEPS;d=addDays(d,every)) add(d);
  }else if(r.freq==="week"){
    var days=(r.days&&r.days.length?r.days:[wdIdx(t.date)]).slice().sort();
    for(var w=weekStart(t.date);w<=limit&&n<max&&steps++<MAX_STEPS;w=addDays(w,7*every)){
      for(var i=0;i<days.length&&n<max;i++){
        var x=addDays(w,days[i]);
        if(x<t.date) continue;
        if(x>limit) break;
        add(x);
      }
    }
  }else{
    var s=K.parseISO(t.date),y=s.getFullYear(),m=s.getMonth(),dd=s.getDate(),step=r.freq==="year"?12*every:every;
    for(var k=0;n<max&&steps++<MAX_STEPS;k++){
      var mm=m+k*step,yy=y+Math.floor(mm/12),mo=mm%12;
      if(dd>daysInMonth(yy,mo)) continue;
      var x2=yy+"-"+pad(mo+1)+"-"+pad(dd);
      if(x2>limit) break;
      add(x2);
    }
  }
  return out;
}
function isSeriesDate(t,d){return seriesDates(t,d,d).length>0;}
function shiftMonths(s,n){
  var d=K.parseISO(s),day=d.getDate();
  d.setDate(1); d.setMonth(d.getMonth()+n);
  d.setDate(Math.min(day,daysInMonth(d.getFullYear(),d.getMonth())));
  return K.iso(d);
}
function repeatLabel(r,date){
  if(!r) return "";
  var n=Math.max(1,+r.every||1),s;
  if(r.freq==="day") s=n===1?"Каждый день":"Каждые "+n+" "+plural(n,"день","дня","дней");
  else if(r.freq==="week") s=(n===1?"Каждую неделю":"Каждые "+n+" "+plural(n,"неделю","недели","недель"))+": "+
    (r.days&&r.days.length?r.days:[wdIdx(date)]).slice().sort().map(function(i){return WEEKDAYS[i];}).join(", ");
  else if(r.freq==="month") s=(n===1?"Каждый месяц":"Каждые "+n+" "+plural(n,"месяц","месяца","месяцев"))+", "+
    K.parseISO(date).getDate()+"-го числа";
  else s=(n===1?"Каждый год":"Каждые "+n+" "+plural(n,"год","года","лет"))+", "+longDate(date);
  if(r.end==="until"&&r.until) s+=", до "+longDate(r.until)+" "+r.until.slice(0,4);
  if(r.end==="count") s+=", всего "+r.count+" "+plural(+r.count,"раз","раза","раз");
  return s;
}

/* Задача в календаре — «появление» в конкретный день: у обычной задачи
   оно одно и совпадает с ней, у повторяющейся их много. it.t — то, что
   показываем (с правками этого повтора), it.task — сама запись,
   it.orig — исходная дата повтора. */
function item(t,date){return {t:t,task:t,orig:date,date:date,done:!!t.done,key:t.id+"|"+date,rec:false};}
function occItem(t,orig){
  var o=(t.occ||{})[orig]||{},v=Object.assign({},t,o.patch||{});
  v.date=(o.patch&&o.patch.date)||orig;
  return {t:v,task:t,orig:orig,date:v.date,done:!!o.done,key:t.id+"|"+orig,rec:true};
}
function occurrencesIn(t,from,to){
  var occ=t.occ||{},out=[],seen={};
  seriesDates(t,from,to).forEach(function(d){
    seen[d]=1;
    if(occ[d]&&occ[d].deleted) return;
    var it=occItem(t,d);
    if(it.date>=from&&it.date<=to) out.push(it);
  });
  /* повторы, перенесённые в этот диапазон из других дней */
  Object.keys(occ).forEach(function(d){
    var o=occ[d];
    if(seen[d]||o.deleted||!o.patch||!o.patch.date||o.patch.date<from||o.patch.date>to||!isSeriesDate(t,d)) return;
    out.push(occItem(t,d));
  });
  return out;
}
function byTime(a,b){
  if(a.date!==b.date) return a.date<b.date?-1:1;
  var x=a.t.time||"",y=b.t.time||"";
  if(x!==y) return x<y?-1:1;
  return prioRank(b.t)-prioRank(a.t)||String(a.t.title).localeCompare(String(b.t.title),"ru");
}
function itemsBetween(from,to){
  var out=[],td=today(),hide=lp().hidePastDone;
  /* по настройке выполненное в прошедших днях не показываем */
  function add(i){if(!(hide&&i.done&&i.date<td)) out.push(i);}
  live().forEach(function(t){
    if(!t.date) return;
    if(t.repeat) occurrencesIn(t,from,to).forEach(function(i){if(visible(i.t)) add(i);});
    else if(visible(t)&&t.date>=from&&t.date<=to) add(item(t,t.date));
  });
  return out.sort(byTime);
}
/* в «Просрочено» от повторяющейся задачи — только последний пропущенный
   повтор, иначе ежедневная привычка заполнила бы весь блок */
function overdue(){
  var t=today(),y=addDays(t,-1),out=[];
  live().forEach(function(x){
    if(!x.date) return;
    if(x.repeat){
      var miss=occurrencesIn(x,addDays(t,-366),y).filter(function(i){return !i.done&&visible(i.t);}).sort(byTime);
      if(miss.length) out.push(miss[miss.length-1]);
    }else if(x.date<t&&!x.done&&visible(x)) out.push(item(x,x.date));
  });
  return out.sort(byTime);
}
function noDate(){
  return live().filter(function(t){return visible(t)&&!t.date;})
    .sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);}).map(function(t){return item(t,"");});
}
function findItem(key){
  var p=String(key).split("|"),t=taskById(p[0]);
  if(!t||t.deletedAt) return null;
  if(!t.repeat) return item(t,t.date);
  var o=(t.occ||{})[p[1]];
  return o&&o.deleted?null:occItem(t,p[1]);
}

/* ═════════ изменения ═════════ */
function blankTask(o){
  var now=Date.now();
  return Object.assign({id:"",title:"",date:today(),time:"",end:"",kind:"",priority:"med",desc:"",done:false,
    repeat:null,occ:{},createdAt:now,updatedAt:now,deletedAt:0},o||{});
}
function occOf(t,orig){t.occ=t.occ||{};return t.occ[orig]||(t.occ[orig]={});}
/* выполнение повтора отмечает только его, остальные повторы не трогает */
function toggleDone(key){
  var it=findItem(key); if(!it) return;
  if(it.rec){var o=occOf(it.task,it.orig);o.done=!o.done;}
  else it.task.done=!it.task.done;
  putTask(it.task);
  render(); repaintPanel();
}
function moveToToday(keys){
  var d=today();
  keys.forEach(function(k){
    var it=findItem(k); if(!it) return;
    if(it.rec){var o=occOf(it.task,it.orig);o.patch=Object.assign({},o.patch,{date:d});}
    else it.task.date=d;
    putTask(it.task);
  });
  render();
  K.flash(keys.length>1?"Задачи перенесены на сегодня":"Задача перенесена на сегодня");
}
function softDelete(t){
  t.deletedAt=Date.now(); putTask(t);
  filesOf(t.id).forEach(function(f){f.deletedAt=Date.now();f.blob=null;saved(write("files",touch(f)));});
}
function removeTask(id){
  var t=taskById(id); if(!t) return;
  if(!confirm("Удалить задачу «"+t.title+"»?")) return;
  softDelete(t); hidePanel();
  K.flash("Задача удалена");
}

/* Правка и удаление повтора. scope: "one" — только этот повтор, "next" —
   этот и следующие (серия делится на две), "all" — вся серия. */
var OCC_FIELDS=["title","date","time","end","kind","priority","desc"];
function splitSeries(t,orig){
  var before=seriesDates(t,t.date,addDays(orig,-1)).length;
  var nt=Object.assign({},t,{id:newId(),date:orig,occ:{},repeat:Object.assign({},t.repeat),createdAt:Date.now()});
  Object.keys(t.occ||{}).forEach(function(d){if(d>=orig){nt.occ[d]=t.occ[d];delete t.occ[d];}});
  if(t.repeat.end==="count") nt.repeat.count=Math.max(1,t.repeat.count-before);
  t.repeat=Object.assign({},t.repeat,{end:"until",until:addDays(orig,-1)});
  L.tasks.push(nt); putTask(t);
  return nt;
}
function applyAll(t,orig,edits){
  Object.keys(edits).forEach(function(f){
    /* новая дата у всей серии — сдвиг её начала на ту же разницу дней */
    if(f==="date"){if(edits.date) t.date=addDays(t.date,K.daysBetween(K.parseISO(orig),K.parseISO(edits.date)));}
    else t[f]=edits[f];
  });
  if(!t.repeat) t.occ={};
  putTask(t);
}
function applyEdits(t,orig,edits,scope){
  if(edits.title!=null&&!edits.title.trim()) edits.title="Без названия";
  if(scope==="one"){
    var o=occOf(t,orig),p=Object.assign({},o.patch);
    OCC_FIELDS.forEach(function(f){if(f in edits)p[f]=edits[f];});
    o.patch=p; putTask(t);
  }else applyAll(scope==="next"&&orig!==t.date?splitSeries(t,orig):t,orig,edits);
  render();
}
function deleteOcc(t,orig,scope){
  if(scope==="one"){occOf(t,orig).deleted=true;putTask(t);}
  else if(scope==="next"&&orig!==t.date){
    t.repeat=Object.assign({},t.repeat,{end:"until",until:addDays(orig,-1)});
    Object.keys(t.occ||{}).forEach(function(d){if(d>=orig)delete t.occ[d];});
    putTask(t);
  }else softDelete(t);
  render();
}
/* Окно с вопросом. buttons — [значение, подпись, класс]; пустое значение —
   «Отмена». pin — ещё поле для четырёх цифр: окно вернёт их, как только
   они набраны. act — что выполнить прямо в нажатии кнопки (Face ID
   Safari запускает только из самого нажатия). «Отмена» и Escape — null. */
function dialog(title,text,buttons,pin,act){
  return new Promise(function(res){
    var box=document.createElement("div");
    box.className="ldialog"; box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true");
    box.setAttribute("aria-label",title);
    box.innerHTML='<div class="ldialog-box"><h3>'+esc(title)+"</h3>"+(text?"<p>"+esc(text)+"</p>":"")+
      (pin?'<input class="lpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN, 4 цифры">':"")+
      buttons.map(function(b){
        return '<button class="btn '+(b[2]||"ghost")+(b[0]?"":" cancel")+'" data-sc="'+b[0]+'">'+esc(b[1])+"</button>";}).join("")+"</div>";
    document.body.appendChild(box);
    function done(v){box.remove();document.removeEventListener("keydown",onKey,true);res(v||null);}
    function onKey(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();done(null);}}
    document.addEventListener("keydown",onKey,true);
    box.addEventListener("click",function(e){
      var b=e.target.closest("[data-sc]");
      if(b&&act&&act[b.dataset.sc]) act[b.dataset.sc]();
      if(b) done(b.dataset.sc); else if(e.target===box) done(null);
    });
    var inp=$(".lpin",box);
    if(inp) inp.addEventListener("input",function(){
      inp.value=inp.value.replace(/\D/g,"").slice(0,4);
      if(inp.value.length===4) done(inp.value);
    });
    (inp||$("button",box)).focus();
  });
}
/* вопрос как в Google Календаре */
function askScope(title,withOne){
  return dialog(title,"",(withOne?[["one","Только эту"]]:[]).concat([["next","Эту и последующие"],["all","Все"],["","Отмена"]]));
}

/* ═════════ отрисовка ═════════ */
function viewTitle(){
  var c=L.cursor;
  if(L.view==="list") return "Ближайшие дни";
  if(L.view==="day") return (relDay(c)?relDay(c)+", ":"")+wd(c)+", "+longDate(c);
  if(L.view==="week"){
    var s=K.parseISO(shownWeek(c)),e=K.parseISO(addDays(shownWeek(c),6));
    return s.getMonth()===e.getMonth()?s.getDate()+"–"+e.getDate()+" "+MONTHS_GEN[e.getMonth()]
      :s.getDate()+" "+K.MONTHS[s.getMonth()]+" – "+e.getDate()+" "+K.MONTHS[e.getMonth()];
  }
  var d=K.parseISO(c);
  return cap(K.MONTHS_FULL[d.getMonth()])+" "+d.getFullYear();
}
function toolbarHTML(){
  var nav=L.view!=="list";
  return '<div class="lt"><div class="lt-views" role="tablist" aria-label="Вид календаря">'+VIEWS.map(function(v){
      return '<button role="tab" data-lview="'+v.id+'" aria-selected="'+(L.view===v.id)+'">'+v.label+"</button>";}).join("")+
    '</div><div class="lt-nav">'+
      (nav?'<button class="icon-btn" data-lnav="-1" aria-label="Назад">'+ic("chevL")+"</button>":"")+
      '<h2 class="lt-title" aria-live="polite">'+esc(viewTitle())+"</h2>"+
      (nav?'<button class="icon-btn" data-lnav="1" aria-label="Вперёд">'+ic("chevR")+"</button>":"")+
      '<button class="btn ghost lt-today" data-ltoday="1">Сегодня</button></div></div>';
}
function kindStyle(t){var k=kindOf(t.kind);return k&&k.color?K.tint(k.color):"";}
function rowHTML(it,od){
  var t=it.t,k=kindOf(t.kind),pr=t.priority||"med",nf=filesOf(t.id).length;
  var when=!it.date?"":od?K.shortDate(K.parseISO(it.date))+(t.time?" "+fmtTime(t.time):"")
    :t.time?fmtTime(t.time)+(t.end?"–"+fmtTime(t.end):""):"весь день";
  var meta=(k?K.kindChip(k):"")+
    (pr==="high"||pr==="urgent"?'<span class="chip prio loud" style="--pc:'+K.prioVar(pr)+";--pcs:"+K.prioSoft(pr)+'">'+
      '<span class="pip"></span>'+(pr==="urgent"?"Срочно":"Высокий")+"</span>":"")+
    (nf?'<span class="chip">'+ic("link")+nf+"</span>":"")+
    (it.rec?'<span class="chip" title="'+esc(repeatLabel(it.task.repeat,it.task.date))+'">'+ic("restore")+"повтор</span>":"");
  return '<div class="lrow'+(it.done?" done":"")+'" style="--pc:'+K.prioVar(pr)+'">'+
    '<button class="check" data-lcheck="'+esc(it.key)+'" role="checkbox" aria-checked="'+it.done+'" aria-label="Выполнено: '+esc(t.title)+'">'+
      K.CHECK_SVG+"</button>"+
    '<button class="lrow-main" data-lopen="'+esc(it.key)+'"><span class="lrow-time">'+esc(when)+"</span>"+
      '<span class="lrow-text"><span class="lrow-title">'+esc(t.title)+'</span><span class="lrow-meta">'+meta+"</span></span></button>"+
    (od?'<button class="btn ghost sm" data-lmove="'+esc(it.key)+'">На сегодня</button>':"")+"</div>";
}
function daySectionHTML(d,items){
  var rel=relDay(d),text=wd(d)+", "+longDate(d);
  return '<section class="lsec"><div class="lday-h"><button class="lday-t'+(d===today()?" today":"")+'" data-lnew="'+d+'">'+
      esc(rel||cap(text))+(rel?"<small>"+esc(text)+"</small>":"")+"</button>"+
      '<button class="icon-btn" data-lnew="'+d+'" aria-label="Добавить задачу на '+esc(longDate(d))+'">'+ic("plus")+"</button></div>"+
    (items.length?items.map(function(i){return rowHTML(i,false);}).join("")
      :'<button class="lempty" data-lnew="'+d+'">Задач нет — нажмите, чтобы добавить</button>')+"</section>";
}
/* напоминание о копии — раз в неделю или в месяц, по настройке */
function backupDue(){
  var every=lp().backupEvery;
  if(every==="never"||!live().length) return false;
  var last=Math.max(L.meta.lastBackupAt||0,L.meta.backupSnooze||0,L.meta.firstUseAt||0);
  return Date.now()-last>(every==="month"?30*864e5:WEEK_MS);
}
function listHTML(){
  var t=today(),h="",od=overdue(),to=addDays(t,L.listDays-1),by={};
  if(backupDue()) h+='<div class="lbanner" role="status"><span><b>Сохраните резервную копию.</b> Данные Grid Life хранятся '+
    "только на этом устройстве — копия пригодится, если с ним что-то случится.</span>"+
    '<div class="row"><button class="btn" data-lexport="1">Сохранить копию</button>'+
    '<button class="btn ghost" data-lsnooze="1">Позже</button></div></div>';
  if(od.length) h+='<section class="lsec od" aria-label="Просрочено"><div class="lsec-h"><h3>Просрочено</h3>'+
      '<span class="n">'+od.length+'</span><span class="sp"></span>'+
      '<button class="btn ghost sm" data-lmoveall="1">Всё на сегодня</button></div>'+
      od.map(function(i){return rowHTML(i,true);}).join("")+"</section>";
  itemsBetween(t,to).forEach(function(i){(by[i.date]=by[i.date]||[]).push(i);});
  for(var d=t;d<=to;d=addDays(d,1)){
    if(d===t||by[d]) h+=daySectionHTML(d,by[d]||[]);
  }
  h+='<button class="lmore" data-lmore="1">Показать ещё 30 дней</button>';
  var nd=noDate();
  h+='<section class="lsec"><div class="lsec-h"><h3>Без даты</h3><span class="n">'+(nd.length||"")+"</span>"+
    '<span class="sp"></span><button class="icon-btn" data-lnew="none" aria-label="Добавить задачу без даты">'+ic("plus")+"</button></div>"+
    (nd.length?nd.map(function(i){return rowHTML(i,false);}).join("")
      :'<button class="lempty" data-lnew="none">Сюда попадают задачи без даты</button>')+"</section>";
  h+='<p class="lnote">Данные Grid Life хранятся только на этом устройстве.</p>';
  return '<div class="lv-body"><div class="lpane">'+h+"</div></div>";
}

/* день и неделя: сетка часов; пересекающиеся задачи встают рядом */
function layout(items){
  var ev=items.map(function(i){
    var s=minutes(i.t.time),e=i.t.end?minutes(i.t.end):s+30;
    return {i:i,s:s,e:Math.max(e,s+30)};
  }).sort(function(a,b){return a.s-b.s||b.e-a.e;});
  var group=null,end=-1,groups=[];
  ev.forEach(function(x){
    if(!group||x.s>=end){group=[];groups.push(group);end=x.e;}
    group.push(x); end=Math.max(end,x.e);
  });
  groups.forEach(function(g){
    var cols=[];
    g.forEach(function(x){
      for(var c=0;c<cols.length;c++){if(cols[c]<=x.s){x.col=c;cols[c]=x.e;return;}}
      x.col=cols.length; cols.push(x.e);
    });
    g.forEach(function(x){x.cols=cols.length;});
  });
  return ev;
}
function chipHTML(i){
  return '<button class="lchip'+(i.done?" done":"")+'" data-lopen="'+esc(i.key)+'" style="'+kindStyle(i.t)+'">'+esc(i.t.title)+"</button>";
}
function blockHTML(x){
  var t=x.i.t;
  return '<button class="lblk'+(x.i.done?" done":"")+'" data-lopen="'+esc(x.i.key)+'" style="top:'+(x.s*HH/60)+"px;height:"+
    ((x.e-x.s)*HH/60-2)+"px;left:calc("+(x.col*100/x.cols)+"% + 2px);width:calc("+(100/x.cols)+"% - 4px);"+kindStyle(t)+'">'+
    "<b>"+esc(t.title)+"</b><span>"+fmtTime(t.time)+(t.end?"–"+fmtTime(t.end):"")+"</span></button>";
}
function gridHTML(dates,cls){
  var t=today(),by={},hours="",h24=lp().h24;
  itemsBetween(dates[0],dates[dates.length-1]).forEach(function(i){(by[i.date]=by[i.date]||[]).push(i);});
  for(var h=1;h<24;h++) hours+='<span style="top:'+h*HH+'px">'+(h24?pad(h)+"<i>:00</i>":(h%12||12)+"<i>"+(h<12?" AM":" PM")+"</i>")+"</span>";
  var now=new Date(),nowTop=(now.getHours()*60+now.getMinutes())*HH/60;
  return '<div class="lgrid '+cls+'" style="--days:'+dates.length+";--hh:"+HH+'px">'+
    '<div class="lg-row lg-head"><div></div>'+dates.map(function(d){
      return '<button class="lg-dh'+(d===t?" today":"")+'" data-lgoto="'+d+'" aria-label="'+esc(longDate(d))+'">'+wd(d)+
        "<b>"+K.parseISO(d).getDate()+"</b></button>";}).join("")+"</div>"+
    '<div class="lg-row lg-allday"><div class="lg-gutter">весь<br>день</div>'+dates.map(function(d){
      return '<div class="lg-ad" data-lad="'+d+'" title="Добавить задачу на весь день">'+
        (by[d]||[]).filter(function(i){return !i.t.time;}).map(chipHTML).join("")+"</div>";}).join("")+"</div>"+
    '<div class="lg-scroll"><div class="lg-body"><div class="lg-hours">'+hours+"</div>"+dates.map(function(d){
      return '<div class="lcol'+(d===t?" today":"")+'" data-lslot="'+d+'">'+
        layout((by[d]||[]).filter(function(i){return i.t.time;})).map(blockHTML).join("")+
        (d===t?'<div class="lnow" style="top:'+nowTop+'px"></div>':"")+"</div>";}).join("")+
    "</div></div></div>";
}
function monthHTML(){
  var c=L.cursor,first=c.slice(0,8)+"01",start=shownWeek(first),t=today(),sel=L.selected||t,by={},cells="";
  itemsBetween(start,addDays(start,41)).forEach(function(i){(by[i.date]=by[i.date]||[]).push(i);});
  for(var n=0;n<42;n++){
    var d=addDays(start,n),list=by[d]||[],out=d.slice(0,7)!==c.slice(0,7);
    cells+='<div class="mc'+(out?" out":"")+(d===t?" today":"")+(d===sel?" sel":"")+'" data-lsel="'+d+'">'+
      '<button class="mc-n" data-lsel="'+d+'" aria-label="'+esc(longDate(d))+(list.length?", задач: "+list.length:"")+
        (d===sel?", выбран — нажмите ещё раз, чтобы добавить задачу":"")+'">'+K.parseISO(d).getDate()+"</button>"+
      '<span class="mc-items">'+list.slice(0,3).map(chipHTML).join("")+
        (list.length>3?'<span class="mc-more">ещё '+(list.length-3)+"</span>":"")+"</span>"+
      '<span class="mc-dots" aria-hidden="true">'+list.slice(0,3).map(function(i){
        return '<i style="'+kindStyle(i.t)+'"></i>';}).join("")+"</span></div>";
  }
  return '<div class="lv-body"><div class="lmonth"><div class="lm-week">'+dayOrder().map(function(i){return "<span>"+WEEKDAYS[i]+"</span>";}).join("")+
    '</div><div class="lm-grid">'+cells+'</div><div class="lm-agenda">'+daySectionHTML(sel,itemsBetween(sel,sel))+"</div></div></div>";
}
function bodyHTML(){
  if(L.view==="day") return gridHTML([L.cursor],"day");
  if(L.view==="week"){var s=shownWeek(L.cursor),ds=[];for(var i=0;i<7;i++)ds.push(addDays(s,i));return gridHTML(ds,"week");}
  if(L.view==="month") return monthHTML();
  return listHTML();
}
function render(){
  if(!L.el) return;
  if(!L.ready){
    if(!L.el.innerHTML) L.el.innerHTML='<div class="skeleton"><span class="spin"></span>Открываем календарь…</div>';
    return;
  }
  var key=L.view+"|"+(L.view==="list"?"":L.cursor),old=$(".lv-body,.lg-scroll",L.el),top=old?old.scrollTop:0;
  L.el.innerHTML='<div class="lv">'+toolbarHTML()+bodyHTML()+"</div>"+
    '<button class="lfab" data-lfab="1" aria-label="Новая задача">'+ic("plus")+"</button>";
  var sc=$(".lv-body,.lg-scroll",L.el);
  if(sc){
    if(key===L.shownKey) sc.scrollTop=top;
    else if(L.view==="day"||L.view==="week"){
      var n=new Date(),inView=$(".lcol.today",L.el);
      sc.scrollTop=inView?Math.max(0,(n.getHours()-1)*HH):7*HH;
    }
  }
  L.shownKey=key;
}
function setView(v,cursor){
  L.view=v; if(cursor) L.cursor=cursor;
  try{localStorage.setItem("grid.life.view",v);}catch(e){}
  render(); K.renderSide();
}

/* ═════════ панель задачи ═════════ */
var panel=document.createElement("aside");
panel.className="drawer lp"; panel.id="lifePanel";
panel.setAttribute("aria-hidden","true"); panel.setAttribute("aria-label","Задача Grid Life");
document.body.appendChild(panel);
var filePick=document.createElement("input");
filePick.type="file"; filePick.hidden=true; document.body.appendChild(filePick);

/* P.id и P.date — открытая задача и исходная дата её повтора. P.draft —
   новая задача, ещё не сохранённая: она записывается при первом символе
   названия. Если задача открыта уже повторяющейся (P.series), правки
   копятся в P.edits, а при закрытии панели доска спрашивает: только этот
   повтор, этот и следующие или все. Задача, которая стала повторяющейся
   здесь же, в панели, правится напрямую — спрашивать не о чем. */
var P={id:null,date:"",draft:null,edits:{},custom:false,series:false},titleT=null;
function series(){var t=P.series&&!P.draft&&taskById(P.id);return t&&t.repeat?t:null;}
function cur(){
  if(P.draft) return P.draft;
  var t=taskById(P.id); if(!t) return null;
  return series()?Object.assign(occItem(t,P.date).t,P.edits):t;
}
/* изменение поля: у черновика — в нём, у повтора — в P.edits, иначе сразу запись */
function edit(name,value){
  if(P.draft){P.draft[name]=value;return;}
  if(series()){P.edits[name]=value;return;}
  var t=taskById(P.id); if(!t) return;
  t[name]=value;
  if(name==="date"||name==="repeat") P.date=t.date;
  putTask(t);
}
function panelOpen(){return panel.classList.contains("on");}
function openTask(key){
  var it=findItem(key); if(!it) return;
  P={id:it.task.id,date:it.orig,draft:null,edits:{},custom:false,series:!!it.task.repeat}; showPanel(false);
}
function newTask(o){
  P={id:null,date:"",draft:blankTask(o),edits:{},custom:false,series:false}; showPanel(true);
}
/* Клавиатура iPhone не уменьшает окно, а наезжает на него. На телефоне лист
   задачи поднимаем над ней по видимой области экрана (visualViewport) и
   держим форму прокрученной к началу, пока в фокусе название. */
var vv=window.visualViewport,phone=window.matchMedia("(max-width:640px)");
function fitSheet(){
  if(!panelOpen()||!phone.matches||!vv){panel.style.bottom="";panel.style.maxHeight="";return;}
  var kb=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);
  panel.style.bottom=kb+"px";
  panel.style.maxHeight=Math.max(240,Math.round(vv.height)-8)+"px";
  var body=$(".d-body",panel);
  if(body&&document.activeElement&&document.activeElement.matches("[data-lf=title]")) body.scrollTop=0;
}
if(vv){vv.addEventListener("resize",fitSheet);vv.addEventListener("scroll",fitSheet);}
function showPanel(focusTitle){
  K.closeSheet(); K.closeSide();
  panel.innerHTML=panelHTML();
  panel.classList.add("on"); K.scrim.classList.add("on"); panel.setAttribute("aria-hidden","false");
  fitTitle();
  var body=$(".d-body",panel); if(body) body.scrollTop=0;      /* форма — с самого верха */
  var b=focusTitle?$("[data-lf=title]",panel):$("[data-dclose]",panel);
  if(b) b.focus({preventScroll:true});
  fitSheet();
}
function fitTitle(){var ta=$("[data-lf=title]",panel);if(ta){ta.style.height="auto";ta.style.height=ta.scrollHeight+"px";}}
function repaintPanel(){
  if(!panelOpen()||!cur()) return;
  var body=$(".d-body",panel),top=body?body.scrollTop:0;
  panel.innerHTML=panelHTML(); fitTitle();
  body=$(".d-body",panel); if(body) body.scrollTop=top;
}
function commitDraft(){
  var d=P.draft; if(!d||!d.title.trim()) return;
  d.id=newId(); d.title=d.title.trim(); d.createdAt=Date.now();
  L.tasks.push(d); putTask(d);
  P={id:d.id,date:d.date,draft:null,edits:{},custom:P.custom,series:false};
  render();
}
function flushTitle(){
  if(!titleT) return;
  clearTimeout(titleT.timer); var run=titleT.run; titleT=null; run();
}
function hidePanel(){
  panel.classList.remove("on"); K.scrim.classList.remove("on"); panel.setAttribute("aria-hidden","true");
  fitSheet();
  P={id:null,date:"",draft:null,edits:{},custom:false,series:false};
  render();
}
/* discard — закрыть без вопроса и без несохранённых правок повтора (смена режима) */
function closePanel(discard){
  if(!panelOpen()) return false;
  flushTitle();
  var s=series();
  if(s&&Object.keys(P.edits).length&&!discard){
    askScope("Изменить повторяющуюся задачу",!("repeat" in P.edits)).then(function(sc){
      if(!sc) return;                    /* «Отмена» — остаёмся в панели */
      applyEdits(s,P.date,P.edits,sc); hidePanel();
    });
    return true;
  }
  var t=P.draft?null:taskById(P.id);
  if(t&&!t.title.trim()){t.title="Без названия";putTask(t);}
  hidePanel();
  return true;
}
function setField(name,value){
  edit(name,value);
  render(); repaintPanel();
}
/* окончание новой задачи по длительности из настроек; не позже полуночи */
function endFor(time){
  var d=lp().duration,e=time?minutes(time)+d:0;
  return d&&e<24*60?hhmm(e):"";
}

/* повтор: готовые варианты, свой интервал, дни недели и окончание */
var REPEATS=[["none","Не повторять"],["day","Каждый день"],["week","Каждую неделю"],["2week","Каждые 2 недели"],
  ["month","Каждый месяц"],["year","Каждый год"],["custom","Свой интервал…"]];
function presetOf(r){
  if(!r) return "none";
  var n=+r.every||1;
  if(n===1&&r.freq!=="week") return r.freq;
  if(r.freq==="week"&&(n===1||n===2)) return n===1?"week":"2week";
  return "custom";
}
function setRepeat(fn){
  var t=cur(),r=Object.assign({freq:"week",every:1,days:[],end:"never",until:"",count:10},t.repeat||{});
  if(!t.date) edit("date",today());
  fn(r,cur().date||today());
  if(r.freq!=="week") r.days=[];
  else if(!r.days.length) r.days=[wdIdx(cur().date||today())];
  setField("repeat",r);
}
function repeatHTML(t){
  var r=t.repeat,preset=presetOf(r),custom=P.custom||preset==="custom",n=r?Math.max(1,+r.every||1):1;
  var h='<select data-lrep="1" aria-label="Повтор">'+REPEATS.map(function(o){
    return '<option value="'+o[0]+'"'+(o[0]===(custom&&r?"custom":preset)?" selected":"")+">"+o[1]+"</option>";}).join("")+"</select>";
  if(!r) return h;
  if(custom) h+='<div class="rep-row"><span>Каждые</span><input type="number" min="1" max="99" data-lrevery="1" value="'+n+'" aria-label="Интервал повтора">'+
    '<select data-lrunit="1" aria-label="Единица интервала">'+[["day",plural(n,"день","дня","дней")],["week",plural(n,"неделю","недели","недель")],
      ["month",plural(n,"месяц","месяца","месяцев")],["year",plural(n,"год","года","лет")]].map(function(u){
      return '<option value="'+u[0]+'"'+(r.freq===u[0]?" selected":"")+">"+u[1]+"</option>";}).join("")+"</select></div>";
  if(r.freq==="week") h+='<div class="wdays" role="group" aria-label="Дни недели">'+dayOrder().map(function(i){
    return '<button data-lwd="'+i+'" aria-pressed="'+((r.days||[]).indexOf(i)>=0)+'">'+WEEKDAYS[i]+"</button>";}).join("")+"</div>";
  h+='<div class="rep-end"><span class="lbl">Окончание</span><div class="quick">'+
      '<button data-lrend="never" aria-pressed="'+(r.end==="never")+'">Бессрочно</button>'+
      '<button data-lrend="until" aria-pressed="'+(r.end==="until")+'">До даты</button>'+
      '<button data-lrend="count" aria-pressed="'+(r.end==="count")+'">После N раз</button>'+
      '<button data-lrq="1" title="Повторять месяц">Месяц</button>'+
      '<button data-lrq="12" title="Повторять год">Год</button></div>'+
    (r.end==="until"?'<div class="rep-row"><span>до</span><input type="date" data-lruntil="1" value="'+esc(r.until)+'" aria-label="Повторять до"></div>':"")+
    (r.end==="count"?'<div class="rep-row"><span>всего</span><input type="number" min="1" max="999" data-lrcount="1" value="'+(+r.count||1)+
      '" aria-label="Число повторений"><span>'+plural(+r.count||1,"раз","раза","раз")+"</span></div>":"")+
    '</div><p class="hint">'+esc(repeatLabel(r,t.date||today()))+"</p>";
  return h;
}
function panelHTML(){
  var t=cur(),isNew=!!P.draft,s=series(),allDay=!t.time,pr=t.priority||"med",fs=isNew?[]:filesOf(t.id),td=today(),tm=addDays(td,1);
  /* тип, убранный из списка, у задачи всё равно виден */
  var ks=kindsAll(); if(t.kind&&!K.find(ks,t.kind)&&kindOf(t.kind)) ks=ks.concat([kindOf(t.kind)]);
  var eyebrow=isNew?"Новая задача":(s?"Повтор · ":"")+(t.date?(relDay(t.date)?relDay(t.date)+", ":"")+longDate(t.date):"Без даты");
  var body='<div class="d-body"><div class="d-title-row">'+
      (isNew?"":'<button class="check" data-lpcheck="1" role="checkbox" aria-checked="'+(findItem(P.id+"|"+P.date)||{done:!!t.done}).done+
        '" style="margin-top:9px" aria-label="'+(s?"Выполнен этот повтор":"Выполнено")+'">'+K.CHECK_SVG+"</button>")+
      '<textarea class="d-title'+(t.done?" done":"")+'" data-lf="title" rows="1" maxlength="200" placeholder="Что нужно сделать?" aria-label="Название задачи">'+
        esc(t.title)+"</textarea></div>"+
    (s&&Object.keys(P.edits).length?'<p class="hint rep-pending">Изменения повторяющейся задачи сохранятся по кнопке «Готово».</p>':"")+
    '<div class="fields">'+
      '<span class="lbl">Дата</span><div class="ctl"><input type="date" data-lf="date" value="'+esc(t.date)+'" aria-label="Дата">'+
        '<div class="quick"><button data-lq="'+td+'" aria-pressed="'+(t.date===td)+'">Сегодня</button>'+
        '<button data-lq="'+tm+'" aria-pressed="'+(t.date===tm)+'">Завтра</button>'+
        (t.repeat?"":'<button data-lq="" aria-pressed="'+!t.date+'">Без даты</button>')+"</div></div>"+
      '<span class="lbl">Время</span><div class="ctl">'+
        '<label class="switch"><input type="checkbox" data-lallday="1"'+(allDay?" checked":"")+"><span><b>Весь день</b></span></label>"+
        (allDay?"":'<div class="times"><input type="time" data-lf="time" value="'+esc(t.time)+'" aria-label="Начало">'+
          '<span>–</span><input type="time" data-lf="end" value="'+esc(t.end)+'" aria-label="Окончание, необязательно"></div>'+
          '<p class="hint">Окончание можно не указывать.</p>')+"</div>"+
      '<span class="lbl">Повтор</span><div class="ctl">'+repeatHTML(t)+"</div>"+
      '<span class="lbl">Тип</span><div class="ctl"><div class="seg kinds">'+ks.map(function(k){
          return '<button data-lkind="'+esc(k.id)+'" aria-pressed="'+(t.kind===k.id)+'" style="'+K.tint(k.color)+'">'+ic(k.icon)+esc(k.label)+"</button>";
        }).join("")+'<button class="add" data-lknew="1">'+ic("plus")+"Свой тип</button></div></div>"+
      '<span class="lbl">Приоритет</span><div class="ctl"><div class="seg">'+K.PRIOS.map(function(p){
          return '<button data-lprio="'+p.id+'" aria-pressed="'+(pr===p.id)+'" style="--pc:'+K.prioVar(p.id)+";--pcs:"+K.prioSoft(p.id)+'">'+
            '<span class="pip"></span>'+esc(p.label)+"</button>";}).join("")+"</div></div>"+
    "</div>"+
    '<div><div class="sect-h"><h3>Описание</h3></div><textarea class="d-desc" data-lf="desc" maxlength="1000" '+
      'placeholder="Коротко: где, что взять, кому позвонить…" aria-label="Описание">'+esc(t.desc)+"</textarea></div>"+
    '<div><div class="sect-h"><h3>Файлы</h3><span class="n">'+fs.length+'</span><span class="sp"></span>'+
      '<button class="btn ghost" data-lfile="1" style="padding:4px 10px;font-size:12px"'+(isNew?" disabled":"")+">Прикрепить</button></div>"+
      (fs.length?'<div class="files">'+fs.map(function(f){
        return '<div class="file"><span class="ic">'+ic("report")+'</span><span class="nm"><b>'+esc(f.name)+"</b><span>"+K.fmtSize(f.size)+"</span></span>"+
          '<button class="icon-btn" data-lfopen="'+esc(f.id)+'" title="Открыть" aria-label="Открыть файл">'+ic("download")+"</button>"+
          '<button class="x" data-lfdel="'+esc(f.id)+'" aria-label="Удалить файл">'+K.X_BTN+"</button></div>";}).join("")+"</div>"
        :'<div class="drop-hint">'+(isNew?"Файлы можно прикрепить, когда у задачи появится название.":"Файлы хранятся только на этом устройстве.")+"</div>")+
    "</div></div>";
  var foot='<div class="d-foot">'+(isNew?"":'<button class="btn danger" data-lpdel="1">Удалить</button>')+
    '<span class="sp" style="flex:1"></span><button class="btn" data-lpdone="1">Готово</button></div>';
  return K.drawerHead(eyebrow)+body+foot;
}
panel.addEventListener("click",function(e){
  var t=e.target,b,task=cur(); if(!task) return;
  if(t.closest("button")) flushTitle();
  if(t.closest("[data-dclose]")||t.closest("[data-lpdone]")){closePanel();return;}
  if(t.closest("[data-lpcheck]")){toggleDone(P.id+"|"+P.date);return;}
  if((b=t.closest("[data-lq]"))){setField("date",b.dataset.lq);return;}
  if((b=t.closest("[data-lkind]"))){setField("kind",task.kind===b.dataset.lkind?"":b.dataset.lkind);return;}
  if((b=t.closest("[data-lknew]"))){editKind(b,null,function(id){setField("kind",id);});return;}
  if((b=t.closest("[data-lprio]"))){setField("priority",b.dataset.lprio);return;}
  if((b=t.closest("[data-lwd]"))){
    var i=+b.dataset.lwd;
    setRepeat(function(r){
      var d=(r.days||[]).slice(),at=d.indexOf(i);
      if(at<0) d.push(i); else if(d.length>1) d.splice(at,1);
      r.days=d.sort();
    });
    return;}
  if((b=t.closest("[data-lrend]"))){
    var end=b.dataset.lrend;
    setRepeat(function(r,date){
      r.end=end;
      if(end==="until"&&(!r.until||r.until<date)) r.until=shiftMonths(date,1);
      if(end==="count"&&!(+r.count>0)) r.count=10;
    });
    return;}
  /* быстрые варианты окончания: повторять месяц или год от даты задачи */
  if((b=t.closest("[data-lrq]"))){
    var months=+b.dataset.lrq;
    setRepeat(function(r,date){r.end="until";r.until=shiftMonths(date,months);});
    return;}
  if(t.closest("[data-lpdel]")){
    var s=series();
    if(!s){removeTask(task.id);return;}
    askScope("Удалить повторяющуюся задачу",true).then(function(sc){
      if(!sc) return;
      deleteOcc(s,P.date,sc); hidePanel();
      K.flash(sc==="one"?"Повтор удалён":"Повторы удалены");
    });
    return;}
  if(t.closest("[data-lfile]")){pickFile(task.id);return;}
  if((b=t.closest("[data-lfopen]"))){openFile(b.dataset.lfopen);return;}
  if((b=t.closest("[data-lfdel]"))) dropFile(b.dataset.lfdel);
});
panel.addEventListener("change",function(e){
  var t=e.target,task=cur(); if(!task) return;
  if(t.matches("[data-lallday]")){
    if(t.checked){edit("end","");setField("time","");}
    else{
      var tm=task.date===today()?hhmm(Math.min(23,new Date().getHours()+1)*60):"09:00";
      edit("end",endFor(tm)); setField("time",tm);
    }
    return;
  }
  if(t.matches("[data-lf=date]")){
    if(!t.value&&task.repeat){K.flash("У повторяющейся задачи должна быть дата");repaintPanel();return;}
    setField("date",t.value||""); return;}
  if(t.matches("[data-lf=time]")){
    if(!t.value){edit("end","");setField("time","");return;}
    if(task.end&&task.end<=t.value) edit("end","");
    setField("time",t.value); return;
  }
  if(t.matches("[data-lf=end]")){
    if(t.value&&t.value<=task.time){K.flash("Окончание должно быть позже начала");repaintPanel();return;}
    setField("end",t.value||""); return;
  }
  if(t.matches("[data-lrep]")){
    var v=t.value;
    P.custom=v==="custom";
    if(v==="none"){setField("repeat",null);return;}
    if(v==="custom"){if(task.repeat) repaintPanel(); else setRepeat(function(){});return;}
    setRepeat(function(r){r.freq=v==="2week"?"week":v;r.every=v==="2week"?2:1;});
    return;
  }
  if(t.matches("[data-lrevery]")){var n=K.clamp(Math.round(+t.value||1),1,99);setRepeat(function(r){r.every=n;});return;}
  if(t.matches("[data-lrunit]")){setRepeat(function(r){r.freq=t.value;});return;}
  if(t.matches("[data-lruntil]")){
    if(t.value&&t.value<task.date){K.flash("Дата окончания раньше начала повторов");repaintPanel();return;}
    setRepeat(function(r){r.until=t.value;if(!t.value)r.end="never";});
    return;
  }
  if(t.matches("[data-lrcount]")){var c=K.clamp(Math.round(+t.value||1),1,999);setRepeat(function(r){r.count=c;});}
});
/* название и описание: у обычной задачи — запись с задержкой, пока
   человек печатает; у повтора — в отложенные правки */
panel.addEventListener("input",function(e){
  var t=e.target,task=cur(),f=t.dataset&&t.dataset.lf; if(!task||(f!=="title"&&f!=="desc")) return;
  if(f==="title") fitTitle();
  if(P.draft){
    P.draft[f]=t.value;
    if(f!=="title"||!t.value.trim()) return;
    /* задача сохранена: панель получает флажок и «Удалить», курсор остаётся в названии */
    commitDraft(); repaintPanel();
    var ta=$("[data-lf=title]",panel); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
    return;
  }
  if(series()){P.edits[f]=t.value;return;}
  var rec=taskById(P.id); rec[f]=t.value;
  if(titleT) clearTimeout(titleT.timer);
  titleT={run:function(){putTask(rec);render();}};
  titleT.timer=setTimeout(flushTitle,400);
});
panel.addEventListener("keydown",function(e){
  if(e.key==="Enter"&&e.target.matches("[data-lf=title]")){e.preventDefault();closePanel();}
});

/* ═════════ файлы на устройстве ═════════ */
function pickFile(taskId){
  filePick.value="";
  filePick.onchange=function(){
    var f=filePick.files&&filePick.files[0]; if(!f) return;
    var now=Date.now(),rec={id:newId(),taskId:taskId,name:f.name,size:f.size,mime:f.type||"application/octet-stream",
      blob:f,createdAt:now,updatedAt:now,deletedAt:0};
    L.files.push(rec);
    saved(write("files",rec)); askPersist();
    repaintPanel(); render();
  };
  filePick.click();
}
function openFile(id){
  var f=K.find(L.files,id); if(!f||!f.blob){K.flash("Файл недоступен.");return;}
  var a=document.createElement("a");
  a.href=URL.createObjectURL(f.blob); a.download=f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function dropFile(id){
  var f=K.find(L.files,id); if(!f||!confirm("Удалить файл «"+f.name+"»?")) return;
  f.deletedAt=Date.now(); f.blob=null;
  saved(write("files",touch(f)));
  repaintPanel(); render();
}

/* ═════════ свои типы ═════════ */
/* kind — свой тип, стандартный (тогда правка ложится в kindEdits) или null для нового */
function editKind(anchor,kind,onCreate){
  var std=kind&&K.find(LIFE_KINDS,kind.id),edits=L.meta.kindEdits||{};
  function done(){render(); repaintPanel(); K.renderSide(); K.renderSettings();}
  if(std) return K.typeEditor(anchor,{kind:kind,title:"Стандартный тип",
    save:function(d){var e=Object.assign({},edits);e[kind.id]=d;setMeta("kindEdits",e);done();},
    removeLabel:"Как было",
    remove:edits[kind.id]?function(){var e=Object.assign({},edits);delete e[kind.id];setMeta("kindEdits",e);done();}:null});
  K.typeEditor(anchor,{kind:kind,title:kind?"Свой тип":"Новый тип задачи",
    save:function(d){
      if(kind){Object.assign(kind,d);saved(write("kinds",touch(kind)));}
      else{
        var own=ownKinds(),now=Date.now();
        kind=Object.assign({id:newId(),order:K.orderBetween(own.length?own[own.length-1].order:null,null),
          createdAt:now,updatedAt:now,deletedAt:0},d);
        L.kinds.push(kind); saved(write("kinds",kind));
        if(onCreate) onCreate(kind.id);
      }
      done();
    },
    remove:kind?function(){
      var users=live().filter(function(t){return t.kind===kind.id;});
      if(!confirm("Удалить тип «"+kind.label+"»?"+(users.length?" Он снимется с задач: "+users.length+".":""))) return;
      users.forEach(function(t){t.kind="";putTask(t);});
      kind.deletedAt=Date.now(); saved(write("kinds",touch(kind)));
      done();
    }:null});
}

/* ═════════ резервная копия ═════════ */
function blobToBase64(b){
  return new Promise(function(res,rej){
    var r=new FileReader();
    r.onload=function(){res(String(r.result).split(",")[1]||"");}; r.onerror=function(){rej(r.error);};
    r.readAsDataURL(b);
  });
}
/* в копию идут и настройки, кроме PIN: копию открывают и на другом устройстве */
var BACKUP_META=["hidden","prefs","kindEdits","offKinds"];
function exportBackup(){
  var files=L.files.filter(function(f){return !f.deletedAt&&f.blob;});
  return Promise.all(files.map(function(f){
    return blobToBase64(f.blob).then(function(data){
      var o=Object.assign({},f); delete o.blob; o.data=data; return o;});
  })).then(function(fs){
    var settings={};
    BACKUP_META.forEach(function(k){if(L.meta[k]!=null) settings[k]=L.meta[k];});
    var dump={app:"grid-life",version:1,exportedAt:new Date().toISOString(),
      tasks:live(),kinds:ownKinds(),files:fs,settings:settings};
    var a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([JSON.stringify(dump)],{type:"application/json"}));
    a.download="grid-life-"+today()+".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    setMeta("lastBackupAt",Date.now());
    render(); K.renderSettings();
    K.flash("Копия сохранена: "+a.download);
    return true;
  },function(e){K.flash("Не удалось собрать копию: "+(e&&e.message||""));return false;});
}
function importBackup(){
  filePick.value=""; filePick.accept="application/json,.json";
  filePick.onchange=function(){
    filePick.accept="";
    var f=filePick.files&&filePick.files[0]; if(!f) return;
    f.text().then(function(txt){
      var d=JSON.parse(txt);
      if(!d||d.app!=="grid-life"||!Array.isArray(d.tasks)) throw new Error("это не резервная копия Grid Life");
      var when=d.exportedAt?new Date(d.exportedAt).toLocaleString("ru-RU"):"неизвестной даты";
      if(!confirm("Восстановить копию от "+when+"? Задачи Grid Life на этом устройстве заменятся задачами из копии ("+
        d.tasks.length+").")) return;
      var files=(d.files||[]).map(function(x){
        var bin=atob(x.data||""),u=new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
        var o=Object.assign({},x); delete o.data; o.blob=new Blob([u],{type:x.mime||"application/octet-stream"}); return o;
      });
      return Promise.all([write("tasks",d.tasks,true),write("kinds",d.kinds||[],true),write("files",files,true)]).then(function(){
        L.tasks=d.tasks; L.kinds=d.kinds||[]; L.files=files;
        BACKUP_META.forEach(function(k){if(d.settings&&d.settings[k]!=null) setMeta(k,d.settings[k]);});
        setMeta("lastBackupAt",Date.now());
        render(); K.renderSide(); K.renderSettings();
        K.flash("Копия восстановлена: задач — "+d.tasks.length);
      });
    }).catch(function(e){K.flash("Не удалось восстановить: "+(e&&e.message||"файл повреждён"));});
  };
  filePick.click();
}

/* ═════════ боковая панель и настройки ═════════ */
function sideHTML(){
  var hid=hiddenKinds();
  function kindRow(k,id,label){
    var on=hid.indexOf(id)<0;
    return '<div class="prow"><button class="pick lk" data-lhide="'+esc(id)+'" aria-pressed="'+on+'" title="'+(on?"Скрыть":"Показать")+'">'+
      '<span class="lk-box" style="'+(k?K.tint(k.color):"")+'">'+(on?ic("tick"):"")+"</span>"+(k?ic(k.icon):ic("note"))+
      "<b>"+esc(label)+"</b></button>"+
      (k?'<button class="x" data-lkedit="'+esc(k.id)+'" aria-label="Изменить тип «'+esc(k.label)+'»">'+ic("pencil")+"</button>":"")+
      "</div>";
  }
  return '<div class="side-head"><h2>Grid Life</h2>'+
      '<button class="icon-btn" data-sclose="1" aria-label="Закрыть">'+K.X_BTN+"</button></div>"+
    '<div class="side-body"><p class="note side-note">Вид календаря</p>'+
    VIEWS.map(function(v){
      var on=L.view===v.id;
      return '<div class="prow'+(on?" on":"")+'"><button class="pick" data-lsview="'+v.id+'"'+(on?' aria-current="page"':"")+">"+
        ic(v.id==="list"?"text":v.id==="month"?"calendar":"clock")+"<b>"+v.label+"</b></button></div>";}).join("")+
    '<p class="note side-note" style="margin-top:14px">Типы задач — снимите галочку, чтобы скрыть</p>'+
    kindsAll().map(function(k){return kindRow(k,k.id,k.label);}).join("")+kindRow(null,"","Без типа")+
    '<div class="prow"><button class="pick" data-lknew="1">'+ic("plus")+"<b>Свой тип</b></button></div>"+
    "</div>"+
    '<div class="side-foot"><p class="note side-note">Данные Grid Life хранятся только на этом устройстве.</p>'+
      '<button class="mi" data-settings="1">'+ic("gear")+"<span>Настройки</span></button></div>";
}
var installEvt=null;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();installEvt=e;K.renderSettings();});

/* ═════════ PIN, Face ID и экран блокировки ═════════ */
/* PIN закрывает Grid Life от чужих глаз на этом устройстве. Это не
   шифрование: в meta лежит только хеш PIN с солью, задачи — как были. */
function hashPin(pin,salt){
  return crypto.subtle.digest("SHA-256",new TextEncoder().encode(salt+":"+pin)).then(function(b){
    return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0");}).join("");});
}
/* Face ID — passkey на этом устройстве (WebAuthn, платформенный
   аутентификатор), без сервера. Это тоже только защита экрана: Grid Life
   хранит id ключа и открывается, если система подтвердила владельца.
   Ключ привязан к адресу сайта, PIN всегда остаётся запасным способом. */
function rnd(n){return crypto.getRandomValues(new Uint8Array(n));}
function b64u(buf){
  return btoa(String.fromCharCode.apply(null,new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function unb64u(s){
  var b=atob(s.replace(/-/g,"+").replace(/_/g,"/")),u=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i);
  return u;
}
function apple(){var u=navigator.userAgent;return /iPhone|iPad|iPod/.test(u)||/Macintosh/.test(u)&&navigator.maxTouchPoints>1;}
function bioName(){var u=navigator.userAgent;return apple()?"Face ID":/Macintosh/.test(u)?"Touch ID":/Windows/.test(u)?"Windows Hello":"биометрии";}
function bioWhere(){
  return apple()?"Запись «Grid Life» появится в «Паролях» iPhone.":"Запись «Grid Life» сохранится в менеджере паролей устройства.";
}
function bioUsable(){return !!(L.meta.bio&&L.bioOK);}
/* запуск — прямо из нажатия кнопки: Safari показывает Face ID только так */
function registerBio(){
  if(!L.meta.bioUser) setMeta("bioUser",b64u(rnd(16)));   /* тот же владелец — новый ключ заменит старый */
  return navigator.credentials.create({publicKey:{
    challenge:rnd(32),rp:{name:"Grid Life"},
    user:{id:unb64u(L.meta.bioUser),name:"Grid Life",displayName:"Grid Life"},
    pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
    authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"preferred"},
    timeout:60000,attestation:"none"}}).then(function(c){
      setMeta("bio",{id:b64u(c.rawId),at:Date.now()});
      K.renderSettings(true); K.flash("Вход по "+bioName()+" включён");
      return true;
    },function(e){
      K.renderSettings(true);
      K.flash(e&&e.name==="NotAllowedError"?"Вход по "+bioName()+" не включён":"Не удалось включить вход по "+bioName()+": "+((e&&e.message)||""));
      return false;
    });
}
function offerBio(){
  return dialog("PIN задан. Входить по "+bioName()+"?","Grid Life будет открываться по "+bioName()+", а PIN останется запасным способом. "+bioWhere(),
    [["bio","Включить вход по "+bioName(),"main"],["","Не сейчас"]],false,{bio:registerBio});
}
/* сначала PIN — запасной способ, потом предложение включить Face ID */
function setPin(){
  if(!window.crypto||!crypto.subtle){K.flash("PIN работает только на защищённой странице (https)");return;}
  dialog("Новый PIN","Четыре цифры. Его спросят при переходе в Grid Life и при открытии приложения.",[["","Отмена"]],true).then(function(a){
    if(!a) return;
    return dialog("Повторите PIN","",[["","Отмена"]],true).then(function(b){
      if(!b) return;
      if(a!==b){K.flash("PIN не совпали — попробуйте ещё раз");return;}
      var salt=newId(),first=!L.meta.pin;
      return hashPin(a,salt).then(function(h){
        setMeta("pin",{salt:salt,hash:h}); L.unlocked=true;
        K.renderSettings(true);
        if(first&&L.bioOK&&!L.meta.bio) return offerBio();   /* окно само говорит, что PIN задан */
        K.flash("PIN задан");
      });
    });
  });
}
var lockEl=null,lockFails=0,inerted=[],bioAbort=null,bioTrouble=null;
function lockState(s){
  if(!lockEl) return;
  lockEl.className="llock "+s;
  var inp=$(".lpin",lockEl);
  if(s==="pin"&&!inp.disabled) inp.focus();
}
/* Face ID спрашиваем сразу; отмена или ошибка — показываем PIN */
function bioUnlock(){
  var bio=L.meta.bio; if(!bio||!lockEl) return;
  lockState("bio");
  if(bioAbort) bioAbort.abort();
  var ac=bioAbort=new AbortController();
  navigator.credentials.get({signal:ac.signal,publicKey:{challenge:rnd(32),timeout:60000,userVerification:"required",
    allowCredentials:[{type:"public-key",id:unb64u(bio.id),transports:["internal"]}]}}).then(function(a){
    if(ac!==bioAbort) return;
    /* тот самый ключ, и система подтвердила владельца (флаг UV) */
    if(b64u(a.rawId)!==bio.id||!(new Uint8Array(a.response.authenticatorData)[32]&4)) throw {name:"Mismatch"};
    bioAbort=null; bioTrouble=null; unlock();
  }).catch(function(e){
    if(ac!==bioAbort||!lockEl) return;
    bioAbort=null; bioTrouble=(e&&e.name)||"Error";
    lockState("pin");
  });
}
function showLock(){
  if(lockEl) return;
  lockEl=document.createElement("div");
  lockEl.setAttribute("role","dialog"); lockEl.setAttribute("aria-modal","true");
  lockEl.setAttribute("aria-label","Grid Life закрыт PIN-кодом");
  lockEl.innerHTML='<div class="llock-box">'+ic("lock")+"<h2>Grid Life</h2>"+
    '<p class="llock-bio">Вход по '+esc(bioName())+"</p>"+
    '<div class="llock-pin"><p>Введите PIN</p>'+
      '<input class="lpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN, 4 цифры">'+
      '<p class="llock-msg" aria-live="polite"></p></div>'+
    (bioUsable()?'<button class="btn main" data-lbio="1">Войти по '+esc(bioName())+"</button>":"")+
    '<button class="btn ghost" data-lpinshow="1">Ввести PIN</button>'+
    '<button class="btn ghost" data-lwork="1">Перейти в Grid Work</button>'+
    '<button class="lnk" data-lforgot="1">Забыли PIN?</button></div>';
  /* всё остальное на странице недоступно, пока экран закрыт */
  inerted=$$("body>*").filter(function(el){return !el.inert;});
  inerted.forEach(function(el){el.inert=true;});
  document.body.appendChild(lockEl);
  var inp=$(".lpin",lockEl),msg=$(".llock-msg",lockEl);
  inp.addEventListener("input",function(){
    inp.value=inp.value.replace(/\D/g,"").slice(0,4);
    if(inp.value.length<4) return;
    var pin=L.meta.pin;
    hashPin(inp.value,pin.salt).then(function(h){
      if(h===pin.hash){pinUnlocked();return;}
      inp.value=""; lockFails++;
      if(lockFails<5){msg.textContent="Неверный PIN";return;}
      /* после пяти ошибок — пауза, чтобы PIN нельзя было подобрать перебором */
      inp.disabled=true; msg.textContent="Слишком много попыток. Подождите 30 секунд.";
      setTimeout(function(){lockFails=0;inp.disabled=false;msg.textContent="";inp.focus();},30000);
    });
  });
  lockEl.addEventListener("click",function(e){
    var t=e.target;
    if(t.closest("[data-lbio]")) bioUnlock();
    else if(t.closest("[data-lpinshow]")){if(bioAbort){bioAbort.abort();bioAbort=null;} lockState("pin");}
    else if(t.closest("[data-lwork]")) K.setMode("work");
    else if(t.closest("[data-lforgot]")) forgotPin();
  });
  if(bioUsable()) bioUnlock();
  else{
    if(L.meta.bio){bioTrouble="unavailable";msg.textContent="Вход по "+bioName()+" сейчас недоступен — войдите по PIN";}
    lockState("pin");
  }
}
function hideLock(){
  if(!lockEl) return;
  if(bioAbort){bioAbort.abort();bioAbort=null;}
  lockEl.remove(); lockEl=null;
  inerted.forEach(function(el){el.inert=false;}); inerted=[];
}
function unlock(){L.unlocked=true;lockFails=0;hideLock();render();}
/* Face ID не сработал, но PIN пустил: доступ не держим, а предлагаем настроить заново */
function pinUnlocked(){
  var trouble=bioTrouble; bioTrouble=null; unlock();
  if(!trouble||!L.meta.bio) return;
  if(trouble==="unavailable"||!L.bioOK)
    K.flash("Вход по "+bioName()+" недоступен на этом устройстве. Входите по PIN или выключите его в настройках.");
  else K.flash("Вход по "+bioName()+" не сработал. Настроить заново?",registerBio,"Настроить");
}
function forgotPin(){
  dialog("Забыли PIN?","Восстановить PIN нельзя. Его можно только сбросить вместе со всеми данными Grid Life на этом устройстве: "+
    "задачами, типами, файлами и настройками. Grid Work это не затронет.",
    [["reset","Сбросить PIN и удалить данные","danger"],["","Отмена"]]).then(function(v){
    if(v!=="reset") return;
    return dialog("Точно удалить все данные Grid Life?","Отменить будет нельзя.",[["yes","Удалить всё","danger"],["","Отмена"]]).then(function(y){
      if(y==="yes") return wipeAll().then(function(){unlock();K.flash("PIN сброшен, данные Grid Life удалены");});
    });
  });
}

/* ═════════ хранилище: очистка и удаление ═════════ */
/* всё Grid Life на этом устройстве: задачи, типы, файлы, настройки и PIN */
function wipeAll(){
  return Promise.all(["tasks","kinds","files","meta"].map(function(s){return write(s,[],true);})).then(function(){
    L.tasks=[]; L.kinds=[]; L.files=[]; L.meta={};
    setMeta("firstUseAt",Date.now());
    try{localStorage.removeItem("grid.openLife");localStorage.removeItem("grid.life.view");}catch(e){}
    L.view="list"; render(); K.renderSide(); K.renderSettings();
  });
}
function askWipe(){
  dialog("Удалить все данные Grid Life","Задачи, типы, файлы и настройки Grid Life на этом устройстве удалятся. Grid Work это не затронет. "+
    "Сначала сохранить резервную копию?",
    [["copy","Сохранить копию и продолжить"],["go","Удалить без копии","danger"],["","Отмена"]]).then(function(v){
    if(!v) return;
    return (v==="copy"?exportBackup():Promise.resolve(true)).then(function(ok){
      if(!ok) return;                     /* копия не сохранилась — ничего не удаляем */
      return dialog("Точно удалить все данные Grid Life?","Отменить будет нельзя.",[["yes","Удалить всё","danger"],["","Отмена"]]);
    }).then(function(y){if(y==="yes") return wipeAll().then(function(){K.flash("Данные Grid Life удалены");});});
  });
}
var CLEAN=[[30,"месяц"],[90,"три месяца"],[180,"полгода"],[365,"год"]];
/* выполненные обычные задачи старше срока; повторяющиеся не трогаем — это серии */
function oldDone(days){
  var edge=addDays(today(),-days),ms=Date.now()-days*864e5;
  return live().filter(function(t){return t.done&&!t.repeat&&(t.date?t.date<edge:(t.updatedAt||0)<ms);});
}
function cleanDone(days){
  var list=oldDone(days),label=CLEAN.filter(function(c){return c[0]===days;})[0][1];
  if(!list.length){K.flash("Выполненных задач старше, чем "+label+", нет");return;}
  if(!confirm("Удалить выполненные задачи старше, чем "+label+": "+list.length+"? Повторяющиеся задачи не трогаем.")) return;
  list.forEach(softDelete); render(); K.renderSettings();
  K.flash("Удалено задач: "+list.length);
}
/* по настройке просроченное само переезжает на сегодня */
function autoMove(){
  if(!L.ready||lp().overdue!=="move") return;
  var keys=overdue().map(function(i){return i.key;});
  if(keys.length) moveToToday(keys);
}
function openLife(){try{return localStorage.getItem("grid.openLife")==="1";}catch(e){return false;}}
/* сколько места даёт браузер; спрашиваем не чаще раза в 10 секунд */
function estimate(){
  if(!navigator.storage||!navigator.storage.estimate||Date.now()-(L.estAt||0)<10000) return;
  L.estAt=Date.now();
  navigator.storage.estimate().then(function(e){L.estimate=e;K.renderSettings();},function(){});
}

/* ═════════ настройки ═════════ */
function sec(id,title,html){
  return '<section class="set" data-lset="'+id+'"'+(id==="calendar"?"":' style="margin-top:22px"')+'><div class="sect-h"><h3>'+
    esc(title)+"</h3></div>"+html+"</section>";
}
function pick(key,label,opts){
  var p=lp();
  return '<label class="opt"><span>'+label+'</span><select class="in" data-lpref="'+key+'">'+opts.map(function(o){
    return '<option value="'+o[0]+'"'+(String(p[key])===String(o[0])?" selected":"")+">"+o[1]+"</option>";}).join("")+"</select></label>";
}
function toggle(attr,on,title,note){
  return '<label class="switch"><input type="checkbox" '+attr+(on?" checked":"")+"><span><b>"+title+"</b>"+
    (note?"<small>"+note+"</small>":"")+"</span></label>";
}
function settingsHTML(){
  var p=lp(),last=L.meta.lastBackupAt,off=offKinds(),est=L.estimate;
  var dataSize=JSON.stringify(live()).length+JSON.stringify(ownKinds()).length;
  var filesSize=L.files.filter(function(f){return !f.deletedAt;}).reduce(function(s,f){return s+(f.size||0);},0);
  var pct=est&&est.quota?Math.min(100,Math.round(est.usage/est.quota*100)):0;
  estimate();
  return K.drawerHead("Настройки Grid Life")+'<div class="d-body">'+
    sec("calendar","Календарь",
      pick("view","Вид при открытии",[["last","как в прошлый раз"],["month","Месяц"],["week","Неделя"],["day","День"],["list","Список"]])+
      pick("weekStart","Неделя начинается с",[[1,"понедельника"],[0,"воскресенья"]])+
      pick("duration","Длительность новой задачи",[[0,"без окончания"],[15,"15 минут"],[30,"30 минут"],[45,"45 минут"],
        [60,"1 час"],[90,"1,5 часа"],[120,"2 часа"]])+
      pick("overdue","Просроченные задачи",[["block","в блоке «Просрочено»"],["move","переезжают на сегодня"]])+
      toggle('data-lpref="h24"',p.h24,"24-часовой формат","Иначе время показывается как 2:00 PM.")+
      toggle('data-lpref="hidePastDone"',p.hidePastDone,"Скрывать выполненное в прошедших днях",
        "В днях, неделях и месяцах остаётся только невыполненное."))+
    sec("types","Типы задач",
      "<div>"+kindsAll(true).map(function(k){
        var std=!!K.find(LIFE_KINDS,k.id),on=off.indexOf(k.id)<0;
        return '<div class="mrow">'+(std?'<label class="switch mini"><input type="checkbox" data-lkon="'+esc(k.id)+'"'+(on?" checked":"")+
            ' aria-label="Показывать тип «'+esc(k.label)+'» в списке"><span></span></label>':'<span class="mini-gap"></span>')+
          K.kindChip(k)+'<span class="sp"></span><button class="x ed" data-lkedit="'+esc(k.id)+'" aria-label="Изменить тип «'+
          esc(k.label)+'»" title="Изменить">'+ic("pencil")+"</button></div>";
      }).join("")+"</div>"+
      '<div class="row"><button class="btn ghost" data-lknew="1">+ Свой тип</button></div>'+
      '<p class="small">Стандартные типы можно переименовать, перекрасить и убрать из списка — у задач они останутся. '+
        "Свой тип удаляется в окне правки.</p>")+
    sec("privacy","Приватность",
      "<p>PIN закрывает Grid Life от посторонних: его спросят при переходе в Grid Life и при открытии приложения.</p>"+
      '<p class="small">Это защита экрана, а не шифрование: задачи остаются в браузере как есть, и человек, '+
        "который разбирается в устройствах, сможет их прочитать.</p>"+
      '<div class="row">'+(L.meta.pin?'<button class="btn ghost" data-lpin="set">Сменить PIN</button>'+
          '<button class="btn ghost" data-lpin="off">Выключить PIN</button>'
        :'<button class="btn" data-lpin="set">Задать PIN</button>')+"</div>"+
      (!L.bioOK?(L.meta.pin?'<p class="small">На этом устройстве нет Face ID, Touch ID или Windows Hello — вход только по PIN.</p>':"")
        :L.meta.pin?toggle("data-lbiotoggle",!!L.meta.bio,"Входить по "+bioName(),
          "PIN остаётся запасным способом. "+bioWhere()+" Если адрес сайта сменится, вход по "+bioName()+" нужно будет включить заново.")
        :'<p class="small">Вход по '+bioName()+" можно включить после того, как вы зададите PIN: он нужен как запасной способ.</p>")+
      toggle("data-lopenlife",openLife(),"Открывать приложение в Grid Life","Иначе Grid откроется там, где вы были в прошлый раз."))+
    sec("storage","Хранилище",
      "<p>Задачи, типы и файлы Grid Life хранятся только на этом устройстве, в этом браузере. "+
        "Ничего не отправляется на сервер, вход не нужен, всё работает без интернета.</p>"+
      '<div class="meter-h"><span>Задачи и типы: '+K.fmtSize(dataSize)+" · файлы: "+K.fmtSize(filesSize)+"</span></div>"+
      (est&&est.quota?'<div class="meter" role="progressbar" aria-label="Занято места в браузере" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+
          pct+'"><i style="width:'+pct+'%"></i></div>'+
        '<p class="small">Браузер даёт этому сайту до '+K.fmtSize(est.quota)+", сейчас занято "+K.fmtSize(est.usage)+
          " — вместе с Grid Work и копией приложения для работы без сети.</p>":"")+
      (L.persisted===true?'<p class="small">Браузер разрешил постоянное хранение и не удалит данные сам.</p>'
        :L.persisted===false?'<p class="small">Браузер пока не обещал хранить данные постоянно: при нехватке места он может '+
          "их очистить. Сохраняйте резервные копии.</p>"+
          '<div class="row"><button class="btn ghost" data-lpersist="1">Попросить постоянное хранение</button></div>':"")+
      "<p><b>Резервная копия.</b> "+(last?"Последняя — "+esc(K.fmtWhen(last))+".":"Копий ещё не было.")+
        " Один файл со всеми задачами, типами, файлами и настройками — его можно перенести на другое устройство.</p>"+
      '<div class="row"><button class="btn" data-lexport="1">Сохранить копию</button>'+
        '<button class="btn ghost" data-limport="1">Восстановить из файла</button></div>'+
      pick("backupEvery","Напоминать о копии",[["week","раз в неделю"],["month","раз в месяц"],["never","не напоминать"]])+
      '<div class="lclean"><span>Удалить выполненные задачи старше, чем</span><div class="row"><select class="in" data-lclean="1" aria-label="Срок">'+
        CLEAN.map(function(c){return '<option value="'+c[0]+'">'+c[1]+"</option>";}).join("")+"</select>"+
        '<button class="btn ghost" data-lcleango="1">Удалить</button></div></div>'+
      '<div class="row"><button class="btn danger" data-lwipe="1">Удалить все данные Grid Life</button></div>')+
    sec("install","На главный экран",
      "<p>Grid можно установить как приложение: он откроется с главного экрана и без интернета.</p>"+
      (installEvt?'<div class="row"><button class="btn" data-linstall="1">Установить</button></div>'
        :'<p class="small">iPhone: Safari → «Поделиться» → «На экран Домой». Android и компьютер: меню браузера → «Установить приложение».</p>'))+
    "</div>";
}

/* ═════════ события ═════════ */
function isLife(){return document.documentElement.dataset.mode==="life";}
function fabDate(){
  var t=today();
  if(L.view==="day") return L.cursor;
  if(L.view==="month") return L.selected||t;
  if(L.view==="week"){var s=shownWeek(L.cursor);return t>=s&&t<=addDays(s,6)?t:s;}
  return t;
}
/* листание: n=1 — следующий месяц, неделя или день, n=-1 — предыдущий */
function navStep(n){
  L.cursor=L.view==="month"?addMonths(L.cursor,n):addDays(L.cursor,L.view==="week"?7*n:n);
  render();
}
/* Свайп по месяцу, неделе и дню на телефоне. Ловим только явно
   горизонтальное движение (в полтора раза больше вертикального) от 50 px
   и не у краёв экрана — там в Safari жест «назад». Пока палец едет,
   календарь едет вместе с ним. */
var SWIPE_MIN=50,SWIPE_EDGE=20,SWIPE_MS=160,swipe=null,swipedAt=0;
function swipeEl(){return L.view==="month"?$(".lm-grid",L.el):L.view==="list"?null:$(".lgrid",L.el);}
function onTouchStart(e){
  swipe=null;
  if(!phone.matches||e.touches.length!==1) return;
  var t=e.touches[0],el=swipeEl();
  if(!el||!el.contains(e.target)||t.clientX<SWIPE_EDGE||t.clientX>window.innerWidth-SWIPE_EDGE) return;
  swipe={x:t.clientX,y:t.clientY,dx:0,el:el,on:false};
}
function onTouchMove(e){
  if(!swipe) return;
  var t=e.touches[0],dx=t.clientX-swipe.x,dy=t.clientY-swipe.y;
  if(!swipe.on){
    if(Math.abs(dx)<10&&Math.abs(dy)<10) return;
    if(Math.abs(dx)<Math.abs(dy)*1.5){swipe=null;return;}   /* вертикально — обычная прокрутка */
    swipe.on=true; swipe.el.style.transition="none";
  }
  e.preventDefault();
  swipe.dx=dx; swipe.el.style.transform="translateX("+dx+"px)";
}
function onTouchEnd(){
  var s=swipe; swipe=null;
  if(!s||!s.on) return;
  swipedAt=Date.now();
  var w=s.el.offsetWidth,n=s.dx<0?1:-1;
  s.el.style.transition="transform "+SWIPE_MS+"ms ease-out";
  if(Math.abs(s.dx)<SWIPE_MIN){s.el.style.transform="";return;}   /* короткий — возвращаем на место */
  /* старый месяц уходит в сторону свайпа, новый въезжает с другой */
  s.el.style.transform="translateX("+(-n*w)+"px)";
  setTimeout(function(){
    navStep(n);
    var el=swipeEl(); if(!el) return;
    el.style.transition="none"; el.style.transform="translateX("+(n*w)+"px)";
    void el.offsetWidth;
    el.style.transition="transform "+SWIPE_MS+"ms ease-out"; el.style.transform="";
  },SWIPE_MS);
}
function onTouchCancel(){
  if(swipe&&swipe.on){swipe.el.style.transition="transform "+SWIPE_MS+"ms ease-out";swipe.el.style.transform="";}
  swipe=null;
}
function onMainClick(e){
  var t=e.target,b;
  if(Date.now()-swipedAt<400) return;          /* касание, закончившее свайп, — не нажатие на день */
  if((b=t.closest("[data-lview]"))){setView(b.dataset.lview);return;}
  if((b=t.closest("[data-lnav]"))){navStep(+b.dataset.lnav);return;}
  if(t.closest("[data-ltoday]")){
    L.cursor=L.selected=today(); L.shownKey="";
    render(); if(L.view==="list"){var s=$(".lv-body",L.el);if(s)s.scrollTop=0;} return;}
  if((b=t.closest("[data-lcheck]"))){toggleDone(b.dataset.lcheck);return;}
  if((b=t.closest("[data-lmove]"))){moveToToday([b.dataset.lmove]);return;}
  if(t.closest("[data-lmoveall]")){moveToToday(overdue().map(function(i){return i.key;}));return;}
  if((b=t.closest("[data-lopen]"))){openTask(b.dataset.lopen);return;}
  if((b=t.closest("[data-lnew]"))){newTask({date:b.dataset.lnew==="none"?"":b.dataset.lnew});return;}
  if(t.closest("[data-lfab]")){newTask({date:fabDate()});return;}
  if(t.closest("[data-lmore]")){L.listDays+=30;render();return;}
  if(t.closest("[data-lexport]")){exportBackup();return;}
  if(t.closest("[data-lsnooze]")){setMeta("backupSnooze",Date.now());render();return;}
  if((b=t.closest("[data-lgoto]"))){if(L.view==="week")setView("day",b.dataset.lgoto);return;}
  if((b=t.closest("[data-lad]"))){newTask({date:b.dataset.lad});return;}
  if((b=t.closest("[data-lslot]"))){
    var r=b.getBoundingClientRect(),m=Math.floor((e.clientY-r.top)/HH*2)*30,tm=hhmm(K.clamp(m,0,23*60+30));
    newTask({date:b.dataset.lslot,time:tm,end:endFor(tm)}); return;}
  /* месяц: первое касание выбирает день, второе — добавляет задачу на него */
  if((b=t.closest("[data-lsel]"))){
    var d=b.dataset.lsel;
    if(L.selected===d) newTask({date:d}); else{L.selected=d;render();}
  }
}
function onSideClick(e){
  if(isLife()===false) return;
  var t=e.target,b;
  if((b=t.closest("[data-lsview]"))){K.closeSide();setView(b.dataset.lsview);return;}
  if((b=t.closest("[data-lhide]"))){
    var id=b.dataset.lhide,h=hiddenKinds().slice(),i=h.indexOf(id);
    if(i<0)h.push(id);else h.splice(i,1);
    setMeta("hidden",h); render(); K.renderSide(); return;}
  if((b=t.closest("[data-lkedit]"))){editKind(b,kindOf(b.dataset.lkedit));return;}
  if((b=t.closest("[data-lknew]"))) editKind(b,null);
}
function onSettingsClick(e){
  if(!isLife()) return;
  var t=e.target,b;
  if(t.closest("[data-lexport]")) exportBackup();
  else if(t.closest("[data-limport]")) importBackup();
  else if(t.closest("[data-lpersist]")){persistAsked=false;askPersist();}
  else if((b=t.closest("[data-lkedit]"))) editKind(b,kindOf(b.dataset.lkedit));
  else if((b=t.closest("[data-lknew]"))) editKind(b,null);
  else if((b=t.closest("[data-lpin]"))){
    if(b.dataset.lpin==="set") setPin();
    else if(confirm("Выключить PIN? Grid Life будет открываться без защиты"+(L.meta.bio?", вход по "+bioName()+" тоже выключится.":"."))){
      setMeta("pin",null); setMeta("bio",null); K.renderSettings();
    }
  }
  else if(t.closest("[data-lcleango]")) cleanDone(+$("[data-lclean]",e.currentTarget).value);
  else if(t.closest("[data-lwipe]")) askWipe();
  else if(t.closest("[data-linstall]")&&installEvt){
    installEvt.prompt(); installEvt.userChoice.then(function(){installEvt=null;K.renderSettings();});
  }
}
function onSettingsChange(e){
  if(!isLife()) return;
  var t=e.target,k=t.dataset.lpref;
  if(k){
    setPref(k,t.type==="checkbox"?t.checked:/^(weekStart|duration)$/.test(k)?Number(t.value):t.value);
    if(k==="view"&&t.value!=="last") setView(t.value);
    if(k==="overdue") autoMove();
    render(); K.renderSide(); return;
  }
  if(t.matches("[data-lkon]")){
    var off=offKinds().filter(function(id){return id!==t.dataset.lkon;});
    if(!t.checked) off.push(t.dataset.lkon);
    setMeta("offKinds",off); render(); K.renderSide(); return;
  }
  /* включение — прямо в нажатии: так Safari покажет Face ID */
  if(t.matches("[data-lbiotoggle]")){
    if(t.checked){registerBio();return;}
    setMeta("bio",null); K.renderSettings(true);
    K.flash("Вход по "+bioName()+" выключен. Запись «Grid Life» "+(apple()?"в «Паролях»":"в менеджере паролей")+" можно удалить вручную.");
    return;
  }
  if(t.matches("[data-lopenlife]")){
    try{if(t.checked) localStorage.setItem("grid.openLife","1"); else localStorage.removeItem("grid.openLife");}catch(err){}
  }
}
var railToday=document.createElement("button");
railToday.className="btn ghost life-only rail-today"; railToday.textContent="Сегодня";
railToday.setAttribute("data-ltoday","1");
$(".rail").appendChild(railToday);
railToday.addEventListener("click",function(e){onMainClick(e);});
$("#side").addEventListener("click",onSideClick);
$("#settings").addEventListener("click",onSettingsClick);
$("#settings").addEventListener("change",onSettingsChange);
K.scrim.addEventListener("click",function(){if(isLife())closePanel();});
/* после сна устройства «сегодня» могло смениться */
document.addEventListener("visibilitychange",function(){if(!document.hidden&&isLife()&&!panelOpen()){autoMove();render();}});

/* PIN спрашиваем при каждом входе в Grid Life: close() запирает, show() показывает экран PIN */
window.GridLife={
  show:function(el){
    if(!L.el){
      L.el=el; el.addEventListener("click",onMainClick);
      el.addEventListener("touchstart",onTouchStart,{passive:true});
      el.addEventListener("touchmove",onTouchMove,{passive:false});
      el.addEventListener("touchend",onTouchEnd);
      el.addEventListener("touchcancel",onTouchCancel);
      L.loading=load().then(function(){
        if(lp().view!=="last") L.view=lp().view;
        if(L.meta.pin&&!L.unlocked) showLock();
        render(); checkPersist(); K.renderSide(); autoMove();
      },function(e){
        el.innerHTML='<div class="empty"><h2>Календарь не открылся</h2><p>Браузер не дал хранить данные на устройстве'+
          (e&&e.message?": "+esc(e.message):"")+". Проверьте, не включён ли режим инкогнито с запретом хранения.</p></div>";
      });
    }else if(L.ready&&L.meta.pin&&!L.unlocked) showLock();
    render();
  },
  close:function(){closePanel(true);L.unlocked=false;hideLock();},
  escape:function(){return closePanel();},
  sideHTML:sideHTML,
  settingsHTML:settingsHTML
};
})();
