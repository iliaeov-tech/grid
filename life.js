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
var VIEWS=[{id:"list",label:"Список"},{id:"day",label:"День"},{id:"week",label:"Неделя"},{id:"month",label:"Месяц"}];
var WEEKDAYS=["пн","вт","ср","чт","пт","сб","вс"];
var MONTHS_GEN=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
var HH=48;                           /* высота часа в сетке дня и недели, px */
var WEEK_MS=7*864e5;

/* ═════════ даты ═════════ */
function today(){return K.todayISO();}
function addDays(s,n){var d=K.parseISO(s);d.setDate(d.getDate()+n);return K.iso(d);}
function addMonths(s,n){var d=K.parseISO(s);d.setDate(1);d.setMonth(d.getMonth()+n);return K.iso(d);}
function weekStart(s){var d=K.parseISO(s);d.setDate(d.getDate()-(d.getDay()+6)%7);return K.iso(d);}
function wd(s){return WEEKDAYS[(K.parseISO(s).getDay()+6)%7];}
function longDate(s){var d=K.parseISO(s);return d.getDate()+" "+MONTHS_GEN[d.getMonth()];}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function relDay(s){var t=today();return s===t?"Сегодня":s===addDays(t,1)?"Завтра":s===addDays(t,-1)?"Вчера":"";}
function minutes(t){var p=t.split(":");return (+p[0])*60+(+p[1]);}
function hhmm(m){return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");}
function pad(n){return String(n).padStart(2,"0");}

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

function load(){
  return openDB().then(function(d){
    db=d;
    return Promise.all([all("tasks"),all("kinds"),all("files"),all("meta")]);
  }).then(function(r){
    L.tasks=r[0]; L.kinds=r[1]; L.files=r[2];
    L.meta={}; r[3].forEach(function(m){L.meta[m.key]=m.value;});
    if(!L.meta.firstUseAt) setMeta("firstUseAt",Date.now());
    L.ready=true;
  });
}
function setMeta(key,value){
  L.meta[key]=value;
  saved(write("meta",{key:key,value:value,updatedAt:Date.now()}));
}
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
function kindsAll(){return LIFE_KINDS.concat(ownKinds());}
function kindOf(id){return id?K.find(LIFE_KINDS,id)||K.find(ownKinds(),id):null;}
function hiddenKinds(){return L.meta.hidden||[];}
function visible(t){return hiddenKinds().indexOf(kindOf(t.kind)?t.kind:"")<0;}
function filesOf(id){return L.files.filter(function(f){return f.taskId===id&&!f.deletedAt;});}
function prioRank(t){return ["low","med","high","urgent"].indexOf(t.priority||"med");}

/* Задача в календаре — «появление» в конкретный день. Пока задача
   встречается один раз, появление совпадает с ней самой. */
function item(t,date){return {t:t,date:date,done:!!t.done,key:t.id+"|"+date};}
function byTime(a,b){
  if(a.date!==b.date) return a.date<b.date?-1:1;
  var x=a.t.time||"",y=b.t.time||"";
  if(x!==y) return x<y?-1:1;
  return prioRank(b.t)-prioRank(a.t)||String(a.t.title).localeCompare(String(b.t.title),"ru");
}
function itemsBetween(from,to){
  return live().filter(function(t){return visible(t)&&t.date&&t.date>=from&&t.date<=to;})
    .map(function(t){return item(t,t.date);}).sort(byTime);
}
function overdue(){
  var t=today();
  return live().filter(function(x){return visible(x)&&x.date&&x.date<t&&!x.done;})
    .map(function(x){return item(x,x.date);}).sort(byTime);
}
function noDate(){
  return live().filter(function(t){return visible(t)&&!t.date;})
    .sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);}).map(function(t){return item(t,"");});
}
function findItem(key){
  var p=String(key).split("|"),t=taskById(p[0]);
  return t&&!t.deletedAt?item(t,p[1]||""):null;
}

/* ═════════ изменения ═════════ */
function blankTask(o){
  var now=Date.now();
  return Object.assign({id:"",title:"",date:today(),time:"",end:"",kind:"",priority:"med",desc:"",done:false,
    createdAt:now,updatedAt:now,deletedAt:0},o||{});
}
function toggleDone(key){
  var it=findItem(key); if(!it) return;
  it.t.done=!it.t.done; putTask(it.t);
  render(); repaintPanel();
}
function moveToToday(keys){
  var t=today();
  keys.forEach(function(k){var it=findItem(k);if(it){it.t.date=t;putTask(it.t);}});
  render();
  K.flash(keys.length>1?"Задачи перенесены на сегодня":"Задача перенесена на сегодня");
}
function removeTask(id){
  var t=taskById(id); if(!t) return;
  if(!confirm("Удалить задачу «"+t.title+"»?")) return;
  t.deletedAt=Date.now(); putTask(t);
  filesOf(id).forEach(function(f){f.deletedAt=Date.now();f.blob=null;saved(write("files",touch(f)));});
  closePanel();
  K.flash("Задача удалена");
}

/* ═════════ отрисовка ═════════ */
function viewTitle(){
  var c=L.cursor;
  if(L.view==="list") return "Ближайшие дни";
  if(L.view==="day") return (relDay(c)?relDay(c)+", ":"")+wd(c)+", "+longDate(c);
  if(L.view==="week"){
    var s=K.parseISO(weekStart(c)),e=K.parseISO(addDays(weekStart(c),6));
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
  var when=!it.date?"":od?K.shortDate(K.parseISO(it.date))+(t.time?" "+t.time:"")
    :t.time?t.time+(t.end?"–"+t.end:""):"весь день";
  var meta=(k?K.kindChip(k):"")+
    (pr==="high"||pr==="urgent"?'<span class="chip prio loud" style="--pc:'+K.prioVar(pr)+";--pcs:"+K.prioSoft(pr)+'">'+
      '<span class="pip"></span>'+(pr==="urgent"?"Срочно":"Высокий")+"</span>":"")+
    (nf?'<span class="chip">'+ic("link")+nf+"</span>":"");
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
function backupDue(){
  if(!live().length) return false;
  var last=Math.max(L.meta.lastBackupAt||0,L.meta.backupSnooze||0,L.meta.firstUseAt||0);
  return Date.now()-last>WEEK_MS;
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
    "<b>"+esc(t.title)+"</b><span>"+t.time+(t.end?"–"+t.end:"")+"</span></button>";
}
function gridHTML(dates,cls){
  var t=today(),by={},hours="";
  itemsBetween(dates[0],dates[dates.length-1]).forEach(function(i){(by[i.date]=by[i.date]||[]).push(i);});
  for(var h=1;h<24;h++) hours+='<span style="top:'+h*HH+'px">'+pad(h)+"<i>:00</i></span>";
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
  var c=L.cursor,first=c.slice(0,8)+"01",start=weekStart(first),t=today(),sel=L.selected||t,by={},cells="";
  itemsBetween(start,addDays(start,41)).forEach(function(i){(by[i.date]=by[i.date]||[]).push(i);});
  for(var n=0;n<42;n++){
    var d=addDays(start,n),list=by[d]||[],out=d.slice(0,7)!==c.slice(0,7);
    cells+='<div class="mc'+(out?" out":"")+(d===t?" today":"")+(d===sel?" sel":"")+'" data-lsel="'+d+'">'+
      '<button class="mc-n" data-lsel="'+d+'" aria-label="'+esc(longDate(d))+(list.length?", задач: "+list.length:"")+
        (d===sel?", выбран — нажмите ещё раз, чтобы добавить задачу":"")+'">'+K.parseISO(d).getDate()+"</button>"+
      '<span class="mc-items">'+list.slice(0,3).map(chipHTML).join("")+
        (list.length>3?'<span class="mc-more">ещё '+(list.length-3)+"</span>":"")+"</span>"+
      '<span class="mc-dots" aria-hidden="true">'+list.slice(0,4).map(function(i){
        return '<i style="'+kindStyle(i.t)+'"></i>';}).join("")+"</span></div>";
  }
  return '<div class="lv-body"><div class="lmonth"><div class="lm-week">'+WEEKDAYS.map(function(w){return "<span>"+w+"</span>";}).join("")+
    '</div><div class="lm-grid">'+cells+'</div><div class="lm-agenda">'+daySectionHTML(sel,itemsBetween(sel,sel))+"</div></div></div>";
}
function bodyHTML(){
  if(L.view==="day") return gridHTML([L.cursor],"day");
  if(L.view==="week"){var s=weekStart(L.cursor),ds=[];for(var i=0;i<7;i++)ds.push(addDays(s,i));return gridHTML(ds,"week");}
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

/* P.id — открытая задача; P.draft — новая, ещё не сохранённая: она
   записывается, как только у неё появляется название */
var P={id:null,date:"",draft:null},titleT=null;
function cur(){return P.draft||taskById(P.id);}
function panelOpen(){return panel.classList.contains("on");}
function openTask(key){
  var it=findItem(key); if(!it) return;
  P={id:it.t.id,date:it.date,draft:null}; showPanel(false);
}
function newTask(o){
  P={id:null,date:"",draft:blankTask(o)}; showPanel(true);
}
function showPanel(focusTitle){
  K.closeSheet(); K.closeSide();
  panel.innerHTML=panelHTML();
  panel.classList.add("on"); K.scrim.classList.add("on"); panel.setAttribute("aria-hidden","false");
  fitTitle();
  var b=focusTitle?$("[data-lf=title]",panel):$("[data-dclose]",panel);
  if(b) b.focus();
}
function fitTitle(){var ta=$("[data-lf=title]",panel);if(ta){ta.style.height="auto";ta.style.height=ta.scrollHeight+"px";}}
function repaintPanel(){
  if(!panelOpen()||!cur()) return;
  var body=$(".d-body",panel),top=body?body.scrollTop:0;
  panel.innerHTML=panelHTML(); fitTitle();
  body=$(".d-body",panel); if(body) body.scrollTop=top;
}
/* новая задача записывается при первом символе названия */
function commitDraft(){
  var d=P.draft; if(!d||!d.title.trim()) return;
  d.id=newId(); d.title=d.title.trim(); d.createdAt=Date.now();
  L.tasks.push(d); putTask(d);
  P={id:d.id,date:d.date,draft:null};
  render();
}
function flushTitle(){
  if(!titleT) return;
  clearTimeout(titleT.timer); var run=titleT.run; titleT=null; run();
}
function closePanel(){
  if(!panelOpen()) return false;
  flushTitle();
  var t=P.draft?null:taskById(P.id);
  if(t&&!t.title.trim()){t.title="Без названия";putTask(t);}
  panel.classList.remove("on"); K.scrim.classList.remove("on"); panel.setAttribute("aria-hidden","true");
  P={id:null,date:"",draft:null};
  render();
  return true;
}
function setField(name,value){
  var t=cur(); if(!t) return;
  t[name]=value;
  if(name==="date") P.date=value;
  if(!P.draft) putTask(t);
  render(); repaintPanel();
}
function panelHTML(){
  var t=cur(),isNew=!!P.draft,allDay=!t.time,pr=t.priority||"med",fs=isNew?[]:filesOf(t.id),td=today(),tm=addDays(td,1);
  var eyebrow=isNew?"Новая задача":t.date?(relDay(t.date)?relDay(t.date)+", ":"")+longDate(t.date):"Без даты";
  var body='<div class="d-body"><div class="d-title-row">'+
      (isNew?"":'<button class="check" data-lpcheck="1" role="checkbox" aria-checked="'+!!t.done+'" style="margin-top:9px" aria-label="Выполнено">'+
        K.CHECK_SVG+"</button>")+
      '<textarea class="d-title'+(t.done?" done":"")+'" data-lf="title" rows="1" maxlength="200" placeholder="Что нужно сделать?" aria-label="Название задачи">'+
        esc(t.title)+"</textarea></div>"+
    '<div class="fields">'+
      '<span class="lbl">Дата</span><div class="ctl"><input type="date" data-lf="date" value="'+esc(t.date)+'" aria-label="Дата">'+
        '<div class="quick"><button data-lq="'+td+'" aria-pressed="'+(t.date===td)+'">Сегодня</button>'+
        '<button data-lq="'+tm+'" aria-pressed="'+(t.date===tm)+'">Завтра</button>'+
        '<button data-lq="" aria-pressed="'+!t.date+'">Без даты</button></div></div>'+
      '<span class="lbl">Время</span><div class="ctl">'+
        '<label class="switch"><input type="checkbox" data-lallday="1"'+(allDay?" checked":"")+"><span><b>Весь день</b></span></label>"+
        (allDay?"":'<div class="times"><input type="time" data-lf="time" value="'+esc(t.time)+'" aria-label="Начало">'+
          '<span>–</span><input type="time" data-lf="end" value="'+esc(t.end)+'" aria-label="Окончание, необязательно"></div>'+
          '<p class="hint">Окончание можно не указывать.</p>')+"</div>"+
      '<span class="lbl">Тип</span><div class="ctl"><div class="seg kinds">'+kindsAll().map(function(k){
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
  if(t.closest("[data-lpcheck]")){toggleDone(task.id+"|"+P.date);return;}
  if((b=t.closest("[data-lq]"))){setField("date",b.dataset.lq);return;}
  if((b=t.closest("[data-lkind]"))){setField("kind",task.kind===b.dataset.lkind?"":b.dataset.lkind);return;}
  if((b=t.closest("[data-lknew]"))){editKind(b,null,function(id){setField("kind",id);});return;}
  if((b=t.closest("[data-lprio]"))){setField("priority",b.dataset.lprio);return;}
  if(t.closest("[data-lpdel]")){removeTask(task.id);return;}
  if(t.closest("[data-lfile]")){pickFile(task.id);return;}
  if((b=t.closest("[data-lfopen]"))){openFile(b.dataset.lfopen);return;}
  if((b=t.closest("[data-lfdel]"))) dropFile(b.dataset.lfdel);
});
panel.addEventListener("change",function(e){
  var t=e.target,task=cur(); if(!task) return;
  if(t.matches("[data-lallday]")){
    if(t.checked){task.end="";setField("time","");}
    else setField("time",task.date===today()?hhmm(Math.min(23,new Date().getHours()+1)*60):"09:00");
    return;
  }
  if(t.matches("[data-lf=date]")){setField("date",t.value||"");return;}
  if(t.matches("[data-lf=time]")){
    if(!t.value){task.end="";setField("time","");return;}
    if(task.end&&task.end<=t.value) task.end="";
    setField("time",t.value); return;
  }
  if(t.matches("[data-lf=end]")){
    if(t.value&&t.value<=task.time){K.flash("Окончание должно быть позже начала");repaintPanel();return;}
    setField("end",t.value||"");
  }
});
/* название и описание сохраняются с небольшой задержкой, пока человек печатает */
panel.addEventListener("input",function(e){
  var t=e.target,task=cur(),f=t.dataset&&t.dataset.lf; if(!task||(f!=="title"&&f!=="desc")) return;
  if(f==="title") fitTitle();
  task[f]=t.value;
  if(P.draft){
    if(f!=="title"||!t.value.trim()) return;
    /* задача сохранена: панель получает флажок и «Удалить», курсор остаётся в названии */
    commitDraft(); repaintPanel();
    var ta=$("[data-lf=title]",panel); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
    return;
  }
  if(titleT) clearTimeout(titleT.timer);
  titleT={run:function(){putTask(task);render();}};
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
function editKind(anchor,kind,onCreate){
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
      render(); repaintPanel(); K.renderSide();
    },
    remove:kind?function(){
      var users=live().filter(function(t){return t.kind===kind.id;});
      if(!confirm("Удалить тип «"+kind.label+"»?"+(users.length?" Он снимется с задач: "+users.length+".":""))) return;
      users.forEach(function(t){t.kind="";putTask(t);});
      kind.deletedAt=Date.now(); saved(write("kinds",touch(kind)));
      render(); repaintPanel(); K.renderSide();
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
function exportBackup(){
  var files=L.files.filter(function(f){return !f.deletedAt&&f.blob;});
  Promise.all(files.map(function(f){
    return blobToBase64(f.blob).then(function(data){
      var o=Object.assign({},f); delete o.blob; o.data=data; return o;});
  })).then(function(fs){
    var dump={app:"grid-life",version:1,exportedAt:new Date().toISOString(),
      tasks:live(),kinds:ownKinds(),files:fs,settings:{hidden:hiddenKinds()}};
    var a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([JSON.stringify(dump)],{type:"application/json"}));
    a.download="grid-life-"+today()+".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    setMeta("lastBackupAt",Date.now());
    render(); K.renderSettings();
    K.flash("Копия сохранена: "+a.download);
  },function(e){K.flash("Не удалось собрать копию: "+(e&&e.message||""));});
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
        setMeta("hidden",(d.settings&&d.settings.hidden)||[]);
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
      (k&&!K.find(LIFE_KINDS,k.id)?'<button class="x" data-lkedit="'+esc(k.id)+'" aria-label="Изменить тип «'+esc(k.label)+'»">'+ic("pencil")+"</button>":"")+
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
function settingsHTML(){
  var last=L.meta.lastBackupAt;
  return K.drawerHead("Настройки Grid Life")+'<div class="d-body">'+
    '<section class="set"><div class="sect-h"><h3>Где хранятся данные</h3></div>'+
      "<p>Задачи, типы и файлы Grid Life хранятся только на этом устройстве, в этом браузере. "+
      "Ничего не отправляется на сервер, вход не нужен, всё работает без интернета.</p>"+
      (L.persisted===true?'<p class="small">Браузер разрешил постоянное хранение и не удалит данные сам.</p>'
        :L.persisted===false?'<p class="small">Браузер пока не обещал хранить данные постоянно: при нехватке места он может '+
          "их очистить. Сохраняйте резервные копии.</p>"+
          '<div class="row"><button class="btn ghost" data-lpersist="1">Попросить постоянное хранение</button></div>':"")+
    "</section>"+
    '<section class="set" style="margin-top:22px"><div class="sect-h"><h3>Резервная копия</h3></div>'+
      "<p>Один файл со всеми задачами, типами и файлами. Его можно перенести на другое устройство и восстановить там.</p>"+
      '<p class="small">'+(last?"Последняя копия: "+esc(K.fmtWhen(last)):"Копий ещё не было.")+"</p>"+
      '<div class="row"><button class="btn" data-lexport="1">Сохранить копию</button>'+
        '<button class="btn ghost" data-limport="1">Восстановить из файла</button></div>'+
    "</section>"+
    '<section class="set" style="margin-top:22px"><div class="sect-h"><h3>На главный экран</h3></div>'+
      "<p>Grid можно установить как приложение: он откроется с главного экрана и без интернета.</p>"+
      (installEvt?'<div class="row"><button class="btn" data-linstall="1">Установить</button></div>'
        :'<p class="small">iPhone: Safari → «Поделиться» → «На экран Домой». Android и компьютер: меню браузера → «Установить приложение».</p>')+
    "</section></div>";
}

/* ═════════ события ═════════ */
function isLife(){return document.documentElement.dataset.mode==="life";}
function fabDate(){
  var t=today();
  if(L.view==="day") return L.cursor;
  if(L.view==="month") return L.selected||t;
  if(L.view==="week"){var s=weekStart(L.cursor);return t>=s&&t<=addDays(s,6)?t:s;}
  return t;
}
function onMainClick(e){
  var t=e.target,b;
  if((b=t.closest("[data-lview]"))){setView(b.dataset.lview);return;}
  if((b=t.closest("[data-lnav]"))){
    var n=+b.dataset.lnav;
    L.cursor=L.view==="month"?addMonths(L.cursor,n):addDays(L.cursor,L.view==="week"?7*n:n);
    render(); return;}
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
    var r=b.getBoundingClientRect(),m=Math.floor((e.clientY-r.top)/HH*2)*30;
    newTask({date:b.dataset.lslot,time:hhmm(K.clamp(m,0,23*60+30))}); return;}
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
  if((b=t.closest("[data-lkedit]"))){editKind(b,K.find(ownKinds(),b.dataset.lkedit));return;}
  if((b=t.closest("[data-lknew]"))) editKind(b,null);
}
function onSettingsClick(e){
  if(!isLife()) return;
  var t=e.target;
  if(t.closest("[data-lexport]")) exportBackup();
  else if(t.closest("[data-limport]")) importBackup();
  else if(t.closest("[data-lpersist]")){persistAsked=false;askPersist();}
  else if(t.closest("[data-linstall]")&&installEvt){
    installEvt.prompt(); installEvt.userChoice.then(function(){installEvt=null;K.renderSettings();});
  }
}
$("#side").addEventListener("click",onSideClick);
$("#settings").addEventListener("click",onSettingsClick);
K.scrim.addEventListener("click",function(){if(isLife())closePanel();});
/* после сна устройства «сегодня» могло смениться */
document.addEventListener("visibilitychange",function(){if(!document.hidden&&isLife()&&!panelOpen())render();});

window.GridLife={
  show:function(el){
    if(!L.el){
      L.el=el; el.addEventListener("click",onMainClick);
      L.loading=load().then(function(){render();checkPersist();K.renderSide();},function(e){
        el.innerHTML='<div class="empty"><h2>Календарь не открылся</h2><p>Браузер не дал хранить данные на устройстве'+
          (e&&e.message?": "+esc(e.message):"")+". Проверьте, не включён ли режим инкогнито с запретом хранения.</p></div>";
      });
    }
    render();
  },
  close:function(){closePanel();},
  escape:function(){return closePanel();},
  sideHTML:sideHTML,
  settingsHTML:settingsHTML
};
})();
