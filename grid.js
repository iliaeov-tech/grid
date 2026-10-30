(function(){
"use strict";

/* ═════════ утилиты ═════════ */
var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
/* случайная часть — из криптогенератора: по id проекта называется канал «кто онлайн», его не угадать */
var uid=function(p){
  var b=crypto.getRandomValues(new Uint8Array(8));
  return p+"-"+Date.now().toString(36)+Array.from(b,function(x){return (x%36).toString(36);}).join("");
};
var clamp=function(n,a,b){return Math.max(a,Math.min(b,n));};

var PRIOS=[{id:"low",label:"Низкий"},{id:"med",label:"Средний"},
           {id:"high",label:"Высокий"},{id:"urgent",label:"Срочно"}];
/* стандартные типы; свои типы проекта лежат в коллекции kinds */
var TASK_KINDS=[{id:"report",label:"Отчёты",icon:"report"},{id:"learn",label:"Обучение",icon:"learn"},
                {id:"improve",label:"Улучшайзинг",icon:"improve"},{id:"idea",label:"Идея",icon:"idea"},
                {id:"note",label:"Заметка",icon:"note"},{id:"urgent",label:"Срочно",icon:"urgent"}];
var NOTE_KINDS=[{id:"memo",label:"Заметка",icon:"note"},{id:"deal",label:"Договорённость",icon:"check"},
                {id:"meet",label:"Встреча",icon:"calendar"},{id:"howto",label:"Инструкция",icon:"book"},
                {id:"links",label:"Ссылки",icon:"link"},{id:"idea",label:"Идея",icon:"idea"}];
/* цвета типов, статусов и заметок: пастельные пары фон/текст --h-* */
var TINTS=[{id:"blue",label:"Синий"},{id:"sky",label:"Голубой"},{id:"teal",label:"Бирюзовый"},
           {id:"green",label:"Зелёный"},{id:"yellow",label:"Жёлтый"},{id:"orange",label:"Оранжевый"},
           {id:"red",label:"Красный"},{id:"pink",label:"Розовый"},{id:"purple",label:"Фиолетовый"},
           {id:"gray",label:"Серый"}];
/* цвета шапок колонок: прежние ключи — пастельный ряд, v-* — насыщенный */
var HUE_ROWS=[
  [{id:"",label:"Без цвета"},{id:"red",label:"Красный"},{id:"orange",label:"Оранжевый"},
   {id:"yellow",label:"Жёлтый"},{id:"green",label:"Зелёный"},{id:"teal",label:"Бирюзовый"},
   {id:"blue",label:"Голубой"},{id:"purple",label:"Сиреневый"},{id:"pink",label:"Розовый"}],
  [{id:"v-slate",label:"Графитовый"},{id:"v-red",label:"Ярко-красный"},{id:"v-orange",label:"Ярко-оранжевый"},
   {id:"v-yellow",label:"Ярко-жёлтый"},{id:"v-green",label:"Ярко-зелёный"},{id:"v-teal",label:"Ярко-бирюзовый"},
   {id:"v-blue",label:"Синий"},{id:"v-purple",label:"Фиолетовый"},{id:"v-pink",label:"Малиновый"}]];
/* насыщенные шапки — с белым текстом, кроме жёлтой */
function hueStyle(id){
  var vivid=/^v-/.test(id||"");
  if(!id||!find(HUE_ROWS[vivid?1:0],id)) return "";
  return "--hb:var(--"+(vivid?id:"c-"+id)+");--hi:"+(vivid&&id!=="v-yellow"?"#fff":"var(--ink)");
}
var PALETTE=["#E0653F","#2F8FD4","#7B5BD6","#B9861A","#0E9E86","#D6467F","#5C7CFA","#3F9A4A"];

var ICONS={
  report:'<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path><path d="M9 13h6M9 17h4"></path>',
  learn:'<path d="M12 4L2.5 9 12 14l9.5-5z"></path><path d="M6 11.5V17c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5"></path>',
  improve:'<path d="M3 17l5.5-5.5 3.5 3.5L21 6"></path><path d="M15 6h6v6"></path>',
  idea:'<path d="M9 18h6"></path><path d="M10 21h4"></path><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"></path>',
  note:'<path d="M5 4h14v10l-5 5H5z"></path><path d="M19 14h-5v5"></path><path d="M8.5 8.5h7M8.5 12h4"></path>',
  urgent:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"></path>',
  check:'<circle cx="12" cy="12" r="8.5"></circle><path d="M8.2 12.4l2.6 2.6 5-5.2"></path>',
  star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  flag:'<path d="M5.5 21V4"></path><path d="M5.5 4.5h12l-2.5 4 2.5 4h-12"></path>',
  heart:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"></path>',
  bug:'<rect x="7.5" y="8" width="9" height="12" rx="4.5"></rect><path d="M12 11v9M7.5 13H4M20 13h-3.5M8 17.5l-3 2.5M16 17.5l3 2.5M8 9.5L5.5 7M16 9.5L18.5 7M9.5 8a2.5 2.5 0 0 1 5 0"></path>',
  users:'<circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 19c0-3.1 2.5-5 5.5-5s5.5 1.9 5.5 5"></path><path d="M16 5.5a3 3 0 0 1 0 5.6"></path><path d="M17.5 14.2c2 .6 3.5 2.2 3.5 4.8"></path>',
  chat:'<path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"></path>',
  target:'<circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="4.5"></circle><circle cx="12" cy="12" r=".8"></circle>',
  code:'<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"></path>',
  cart:'<path d="M3 4h2.5l2.2 11h10.6l2-8H6.6"></path><circle cx="9.5" cy="19.5" r="1.3"></circle><circle cx="17" cy="19.5" r="1.3"></circle>',
  coin:'<circle cx="12" cy="12" r="8.5"></circle><path d="M14.7 9.4c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.8.8-2.8 2 0 2.8 5.8 1.4 5.8 4.1 0 1.2-1.3 2-2.9 2-1.3 0-2.4-.5-2.9-1.4M12 6.3V8M12 16.1v1.6"></path>',
  pin:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  pushpin:'<path d="M9 3.5h6"></path><path d="M10 3.5v5.5L7 13h10l-3-4V3.5"></path><path d="M12 13v7.5"></path>',
  bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
  rocket:'<path d="M5 15c-1.5 1.3-2 4-2 6 2 0 4.7-.5 6-2"></path><path d="M9 18l-3-3c1.5-5 5.5-10.5 14-11-.5 8.5-6 12.5-11 14z"></path><circle cx="15" cy="9" r="1.6"></circle>',
  clock:'<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
  calendar:'<rect x="3.5" y="5" width="17" height="16" rx="2.5"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  book:'<path d="M5 18.5V5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5 2.5 2.5 0 0 0 7.5 22H19v-5"></path>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  tree:'<path d="M5 3.5v12a2.5 2.5 0 0 0 2.5 2.5H10M5 8.5h5"></path><rect x="12" y="6" width="8" height="5" rx="1.5"></rect><rect x="12" y="15.5" width="8" height="5" rx="1.5"></rect>',
  chev:'<path d="M6 9l6 6 6-6"></path>',
  chevR:'<path d="M9 6l6 6-6 6"></path>',
  chevL:'<path d="M15 6l-6 6 6 6"></path>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"></path>',
  tick:'<path d="M5 12.5l4.5 4.5L19 7"></path>',
  briefcase:'<rect x="3.5" y="7" width="17" height="12.5" rx="2"></rect><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"></path>',
  leaf:'<path d="M5 19.5C5 11 10 6 19.5 4.5 19.5 14 14 19.5 5 19.5z"></path><path d="M5 19.5l8.5-8.5"></path>',
  gear:'<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>',
  download:'<path d="M12 4v12M7 11l5 5 5-5M5 20h14"></path>',
  folder:'<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"></path>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>',
  sort:'<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"></path>',
  move:'<path d="M13 5h6v14h-6"></path><path d="M4 12h11M11 8l4 4-4 4"></path>',
  archiveDone:'<rect x="3.5" y="4" width="17" height="5" rx="1.2"></rect><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9"></path><path d="M9.5 14.5l2 2 3.5-3.5"></path>',
  bars:'<path d="M6 20v-5M12 20V9M18 20V4"></path>',
  tag:'<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z"></path><circle cx="8" cy="8" r="1.4"></circle>',
  text:'<path d="M5 6h14M5 12h14M5 18h9"></path>',
  plus:'<path d="M12 5v14M5 12h14"></path>',
  open:'<path d="M14 4h6v6M20 4l-8 8"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  detach:'<path d="M5 4v6a3 3 0 0 0 3 3h11"></path><path d="M15 9l4 4-4 4"></path>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"></path>',
  archive:'<rect x="3.5" y="4" width="17" height="5" rx="1.2"></rect><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9M10 13h4"></path>',
  restore:'<path d="M4 12a8 8 0 1 0 2.5-5.8"></path><path d="M4 4v4.5h4.5"></path>',
  trash:'<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"></path>',
  pencil:'<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z"></path><path d="M13.5 6.5l4 4"></path>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  x:'<path d="M6 6l12 12M18 6L6 18"></path>',
  dots:'<circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle>'
};
/* иконки, из которых выбирают свой тип */
var ICON_CHOICES=[["report","Документ"],["learn","Обучение"],["improve","Рост"],["idea","Идея"],
  ["note","Заметка"],["urgent","Молния"],["check","Галочка"],["star","Звезда"],["flag","Флаг"],
  ["heart","Сердце"],["bug","Ошибка"],["users","Люди"],["chat","Сообщение"],["target","Цель"],
  ["code","Код"],["cart","Покупки"],["coin","Деньги"],["pin","Место"],["bell","Напоминание"],
  ["rocket","Запуск"],["clock","Время"],["calendar","Календарь"],["book","Книга"],["link","Ссылка"]];
function ic(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[name]||ICONS.note)+"</svg>";}
/* цвет из общей палитры: --kb светлый фон, --ki яркий (иконка, точка), --kt тёмный текст */
function tint(t){t=find(TINTS,t)?t:"gray";return "--kb:var(--h-"+t+");--ki:var(--k-"+t+");--kt:var(--h-"+t+"-ink)";}
/* приоритет из данных (база, резервная копия) — только из списка: значение попадает в style */
function prioId(p){return find(PRIOS,p)?p:"med";}
function prioVar(p){return "var(--p-"+prioId(p)+")";}
function prioSoft(p){return "var(--p-"+prioId(p)+"-soft)";}
function labelOf(list,id,dflt){for(var i=0;i<list.length;i++){if(list[i].id===id)return list[i].label;}return dflt||"";}

var MONTHS=["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
var MONTHS_FULL=["январь","февраль","март","апрель","май","июнь","июль",
                 "август","сентябрь","октябрь","ноябрь","декабрь"];
var WEEK=["вс","пн","вт","ср","чт","пт","сб"];
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function todayISO(){return iso(new Date());}
function parseISO(s){var p=String(s||"").split("-");
  return p.length===3&&p[0]?new Date(+p[0],+p[1]-1,+p[2]):null;}
function daysBetween(a,b){return Math.round((b-a)/864e5);}
function shortDate(d){
  return d.getDate()+" "+MONTHS[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?" "+String(d.getFullYear()).slice(2):"");
}
/* дата в Grid Work — в формате из личных настроек: «27 окт» или «27.10.26» */
function wDate(d){
  if(prefs().dateFmt!=="num") return shortDate(d);
  return String(d.getDate()).padStart(2,"0")+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getFullYear()).slice(2);
}
function dueInfo(s){
  var d=parseISO(s); if(!d) return null;
  var n=daysBetween(parseISO(todayISO()),d);
  var label=n===0?"сегодня":n===1?"завтра":n===-1?"вчера":wDate(d);
  return {label:label,days:n,state:n<0?"late":(n<=2?"soon":"")};
}
function initials(name){
  var p=String(name||"?").trim().split(/\s+/).filter(Boolean);
  return p.length?(p[0][0]+(p[1]?p[1][0]:"")).toUpperCase():"?";
}
function fmtSize(n){
  n=Number(n)||0;
  return n<1024?n+" Б":n<1048576?(n/1024).toFixed(0)+" КБ":n<1073741824?(n/1048576).toFixed(1).replace(/\.0$/,"")+" МБ"
    :(n/1073741824).toFixed(1).replace(/\.0$/,"")+" ГБ";
}
function fmtWhen(ts){
  if(!ts) return "";
  var d=new Date(ts),n=new Date();
  var hm=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  return d.toDateString()===n.toDateString()?hm:(d.getDate()+" "+MONTHS[d.getMonth()]+", "+hm);
}

/* ═════════ состояние ═════════ */
/* Совместная работа через сервер (grid.config.js → collab). Пока она
   выключена, Grid Work живёт только на этом устройстве (IndexedDB): нет
   входа, ролей, приглашений, push и подписки на календари, и сайт не
   обращается никуда, кроме своих файлов. Код совместной работы остаётся
   для следующего этапа. */
var COLLAB=!!(window.GRID_CONFIG&&window.GRID_CONFIG.collab);
/* me — id профиля того, кто вошёл; без сервера — хозяина этого устройства */
var S={store:null,sb:null,chan:null,mode:"boot",started:false,
  projects:[],project_members:[],profiles:[],columns:[],cards:[],comments:[],files:[],notes:[],statuses:[],kinds:[],feeds:[],
  project:null,tab:"board",me:null,email:"",open:null,openNote:null,peers:[],
  filter:{q:"",assignee:"all",priority:"all",hideDone:false},
  composer:null,composerText:"",renaming:null,expanded:{},
  dragging:false};

var mainEl=$("#main"),drawerEl=$("#drawer"),scrimEl=$("#scrim"),
    gateEl=$("#gate"),tabsEl=$("#tabs"),filePick=$("#filePick");

/* ═════════ выборки ═════════ */
function find(list,id){for(var i=0;i<list.length;i++){if(list[i].id===id)return list[i];}return null;}
function project(id){return find(S.projects,id||S.project);}
function column(id){return find(S.columns,id);}
function card(id){return find(S.cards,id);}
function person(id){return id?find(S.profiles,id):null;}
function nameOf(p){return p?p.name||String(p.email||"").split("@")[0]||"Участник":"";}
function me(){return person(S.me);}
/* личные настройки отображения лежат в профиле (profiles.settings) —
   они одинаковы на всех устройствах человека */
/* push: какие события присылать, тихие часы и пояс (по нему сервер считает 9:00 и тихие часы) */
var PREFS={view:"board",hideDone:false,density:"normal",weekStart:1,dateFmt:"short",
  pushDue:true,pushAssigned:true,pushComment:true,quiet:true,quietFrom:"22:00",quietTo:"08:00",tz:""};
function prefs(){var s=(me()||{}).settings;return Object.assign({},PREFS,s&&typeof s==="object"?s:{});}
/* вид и «скрывать выполненные» действуют с открытия Grid Work */
function applyPrefs(){
  var p=prefs();
  S.tab=p.view; S.filter.hideDone=!!p.hideDone;
  $("#fDone").setAttribute("aria-pressed",String(S.filter.hideDone));
}
function byOrder(a,b){return (a.order||0)-(b.order||0)||String(a.id).localeCompare(String(b.id));}
function projName(){var p=project();return p?p.name:"Проект";}
/* в корзине — всё, у чего стоит deletedAt */
function liveProjects(){return S.projects.filter(function(p){return !p.deletedAt;}).sort(byOrder);}
function colsOf(pid){return S.columns.filter(function(c){return c.projectId===pid&&!c.deletedAt;}).sort(byOrder);}
function cols(){return colsOf(S.project);}
function colPath(col){var p=project(col.projectId);return (p?p.name:"?")+" » "+col.title;}
/* задача на доске: ни она, ни её колонка, ни проект не в корзине */
function onBoard(c){
  var col=column(c.columnId),p=col&&project(col.projectId);
  return !c.deletedAt&&!!col&&!col.deletedAt&&!!p&&!p.deletedAt;
}
/* живые задачи проекта, включая подзадачи; архив сюда не входит */
function projCards(){return S.cards.filter(function(c){return c.projectId===S.project&&!c.archived&&onBoard(c);});}
function topCards(){return projCards().filter(function(c){return !c.parentId;});}
/* закреплённые задачи всегда вверху колонки, дальше — по порядку */
function pinFirst(a,b){return (b.pinned?1:0)-(a.pinned?1:0)||byOrder(a,b);}
function cardsIn(colId){return S.cards.filter(function(c){
  return c.columnId===colId&&!c.parentId&&!c.archived&&!c.deletedAt;}).sort(pinFirst);}
function childrenOf(id){return S.cards.filter(function(c){return c.parentId===id&&!c.archived&&!c.deletedAt;}).sort(byOrder);}
function archivedCards(){return S.cards.filter(function(c){
  return c.projectId===S.project&&c.archived&&!c.parentId&&onBoard(c);})
  .sort(function(a,b){return (b.archivedAt||0)-(a.archivedAt||0);});}

/* Роли в проекте: владелец — всё; редактор — задачи, колонки, заметки и
   файлы; наблюдатель — смотрит и комментирует. Те же правила держит база
   (supabase-schema.sql), интерфейс лишь не предлагает недоступного. */
var ROLES=[{id:"owner",label:"Владелец",note:"всё, включая участников, статусы и типы, удаление колонок и проектов"},
           {id:"editor",label:"Редактор",note:"задачи, колонки, заметки и файлы"},
           {id:"viewer",label:"Наблюдатель",note:"смотрит и комментирует"}];
function membersOf(pid){pid=pid||S.project;return S.project_members.filter(function(m){return m.projectId===pid;});}
/* без сервера на устройстве один хозяин — ему можно всё */
function roleOf(pid,who){
  if(!COLLAB) return "owner";
  var m=membersOf(pid).filter(function(x){return x.userId&&x.userId===(who||S.me);})[0];
  return m?m.role:"";
}
function canEdit(pid){var r=roleOf(pid);return r==="owner"||r==="editor";}
function isOwner(pid){return roleOf(pid)==="owner";}
/* ответственным можно назначить вошедшего участника проекта; без сервера —
   любого из списка «Участники» (он общий для всех проектов) */
function people(pid){
  if(!COLLAB) return S.profiles.slice().sort(function(a,b){return nameOf(a).localeCompare(nameOf(b),"ru");});
  return membersOf(pid).filter(function(m){return m.userId;}).map(function(m){
    return person(m.userId)||{id:m.userId,name:"",email:m.email,color:""};
  }).sort(function(a,b){return nameOf(a).localeCompare(nameOf(b),"ru");});
}
function endOf(colId){var t=cardsIn(colId);return orderBetween(t.length?t[t.length-1].order:null,null);}
function projNotes(){return S.notes.filter(function(n){return n.projectId===S.project;}).sort(byOrder);}

/* типы: стандартные плюс свои типы проекта */
function kindsFor(scope,pid){
  var own=S.kinds.filter(function(k){return k.scope===scope&&k.projectId===(pid||S.project);}).sort(byOrder);
  return (scope==="note"?NOTE_KINDS:TASK_KINDS).concat(own);
}
function kindInfo(scope,id){
  if(!id) return null;
  return find(scope==="note"?NOTE_KINDS:TASK_KINDS,id)||find(S.kinds,id);
}
/* выбор цвета из общей палитры (заметка, карточка); пустое значение — без цвета */
function tintPick(attr,cur,ro){
  return '<div class="tints"><button class="tint none" '+attr+'="" aria-pressed="'+!find(TINTS,cur)+
    '" aria-label="Без цвета" title="Без цвета" style="--ki:var(--accent)"'+(ro||"")+"><i></i></button>"+
    TINTS.map(function(t){return '<button class="tint" '+attr+'="'+t.id+'" aria-pressed="'+(cur===t.id)+
      '" aria-label="'+t.label+'" title="'+t.label+'" style="'+tint(t.id)+'"'+(ro||"")+"><i></i></button>";}).join("")+"</div>";
}
function kindChip(k){
  return '<span class="chip kind"'+(k.color?' style="'+tint(k.color)+'"':"")+">"+ic(k.icon)+esc(k.label)+"</span>";
}
/* у каждого проекта свои статусы. Статус с isDone ставится выполненным
   задачам; его можно переименовать, но не удалить */
var DEFAULT_STATUSES=[["todo","Не начата","gray"],["doing","В работе","blue"],["blocked","Нужна помощь","red"],
                      ["review","На проверке","yellow"],["done","Готова","green"]];
function statusRows(pid,idOf){
  return DEFAULT_STATUSES.map(function(s,i){
    return {id:idOf(s[0]),projectId:pid,label:s[1],color:s[2],order:(i+1)*1000,isDone:s[0]==="done"};});
}
function statusList(pid){pid=pid||S.project;return S.statuses.filter(function(s){return s.projectId===pid;}).sort(byOrder);}
function statusOf(id){return find(S.statuses,id);}
function doneStatus(pid){return statusList(pid).filter(function(s){return s.isDone;})[0]||null;}
function startStatus(pid){return statusList(pid).filter(function(s){return !s.isDone;})[0]||null;}
function commentsOf(id){return S.comments.filter(function(c){return c.cardId===id;})
  .sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});}
function filesOf(id){return S.files.filter(function(f){return f.cardId===id;})
  .sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});}
/* файлы проекта; файлы задач из корзины лежат в корзине вместе с ними */
function projFiles(){return S.files.filter(function(f){
    var c=f.cardId&&card(f.cardId);
    return f.projectId===S.project&&(!f.cardId||c&&onBoard(c));})
  .sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});}
function passes(c){
  var f=S.filter;
  if(f.hideDone&&c.done) return false;
  if(f.assignee!=="all"&&(c.assignee||"")!==(f.assignee==="none"?"":f.assignee)) return false;
  if(f.priority!=="all"&&(c.priority||"med")!==f.priority) return false;
  if(f.q){
    var k=kindInfo("task",c.kind);
    var hay=(c.title||"")+" "+(c.desc||"")+" "+(k?k.label:"");
    if(hay.toLowerCase().indexOf(f.q.toLowerCase())<0) return false;
  }
  return true;
}
/* задача видна, если под фильтр подходит она сама или хоть одна её подзадача */
function shown(c){return passes(c)||childrenOf(c.id).some(passes);}
function visibleIn(colId){return cardsIn(colId).filter(shown);}

/* ═════════ уведомления ═════════ */
/* undo — что сделать по кнопке в подсказке: «Вернуть» после удаления в
   корзину или своё действие с подписью label */
var toastT;
function flash(msg,undo,label){
  var el=$("#toast");
  if(!el){el=document.createElement("div");el.id="toast";el.className="toast";
    el.setAttribute("role","status");document.body.appendChild(el);}
  el.innerHTML=esc(msg)+(undo?'<button class="toast-undo">'+esc(label||"Вернуть")+"</button>":"");
  if(undo) $(".toast-undo",el).onclick=function(){el.style.display="none";undo();};
  el.style.display="block";
  clearTimeout(toastT); toastT=setTimeout(function(){el.style.display="none";},undo?7000:3600);
}

/* ═════════ хранилище ═════════ */
var COLLS=["projects","project_members","profiles","columns","cards","comments","files","notes","statuses","kinds","feeds"];
/* поле в браузере → колонка таблицы с тем же именем, что и коллекция */
var MAP={
  projects:{name:"name",descr:"descr",order:"pos",doneMoveDefault:"done_move_default",deletedAt:"deleted_at"},
  project_members:{projectId:"project_id",userId:"user_id",email:"email",role:"role",createdAt:"created_at"},
  profiles:{email:"email",name:"name",color:"color",avatar:"avatar",settings:"settings"},
  statuses:{projectId:"project_id",label:"label",color:"color",order:"pos",isDone:"is_done"},
  kinds:{projectId:"project_id",scope:"scope",label:"label",color:"color",icon:"icon",order:"pos"},
  columns:{projectId:"project_id",title:"title",order:"pos",hue:"hue",
           doneMove:"done_move",doneTarget:"done_target",deletedAt:"deleted_at"},
  cards:{projectId:"project_id",columnId:"column_id",parentId:"parent_id",order:"pos",
         title:"title",desc:"descr",done:"done",start:"start_on",due:"due",priority:"priority",
         status:"status",kind:"kind",assignee:"assignee",archived:"archived",
         archivedAt:"archived_at",deletedAt:"deleted_at",createdAt:"created_at",updatedAt:"updated_at",
         pinned:"pinned",color:"color"},
  comments:{cardId:"card_id",authorId:"author_id",author:"author",body:"body",createdAt:"created_at"},
  files:{projectId:"project_id",cardId:"card_id",noteId:"note_id",name:"name",size:"size",mime:"mime",
         path:"path",createdAt:"created_at"},
  notes:{projectId:"project_id",title:"title",body:"body",color:"color",kind:"kind",
         order:"pos",createdAt:"created_at",updatedAt:"updated_at"},
  feeds:{userId:"user_id",scope:"scope",createdAt:"created_at"}
};
var NUM={order:1,size:1},TIME={createdAt:1,updatedAt:1,archivedAt:1,deletedAt:1},
    /* ссылки и даты: пустое значение в базе — null */
    NULLABLE={parentId:1,assignee:1,start:1,due:1,doneTarget:1,cardId:1,noteId:1,status:1,userId:1,authorId:1,archivedAt:1,deletedAt:1};
/* что база удаляет вместе со строкой (on delete cascade в supabase-schema.sql) */
var CASCADE={
  projects:[["project_members","projectId"],["statuses","projectId"],["kinds","projectId"],["columns","projectId"],
            ["cards","projectId"],["notes","projectId"],["files","projectId"]],
  columns:[["cards","columnId"]],
  cards:[["cards","parentId"],["comments","cardId"],["files","cardId"]],
  notes:[["files","noteId"]]
};
function cascadeOf(coll,acc){
  acc=acc||{}; acc[coll]=1;
  (CASCADE[coll]||[]).forEach(function(r){if(!acc[r[0]]) cascadeOf(r[0],acc);});
  return acc;
}

function fromRow(coll,r){
  var o={id:r.id},m=MAP[coll];
  Object.keys(m).forEach(function(k){
    var v=r[m[k]];
    o[k]=NUM[k]?Number(v)||0:TIME[k]?(v?Date.parse(v):0):(v==null?"":v);
  });
  return o;
}
function toRow(coll,id,o){
  var r={},m=MAP[coll];
  Object.keys(o).forEach(function(k){
    var v=o[k];
    if(!m[k]) return;                       /* локальные поля вроде data демо-файла в базу не идут */
    if(TIME[k]&&!v&&!NULLABLE[k]) return;   /* пустая дата создания — её поставит база */
    r[m[k]]=TIME[k]?(v?new Date(v).toISOString():null):(v===""&&NULLABLE[k]?null:v);
  });
  if(m.updatedAt) r.updated_at=new Date().toISOString();
  if(id!=null) r.id=id;
  return r;
}
function supaStore(sb){
  var subs={},timers={};
  function refetch(coll){
    clearTimeout(timers[coll]);
    timers[coll]=setTimeout(function(){
      sb.from(coll).select("*").then(function(res){
        if(res.error){flash("Не удалось загрузить данные: "+res.error.message);return;}
        var rows=(res.data||[]).map(function(r){return fromRow(coll,r);});
        (subs[coll]||[]).forEach(function(f){f(rows);});
      });
    },110);
  }
  /* после удаления перечитываем и то, что база удалила вместе со строкой */
  function done(colls){return function(res){
    colls.forEach(refetch);
    if(res&&res.error)throw res.error;};}
  return {
    kind:"supabase",refetch:refetch,sb:sb,
    subscribe:function(coll,cb){(subs[coll]=subs[coll]||[]).push(cb);refetch(coll);
      return function(){subs[coll]=subs[coll].filter(function(f){return f!==cb;});};},
    set:function(coll,id,body){return sb.from(coll).upsert(toRow(coll,id,body)).then(done([coll]));},
    update:function(coll,id,patch){return sb.from(coll).update(toRow(coll,null,patch)).eq("id",id).then(done([coll]));},
    del:function(coll,id){return sb.from(coll).delete().eq("id",id).then(done(Object.keys(cascadeOf(coll))));}
  };
}
/* ═════════ хранилище на этом устройстве ═════════ */
/* Grid Work без сервера: те же коллекции, что в базе, — в IndexedDB этого
   браузера, как в Grid Life. В памяти копия, каждая правка сразу пишется
   на диск. Файлы хранятся как есть (Blob). meta — служебное: кто хозяин
   устройства (me), показан ли пример, когда сохраняли копию.
   При первом запуске сюда переезжают данные прежнего демо-режима из
   localStorage, а если их нет — кладётся пример. */
var WORK_DB="grid-work",OLD_KEY="grid.board.v4";
function idbDone(r){return new Promise(function(res,rej){r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});}
/* Все записи хранилища. В приватном окне Safari запись, которую прервала
   перезагрузка страницы, оставляет «призраков» — пустые (undefined) строки
   на месте новых ключей; таких записей не было, сохранённые раньше целы. */
function idbAll(os){return idbDone(os.getAll()).then(function(rows){return rows.filter(function(x){return x!==undefined;});});}
function openWorkDB(){
  if(!window.indexedDB) return Promise.reject(new Error("браузер не поддерживает хранение данных"));
  var r=indexedDB.open(WORK_DB,1);
  r.onupgradeneeded=function(){
    var d=r.result;
    COLLS.forEach(function(c){d.createObjectStore(c,{keyPath:"id"});});
    d.createObjectStore("meta",{keyPath:"key"});
  };
  return idbDone(r);
}
function dataURLBlob(u){
  var m=/^data:([^;,]*)(;base64)?,(.*)$/.exec(u||""); if(!m) return null;
  var bin=m[2]?atob(m[3]):decodeURIComponent(m[3]),a=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
  return new Blob([a],{type:m[1]||"application/octet-stream"});
}
/* постоянное хранение просим при первой записи: без него браузер может
   очистить данные, когда на устройстве кончается место */
var persistAsked=false;
function askPersist(){
  if(persistAsked||!navigator.storage||!navigator.storage.persist) return;
  persistAsked=true;
  navigator.storage.persist().then(function(p){S.persisted=p;renderSettings();},function(){});
}
/* Без сервера почты в Grid нет: ни в профилях, ни в участниках проектов. Правило
   держит само хранилище — для каждой записи и для данных, сохранённых раньше
   (их чистим при загрузке). */
var MAILED=["profiles","project_members"];
function noMail(c,r){return r.email&&MAILED.indexOf(c)>=0?Object.assign({},r,{email:""}):r;}
function localStore(){
  var db=null,data={},meta={},subs={},fresh=false;
  function tx(stores,fn){
    return new Promise(function(res,rej){
      var t=db.transaction(stores,"readwrite"); fn(t);
      t.oncomplete=function(){res();}; t.onerror=t.onabort=function(){rej(t.error);};
    });
  }
  function saved(p){
    askPersist();
    return p.catch(function(e){flash("Не удалось сохранить на устройстве"+(e&&e.message?": "+e.message:""));throw e;});
  }
  function emit(c){(subs[c]||[]).forEach(function(f){f(data[c].slice());});}
  function idx(c,id){for(var i=0;i<data[c].length;i++){if(data[c][i].id===id)return i;}return -1;}
  function writeAll(d,m){
    return tx(COLLS.concat(["meta"]),function(t){
      COLLS.forEach(function(c){var os=t.objectStore(c);os.clear();(d[c]||[]).forEach(function(r){os.put(r);});});
      Object.keys(m).forEach(function(k){t.objectStore("meta").put({key:k,value:m[k]});});
    });
  }
  /* данные прежнего демо-режима: файлы были текстом (data:URL) — делаем из них Blob */
  function fromOld(old){
    (old.files||[]).forEach(function(f){if(f.data){f.blob=dataURLBlob(f.data);delete f.data;}});
    var me=null; try{me=localStorage.getItem("grid.demo.me");}catch(e){}
    if(!find(old.profiles||[],me)) me=(old.profiles||[])[0]?old.profiles[0].id:null;
    return {data:old,me:me};
  }
  var ready=openWorkDB().then(function(d){
    db=d;
    return Promise.all(COLLS.concat(["meta"]).map(function(c){return idbAll(db.transaction(c).objectStore(c));}));
  }).then(function(r){
    var mailed=false;
    COLLS.forEach(function(c,i){data[c]=r[i].map(function(x){var y=noMail(c,x);if(y!==x)mailed=true;return y;});});
    r[COLLS.length].forEach(function(x){meta[x.key]=x.value;});
    if(meta.started) return mailed?saved(tx(MAILED,function(t){
      MAILED.forEach(function(c){data[c].forEach(function(x){t.objectStore(c).put(x);});});})):null;
    var old=null; try{old=JSON.parse(localStorage.getItem(OLD_KEY));}catch(e){}
    var first=old&&old.projects?fromOld(old):{data:starter(),me:"m-1",sample:true};
    fresh=!!first.sample;
    COLLS.forEach(function(c){data[c]=(first.data[c]||[]).map(function(x){return noMail(c,x);});});
    Object.assign(meta,{started:Date.now(),me:first.me,sample:!!first.sample});
    return writeAll(data,meta).then(function(){
      try{localStorage.removeItem(OLD_KEY);localStorage.removeItem("grid.demo.me");}catch(e){}
    });
  }).then(function(){return meta;});
  return {
    kind:"local",refetch:function(){},ready:ready,meta:meta,
    /* открылся без данных: при этом открытии положили пример */
    isFresh:function(){return fresh;},
    setMeta:function(k,v){meta[k]=v;return saved(tx(["meta"],function(t){t.objectStore("meta").put({key:k,value:v});}));},
    subscribe:function(c,cb){(subs[c]=subs[c]||[]).push(cb);
      ready.then(function(){cb(data[c].slice());});
      return function(){subs[c]=subs[c].filter(function(f){return f!==cb;});};},
    set:function(c,id,body){var i=idx(c,id),rec=noMail(c,Object.assign({},body,{id:id}));
      if(i<0)data[c].push(rec);else data[c][i]=rec;emit(c);
      return saved(tx([c],function(t){t.objectStore(c).put(rec);}));},
    update:function(c,id,patch){var i=idx(c,id);if(i<0)return Promise.resolve();
      var rec=data[c][i]=noMail(c,Object.assign({},data[c][i],patch));emit(c);
      return saved(tx([c],function(t){t.objectStore(c).put(rec);}));},
    del:function(c,id){
      var gone={};
      (function drop(c,id){
        (gone[c]=gone[c]||[]).push(id); data[c]=data[c].filter(function(d){return d.id!==id;});
        (CASCADE[c]||[]).forEach(function(r){
          data[r[0]].filter(function(d){return d[r[1]]===id;}).forEach(function(d){drop(r[0],d.id);});});
      })(c,id);
      Object.keys(gone).forEach(emit);
      return saved(tx(Object.keys(gone),function(t){
        Object.keys(gone).forEach(function(k){gone[k].forEach(function(x){t.objectStore(k).delete(x);});});}));
    },
    /* все коллекции разом — из снимка; meta (хозяин устройства) остаётся */
    replace:function(d){
      COLLS.forEach(function(c){data[c]=(d[c]||[]).map(function(x){return noMail(c,x);});});
      meta.sample=false;
      COLLS.forEach(emit);
      return saved(writeAll(data,meta));
    },
    /* «Очистить и начать с нуля»: остаётся только профиль хозяина устройства — фото, цвет,
       настройки; имя из примера («Аня») не ваше, его убираем */
    reset:function(){
      var mine=find(data.profiles,meta.me);
      return this.replace({profiles:mine?[mine.name===SAMPLE_ME?Object.assign({},mine,{name:""}):mine]:[]});
    }
  };
}
var SAMPLE_ME="Аня";
function starter(){
  var d=new Date(); d.setDate(d.getDate()+4); var soon=iso(d);
  var s=new Date(); s.setDate(s.getDate()-2); var past=iso(s);
  var now=Date.now();
  function col(id,pid,title,order,hue){return {id:id,projectId:pid,title:title,order:order,hue:hue,
    doneMove:true,doneTarget:"",deletedAt:0};}
  function t(id,colId,order,title,o){return Object.assign({id:id,projectId:"p-1",columnId:colId,parentId:"",
    order:order,title:title,desc:"",done:false,start:"",due:"",priority:"med",status:"todo",kind:"",
    assignee:"",archived:false,archivedAt:0,deletedAt:0,createdAt:now,updatedAt:now},o||{});}
  function proj(id,name,order){return {id:id,name:name,descr:"",order:order,doneMoveDefault:true,deletedAt:0};}
  function prof(id,name,color){return {id:id,email:"",name:name,color:color,avatar:"",settings:{}};}
  function mem(id,pid,who,role){return {id:id,projectId:pid,userId:who,email:"",role:role,createdAt:now};}
  return {
    projects:[proj("p-1","Запуск продукта",1000),proj("p-2","Маркетинг",2000)],
    /* вы в примере — «Аня» (m-1); Борис и Вера — участники для поля «Ответственный» */
    profiles:[prof("m-1",SAMPLE_ME,PALETTE[0]),prof("m-2","Борис",PALETTE[1]),prof("m-3","Вера",PALETTE[4])],
    project_members:[mem("pm-1","p-1","m-1","owner"),mem("pm-2","p-1","m-2","editor"),mem("pm-3","p-1","m-3","viewer"),
                     mem("pm-5","p-2","m-1","owner"),mem("pm-6","p-2","m-3","editor")],
    statuses:statusRows("p-1",function(k){return k;}).concat(statusRows("p-2",function(k){return "p2-"+k;})),
    kinds:[{id:"k-1",projectId:"p-1",scope:"task",label:"Инфраструктура",color:"purple",icon:"code",order:1000}],
    columns:[col("c-1","p-1","Бэклог",1000,""),col("c-2","p-1","В работе",2000,"blue"),
             col("c-3","p-1","На проверке",3000,"yellow"),col("c-4","p-1","Готово",4000,"green"),
             col("c-5","p-2","Идеи",1000,"purple"),col("c-6","p-2","В работе",2000,"")],
    cards:[
      t("t-1","c-1",1000,"Освоиться в Grid",
        {kind:"note",assignee:"m-1",due:soon,desc:"Проекты, задачи и заметки здесь — пример. Когда освоитесь, удалите их или "+
          "начните с нуля: Настройки → Данные → «Очистить и начать с нуля»."}),
      t("s-1","c-1",1000,"Удалить примеры",{parentId:"t-1",assignee:"m-1"}),
      t("s-2","c-1",2000,"Сохранить резервную копию",{parentId:"t-1",assignee:"m-1"}),
      t("t-2","c-1",2000,"Переименовать колонки под свой процесс",{priority:"low",kind:"improve"}),
      t("t-3","c-2",1000,"Прототип личного кабинета",
        {priority:"high",status:"doing",kind:"improve",assignee:"m-2",start:past,due:soon}),
      t("s-3","c-2",1000,"Шапка",{parentId:"t-3",done:true,status:"done",assignee:"m-2"}),
      t("s-4","c-2",2000,"Карточка профиля",{parentId:"t-3",done:true,status:"done",assignee:"m-2"}),
      t("s-5","c-2",3000,"Мобильная вёрстка",{parentId:"t-3",priority:"high",assignee:"m-3",due:soon}),
      t("t-4","c-2",2000,"Починить экспорт отчёта в CSV",
        {priority:"urgent",status:"blocked",kind:"report",assignee:"m-3",due:todayISO()}),
      t("t-5","c-3",1000,"Ревью схемы базы данных",{status:"review",kind:"learn",assignee:"m-1"}),
      t("t-6","c-4",1000,"Настроить сборку и деплой",
        {priority:"low",status:"done",kind:"k-1",assignee:"m-2",done:true}),
      t("s-6","c-4",1000,"CI",{parentId:"t-6",done:true,status:"done",assignee:"m-2"}),
      t("t-7","c-5",1000,"Серия писем для новых пользователей",
        {projectId:"p-2",status:"p2-todo",kind:"idea",assignee:"m-3",due:soon})
    ],
    comments:[{id:"k-1",cardId:"t-3",authorId:"m-2",author:"Борис",body:"Шапку доделал, осталась мобильная вёрстка.",createdAt:now-5400000}],
    files:[],
    notes:[{id:"n-1",projectId:"p-1",title:"Договорённости команды",kind:"deal",color:"yellow",order:1000,
            body:"— релиз в конце месяца\n— демо по пятницам",createdAt:now,updatedAt:now},
           {id:"n-2",projectId:"p-1",title:"Полезные ссылки",kind:"links",color:"",order:2000,
            body:"Макеты, документация и доступы — всё, что команде нужно под рукой.",createdAt:now,updatedAt:now}]
  };
}
function w(p){
  if(!p||!p.then) return p;
  return p.catch(function(e){
    var msg=(e&&(e.message||e.hint))||"";
    if(/row-level security|permission|denied|JWT/i.test(msg))
      flash("Нет прав на изменение. Возможно, сессия истекла — обновите страницу.");
    else if(/Failed to fetch|NetworkError/i.test(msg))
      flash("Нет связи с базой. Изменение не сохранено.");
    else flash("Не удалось сохранить"+(msg?": "+msg:"."));
  });
}

/* ═════════ порядок ═════════ */
function orderBetween(prev,next){
  if(prev==null&&next==null) return 1000;
  if(prev==null) return next-1000;
  if(next==null) return prev+1000;
  return (prev+next)/2;
}
function needsNormalize(a,b){return a!=null&&b!=null&&Math.abs(b-a)<0.0005;}
function normalize(list,coll){
  list.forEach(function(it,i){
    if(it.order!==(i+1)*1000) w(S.store.update(coll,it.id,{order:(i+1)*1000}));
  });
}

/* ═════════ изменения ═════════ */
function patchCard(id,patch){
  var c=card(id); if(c) Object.assign(c,patch);
  w(S.store.update("cards",id,patch));
  renderMain(); if(S.open) renderDrawer();
}
/* Статусы, свои типы и команда у каждого проекта свои. Задача, переехавшая
   в другой проект, получает статус и тип с тем же названием (статуса нет —
   начальный или «выполнено»), а ответственный снимается, если он не участник. */
function carryOver(c,pid){
  var st=statusOf(c.status),k=find(S.kinds,c.kind),patch={};
  var ns=st&&statusList(pid).filter(function(s){return s.label===st.label;})[0]||(c.done?doneStatus(pid):startStatus(pid));
  patch.status=ns?ns.id:"";
  if(k) patch.kind=(kindsFor("task",pid).filter(function(x){return x.projectId&&x.label===k.label;})[0]||{id:""}).id;
  if(c.assignee&&!roleOf(pid,c.assignee)) patch.assignee="";
  return patch;
}
/* файлы переехавших задач переходят в новый проект (комментарии привязаны к задаче и едут сами) */
function moveFiles(cardIds,pid){
  S.files.forEach(function(f){
    if(cardIds.indexOf(f.cardId)<0) return;
    f.projectId=pid; w(S.store.update("files",f.id,{projectId:pid}));
  });
}
/* переносит задачу вместе с подзадачами */
function moveCard(id,colId,order,extra){
  var c=card(id),col=column(colId); if(!c||!col) return;
  var pid=col.projectId,moved=pid!==c.projectId,kids=S.cards.filter(function(x){return x.parentId===id;});
  kids.forEach(function(k){
    if(k.columnId===colId&&!moved) return;
    var p=Object.assign(moved?carryOver(k,pid):{},{columnId:colId,projectId:pid});
    Object.assign(k,p); w(S.store.update("cards",k.id,p));
  });
  var patch=Object.assign({},extra||{},{columnId:colId,projectId:pid,order:order});
  if(moved){
    moveFiles([id].concat(kids.map(function(k){return k.id;})),pid);
    Object.assign(patch,carryOver(Object.assign({},c,extra),pid));
  }
  patchCard(id,patch);
}
/* Куда уезжает выполненная задача: колонка из настроек, иначе следующая.
   null — задача остаётся на месте. */
function doneTarget(col){
  if(!col||col.doneMove===false) return null;
  if(col.doneTarget&&col.doneTarget!==col.id){
    var t=column(col.doneTarget),tp=t&&project(t.projectId);
    if(!t||!tp) return null;                /* проект, куда у вас нет доступа */
    if(!t.deletedAt&&!tp.deletedAt) return canEdit(t.projectId)?t:null;
    /* колонка назначения в корзине — как будто её не выбирали */
  }
  var list=colsOf(col.projectId);
  for(var i=0;i<list.length-1;i++){if(list[i].id===col.id) return list[i+1];}
  return null;
}
/* Отметка «выполнено» переносит задачу по настройке её колонки. Снятие
   отметки задачу не возвращает — возврат был бы неожиданным. Подзадачи
   живут под родителем и никуда не переезжают. */
function toggleDone(id){
  var c=card(id); if(!c) return;
  var next=!c.done,ds=doneStatus(c.projectId),st=c.status;
  if(next&&ds) st=ds.id;
  else if(!next&&ds&&c.status===ds.id){
    /* снятая отметка возвращает задачу «в работу» — на второй статус по списку */
    var open=statusList(c.projectId).filter(function(s){return !s.isDone;});
    st=((open[1]||open[0])||{}).id||"";
  }
  var patch={done:next,status:st};
  var target=next&&!c.parentId?doneTarget(column(c.columnId)):null;
  if(!target){patchCard(id,patch);return;}
  moveCard(id,target.id,endOf(target.id),patch);
  /* экран за задачей не едет — говорим, куда она перенесена */
  flash("Перенесено в «"+(target.projectId!==S.project?colPath(target):target.title)+"»");
}
function newCard(o){
  var pid=o.projectId||S.project,st=startStatus(pid),now=Date.now();
  return Object.assign({projectId:pid,columnId:"",parentId:"",order:1000,title:"",desc:"",
    done:false,start:"",due:"",priority:"med",status:st?st.id:"",kind:"",assignee:S.me||"",
    archived:false,deletedAt:0,pinned:false,color:"",createdAt:now,updatedAt:now},o);
}
function addCard(colId,title){
  title=(title||"").trim(); if(!title) return;
  var id=uid("t"),body=newCard({columnId:colId,order:endOf(colId),title:title});
  S.cards.push(Object.assign({id:id},body));
  w(S.store.set("cards",id,body));
  renderMain();
}
function addSubtask(pid,title){
  var p=card(pid); title=(title||"").trim(); if(!p||!title) return;
  var kids=childrenOf(pid),id=uid("t");
  var body=newCard({projectId:p.projectId,columnId:p.columnId,parentId:pid,title:title,
    order:orderBetween(kids.length?kids[kids.length-1].order:null,null)});
  S.cards.push(Object.assign({id:id},body));
  w(S.store.set("cards",id,body));
  setExpanded(pid,true);
  renderMain(); if(S.open) renderDrawer(true);
}
/* Корзина: удалённые проекты, колонки и задачи лежат в ней 30 дней, потом
   стираются насовсем. Задача уходит туда с подзадачами и возвращается с теми,
   что ушли вместе с ней (у них та же отметка времени). */
var TRASH_DAYS=30;
function trashCard(id){
  var c=card(id); if(!c) return;
  var at=Date.now(),ids=[id];
  S.cards.forEach(function(k){
    if(k.parentId!==id||k.deletedAt) return;
    k.deletedAt=at; ids.push(k.id); w(S.store.update("cards",k.id,{deletedAt:at}));
  });
  if(ids.indexOf(S.open)>=0) closeDrawer();
  patchCard(id,{deletedAt:at});
  flash("Задача в корзине",function(){restoreCard(id);});
}
function restoreCard(id){
  var c=card(id); if(!c) return;
  S.cards.forEach(function(k){
    if(k.parentId!==id||k.deletedAt!==c.deletedAt) return;
    k.deletedAt=0; w(S.store.update("cards",k.id,{deletedAt:0}));
  });
  patchCard(id,{deletedAt:0});
}
/* Насовсем: вложенное удаляет база (в демо — localStore), а файлы из
   хранилища убираем сами — про них база не знает. */
function purge(coll,id){
  var gone=coll==="cards"?S.cards.filter(function(c){return c.id===id||c.parentId===id;})
    :coll==="columns"?S.cards.filter(function(c){return c.columnId===id;}):[];
  removeObjects(S.files.filter(function(f){
    return coll==="projects"?f.projectId===id:gone.some(function(c){return c.id===f.cardId;});}));
  w(S.store.del(coll,id));
}
/* при входе владелец стирает то, что пролежало в корзине дольше срока */
function purgeOld(){
  var edge=Date.now()-TRASH_DAYS*864e5,old=function(x){return x.deletedAt&&x.deletedAt<edge;};
  S.projects.forEach(function(p){if(old(p)&&isOwner(p.id)) purge("projects",p.id);});
  S.columns.forEach(function(c){if(old(c)&&isOwner(c.projectId)) purge("columns",c.id);});
  S.cards.forEach(function(c){if(old(c)&&isOwner(c.projectId)) purge("cards",c.id);});
}
/* в архив задача уходит вместе с подзадачами и возвращается в конец своей колонки */
function setArchived(id,on){
  var c=card(id); if(!c) return;
  S.cards.forEach(function(k){
    if(k.parentId!==id||!!k.archived===on) return;
    k.archived=on; w(S.store.update("cards",k.id,{archived:on}));
  });
  patchCard(id,on?{archived:true,archivedAt:Date.now()}:{archived:false,order:endOf(c.columnId)});
}
/* подзадача становится обычной задачей в конце той же колонки */
function detachCard(id){
  var c=card(id); if(!c) return;
  patchCard(id,{parentId:"",order:endOf(c.columnId)});
}
function setExpanded(id,on){
  if(on) S.expanded[id]=true; else delete S.expanded[id];
  try{localStorage.setItem("grid.expanded",JSON.stringify(Object.keys(S.expanded)));}catch(e){}
}
function addColumn(){
  var list=cols(),last=list.length?list[list.length-1].order:null,id=uid("c"),p=project();
  var body={projectId:S.project,title:"Новая колонка",order:orderBetween(last,null),hue:"",
    doneMove:!p||p.doneMoveDefault!==false,doneTarget:"",deletedAt:0};
  S.columns.push(Object.assign({id:id},body));
  w(S.store.set("columns",id,body));
  S.renaming=id; renderMain();
  requestAnimationFrame(function(){var b=$("#board");if(b)b.scrollLeft=b.scrollWidth;});
}
function patchColumn(id,patch){
  var col=column(id); if(col) Object.assign(col,patch);
  w(S.store.update("columns",id,patch));
  renderMain();
}
/* колонка уходит в корзину целиком, с задачами и архивом; это может только владелец */
function removeColumn(id){
  var col=column(id); if(!col) return;
  patchColumn(id,{deletedAt:Date.now()});
  flash("Колонка «"+col.title+"» в корзине вместе с задачами",function(){patchColumn(id,{deletedAt:0});});
}
/* разовые действия из меню колонки */
function archiveColumn(colId,onlyDone){
  var list=cardsIn(colId).filter(function(c){return !onlyDone||c.done;});
  if(!list.length){flash(onlyDone?"В колонке нет выполненных задач":"В колонке нет задач");return;}
  list.forEach(function(c){setArchived(c.id,true);});
  flash("В архив убрано задач: "+list.length+". Вернуть их можно во вкладке «Архив».");
}
/* колонка уезжает в конец другого проекта вместе со всеми задачами, архивом и файлами */
function moveColumn(colId,pid){
  var col=column(colId),p=project(pid); if(!col||!p) return;
  var list=S.cards.filter(function(c){return c.columnId===colId;});
  list.forEach(function(c){
    var p=Object.assign(carryOver(c,pid),{projectId:pid});
    Object.assign(c,p); w(S.store.update("cards",c.id,p));
  });
  moveFiles(list.map(function(c){return c.id;}),pid);
  var tail=colsOf(pid);
  patchColumn(colId,{projectId:pid,order:orderBetween(tail.length?tail[tail.length-1].order:null,null)});
  flash("Колонка «"+col.title+"» перенесена в проект «"+p.name+"»");
}
/* Копия встаёт справа от колонки, с задачами и подзадачами (без архива,
   комментариев и файлов). Записи идут по очереди: база не примет задачу
   раньше её колонки и подзадачу раньше задачи. */
function duplicateColumn(colId){
  var col=column(colId); if(!col) return;
  var list=cols(),next=list[list.indexOf(col)+1],id=uid("c");
  var body={projectId:col.projectId,title:col.title+" (копия)",order:orderBetween(col.order,next?next.order:null),
    hue:col.hue||"",doneMove:col.doneMove!==false,doneTarget:col.doneTarget||"",deletedAt:0};
  S.columns.push(Object.assign({id:id},body));
  var FIELDS=["title","desc","done","start","due","priority","status","kind","assignee","order"];
  function copy(c,parentId){
    var b=newCard({projectId:col.projectId,columnId:id,parentId:parentId}),nid=uid("t");
    FIELDS.forEach(function(f){b[f]=c[f];});
    S.cards.push(Object.assign({id:nid},b));
    return {id:nid,body:b,kids:[]};
  }
  var tops=cardsIn(colId).map(function(c){
    var t=copy(c,"");
    t.kids=childrenOf(c.id).map(function(k){return copy(k,t.id);});
    return t;
  });
  w(S.store.set("columns",id,body).then(function(){
    return Promise.all(tops.map(function(t){
      return S.store.set("cards",t.id,t.body).then(function(){
        return Promise.all(t.kids.map(function(k){return S.store.set("cards",k.id,k.body);}));
      });
    }));
  }));
  if(needsNormalize(col.order,next?next.order:null)) normalize(cols(),"columns");
  renderMain();
  flash("Колонка скопирована"+(tops.length?", задач: "+tops.length+". Комментарии и файлы не копируются.":""));
}
var SORTS=[
  {id:"due",label:"Дедлайну",icon:"calendar",up:"Сначала ближайшие",down:"Сначала дальние",
    val:function(c){return c.due||null;}},
  {id:"assignee",label:"Ответственному",icon:"users",up:"От А до Я",down:"От Я до А",
    val:function(c){var p=person(c.assignee);return p?nameOf(p).toLowerCase():null;}},
  {id:"created",label:"Дате создания",icon:"clock",up:"Сначала старые",down:"Сначала новые",
    val:function(c){return c.createdAt||null;}},
  {id:"done",label:"Выполненности",icon:"check",up:"Сначала невыполненные",down:"Сначала выполненные",
    val:function(c){return c.done?1:0;}},
  {id:"title",label:"Названию",icon:"text",up:"От А до Я",down:"От Я до А",
    val:function(c){return (c.title||"").toLowerCase();}},
  {id:"priority",label:"Приоритету",icon:"bars",up:"От низкого к срочному",down:"От срочного к низкому",
    val:function(c){return PRIOS.map(function(p){return p.id;}).indexOf(c.priority||"med");}},
  {id:"kind",label:"Типу задачи",icon:"tag",up:"От А до Я",down:"От Я до А",
    val:function(c){var k=kindInfo("task",c.kind);return k?k.label.toLowerCase():null;}},
  {id:"status",label:"Статусу",icon:"flag",up:"В порядке списка статусов",down:"В обратном порядке",
    val:function(c){var i=statusList(c.projectId).map(function(s){return s.id;}).indexOf(c.status);return i<0?null:i;}}
];
/* Сортировка разовая: она просто переставляет карточки, и дальше их
   можно двигать руками. Задачи без значения всегда в конце, закреплённые —
   всегда вверху. */
function sortColumn(colId,key,desc){
  var s=find(SORTS,key); if(!s) return;
  var sorted=cardsIn(colId).sort(function(a,b){
    if(!!a.pinned!==!!b.pinned) return a.pinned?-1:1;
    var x=s.val(a),y=s.val(b);
    if(x===y) return 0; if(x==null) return 1; if(y==null) return -1;
    var r=typeof x==="string"?x.localeCompare(y,"ru"):x-y;
    return desc?-r:r;
  });
  sorted.forEach(function(c,i){
    var o=(i+1)*1000;
    if(c.order!==o){c.order=o;w(S.store.update("cards",c.id,{order:o}));}
  });
  renderMain();
}
/* Строка проекта. Создатель — владелец: в базе его назначает триггер, в демо
   пишем сами. Всё остальное пишется после проекта: раньше база не примет. */
function insertProject(id,body){
  var mid=uid("pm"),owner={projectId:id,userId:S.me,email:S.email||(me()||{}).email||"",role:"owner",createdAt:Date.now()};
  S.projects.push(Object.assign({id:id},body));
  S.project_members.push(Object.assign({id:mid},owner));
  return S.store.set("projects",id,body).then(function(){
    if(S.store.kind==="local") return S.store.set("project_members",mid,owner);
  });
}
function projectsEnd(){var list=S.projects.slice().sort(byOrder);return orderBetween(list.length?list[list.length-1].order:null,null);}
function addProject(name){
  name=(name||"").trim(); if(!name) return null;
  var id=uid("p"),body={name:name,descr:"",order:projectsEnd(),doneMoveDefault:true,deletedAt:0};
  var rows=statusRows(id,function(){return uid("st");}).map(function(s){S.statuses.push(s);return ["statuses",s];})
    .concat(["Бэклог","В работе","Готово"].map(function(t,i){
      var cb={id:uid("c"),projectId:id,title:t,order:(i+1)*1000,hue:i===2?"green":"",doneMove:true,doneTarget:"",deletedAt:0};
      S.columns.push(cb);
      return ["columns",cb];
    }));
  w(insertProject(id,body).then(function(){
    return Promise.all(rows.map(function(r){
      var b=Object.assign({},r[1]); delete b.id;
      return S.store.set(r[0],r[1].id,b);
    }));
  }));
  return id;
}
function patchProject(id,patch){
  var p=project(id); if(p) Object.assign(p,patch);
  w(S.store.update("projects",id,patch));
}
function removeProject(id){
  var p=project(id); if(!p) return;
  patchProject(id,{deletedAt:Date.now()});
  if(S.project===id) switchProject(null); else renderAll();
  flash("Проект «"+p.name+"» в корзине",function(){patchProject(id,{deletedAt:0});switchProject(id);});
}
function switchProject(id){
  S.project=id||null;
  try{if(id)localStorage.setItem("grid.project",id);}catch(e){}
  S.open=null; closeDrawer(); closeSheet();
  renderAll();
}
/* Участники проекта. Приглашение — строка с почтой: доступ откроется, когда
   человек войдёт в Grid через Google с этой почтой (если он уже входил —
   сразу; это делает база). */
function invite(email,role){
  email=String(email||"").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){flash("Проверьте адрес почты");return false;}
  if(membersOf().some(function(m){return m.email===email;})){flash("Этот человек уже в проекте");return false;}
  var known=S.profiles.filter(function(p){return String(p.email).toLowerCase()===email;})[0];
  var id=uid("pm"),body={projectId:S.project,userId:known?known.id:"",email:email,role:role,createdAt:Date.now()};
  S.project_members.push(Object.assign({id:id},body));
  w(S.store.set("project_members",id,body));
  renderAll();
  return true;
}
function lastOwner(m){return m.role==="owner"&&!membersOf(m.projectId).some(function(x){return x.id!==m.id&&x.role==="owner";});}
function setRole(mid,role){
  var m=find(S.project_members,mid); if(!m) return;
  if(role!=="owner"&&lastOwner(m)) flash("У проекта должен остаться владелец — сначала назначьте другого");
  else{m.role=role; w(S.store.update("project_members",mid,{role:role}));}
  renderAll(); renderSettings(true);
}
/* задачи убранного участника в этом проекте остаются без ответственного */
function removeMember(mid){
  var m=find(S.project_members,mid); if(!m) return;
  if(lastOwner(m)){flash("У проекта должен остаться владелец — сначала назначьте другого");return;}
  var who=nameOf(person(m.userId))||m.email;
  if(!confirm("Убрать "+who+" из проекта «"+projName()+"»?")) return;
  if(m.userId) S.cards.forEach(function(c){
    if(c.projectId===m.projectId&&c.assignee===m.userId){c.assignee="";w(S.store.update("cards",c.id,{assignee:""}));}});
  S.project_members=S.project_members.filter(function(x){return x.id!==mid;});
  w(S.store.del("project_members",mid));
  renderAll();
}
function addComment(cardId,text){
  text=(text||"").trim(); if(!text) return;
  var id=uid("k");
  var body=COLLAB?{cardId:cardId,authorId:S.me,author:nameOf(me()),body:text,createdAt:Date.now()}
    :{cardId:cardId,authorId:"",author:"",body:text,createdAt:Date.now()};
  S.comments.push(Object.assign({id:id},body));
  w(S.store.set("comments",id,body));
  renderDrawer(true);
  /* доводим до конца списка, чтобы новый комментарий был виден,
     и возвращаем курсор в поле ввода */
  var b=$(".d-body",drawerEl);
  if(b) b.scrollTop=b.scrollHeight;
  var box=$("[data-kadd]",drawerEl);
  if(box) box.focus();
  renderMain();
}

/* типы задач и заметок */
function saveKind(scope,id,draft){
  if(id){
    var k=find(S.kinds,id); if(k) Object.assign(k,draft);
    w(S.store.update("kinds",id,draft));
  }else{
    var own=kindsFor(scope).filter(function(x){return x.projectId;});
    id=uid("k");
    var body=Object.assign({projectId:S.project,scope:scope,
      order:orderBetween(own.length?own[own.length-1].order:null,null)},draft);
    S.kinds.push(Object.assign({id:id},body));
    w(S.store.set("kinds",id,body));
  }
  renderAll();
  return id;
}
function kindUsers(k){return S[k.scope==="note"?"notes":"cards"].filter(function(x){return x.kind===k.id;});}
function removeKind(id){
  var k=find(S.kinds,id); if(!k) return false;
  var users=kindUsers(k),coll=k.scope==="note"?"notes":"cards";
  if(!confirm("Удалить тип «"+k.label+"»?"+(users.length?" Он снимется с "+users.length+
    (k.scope==="note"?" заметок.":" задач."):""))) return false;
  users.forEach(function(x){x.kind="";w(S.store.update(coll,x.id,{kind:""}));});
  S.kinds=S.kinds.filter(function(x){return x.id!==id;});
  w(S.store.del("kinds",id));
  renderAll();
  return true;
}

/* статусы */
function addStatus(label){
  label=(label||"").trim(); if(!label) return;
  var list=statusList(),id=uid("st");
  var body={projectId:S.project,label:label,color:TINTS[list.length%TINTS.length].id,isDone:false,
    order:orderBetween(list.length?list[list.length-1].order:null,null)};
  S.statuses.push(Object.assign({id:id},body));
  w(S.store.set("statuses",id,body));
  renderAll();
}
function patchStatus(id,patch){
  var s=statusOf(id); if(s) Object.assign(s,patch);
  w(S.store.update("statuses",id,patch));
  renderMain(); if(S.open) renderDrawer(true);
}
function removeStatus(id,to){
  S.cards.forEach(function(c){
    if(c.status===id){c.status=to||"";w(S.store.update("cards",c.id,{status:to||""}));}});
  S.statuses=S.statuses.filter(function(s){return s.id!==id;});
  w(S.store.del("statuses",id));
  renderMain(); if(S.open) renderDrawer(true);
}

/* заметки проекта: новая встаёт первой */
function addNote(){
  var list=projNotes(),id=uid("n"),now=Date.now();
  var body={projectId:S.project,title:"Новая заметка",body:"",color:"",kind:"memo",
    order:orderBetween(null,list.length?list[0].order:null),createdAt:now,updatedAt:now};
  S.notes.push(Object.assign({id:id},body));
  w(S.store.set("notes",id,body));
  renderMain();
  openNote(id,true);
}
function patchNote(id,patch,quiet){
  var n=find(S.notes,id); if(n) Object.assign(n,patch,{updatedAt:Date.now()});
  w(S.store.update("notes",id,patch));
  renderMain(); if(!quiet&&S.openNote===id) renderDrawer(true);
}
function removeNote(id){
  var n=find(S.notes,id); if(!n) return;
  var fs=filesOfNote(id);
  if(!confirm("Удалить заметку «"+n.title+"»"+(fs.length?" вместе с файлами ("+fs.length+")":"")+"?")) return;
  removeObjects(fs);                   /* строки файлов удалит база вместе с заметкой */
  S.notes=S.notes.filter(function(x){return x.id!==id;});
  w(S.store.del("notes",id));
  if(S.openNote===id) closeDrawer();
  renderMain();
}

/* ═════════ файлы ═════════ */
/* предел одного файла; тот же предел стоит у хранилища в supabase-schema.sql */
var BUCKET="grid-files",FILE_MAX=10*1024*1024;
/* link — к чему файл: {cardId} задачи, {noteId} заметки или {} — файл проекта */
function pickFile(link){
  filePick.value=""; filePick.accept="";
  filePick.onchange=function(){
    var f=filePick.files&&filePick.files[0]; if(f) uploadFile(f,link);
  };
  filePick.click();
}
/* Фото перед загрузкой уменьшаются до 2560 px по длинной стороне и
   пересохраняются в JPEG. Если сжатие не помогло, остаётся оригинал. */
var PHOTO=/^image\/(jpeg|heic|heif|webp)$/i,PHOTO_SIDE=2560;
function shrinkPhoto(f){
  var photo=PHOTO.test(f.type)||f.type==="image/png"&&f.size>2*1024*1024;
  if(!photo) return Promise.resolve(f);
  return new Promise(function(res){
    var url=URL.createObjectURL(f),img=new Image();
    img.onload=function(){
      var k=Math.min(1,PHOTO_SIDE/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");
      c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
      var g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height);
      g.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      c.toBlob(function(b){
        res(b&&b.size<f.size?new File([b],f.name.replace(/\.(jpe?g|heic|heif|webp|png)$/i,"")+".jpg",{type:"image/jpeg"}):f);
      },"image/jpeg",0.82);
    };
    img.onerror=function(){URL.revokeObjectURL(url);res(f);};   /* браузер не умеет этот формат — грузим как есть */
    img.src=url;
  });
}
function uploadFile(raw,link){
  shrinkPhoto(raw).then(function(f){
    if(f.size>FILE_MAX){
      flash("«"+raw.name+"» — "+fmtSize(f.size)+(f!==raw?" даже после сжатия":"")+". Можно прикрепить файл до "+fmtSize(FILE_MAX)+".");
      return;
    }
    if(f!==raw) flash("Фото сжато: "+fmtSize(raw.size)+" → "+fmtSize(f.size));
    storeFile(f,link);
  });
}
function storeFile(f,link){
  var id=uid("f");
  var meta={projectId:S.project,cardId:link.cardId||"",noteId:link.noteId||"",name:f.name,size:f.size,
    mime:f.type||"application/octet-stream",path:"",createdAt:Date.now()};
  if(S.store.kind==="supabase"){
    var path=S.project+"/"+id+"-"+f.name.replace(/[^\w.\-]+/g,"_");
    flash("Загружаем «"+f.name+"»…");
    S.store.sb.storage.from(BUCKET).upload(path,f,{contentType:meta.mime}).then(function(res){
      if(res.error){flash("Файл не загрузился: "+res.error.message);return;}
      meta.path=path;
      S.files.push(Object.assign({id:id},meta));
      w(S.store.set("files",id,meta));
      flash("Файл «"+f.name+"» прикреплён");
      renderDrawer(true); renderMain();
    });
  }else{
    /* на устройстве файл хранится как есть, вместе с записью */
    meta.blob=f;
    S.files.push(Object.assign({id:id},meta));
    w(S.store.set("files",id,meta));
    renderDrawer(true); renderMain();
  }
}
function openFile(f){
  if(S.store.kind==="supabase"&&f.path){
    S.store.sb.storage.from(BUCKET).createSignedUrl(f.path,120).then(function(res){
      if(res.error||!res.data){flash("Не удалось открыть файл: "+((res.error||{}).message||""));return;}
      window.open(res.data.signedUrl,"_blank","noopener");
    });
  }else if(f.blob) saveBlob(f.blob,f.name);
  else flash("Файл недоступен.");
}
/* Адрес картинки для показа: на устройстве — ссылка на сам файл, в базе —
   подписанная ссылка на час (бакет закрытый); ссылки держим, чтобы не просить заново. */
var signedURLs={},blobURLs={};
function imageURL(f){
  if(f.blob) return Promise.resolve(blobURLs[f.id]||(blobURLs[f.id]=URL.createObjectURL(f.blob)));
  var s=signedURLs[f.path];
  if(s&&s.until>Date.now()) return Promise.resolve(s.url);
  return S.store.sb.storage.from(BUCKET).createSignedUrl(f.path,3600).then(function(r){
    if(r.error||!r.data) throw r.error||new Error("нет ссылки");
    signedURLs[f.path]={url:r.data.signedUrl,until:Date.now()+3500*1000};
    return r.data.signedUrl;
  });
}
function fillThumbs(root){
  $$("[data-fimg]",root).forEach(function(img){
    var f=find(S.files,img.dataset.fimg); if(!f) return;
    imageURL(f).then(function(u){img.src=u;},function(){img.alt="Не удалось загрузить";});
  });
}
/* картинка на весь экран: закрыть — крестик, нажатие мимо или Escape */
var lightboxEl=null;
function closeLightbox(){if(lightboxEl){lightboxEl.remove();lightboxEl=null;}}
function showImage(f){
  closeLightbox();
  lightboxEl=document.createElement("div");
  lightboxEl.className="lightbox"; lightboxEl.setAttribute("role","dialog"); lightboxEl.setAttribute("aria-modal","true");
  lightboxEl.setAttribute("aria-label",f.name);
  lightboxEl.innerHTML='<div class="lb-bar"><span>'+esc(f.name)+"</span>"+
    '<button class="icon-btn" data-lbdl="1" aria-label="Скачать" title="Скачать">'+ic("download")+"</button>"+
    '<button class="icon-btn" data-lbx="1" aria-label="Закрыть" title="Закрыть">'+X_BTN+"</button></div>"+
    '<img alt="'+esc(f.name)+'">';
  document.body.appendChild(lightboxEl);
  var box=lightboxEl;
  imageURL(f).then(function(u){$("img",box).src=u;},function(){flash("Не удалось открыть картинку");closeLightbox();});
  box.addEventListener("click",function(e){
    if(e.target.closest("[data-lbdl]")){openFile(f);return;}
    if(e.target.closest("[data-lbx]")||e.target===box) closeLightbox();
  });
  $("[data-lbx]",box).focus();
}
function removeObjects(files){
  var paths=files.map(function(f){return f.path;}).filter(Boolean);
  if(S.store.kind==="supabase"&&paths.length) S.store.sb.storage.from(BUCKET).remove(paths).then(function(){},function(){});
}
function dropFile(f){
  if(!confirm("Удалить файл «"+f.name+"»?")) return;
  removeObjects([f]);
  S.files=S.files.filter(function(x){return x.id!==f.id;});
  w(S.store.del("files",f.id));
  renderDrawer(true); renderMain();
}

/* ═════════ верхняя рейка ═════════ */
function renderRail(){
  var bt=$("#boardTitle"),own=isOwner();
  bt.textContent=projName(); bt.disabled=!own; bt.title=own?"Переименовать проект":"";
  var all=topCards(),done=all.filter(function(c){return c.done;}).length;
  var pct=all.length?Math.round(done/all.length*100):0;
  $("#tally").innerHTML=all.length
    ? '<span class="bar"><i style="width:'+pct+'%"></i></span><span class="mono">'+done+"/"+all.length+"</span>" : "";
  var m=me();
  $("#btnMe").innerHTML=(m?avatar(m):'<span class="av sm ghost">?</span>')+"<span>"+esc(nameOf(m)||"Профиль")+"</span>";
  $("#btnMe").title="Мой профиль";

  var sel=$("#fAssignee"),cur=S.filter.assignee,team=people(S.project);
  var opts='<option value="all">Все участники</option><option value="none">Без ответственного</option>';
  team.forEach(function(p){opts+='<option value="'+esc(p.id)+'">'+esc(nameOf(p))+"</option>";});
  if(sel.innerHTML!==opts) sel.innerHTML=opts;
  var ok=(cur==="all"||cur==="none"||team.some(function(p){return p.id===cur;}));
  sel.value=ok?cur:"all"; if(!ok) S.filter.assignee="all";
}
function renderPresence(){
  var box=$("#here"),stack=$("#stack");
  var people=S.peers.filter(function(p){return p.kind==="viewer";});
  if(people.length<2){box.hidden=true;return;}
  box.hidden=false;
  var shown=people.slice(0,5),extra=people.length-shown.length;
  stack.innerHTML=shown.map(function(p){
    var nm=typeof p.presence.who==="string"?p.presence.who:"Гость";
    var col=/^#[0-9a-f]{6}$/i.test(p.presence.tint||"")?p.presence.tint:"#7F8C8D";
    return '<span class="av" style="background:'+esc(col)+'" title="'+esc(nm)+(p.isMe?" (вы)":"")+'">'+
      esc(initials(nm))+"</span>";}).join("")+
    (extra>0?'<span class="av" style="background:var(--ink-3)">+'+extra+"</span>":"");
}
var TABS=[
  {id:"board",label:"Доска",icon:'<path d="M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v13h-3z"></path>'},
  {id:"gantt",label:"Диаграмма Ганта",icon:'<path d="M4 6h9M8 12h11M4 18h7"></path>'},
  {id:"calendar",label:"Календарь",icon:ICONS.calendar},
  {id:"notes",label:"Заметки и файлы",icon:'<path d="M5 4h14v16H5z"></path><path d="M8.5 9h7M8.5 13h7M8.5 17h4"></path>'},
  {id:"archive",label:"Архив",icon:ICONS.archive}
];
function renderTabs(){
  var dated=datedCards().length;
  var counts={board:topCards().length,gantt:dated,calendar:dated,
    notes:projNotes().length+projFiles().length,archive:archivedCards().length};
  tabsEl.innerHTML=TABS.map(function(t){
    var n=counts[t.id];
    return '<button class="tab" role="tab" data-tab="'+t.id+'" aria-selected="'+(S.tab===t.id)+'">'+
      '<svg viewBox="0 0 24 24">'+t.icon+"</svg>"+esc(t.label)+
      (n?'<span class="n">'+n+"</span>":"")+"</button>";
  }).join("");
}

/* ═════════ доска ═════════ */
/* цвет и фото профиля задают сами люди, поэтому в разметку пускаем только
   цвет #rrggbb и картинку data:image */
function safeColor(c){return /^#[0-9a-f]{6}$/i.test(c||"")?c:"#8A99A0";}
var AVATAR_URL=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
function avatar(p,cls){
  var n=nameOf(p);
  if(AVATAR_URL.test(p.avatar||"")) return '<span class="av '+(cls||"sm")+' photo" title="'+esc(n)+'"><img src="'+p.avatar+'" alt=""></span>';
  return '<span class="av '+(cls||"sm")+'" style="background:'+safeColor(p.color)+'" title="'+esc(n)+'">'+esc(initials(n))+"</span>";
}
/* сроки на карточке: диапазон «22 июл – 1 сен», если есть обе даты */
function datesChip(c){
  var due=dueInfo(c.due),s=parseISO(c.start); if(!due&&!s) return "";
  var label=s&&due?wDate(s)+" – "+wDate(parseISO(c.due)):due?due.label:"с "+wDate(s);
  return '<span class="chip due '+(due&&!c.done?due.state:"")+'" title="'+(s&&due?"Сроки":due?"Дедлайн":"Дата начала")+'">'+
    (s&&due?ic("clock"):"")+esc(label)+"</span>";
}
function cardHTML(c,child){
  var pr=c.priority||"med",as=person(c.assignee),ed=canEdit(c.projectId);
  var kids=child?[]:childrenOf(c.id),kdone=kids.filter(function(k){return k.done;}).length;
  var nk=commentsOf(c.id).length,nf=filesOf(c.id).length;
  var k=kindInfo("task",c.kind),st=statusOf(c.status),st0=startStatus(c.projectId);
  var chips='<span class="chip prio'+((pr==="high"||pr==="urgent")?" loud":"")+'">'+
    '<span class="pip"></span>'+esc(labelOf(PRIOS,pr,"Средний"))+"</span>";
  if(k) chips+=kindChip(k);
  if(st&&!(st0&&st.id===st0.id)) chips+='<span class="chip st" style="'+tint(st.color)+'">'+esc(st.label)+"</span>";
  chips+=datesChip(c);
  if(nk) chips+='<span class="chip badge" title="Комментарии">'+ic("chat")+nk+"</span>";
  if(nf) chips+='<span class="chip" title="Файлы"><svg viewBox="0 0 24 24"><path d="M20 11l-8.5 8.5a4.5 4.5 0 0 1-6.4-6.4L13 4.8a3 3 0 0 1 4.2 4.2l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.6-7.6"></path></svg>'+nf+"</span>";
  if(child&&as) chips+=avatar(as);
  var foot="";
  if(kids.length||as&&!child){
    var open=!!S.expanded[c.id];
    foot='<div class="card-foot">'+
      (kids.length?'<span class="subs-bar" title="Подзадачи">'+ic("tree")+
        '<span class="mini-bar"><i style="width:'+Math.round(kdone/kids.length*100)+'%"></i></span>'+
        '<span class="mono">'+kdone+"/"+kids.length+"</span></span>":'<span class="sp"></span>')+
      (as?avatar(as):"")+
      (kids.length?'<button class="expand" data-expand="'+esc(c.id)+'" aria-expanded="'+open+'" aria-label="'+
        (open?"Скрыть подзадачи":"Показать подзадачи")+'">'+ic("chev")+"</button>":"")+
      "</div>";
  }
  /* цвет карточки — светлый оттенок из палитры; полоска приоритета слева остаётся */
  return '<article class="card'+(child?" child":"")+(c.done?" is-done":"")+'" data-card="'+esc(c.id)+'" tabindex="0" '+
    'style="--pc:'+prioVar(pr)+";--pcs:"+prioSoft(pr)+(find(TINTS,c.color)?";--cb:var(--h-"+c.color+")":"")+'">'+
    '<div class="card-top"><button class="check" data-check="'+esc(c.id)+'" role="checkbox" '+
    'aria-checked="'+(c.done?"true":"false")+'" aria-label="Выполнено"'+(ed?"":" disabled")+'>'+
    '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"></path></svg></button>'+
    '<div class="c-title">'+esc(c.title)+"</div>"+
    (c.pinned&&!child?'<span class="c-pin" title="Закреплена вверху колонки" aria-label="Закреплена">'+ic("pushpin")+"</span>":"")+
    (ed?'<button class="kebab" data-cmenu="'+esc(c.id)+'" aria-label="Действия с задачей">'+ic("dots")+"</button>":"")+"</div>"+
    '<div class="chips">'+chips+"</div>"+foot+"</article>";
}
/* задача и под ней — раскрытые подзадачи; перетаскивается вся группа */
function groupHTML(c){
  var kids=S.expanded[c.id]?childrenOf(c.id).filter(passes):[];
  return '<div class="cgroup" data-group="'+esc(c.id)+'">'+cardHTML(c,false)+
    (kids.length?'<div class="subcards">'+kids.map(function(k){return cardHTML(k,true);}).join("")+"</div>":"")+
    "</div>";
}
function trackHTML(col){
  var vis=visibleIn(col.id),total=cardsIn(col.id).length,ed=canEdit(col.projectId);
  var hs=hueStyle(col.hue);
  var head='<div class="track-head'+(/^v-/.test(col.hue)&&hs?" vivid":"")+'" data-colhead="'+esc(col.id)+'"'+
    (hs?' style="'+hs+'"':"")+">"+
    (ed?'<span class="grip"></span>':"")+
    (S.renaming===col.id&&ed
      ? '<input class="track-name-in" data-rename="'+esc(col.id)+'" value="'+esc(col.title)+'">'
      : ed?'<button class="track-name" data-colname="'+esc(col.id)+'" title="Переименовать">'+esc(col.title)+"</button>"
      : '<span class="track-name">'+esc(col.title)+"</span>")+
    '<span class="track-count mono">'+(vis.length===total?total:vis.length+"/"+total)+"</span>"+
    (ed?'<button class="icon-btn" data-colmenu="'+esc(col.id)+'" title="Настроить колонку" aria-label="Настроить колонку">'+
      ic("dots")+"</button>":"")+
    "</div>";
  var body='<div class="track-body" data-body="'+esc(col.id)+'">'+vis.map(groupHTML).join("");
  if(ed&&S.composer===col.id){
    body+='<div class="composer"><textarea data-comp="'+esc(col.id)+'" placeholder="Что нужно сделать?" rows="2">'+
      esc(S.composerText)+"</textarea>"+
      '<div class="row"><button class="btn" data-compadd="'+esc(col.id)+'">Добавить</button>'+
      '<button class="btn ghost" data-compcancel="1">Отмена</button><span class="hint">Enter</span></div></div>';
  }else if(ed){
    body+='<button class="add-card" data-addcard="'+esc(col.id)+'">'+
      '<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M12 5v14M5 12h14"></path></svg>Задача</button>';
  }
  body+="</div>";
  return '<section class="track" data-col="'+esc(col.id)+'">'+head+body+"</section>";
}
function renderBoard(){
  var list=cols(),ed=canEdit();
  if(!list.length){
    mainEl.innerHTML='<div class="empty"><h2>Пустой проект</h2>'+(ed
      ? "<p>Колонки — это этапы вашего процесса. Их может быть сколько угодно: создайте первую и перетаскивайте задачи между ними.</p>"+
        '<button class="btn" data-addcol="1">Создать колонку</button>'
      : "<p>Колонок пока нет. Их добавят владелец или редакторы проекта.</p>")+"</div>";
    return;
  }
  /* доска перерисовывается целиком, поэтому прокрутку доски и колонок
     сохраняем сами — иначе после любой правки экран прыгает к первой колонке */
  var old=$("#board"),keep=old&&old.dataset.project===S.project?{left:old.scrollLeft,top:{}}:null;
  if(keep) $$("[data-body]",old).forEach(function(b){keep.top[b.dataset.body]=b.scrollTop;});
  mainEl.innerHTML='<div class="board" id="board" data-project="'+esc(S.project)+'">'+list.map(trackHTML).join("")+
    (ed?'<button class="add-track" data-addcol="1">'+
    '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M12 5v14M5 12h14"></path></svg>Колонка</button>':"")+"</div>";
  if(!keep) return;
  var board=$("#board");
  board.scrollLeft=keep.left;
  $$("[data-body]",board).forEach(function(b){if(keep.top[b.dataset.body]) b.scrollTop=keep.top[b.dataset.body];});
}

/* ═════════ диаграмма Ганта ═════════ */
function datedCards(){
  return projCards().filter(function(c){return c.due||c.start;}).filter(passes);
}
function renderGantt(){
  var list=datedCards();
  if(!list.length){
    mainEl.innerHTML='<div class="empty"><h2>Нечего показать на шкале</h2>'+
      "<p>Диаграмма строится по датам. Поставьте задаче дедлайн — и она появится здесь; добавьте дату начала, чтобы получилась полоса, а не точка.</p></div>";
    return;
  }
  var rows=list.map(function(c){
    var a=parseISO(c.start)||parseISO(c.due),b=parseISO(c.due)||parseISO(c.start);
    if(a>b){var t=a;a=b;b=t;}
    return {c:c,s:a,e:b};
  }).sort(function(x,y){return x.s-y.s||x.e-y.e;});
  var min=rows[0].s,max=rows[0].e;
  rows.forEach(function(r){if(r.s<min)min=r.s;if(r.e>max)max=r.e;});
  var today=parseISO(todayISO()),ws=prefs().weekStart;
  if(today<min) min=today;
  if(today>max) max=today;
  min=new Date(min.getTime()-2*864e5); max=new Date(max.getTime()+2*864e5);
  var n=clamp(daysBetween(min,max)+1,1,180),days=[];
  for(var i=0;i<n;i++) days.push(new Date(min.getTime()+i*864e5));
  var tpl="grid-template-columns:230px repeat("+n+",34px)";

  var months="",mi=0;
  while(mi<days.length){
    var m=days[mi].getMonth(),span=0;
    while(mi+span<days.length&&days[mi+span].getMonth()===m) span++;
    months+='<div class="g-mon" style="grid-column:span '+span+'">'+
      MONTHS_FULL[m]+(days[mi].getFullYear()!==new Date().getFullYear()?" "+days[mi].getFullYear():"")+"</div>";
    mi+=span;
  }
  var head='<div class="g-head">'+
    '<div class="g-row head" style="'+tpl+'"><div class="g-name">Задача</div>'+months+"</div>"+
    '<div class="g-row head" style="'+tpl+'"><div class="g-name"></div>'+
    days.map(function(d,i){
      var we=(d.getDay()===0||d.getDay()===6),td=(+d===+today);
      return '<div class="g-day'+(we?" we":"")+(td?" today":"")+(d.getDay()===ws?" wk":"")+'" style="grid-column:'+(i+2)+'">'+
        d.getDate()+"<br>"+WEEK[d.getDay()]+"</div>";
    }).join("")+"</div></div>";

  var body=rows.map(function(r){
    var c=r.c,pr=c.priority||"med";
    var from=clamp(daysBetween(min,r.s),0,n-1),to=clamp(daysBetween(min,r.e),0,n-1);
    var span=Math.max(1,to-from+1);
    /* колонка задаётся явно: иначе ячейки авто-раскладкой обходят полосу
       задачи, которая уже заняла свои колонки, и весь ряд уезжает вправо */
    var cells=days.map(function(d,i){
      var we=(d.getDay()===0||d.getDay()===6),td=(+d===+today);
      return '<div class="g-cell'+(we?" we":"")+(td?" today":"")+(d.getDay()===ws?" wk":"")+'" style="grid-column:'+(i+2)+'"></div>';
    }).join("");
    return '<div class="g-row" style="'+tpl+";--pc:"+prioVar(pr)+'" data-card="'+esc(c.id)+'">'+
      '<div class="g-name'+(c.done?" done":"")+'"><span class="dot"></span>'+(c.parentId?"↳ ":"")+esc(c.title)+"</div>"+cells+
      '<div class="g-bar'+(c.done?" done":"")+'" style="grid-column:'+(from+2)+" / span "+span+'">'+
      esc(c.title)+"</div></div>";
  }).join("");
  mainEl.innerHTML='<div class="pane wide"><div class="gantt">'+head+body+"</div></div>";
}

/* Свайп для листания календаря на телефоне — в Grid Work и Grid Life.
   Ловим только явно горизонтальное движение (в полтора раза больше
   вертикального) от 50 px и не у краёв экрана: там жест «назад» Safari.
   Пока палец едет, календарь едет вместе с ним. target() — что двигать
   (null — свайп здесь не работает), step(n) — перелистнуть: 1 вперёд,
   -1 назад. Возвращает функцию «был ли только что свайп», чтобы конец
   свайпа не приняли за нажатие на день. */
var SWIPE_MIN=50,SWIPE_EDGE=20,SWIPE_MS=160,phoneMQ=window.matchMedia("(max-width:640px)");
/* На компьютере стрелки и название периода — одна группа «‹ Октябрь 2026 ›».
   Ширина названия — по самому длинному варианту этого вида (titles() —
   все варианты), текст по центру: стрелки не прыгают при смене периода.
   Пока шрифт не загрузился, ширину не запоминаем. На телефоне не трогаем. */
var navW={};
function fitNavTitle(h,key,titles){
  if(!h) return;
  if(phoneMQ.matches||!key){h.style.minWidth="";return;}
  var w=navW[key];
  if(!w){
    var cs=getComputedStyle(h),ctx=document.createElement("canvas").getContext("2d");
    ctx.font=cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;
    w=Math.ceil(titles().reduce(function(m,s){return Math.max(m,ctx.measureText(s).width);},0))+2;
    if(!document.fonts||document.fonts.status==="loaded") navW[key]=w;
  }
  h.style.minWidth=w+"px";
}
/* даты на год вперёд (и вчера) — по ним собираются все варианты названия */
function navDates(){var out=[],d=parseISO(todayISO());d.setDate(d.getDate()-1);for(var i=0;i<369;i++){out.push(iso(d));d.setDate(d.getDate()+1);}return out;}
function attachSwipe(box,target,step){
  var s=null,at=0;
  function reset(el){el.style.transition="transform "+SWIPE_MS+"ms ease-out";el.style.transform="";}
  box.addEventListener("touchstart",function(e){
    s=null;
    if(!phoneMQ.matches||e.touches.length!==1) return;
    var t=e.touches[0],el=target();
    if(!el||!el.contains(e.target)||t.clientX<SWIPE_EDGE||t.clientX>window.innerWidth-SWIPE_EDGE) return;
    s={x:t.clientX,y:t.clientY,dx:0,el:el,on:false};
  },{passive:true});
  box.addEventListener("touchmove",function(e){
    if(!s) return;
    var t=e.touches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;
    if(!s.on){
      if(Math.abs(dx)<10&&Math.abs(dy)<10) return;
      if(Math.abs(dx)<Math.abs(dy)*1.5){s=null;return;}   /* вертикально — обычная прокрутка */
      s.on=true; s.el.style.transition="none";
    }
    e.preventDefault();
    s.dx=dx; s.el.style.transform="translateX("+dx+"px)";
  },{passive:false});
  box.addEventListener("touchend",function(){
    var m=s; s=null;
    if(!m||!m.on) return;
    at=Date.now();
    if(Math.abs(m.dx)<SWIPE_MIN){reset(m.el);return;}       /* короткий — на место */
    /* старое уходит в сторону свайпа, новое въезжает с другой */
    var w=m.el.offsetWidth,n=m.dx<0?1:-1;
    m.el.style.transition="transform "+SWIPE_MS+"ms ease-out";
    m.el.style.transform="translateX("+(-n*w)+"px)";
    setTimeout(function(){
      step(n);
      var el=target(); if(!el) return;
      el.style.transition="none"; el.style.transform="translateX("+(n*w)+"px)";
      void el.offsetWidth;
      reset(el);
    },SWIPE_MS);
  });
  box.addEventListener("touchcancel",function(){if(s&&s.on) reset(s.el);s=null;});
  return function(){return Date.now()-at<400;};
}

/* ═════════ календарь ═════════ */
/* Как в Grid Life: Месяц, Неделя, День, Список; листание стрелками и
   свайпом на телефоне. Задача с началом и дедлайном — полоса через все дни
   диапазона, как многодневное событие. Фильтры доски действуют и здесь. */
var CAL_VIEWS=[{id:"month",label:"Месяц"},{id:"week",label:"Неделя"},{id:"day",label:"День"},{id:"list",label:"Список"}];
var CAL_LANES=3;                         /* полос в неделе месяца; остальное — «ещё N» */
S.cal={view:"month",cursor:todayISO(),selected:todayISO()};
try{var calView0=localStorage.getItem("grid.work.calview");if(find(CAL_VIEWS,calView0))S.cal.view=calView0;}catch(e){}
function addDay(s,n){var d=parseISO(s);d.setDate(d.getDate()+n);return iso(d);}
function addMonth(s,n){var d=parseISO(s);d.setDate(1);d.setMonth(d.getMonth()+n);return iso(d);}
function weekOf(s){var d=parseISO(s);d.setDate(d.getDate()-(d.getDay()-prefs().weekStart+7)%7);return iso(d);}
function dayName(s){var d=parseISO(s);return WEEK[d.getDay()]+", "+d.getDate()+" "+MONTHS[d.getMonth()];}
function dayTitle(s){var t=todayISO();return (s===t?"Сегодня, ":s===addDay(t,1)?"Завтра, ":"")+dayName(s);}
/* задачи с датами под фильтры доски; a…b — с даты начала по дедлайн */
function calTasks(){
  return projCards().filter(passes).filter(function(c){return c.due||c.start;}).map(function(c){
    var a=c.start||c.due,b=c.due||c.start;
    return a>b?{c:c,a:b,b:a}:{c:c,a:a,b:b};
  });
}
function covering(list,d){return list.filter(function(x){return x.a<=d&&x.b>=d;});}
/* цвет события — цвет типа задачи, без цвета — нейтральный серый */
function evTint(c){var k=kindInfo("task",c.kind);return tint(k&&k.color?k.color:"gray");}
function calTitle(v,c){
  v=v||S.cal.view; c=c||S.cal.cursor;
  var d=parseISO(c);
  if(v==="list") return "Все задачи с датами";
  if(v==="day") return dayTitle(c);
  if(v==="week"){var s=weekOf(c);return shortDate(parseISO(s))+" – "+shortDate(parseISO(addDay(s,6)));}
  return MONTHS_FULL[d.getMonth()].charAt(0).toUpperCase()+MONTHS_FULL[d.getMonth()].slice(1)+" "+d.getFullYear();
}
function calBarHTML(){
  var v=S.cal.view,nav=v!=="list";
  return '<div class="lt wc-bar"><div class="lt-views" role="tablist" aria-label="Вид календаря">'+CAL_VIEWS.map(function(x){
      return '<button role="tab" data-wcview="'+x.id+'" aria-selected="'+(v===x.id)+'">'+x.label+"</button>";}).join("")+
    '</div><div class="lt-nav">'+
      (nav?'<button class="icon-btn" data-wcnav="-1" aria-label="Назад">'+ic("chevL")+"</button>":"")+
      '<h2 class="lt-title" aria-live="polite">'+esc(calTitle())+"</h2>"+
      (nav?'<button class="icon-btn" data-wcnav="1" aria-label="Вперёд">'+ic("chevR")+"</button>":"")+
      '<button class="btn ghost lt-today" data-wctoday="1">Сегодня</button></div></div>';
}
/* полосы недели: обрезаем по неделе и раскладываем по дорожкам без наложений */
function lanes(list,ws){
  var we=addDay(ws,6),ends=[],w0=parseISO(ws);
  return list.filter(function(x){return x.a<=we&&x.b>=ws;}).sort(function(p,q){
    return p.a<q.a?-1:p.a>q.a?1:p.b>q.b?-1:p.b<q.b?1:0;
  }).map(function(x){
    var s=x.a<ws?ws:x.a,e=x.b>we?we:x.b,lane=0;
    while(ends[lane]&&ends[lane]>=s) lane++;
    ends[lane]=e;
    return {x:x,lane:lane,from:daysBetween(w0,parseISO(s)),span:daysBetween(parseISO(s),parseISO(e))+1,cl:x.a<ws,cr:x.b>we};
  });
}
function barHTML(e,row,cls){
  var c=e.x.c;
  return '<button class="'+cls+(c.done?" done":"")+(e.cl?" cl":"")+(e.cr?" cr":"")+'" data-card="'+esc(c.id)+'" '+
    'style="grid-column:'+(e.from+1)+" / span "+e.span+";grid-row:"+row+";"+evTint(c)+'" title="'+esc(c.title)+'">'+
    (c.parentId?"↳ ":"")+esc(c.title)+"</button>";
}
function itemHTML(x){
  var c=x.c,col=column(c.columnId),as=person(c.assignee),k=kindInfo("task",c.kind);
  return '<div class="cal-item'+(c.done?" done":"")+'" data-card="'+esc(c.id)+'" style="--pc:'+prioVar(c.priority||"med")+'">'+
    '<span class="dot"></span><span class="t">'+(c.parentId?"↳ ":"")+esc(c.title)+"</span>"+
    '<span class="metas">'+(x.a!==x.b?'<span class="meta">'+esc(wDate(parseISO(x.a))+" – "+wDate(parseISO(x.b)))+"</span>":"")+
      (k?'<span class="meta">'+esc(k.label)+"</span>":"")+'<span class="meta">'+esc(col?col.title:"")+"</span></span>"+
    (as?avatar(as):"")+"</div>";
}
function dayList(list,d,hint){
  var day=covering(list,d),ed=canEdit();
  return (day.length?'<div class="cal-list">'+day.map(itemHTML).join("")+"</div>":"")+
    (ed?'<button class="lempty" data-wcnew="'+d+'">'+(day.length?"+ Задача на этот день":hint)+"</button>"
      :day.length?"":'<div class="drop-hint">Задач нет.</div>');
}
function weekdays(){var ws=prefs().weekStart,out=[];for(var i=0;i<7;i++) out.push(WEEK[(ws+i)%7]);return out;}
function monthHTML(list){
  var c=S.cal.cursor,start=weekOf(c.slice(0,8)+"01"),td=todayISO(),sel=S.cal.selected,weeks="";
  for(var w=0;w<6;w++){
    var ws=addDay(start,w*7),ev=lanes(list,ws),cells="",more="";
    for(var i=0;i<7;i++){
      var d=addDay(ws,i),day=covering(list,d);
      var hidden=ev.filter(function(e){return e.lane>=CAL_LANES&&e.from<=i&&e.from+e.span>i;}).length;
      cells+='<button class="wm-day'+(d.slice(0,7)!==c.slice(0,7)?" out":"")+(d===td?" today":"")+(d===sel?" sel":"")+
        '" data-wcday="'+d+'" style="grid-column:'+(i+1)+'" aria-label="'+esc(dayName(d))+(day.length?", задач: "+day.length:"")+'">'+
        '<span class="wm-n">'+parseISO(d).getDate()+'</span><span class="wm-dots" aria-hidden="true">'+
        day.slice(0,3).map(function(x){return '<i style="'+evTint(x.c)+'"></i>';}).join("")+"</span></button>";
      if(hidden) more+='<span class="wm-more" style="grid-column:'+(i+1)+";grid-row:"+(CAL_LANES+2)+'">ещё '+hidden+"</span>";
    }
    weeks+='<div class="wm-week">'+cells+ev.filter(function(e){return e.lane<CAL_LANES;}).map(function(e){
      return barHTML(e,e.lane+2,"wm-bar");}).join("")+more+"</div>";
  }
  return '<div class="wm"><div class="wm-head">'+weekdays().map(function(x){return "<span>"+x+"</span>";}).join("")+
    '</div><div class="wm-grid">'+weeks+'</div></div><section class="wc-day"><h3 class="lday-t'+(sel===td?" today":"")+'">'+
    esc(dayTitle(sel))+"</h3>"+dayList(list,sel,"Задач нет — нажмите, чтобы добавить")+"</section>";
}
function weekHTML(list){
  var ws=weekOf(S.cal.cursor),td=todayISO(),ev=lanes(list,ws),head="",cols="";
  var n=ev.reduce(function(m,e){return Math.max(m,e.lane+1);},0);
  for(var i=0;i<7;i++){
    var d=addDay(ws,i),p=parseISO(d);
    head+='<button class="ww-dh'+(d===td?" today":"")+'" data-wcgoto="'+d+'" aria-label="'+esc(dayName(d))+'">'+WEEK[p.getDay()]+"<b>"+p.getDate()+"</b></button>";
    cols+='<button class="ww-col'+(d===td?" today":"")+'" data-wcday="'+d+'" style="grid-column:'+(i+1)+'" aria-label="Новая задача на '+esc(dayName(d))+'"></button>';
  }
  return '<div class="ww"><div class="ww-head">'+head+'</div><div class="ww-body" style="--lanes:'+n+'">'+cols+
    ev.map(function(e){return barHTML(e,e.lane+1,"ww-bar");}).join("")+"</div></div>";
}
function dayHTML(list){return '<div class="wd">'+dayList(list,S.cal.cursor,"Задач нет — нажмите, чтобы добавить")+"</div>";}
/* список: дни по дедлайну (или по началу), разбитые на недели */
function listHTML(list){
  if(!list.length) return '<div class="empty"><h2>Нет задач с датами</h2>'+
    "<p>Поставьте задаче дедлайн или дату начала — и она появится в календаре.</p></div>";
  var groups={};
  list.forEach(function(x){var k=x.c.due||x.c.start;(groups[k]=groups[k]||[]).push(x);});
  var keys=Object.keys(groups).sort(),today=todayISO(),week="";
  return '<div class="cal">'+keys.map(function(k){
    var d=parseISO(k),td=k===today,ws=weekOf(k);
    var head=ws!==week?'<div class="cal-week">'+esc(wDate(parseISO(ws))+" – "+wDate(parseISO(addDay(ws,6))))+"</div>":"";
    week=ws;
    var late=k<today&&groups[k].some(function(x){return !x.c.done;});
    var when='<div class="cal-when'+(td?" today":late?" late":"")+'">'+'<div class="d">'+d.getDate()+"</div>"+
      '<div class="m"><span class="mf">'+MONTHS_FULL[d.getMonth()]+'</span><span class="ms">'+MONTHS[d.getMonth()]+"</span>, "+WEEK[d.getDay()]+"</div>"+
      (td?'<div class="m" style="color:var(--accent)">сегодня</div>':late?'<div class="m" style="color:var(--danger)">просро&shy;чено</div>':"")+"</div>";
    return head+'<section class="cal-day" data-wcd="'+k+'">'+when+'<div class="cal-list">'+groups[k].sort(function(a,b){
      return (a.c.done?1:0)-(b.c.done?1:0);}).map(itemHTML).join("")+"</div></section>";
  }).join("")+"</div>";
}
function renderCalendar(){
  var list=calTasks(),v=S.cal.view,key=v+"|"+(v==="list"?"":S.cal.cursor),old=$(".wc-scroll",mainEl);
  var same=old&&mainEl.dataset.calkey===key,top=same?old.scrollTop:0;   /* та же страница — прокрутка на месте */
  mainEl.innerHTML='<div class="wc">'+calBarHTML()+'<div class="wc-scroll"><div class="wc-in">'+
    (v==="month"?monthHTML(list):v==="week"?weekHTML(list):v==="day"?dayHTML(list):listHTML(list))+"</div></div></div>";
  mainEl.dataset.calkey=key;
  var p=prefs();
  fitNavTitle($(".wc .lt-title",mainEl),v==="list"?"":"work|"+v+"|"+p.dateFmt+"|"+p.weekStart,function(){
    return navDates().map(function(d){return calTitle(v,d);});});
  if(same) $(".wc-scroll",mainEl).scrollTop=top; else if(v==="list") listToToday();
}
function calStep(n){
  var v=S.cal.view;
  S.cal.cursor=v==="month"?addMonth(S.cal.cursor,n):addDay(S.cal.cursor,v==="week"?7*n:n);
  renderMain();
}
function calSetView(v){
  if(v==="week"||v==="day") S.cal.cursor=S.cal.selected;
  S.cal.view=v; try{localStorage.setItem("grid.work.calview",v);}catch(e){}
  renderMain();
}
/* список открывается на неделе с сегодняшним днём (прошлые задачи — выше), «Сегодня» возвращает к ней */
function listToToday(){
  var s=$(".wc-scroll",mainEl),t=todayISO(); if(!s) return;
  var el=[].filter.call(mainEl.querySelectorAll(".cal-day"),function(x){return x.dataset.wcd>=t;})[0];
  if(!el){s.scrollTop=s.scrollHeight;return;}
  var h=el.previousElementSibling; if(h&&h.classList.contains("cal-week")) el=h;
  s.scrollTop+=el.getBoundingClientRect().top-s.getBoundingClientRect().top-10;
}
/* новая задача с этой датой в первой колонке; название сразу можно печатать */
function quickTask(d){
  var col=cols()[0]; if(!col){flash("Сначала создайте колонку на доске");return;}
  var id=uid("t"),body=newCard({columnId:col.id,order:endOf(col.id),title:"Новая задача",due:d});
  S.cards.push(Object.assign({id:id},body)); w(S.store.set("cards",id,body));
  S.cal.selected=d; renderMain(); openCard(id,true);
}
/* пустой день — новая задача; в месяце день с задачами — выбрать и показать их ниже */
function calDayClick(d){
  var has=covering(calTasks(),d).length;
  if(S.cal.view==="month"&&(has||!canEdit())){S.cal.selected=d;renderMain();return;}
  if(canEdit()) quickTask(d);
}
function calSwipeEl(){var v=S.cal.view;return S.tab!=="calendar"||v==="list"?null:$(v==="month"?".wm-grid":v==="week"?".ww":".wd",mainEl);}
var calSwiped=attachSwipe(mainEl,calSwipeEl,calStep);

/* ═════════ заметки и файлы ═════════ */
/* withCard — подписать, к какой задаче или заметке прикреплён файл */
function fileRow(f,withCard,ed){
  var c=f.cardId?card(f.cardId):null,n=f.noteId?find(S.notes,f.noteId):null;
  return '<div class="file"><span class="ic"><svg viewBox="0 0 24 24">'+
    '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg></span>'+
    '<span class="nm"><b>'+esc(f.name)+"</b><span>"+fmtSize(f.size)+
      (withCard&&c?" · "+esc(c.title):withCard&&n?" · заметка «"+esc(n.title)+"»":"")+"</span></span>"+
    '<button class="icon-btn" data-fopen="'+esc(f.id)+'" title="Скачать" aria-label="Скачать">'+
      '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"></path></svg></button>'+
    (ed?'<button class="x" data-fdel="'+esc(f.id)+'" aria-label="Удалить файл">'+X_BTN+"</button>":"")+"</div>";
}
/* файлы заметки; картинки показываются превью прямо в заметке */
function filesOfNote(id){return S.files.filter(function(f){return f.noteId===id;})
  .sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});}
function isImage(f){return /^image\//.test(f.mime||"");}
var CLIP_SVG='<svg viewBox="0 0 24 24"><path d="M20 11l-8.5 8.5a4.5 4.5 0 0 1-6.4-6.4L13 4.8a3 3 0 0 1 4.2 4.2l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.6-7.6"></path></svg>';
function noteCardHTML(n){
  var k=kindInfo("note",n.kind),tinted=!!find(TINTS,n.color),nf=filesOfNote(n.id).length;
  return '<article class="ncard'+(tinted?" tinted":"")+'" data-note="'+esc(n.id)+'" tabindex="0"'+
    (tinted?' style="--nb:var(--h-'+n.color+')"':"")+'>'+
    '<div class="top">'+(k?kindChip(k):"")+(nf?'<span class="chip" title="Файлы">'+CLIP_SVG+nf+"</span>":"")+
      "<time>"+esc(fmtWhen(n.updatedAt))+"</time></div>"+
    "<h4>"+esc(n.title||"Без названия")+"</h4>"+
    (n.body?"<p>"+esc(n.body)+"</p>":"")+"</article>";
}
function renderNotes(){
  var notes=projNotes(),files=projFiles(),ed=canEdit();
  mainEl.innerHTML='<div class="pane"><div class="notes">'+
    '<section><div class="sect-h"><h3>Заметки проекта</h3><span class="n">'+notes.length+"</span>"+
      '<span class="sp"></span>'+(ed?'<button class="btn" data-nnew="1">+ Заметка</button>':"")+"</div>"+
      (notes.length?'<div class="ncards">'+notes.map(noteCardHTML).join("")+"</div>"
        :'<div class="drop-hint">Заметок пока нет. Договорённости, ссылки, протоколы встреч — всё, что не ложится в задачи.</div>')+
    "</section>"+
    '<section><div class="sect-h"><h3>Файлы проекта</h3><span class="n">'+files.length+"</span>"+
      '<span class="sp"></span>'+(ed?'<button class="btn" data-upload="project">Прикрепить файл</button>':"")+"</div>"+
      (files.length?'<div class="files">'+files.map(function(f){return fileRow(f,true,ed);}).join("")+"</div>"
        :'<div class="drop-hint">Пока ничего не прикреплено. Файлы можно добавлять и внутри задачи.</div>')+
    "</section></div></div>";
}

/* ═════════ архив ═════════ */
function renderArchive(){
  var list=archivedCards();
  if(!list.length){
    mainEl.innerHTML='<div class="empty"><h2>Архив пуст</h2>'+
      "<p>Сюда попадают задачи, убранные с доски через меню «⋮». Отсюда их можно вернуть на место или удалить.</p></div>";
    return;
  }
  var ed=canEdit();
  mainEl.innerHTML='<div class="pane"><div class="notes"><section>'+
    '<div class="sect-h"><h3>Архив</h3><span class="n">'+list.length+"</span></div>"+
    '<div class="arch">'+list.map(function(c){
      var col=column(c.columnId),kids=S.cards.filter(function(x){return x.parentId===c.id&&!x.deletedAt;}).length;
      return '<div class="arow"><button class="t" data-card="'+esc(c.id)+'"><b>'+esc(c.title)+"</b>"+
        "<span>"+esc(col?col.title:"")+(kids?" · подзадач: "+kids:"")+
          (c.archivedAt?" · в архиве с "+esc(fmtWhen(c.archivedAt)):"")+"</span></button>"+
        (ed?'<button class="btn ghost" data-arestore="'+esc(c.id)+'">Вернуть</button>'+
          '<button class="icon-btn" data-adel="'+esc(c.id)+'" title="В корзину" aria-label="В корзину">'+
          ic("trash")+"</button>":"")+"</div>";
    }).join("")+"</div></section></div></div>";
}

/* ═════════ общий рендер ═════════ */
function renderMain(){
  if(S.dragging) return;
  document.documentElement.dataset.density=prefs().density;
  var live=liveProjects(),cur=project();
  /* пока проекты не загрузились, сохранённый выбор не трогаем */
  if(S.projects.length&&(!cur||cur.deletedAt)) S.project=live.length?live[0].id:null;
  presenceFor(S.project);
  renderRail(); renderTabs(); renderNotice();
  if(S.mode==="boot") return;
  if(!live.length){
    mainEl.innerHTML='<div class="empty"><h2>Ни одного проекта</h2>'+
      "<p>Проект — это отдельная доска со своими колонками, задачами и заметками. Создайте первый"+
      (COLLAB?" — или попросите коллегу пригласить вас в свой.":".")+"</p>"+
      '<button class="btn" data-addproj="1">Создать проект</button></div>';
    return;
  }
  if(S.tab==="gantt") renderGantt();
  else if(S.tab==="calendar") renderCalendar();
  else if(S.tab==="notes") renderNotes();
  else if(S.tab==="archive") renderArchive();
  else renderBoard();

  var ren=$("[data-rename]",mainEl); if(ren){ren.focus();ren.select();}
  var comp=$("[data-comp]",mainEl);
  if(comp&&document.activeElement!==comp){comp.focus();comp.setSelectionRange(comp.value.length,comp.value.length);}
}
function renderAll(){renderMain();if(S.open||S.openNote)renderDrawer();renderSide();renderSettings();renderPresence();}

/* ═════════ панель задачи и заметки ═════════ */
var X_BTN='<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
var CHECK_SVG='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>';
function drawerHead(eyebrow){
  return '<div class="d-head"><span class="d-eyebrow">'+esc(eyebrow)+"</span>"+
    '<button class="icon-btn" data-dclose="1" aria-label="Закрыть">'+X_BTN+"</button></div>";
}
/* ряд кнопок типа: стандартные, свои, «+ Свой тип» и правка своих (типы меняет владелец) */
function kindSeg(scope,pid,current){
  var list=kindsFor(scope,pid),own=list.filter(function(k){return k.projectId;}).length;
  var ro=canEdit(pid)?"":" disabled",boss=isOwner(pid);
  return '<div class="seg kinds">'+list.map(function(k){
      return '<button data-kind="'+esc(k.id)+'" aria-pressed="'+(current===k.id)+'"'+
        (k.color?' style="'+tint(k.color)+'"':"")+ro+">"+ic(k.icon)+esc(k.label)+"</button>";}).join("")+
    (boss?'<button class="add" data-kindnew="'+scope+'">'+ic("plus")+"Свой тип</button>":"")+
    (boss&&own?'<button class="add" data-kindlist="'+scope+'" aria-label="Изменить свои типы" title="Изменить свои типы">'+
      ic("pencil")+"</button>":"")+"</div>";
}
function cardDrawerHTML(c){
  var kids=c.parentId?[]:childrenOf(c.id),kdone=kids.filter(function(k){return k.done;}).length;
  var pct=kids.length?Math.round(kdone/kids.length*100):0;
  var col=column(c.columnId),parent=c.parentId?card(c.parentId):null,ks=commentsOf(c.id),fs=filesOf(c.id);
  var p=project(c.projectId),ed=canEdit(c.projectId),ro=ed?"":" disabled";
  var team=people(c.projectId),as=person(c.assignee);
  /* ответственный, которого уже нет в проекте, всё равно виден в списке */
  if(as&&!team.some(function(x){return x.id===as.id;})) team=team.concat([as]);

  var h=drawerHead((p?p.name:"")+" · "+(col?col.title:"—")+(c.archived?" · в архиве":""));

  var body='<div class="d-body"><div class="d-title-row">'+
    '<button class="check" data-dcheck="1" role="checkbox" aria-checked="'+(c.done?"true":"false")+'" '+
    'style="margin-top:8px" aria-label="Выполнено"'+ro+'>'+CHECK_SVG+"</button>"+
    '<textarea class="d-title'+(c.done?" done":"")+'" data-dtitle="1" rows="1" aria-label="Название задачи"'+
      (ed?"":" readonly")+">"+esc(c.title)+"</textarea></div>";
  if(parent) body+='<button class="lnk d-parent" data-dopen="'+esc(parent.id)+'">'+ic("up")+
    "Подзадача задачи «"+esc(parent.title)+"»</button>";

  body+='<div class="fields">'+
    (parent?"":'<span class="lbl">Колонка</span><div class="ctl"><select data-dcol="1" aria-label="Колонка"'+ro+'>'+
      colsOf(c.projectId).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===c.columnId?" selected":"")+">"+esc(x.title)+"</option>";}).join("")+
    "</select></div>")+
    '<span class="lbl">Статус</span><div class="ctl ctl-row"><select data-dstatus="1" aria-label="Статус"'+ro+'>'+
      (statusOf(c.status)?"":'<option value="" selected>Без статуса</option>')+
      statusList(c.projectId).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===c.status?" selected":"")+">"+esc(x.label)+"</option>";}).join("")+
      "</select>"+(isOwner(c.projectId)?'<button class="lnk" data-stlist="1">Настроить</button>':"")+"</div>"+
    '<span class="lbl">Тип задачи</span><div class="ctl">'+kindSeg("task",c.projectId,c.kind)+"</div>"+
    '<span class="lbl">Приоритет</span><div class="ctl"><div class="seg">'+
      PRIOS.map(function(p){return '<button data-dprio="'+p.id+'" aria-pressed="'+((c.priority||"med")===p.id)+
        '" style="--pc:'+prioVar(p.id)+";--pcs:"+prioSoft(p.id)+'"'+ro+'><span class="pip"></span>'+esc(p.label)+"</button>";}).join("")+
    "</div></div>"+
    '<span class="lbl">Цвет</span><div class="ctl">'+tintPick("data-dcolor",c.color,ro)+"</div>"+
    '<span class="lbl">Ответственный</span><div class="ctl"><select data-dassign="1" aria-label="Ответственный"'+ro+'><option value="">Не назначен</option>'+
      team.map(function(m){return '<option value="'+esc(m.id)+'"'+(m.id===c.assignee?" selected":"")+">"+esc(nameOf(m))+"</option>";}).join("")+
    "</select></div>"+
    '<span class="lbl">Сроки</span><div class="ctl"><div class="dates">'+
      '<label class="dt"><span>Начало</span>'+
        '<input type="date" data-dstart="1" value="'+esc(c.start||"")+'" aria-label="Дата начала"'+ro+'></label>'+
      '<label class="dt"><span>Дедлайн</span>'+
        '<input type="date" data-ddue="1" value="'+esc(c.due||"")+'" aria-label="Дедлайн"'+ro+'></label>'+
    "</div></div>"+
    (c.due||c.start?'<span class="lbl">В календарь</span><div class="ctl cal-add">'+
      '<a class="btn ghost" href="'+esc(googleLink(c))+'" target="_blank" rel="noopener">'+ic("calendar")+"Google Календарь</a>"+
      '<button class="btn ghost" data-dics="1" title="Для Outlook, Apple Календаря и других">'+ic("download")+"Файл .ics</button>"+
      '<p class="small cal-note">«Google Календарь» — название и даты задачи будут переданы в ваш Google Календарь. '+
        "«Файл .ics» остаётся на устройстве.</p></div>":"")+
  "</div>";

  if(!parent){
    body+='<div><div class="sect-h"><h3>Подзадачи</h3>'+
      (kids.length?'<span class="bar"><i style="width:'+pct+'%"></i></span><span class="n">'+kdone+"/"+kids.length+"</span>":"")+
      '</div><div class="subs">'+kids.map(function(s){
        var as=person(s.assignee);
        return '<div class="sub'+(s.done?" done":"")+'">'+
          '<button class="check" data-dsubcheck="'+esc(s.id)+'" role="checkbox" aria-checked="'+(s.done?"true":"false")+
          '" aria-label="Отметить подзадачу"'+ro+'>'+CHECK_SVG+"</button>"+
          '<button class="txt" data-dopen="'+esc(s.id)+'">'+esc(s.title)+"</button>"+
          datesChip(s)+(as?avatar(as):"")+"</div>";
      }).join("")+
      (ed?'<div class="sub-add"><span class="check" aria-hidden="true" style="border-style:dashed"></span>'+
        '<input data-dsubadd="1" placeholder="Добавить подзадачу" aria-label="Новая подзадача"></div>'
        :kids.length?"":'<div class="drop-hint">Подзадач нет.</div>')+"</div></div>";
  }

  body+='<div><div class="sect-h"><h3>Файлы</h3><span class="n">'+fs.length+"</span>"+
    '<span class="sp"></span>'+(ed?'<button class="btn ghost" data-upload="card" style="padding:4px 10px;font-size:12px">Прикрепить</button>':"")+"</div>"+
    (fs.length?'<div class="files">'+fs.map(function(f){return fileRow(f,false,ed);}).join("")+"</div>"
      :'<div class="drop-hint">Файл к задаче ещё не прикреплён.</div>')+"</div>";

  body+='<div><div class="sect-h"><h3>Описание</h3></div>'+
    '<textarea class="d-desc" data-ddesc="1" placeholder="'+(ed?"Контекст, ссылки, критерии готовности…":"Описания нет")+
      '" aria-label="Описание"'+(ed?"":" readonly")+">"+esc(c.desc||"")+"</textarea></div>";

  /* комментировать может любой участник, удалить — автор или владелец */
  body+='<div><div class="sect-h"><h3>Комментарии</h3><span class="n">'+ks.length+"</span></div>"+
    '<div class="talk">'+ks.map(function(k){
      /* без сервера комментарий — запись к задаче со временем, без автора */
      var a=COLLAB?person(k.authorId)||{name:k.author||"Участник",color:""}:null;
      return '<div class="msg'+(a?"":" plain")+'">'+(a?avatar(a):"")+
        '<div class="body"><div class="who">'+(a?"<b>"+esc(nameOf(a))+"</b>":"")+
        "<time>"+esc(fmtWhen(k.createdAt))+"</time></div>"+
        '<div class="txt">'+esc(k.body)+"</div></div>"+
        (k.authorId===S.me||isOwner(c.projectId)
          ?'<button class="x" data-kdel="'+esc(k.id)+'" aria-label="Удалить комментарий">'+X_BTN+"</button>":"")+"</div>";
    }).join("")+
    '<div class="talk-add"><textarea data-kadd="1" rows="1" placeholder="Написать комментарий…" aria-label="Комментарий"></textarea>'+
    '<button class="btn" data-ksend="1">Отправить</button></div></div></div>';
  body+="</div>";

  var foot='<div class="d-foot">'+
    (ed&&c.archived?'<button class="btn ghost" data-drestore="1">Вернуть из архива</button>':"")+
    (ed?'<button class="btn danger" data-ddel="1">Удалить задачу</button>':"")+
    '<span class="stamp">'+(c.updatedAt?"изм. "+fmtWhen(c.updatedAt):"")+"</span></div>";
  return h+body+foot;
}
function noteFilesHTML(n,ed){
  var fs=filesOfNote(n.id),imgs=fs.filter(isImage),docs=fs.filter(function(f){return !isImage(f);});
  return '<div><div class="sect-h"><h3>Файлы</h3><span class="n">'+fs.length+'</span><span class="sp"></span>'+
      (ed?'<button class="btn ghost" data-upload="note" style="padding:4px 10px;font-size:12px">Прикрепить</button>':"")+"</div>"+
    (imgs.length?'<div class="nthumbs">'+imgs.map(function(f){
      return '<div class="nthumb"><button class="nthumb-b" data-fview="'+esc(f.id)+'" aria-label="Открыть «'+esc(f.name)+'» на весь экран">'+
        '<img data-fimg="'+esc(f.id)+'" alt=""></button>'+
        (ed?'<button class="x" data-fdel="'+esc(f.id)+'" aria-label="Удалить «'+esc(f.name)+'»">'+X_BTN+"</button>":"")+"</div>";
    }).join("")+"</div>":"")+
    (docs.length?'<div class="files">'+docs.map(function(f){return fileRow(f,false,ed);}).join("")+"</div>":"")+
    (fs.length?"":'<div class="drop-hint">Картинки покажутся прямо в заметке, остальные файлы — списком.</div>')+"</div>";
}
function noteDrawerHTML(n){
  var ed=canEdit(n.projectId),ro=ed?"":" disabled";
  var body='<div class="d-body">'+
    '<textarea class="d-title" data-ntitle="1" rows="1" aria-label="Название заметки"'+(ed?"":" readonly")+">"+esc(n.title)+"</textarea>"+
    '<div class="fields">'+
      '<span class="lbl">Тип</span><div class="ctl">'+kindSeg("note",n.projectId,n.kind)+"</div>"+
      '<span class="lbl">Цвет</span><div class="ctl">'+tintPick("data-ncolor",n.color,ro)+"</div>"+
    "</div>"+
    '<textarea class="d-desc n-body" data-nbody="1" placeholder="Текст заметки" aria-label="Текст заметки"'+(ed?"":" readonly")+">"+esc(n.body)+"</textarea>"+
    noteFilesHTML(n,ed)+"</div>";
  var foot='<div class="d-foot">'+(ed?'<button class="btn danger" data-ndel="1">Удалить заметку</button>':"")+
    '<span class="stamp">'+(n.updatedAt?"изм. "+fmtWhen(n.updatedAt):"")+"</span></div>";
  return drawerHead(projName()+" · Заметка")+body+foot;
}
/* Фоновая перерисовка между нажатием и отпусканием кнопки мыши подменяет
   кнопку под курсором, и браузер теряет клик. Пока кнопка зажата над
   панелью, такую перерисовку откладываем до конца клика. */
var pressing=false,renderLater=false;
drawerEl.addEventListener("pointerdown",function(){pressing=true;});
function release(){
  if(!pressing) return;
  pressing=false;
  if(renderLater){renderLater=false;setTimeout(function(){renderDrawer();},0);}
}
window.addEventListener("pointerup",release,true);
window.addEventListener("pointercancel",release,true);
function renderDrawer(force){
  var n=S.openNote?find(S.notes,S.openNote):null,c=S.open?card(S.open):null;
  if(!n&&!c){closeDrawer();return;}
  if(!force&&pressing){renderLater=true;return;}
  var ae=document.activeElement;
  if(!force&&drawerEl.contains(ae)&&/^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
  /* панель перерисовывается целиком, поэтому прокрутку сохраняем сами —
     иначе после любой правки содержимое отбрасывает в самый верх */
  var was=$(".d-body",drawerEl),keep=was?was.scrollTop:0;
  drawerEl.innerHTML=n?noteDrawerHTML(n):cardDrawerHTML(c);
  fillThumbs(drawerEl);
  var now=$(".d-body",drawerEl);
  if(now&&keep) now.scrollTop=keep;
  var ta=$(".d-title",drawerEl);
  if(ta){ta.style.height="auto";ta.style.height=ta.scrollHeight+"px";}
}
function showDrawer(){
  drawerEl.classList.add("on"); scrimEl.classList.add("on");
  drawerEl.setAttribute("aria-hidden","false"); renderDrawer(true);
  var b=$(".d-body",drawerEl); if(b) b.scrollTop=0;   /* новая задача — сверху */
}
/* fresh — новая задача: название выделено, можно сразу печатать */
function openCard(id,fresh){
  flushText(); S.openNote=null; S.open=id; showDrawer();
  var t=fresh&&$("[data-dtitle]",drawerEl); if(t){t.focus();t.select();}
}
function openNote(id,fresh){
  flushText(); S.open=null; S.openNote=id; showDrawer();
  var t=fresh&&$("[data-ntitle]",drawerEl); if(t){t.focus();t.select();}
}
function closeDrawer(){
  flushText();
  S.open=null; S.openNote=null; drawerEl.classList.remove("on"); scrimEl.classList.remove("on");
  drawerEl.setAttribute("aria-hidden","true");
}

/* ═════════ всплывающие панели ═════════ */
var sheetEl=null;
function closeSheet(){if(sheetEl){sheetEl.remove();sheetEl=null;}}
function openSheet(anchor,html,wire,cls){
  closeSheet();
  sheetEl=document.createElement("div");
  sheetEl.className="sheet"+(cls?" "+cls:""); sheetEl.innerHTML=html;
  document.body.appendChild(sheetEl);
  var wd=sheetEl.offsetWidth,r=anchor.getBoundingClientRect();
  /* кнопку успела заменить перерисовка — встаём посередине экрана */
  if(!anchor.isConnected) r={left:(window.innerWidth-wd)/2,bottom:window.innerHeight*0.18};
  sheetEl.style.top=Math.max(10,Math.min(r.bottom+8,window.innerHeight-sheetEl.offsetHeight-10))+"px";
  sheetEl.style.left=clamp(r.left,10,window.innerWidth-wd-10)+"px";
  if(wire) wire(sheetEl);
  setTimeout(function(){document.addEventListener("pointerdown",outside,true);},0);
  function outside(e){
    if(sheetEl&&!sheetEl.contains(e.target)&&!anchor.contains(e.target)){
      document.removeEventListener("pointerdown",outside,true); closeSheet();}
  }
}
function menuHTML(items){
  return items.map(function(it){
    if(it==="-") return "<hr>";
    return '<button class="mi'+(it.danger?" danger":"")+'" data-act="'+it.act+'">'+ic(it.icon)+
      "<span>"+esc(it.label)+"</span>"+
      (it.more!=null?'<span class="more">'+(it.more?'<span class="h">'+esc(it.more)+"</span>":"")+ic("chevR")+"</span>":"")+"</button>";
  }).join("");
}
/* меню «⋮» на карточке задачи и подзадачи */
function cardMenu(anchor,id){
  var c=card(id); if(!c) return;
  function html(){
    var items=[];                      /* открыть — нажатием на саму карточку */
    if(c.parentId) items.push({act:"detach",icon:"detach",label:"Сделать отдельной задачей"});
    else items.push({act:"pin",icon:"pushpin",label:c.pinned?"Открепить":"Закрепить"},
      {act:"sub",icon:"plus",label:"Добавить подзадачу"},{act:"archive",icon:"archive",label:"В архив"});
    return menuHTML(items)+'<hr><div class="cap">Цвет карточки</div><div class="pad">'+tintPick("data-ccolor",c.color)+"</div>"+
      "<hr>"+menuHTML([{act:"del",icon:"trash",label:"Удалить",danger:true}]);
  }
  openSheet(anchor,html(),function(sh){
    sh.addEventListener("click",function(e){
      var b=e.target.closest("[data-ccolor]");
      if(b){patchCard(id,{color:b.dataset.ccolor});c=card(id);sh.innerHTML=html();return;}
      b=e.target.closest("[data-act]"); if(!b) return;
      var a=b.dataset.act; closeSheet();
      if(a==="pin"){
        patchCard(id,{pinned:!c.pinned});
        flash(c.pinned?"Задача закреплена вверху колонки":"Задача откреплена");
      }
      else if(a==="sub"){
        openCard(id);
        var i=$("[data-dsubadd]",drawerEl); if(i){i.scrollIntoView({block:"center"});i.focus();}}
      else if(a==="detach") detachCard(id);
      else if(a==="archive"){setArchived(id,true);flash("Задача в архиве. Вернуть её можно во вкладке «Архив».");}
      else if(a==="del") trashCard(id);
    });
  },"menu");
}
/* Окно своего типа: название, цвет, иконка. Им пользуются оба режима,
   а где хранить тип, решает вызывающий: o.save(черновик), o.remove()
   (o.removeLabel — подпись этой кнопки, если она не удаляет). */
function typeEditor(anchor,o){
  var k=o.kind;
  var d={label:k?k.label:"",color:k?k.color:"teal",icon:k?k.icon:"star"};
  var html="<h3>"+esc(o.title)+"</h3>"+
    '<input class="in" data-kname="1" maxlength="40" placeholder="Название" aria-label="Название типа" value="'+esc(d.label)+'">'+
    '<div class="fl">Цвет</div><div class="tints">'+TINTS.map(function(t){
      return '<button class="tint" data-ktint="'+t.id+'" aria-pressed="'+(d.color===t.id)+'" aria-label="'+t.label+
        '" title="'+t.label+'" style="'+tint(t.id)+'"><i></i></button>';}).join("")+"</div>"+
    '<div class="fl">Иконка</div><div class="icons">'+ICON_CHOICES.map(function(x){
      return '<button data-kicon="'+x[0]+'" aria-pressed="'+(d.icon===x[0])+'" aria-label="'+x[1]+'" title="'+x[1]+'">'+
        ic(x[0])+"</button>";}).join("")+"</div>"+
    '<div class="fl">Так он будет выглядеть</div><div data-kprev="1"></div>'+
    '<div class="row"><button class="btn" data-ksave="1">'+(k?"Сохранить":"Создать")+"</button>"+
      '<span class="sp"></span>'+(o.remove?'<button class="btn '+(o.removeLabel?"ghost":"danger")+'" data-kremove="1">'+
        esc(o.removeLabel||"Удалить")+"</button>":"")+"</div>";
  openSheet(anchor,html,function(sh){
    var name=$("[data-kname]",sh);
    function preview(){$("[data-kprev]",sh).innerHTML=kindChip({label:name.value.trim()||"Название",color:d.color,icon:d.icon});}
    function pick(attr,key,b){
      $$("["+attr+"]",sh).forEach(function(x){x.setAttribute("aria-pressed",String(x===b));});
      d[key]=b.getAttribute(attr); preview();
    }
    function save(){
      d.label=name.value.trim();
      if(!d.label){name.classList.add("bad");name.focus();return;}
      closeSheet(); o.save(d);
    }
    preview(); setTimeout(function(){name.focus();},0);
    sh.addEventListener("input",function(e){if(e.target===name){name.classList.remove("bad");preview();}});
    sh.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target===name){e.preventDefault();save();}});
    sh.addEventListener("click",function(e){
      var b;
      if((b=e.target.closest("[data-ktint]"))) pick("data-ktint","color",b);
      else if((b=e.target.closest("[data-kicon]"))) pick("data-kicon","icon",b);
      else if(e.target.closest("[data-ksave]")) save();
      else if(e.target.closest("[data-kremove]")){closeSheet();o.remove();}
    });
  });
}
function kindEditor(anchor,scope,id,onCreate){
  var k=id?find(S.kinds,id):null;
  typeEditor(anchor,{kind:k,title:(k?"Свой тип ":"Новый тип ")+(scope==="note"?"заметки":"задачи"),
    save:function(d){var nid=saveKind(scope,id,d);if(!id&&onCreate)onCreate(nid);},
    remove:k?function(){removeKind(id);}:null});
}
function kindList(anchor,scope){
  function html(){
    var own=kindsFor(scope).filter(function(k){return k.projectId;});
    return "<h3>Свои типы "+(scope==="note"?"заметок":"задач")+"</h3>"+
      '<p class="note">Хранятся в проекте «'+esc(projName())+"».</p>"+
      (own.length?own.map(function(k){
        return '<div class="mrow">'+kindChip(k)+'<span class="sp"></span>'+
          '<button class="x ed" data-kedit="'+esc(k.id)+'" aria-label="Изменить тип «'+esc(k.label)+'»" title="Изменить">'+ic("pencil")+"</button>"+
          '<button class="x" data-kdel="'+esc(k.id)+'" aria-label="Удалить тип «'+esc(k.label)+'»" title="Удалить">'+X_BTN+"</button></div>";
      }).join(""):'<p class="note">Своих типов пока нет.</p>')+
      '<div class="sheet-add"><button class="btn ghost" data-knew="1" style="width:100%">+ Новый тип</button></div>';
  }
  openSheet(anchor,html(),function(sh){
    sh.addEventListener("click",function(e){
      var b;
      if((b=e.target.closest("[data-kedit]"))) kindEditor(anchor,scope,b.dataset.kedit);
      else if((b=e.target.closest("[data-kdel]"))){if(removeKind(b.dataset.kdel)) sh.innerHTML=html();}
      else if(e.target.closest("[data-knew]")) kindEditor(anchor,scope,null);
    });
  });
}
/* статусы проекта: цвет, название, удаление с переводом задач на другой статус */
function statusSheet(anchor){
  var edit=null,del=null;
  function html(){
    var list=statusList();
    return "<h3>Статусы</h3>"+
      '<p class="note">Свои у проекта «'+esc(projName())+"». Статус выполненных задач можно переименовать, но не удалить.</p>"+
      list.map(function(s){
        var used=S.cards.filter(function(c){return c.status===s.id;}).length;
        var row='<div class="mrow"><button class="st-dot" data-stcolor="'+esc(s.id)+'" style="'+tint(s.color)+
          '" aria-label="Цвет статуса «'+esc(s.label)+'»" title="Цвет"><i></i></button>'+
          '<input data-stname="'+esc(s.id)+'" value="'+esc(s.label)+'" aria-label="Название статуса">'+
          (s.isDone?'<span class="lock" title="Этим статусом отмечаются выполненные задачи">'+ic("lock")+"</span>"
            :'<button class="x" data-stdel="'+esc(s.id)+'" aria-label="Удалить статус «'+esc(s.label)+'»">'+X_BTN+"</button>")+
          "</div>";
        if(edit===s.id) row+='<div class="tints">'+TINTS.map(function(t){
          return '<button class="tint" data-stset="'+t.id+'" aria-pressed="'+(s.color===t.id)+'" aria-label="'+t.label+
            '" title="'+t.label+'" style="'+tint(t.id)+'"><i></i></button>';}).join("")+"</div>";
        if(del===s.id) row+='<div class="confirm"><span>Статус «'+esc(s.label)+"» стоит у задач: "+used+
          ". На какой статус их перевести?</span>"+
          '<select class="in" data-stto="1" aria-label="Новый статус для задач">'+
          list.filter(function(x){return x.id!==s.id;}).map(function(x){
            return '<option value="'+esc(x.id)+'">'+esc(x.label)+"</option>";}).join("")+"</select>"+
          '<div class="row"><button class="btn danger" data-stdelok="1">Перевести и удалить</button>'+
          '<button class="btn ghost" data-stdelno="1">Отмена</button></div></div>';
        return row;
      }).join("")+
      '<div class="sheet-add"><input data-stnew="1" placeholder="Новый статус" aria-label="Новый статус">'+
      '<button class="btn" data-stadd="1" aria-label="Добавить статус">+</button></div>';
  }
  openSheet(anchor,html(),function(sh){
    function re(){sh.innerHTML=html();}
    function add(){
      var i=$("[data-stnew]",sh); if(!i||!i.value.trim()) return;
      addStatus(i.value); re(); $("[data-stnew]",sh).focus();
    }
    sh.addEventListener("click",function(e){
      var b;
      if((b=e.target.closest("[data-stcolor]"))){edit=edit===b.dataset.stcolor?null:b.dataset.stcolor;del=null;re();}
      else if((b=e.target.closest("[data-stset]"))){patchStatus(edit,{color:b.dataset.stset});edit=null;re();}
      else if((b=e.target.closest("[data-stdel]"))){
        var id=b.dataset.stdel;
        if(S.cards.some(function(c){return c.status===id;})){del=id;edit=null;re();}
        else{removeStatus(id,"");re();}}
      else if(e.target.closest("[data-stdelok]")){removeStatus(del,$("[data-stto]",sh).value);del=null;re();}
      else if(e.target.closest("[data-stdelno]")){del=null;re();}
      else if(e.target.closest("[data-stadd]")) add();
    });
    sh.addEventListener("keydown",function(e){
      if(e.key==="Enter"&&e.target.matches("[data-stnew]")){e.preventDefault();add();}
      if(e.key==="Enter"&&e.target.matches("[data-stname]")) e.target.blur();
    });
    sh.addEventListener("change",function(e){
      if(!e.target.matches("[data-stname]")) return;
      var id=e.target.dataset.stname,v=e.target.value.trim(),s=statusOf(id);
      if(!v){e.target.value=s?s.label:"";return;}
      patchStatus(id,{label:v});
    });
  });
}
/* перенос выполненных: переключатель и колонка назначения, в том числе в другом проекте */
function autoHTML(col){
  var on=col.doneMove!==false,list=colsOf(col.projectId),next=null,t=doneTarget(col);
  for(var i=0;i<list.length-1;i++){if(list[i].id===col.id) next=list[i+1];}
  var opts='<option value="">'+(next?"Следующая колонка — «"+esc(next.title)+"»":"Следующая колонка (её пока нет)")+"</option>"+
    liveProjects().filter(function(p){return canEdit(p.id);}).map(function(p){
      var cs=colsOf(p.id).filter(function(x){return x.id!==col.id;}); if(!cs.length) return "";
      return '<optgroup label="'+esc(p.name)+'">'+cs.map(function(x){
        return '<option value="'+esc(x.id)+'"'+(x.id===col.doneTarget?" selected":"")+">"+esc(x.title)+"</option>";
      }).join("")+"</optgroup>";
    }).join("");
  return '<label class="switch"><input type="checkbox" data-cmove="1"'+(on?" checked":"")+">"+
    "<span><b>Переносить задачу при выполнении</b><small>"+
    (!on?"Выполненные задачи остаются в этой колонке."
      :t?"Выполненные задачи будут перенесены в «"+esc(colPath(t))+"»."
      :"Следующей колонки нет, поэтому выполненные задачи останутся здесь.")+
    "</small></span></label>"+
    '<select class="in" data-ctarget="1" aria-label="Куда переносить выполненные задачи"'+(on?"":" disabled")+">"+opts+"</select>";
}

/* ═════════ боковая панель проектов ═════════ */
var sideEl=$("#side"),sideScrim=$("#sideScrim");
function sideHTML(){
  return '<div class="side-head"><h2>Проекты</h2>'+
      '<button class="icon-btn" data-sclose="1" aria-label="Закрыть">'+X_BTN+"</button></div>"+
    '<div class="side-body"><p class="note side-note">Каждый проект — отдельная доска со своей командой.</p>'+
    liveProjects().map(function(p){
      var n=S.cards.filter(function(c){return c.projectId===p.id&&!c.done&&!c.archived&&!c.parentId&&onBoard(c);}).length;
      var on=p.id===S.project;
      return '<div class="prow'+(on?" on":"")+'"><button class="pick" data-p="'+esc(p.id)+'"'+(on?' aria-current="page"':"")+">"+
          ic("folder")+"<b>"+esc(p.name)+'</b><span class="cnt" title="Открытых задач">'+n+"</span></button>"+
        (isOwner(p.id)?'<button class="x" data-pdel="'+esc(p.id)+'" aria-label="Удалить проект «'+esc(p.name)+'»" title="Удалить проект">'+
          X_BTN+"</button>":"")+"</div>";
    }).join("")+
    '<div class="side-add"><input data-pnew="1" placeholder="Новый проект" aria-label="Название нового проекта">'+
      '<button class="btn" data-padd="1" aria-label="Создать проект">+</button></div></div>'+
    '<div class="side-foot"><button class="mi" data-settings="1">'+ic("gear")+"<span>Настройки</span></button></div>";
}
function sideOpen(){return sideEl.classList.contains("on");}
/* перерисовка открытой панели; поле нового проекта во время ввода не трогаем */
function renderSide(){
  if(!sideOpen()||sideEl.contains(document.activeElement)&&document.activeElement.tagName==="INPUT") return;
  sideEl.innerHTML=isWork()?sideHTML():GridLife.sideHTML();
}
function setSideState(on){
  sideEl.classList.toggle("on",on); sideScrim.classList.toggle("on",on);
  sideEl.setAttribute("aria-hidden",String(!on));
  $("#btnSide").setAttribute("aria-expanded",String(on));
}
function openSide(){
  closeSheet(); closeDrawer();
  sideEl.innerHTML=isWork()?sideHTML():GridLife.sideHTML(); setSideState(true);
  sideEl.focus({preventScroll:true});
}
function closeSide(){
  if(!sideOpen()) return;
  setSideState(false);
  if(sideEl.contains(document.activeElement)) $("#btnSide").focus();
}
function createProject(input){
  var v=input.value.trim(); if(!v) return;
  var id=addProject(v); closeSide(); switchProject(id);
}
sideEl.addEventListener("click",function(e){
  var t=e.target,x;
  if(t.closest("[data-sclose]")){closeSide();return;}
  if(t.closest("[data-settings]")){openSettings();return;}
  if(!isWork()) return;                       /* остальное в Life обрабатывает life.js */
  if((x=t.closest("[data-pdel]"))){removeProject(x.dataset.pdel);renderSide();return;}
  if(t.closest("[data-padd]")){createProject($("[data-pnew]",sideEl));return;}
  if((x=t.closest("[data-p]"))){closeSide();if(x.dataset.p!==S.project)switchProject(x.dataset.p);}
});
sideEl.addEventListener("keydown",function(e){
  if(e.key==="Enter"&&e.target.matches("[data-pnew]")){e.preventDefault();createProject(e.target);}
});
sideScrim.addEventListener("click",closeSide);

/* ═════════ перетаскивание ═════════ */
var drag=null,autoRAF=null,dropAt=0;
function pointDown(e){
  if(S.tab!=="board"||!canEdit()) return;
  if(e.button!=null&&e.button!==0) return;
  if(e.target.closest("button,input,textarea,select,a")) return;
  var cardEl=e.target.closest("[data-card]"),headEl=e.target.closest("[data-colhead]");
  if(cardEl&&cardEl.classList.contains("child")) return;   /* подзадачи едут только вместе с родителем */
  var el=cardEl||headEl; if(!el) return;
  drag={kind:cardEl?"card":"col",id:cardEl?cardEl.dataset.card:headEl.dataset.colhead,
    x0:e.clientX,y0:e.clientY,started:false,host:cardEl?cardEl.closest("[data-group]"):el.closest("[data-col]")};
  window.addEventListener("pointermove",pointMove);
  window.addEventListener("pointerup",pointUp);
  window.addEventListener("pointercancel",pointUp);
}
function startDrag(){
  var host=drag.host,r=host.getBoundingClientRect();
  drag.started=true; S.dragging=true; closeSheet();
  drag.dx=drag.x0-r.left; drag.dy=drag.y0-r.top;
  var g=host.cloneNode(true);
  g.className=host.className.replace(/\bdrag-src\b/,"")+" drag-ghost"+(drag.kind==="col"?" col":"");
  g.style.cssText+=";width:"+r.width+"px;left:"+r.left+"px;top:"+r.top+"px;margin:0";
  if(drag.kind==="col") g.style.maxHeight=r.height+"px";
  document.body.appendChild(g); drag.ghost=g;
  var slot=document.createElement("div");
  slot.className="slot"+(drag.kind==="col"?" col":"");
  slot.style.height=r.height+"px";
  if(drag.kind==="col") slot.style.width=r.width+"px";
  drag.slot=slot;
  host.classList.add("drag-src");
  host.parentNode.insertBefore(slot,host);
  host.style.display="none";
  document.body.style.cursor="grabbing";
  autoRAF=requestAnimationFrame(autoScroll);
}
function autoScroll(){
  if(!drag||!drag.started) return;
  var b=$("#board");
  if(b){
    var r=b.getBoundingClientRect(),x=drag.lastX||0;
    if(x&&x<r.left+70) b.scrollLeft-=14; else if(x&&x>r.right-70) b.scrollLeft+=14;
  }
  if(drag.kind==="card"&&drag.overBody){
    var br=drag.overBody.getBoundingClientRect(),y=drag.lastY||0;
    if(y<br.top+40) drag.overBody.scrollTop-=10;
    else if(y>br.bottom-40) drag.overBody.scrollTop+=10;
  }
  autoRAF=requestAnimationFrame(autoScroll);
}
function pointMove(e){
  if(!drag) return;
  if(!drag.started){
    if(Math.abs(e.clientX-drag.x0)<5&&Math.abs(e.clientY-drag.y0)<5) return;
    startDrag();
  }
  e.preventDefault();
  drag.lastX=e.clientX; drag.lastY=e.clientY;
  drag.ghost.style.left=(e.clientX-drag.dx)+"px";
  drag.ghost.style.top=(e.clientY-drag.dy)+"px";
  if(drag.kind==="card") placeCardSlot(e.clientX,e.clientY); else placeColSlot(e.clientX);
}
function placeCardSlot(x,y){
  var bodies=$$("[data-body]"); if(!bodies.length) return;
  var target=null,best=Infinity;
  bodies.forEach(function(b){
    var r=b.parentNode.getBoundingClientRect();
    if(x>=r.left&&x<=r.right){target=b;best=-1;return;}
    if(best!==-1){var d=x<r.left?r.left-x:x-r.right;if(d<best){best=d;target=b;}}
  });
  if(!target) return;
  drag.overBody=target;
  $$(".track-body.hot").forEach(function(b){b.classList.remove("hot");});
  target.classList.add("hot");
  var cards=$$("[data-group]",target),before=null;
  for(var i=0;i<cards.length;i++){
    var r=cards[i].getBoundingClientRect();
    if(r.height&&y<r.top+r.height/2){before=cards[i];break;}
  }
  if(!before) before=$(".composer",target)||$(".add-card",target);
  if(before) target.insertBefore(drag.slot,before); else target.appendChild(drag.slot);
}
function placeColSlot(x){
  var b=$("#board"); if(!b) return;
  var tracks=$$("[data-col]",b).filter(function(t){return t.style.display!=="none";});
  var before=null;
  for(var i=0;i<tracks.length;i++){
    var r=tracks[i].getBoundingClientRect();
    if(x<r.left+r.width/2){before=tracks[i];break;}
  }
  if(!before) before=$(".add-track",b);
  if(before) b.insertBefore(drag.slot,before); else b.appendChild(drag.slot);
}
function pointUp(){
  window.removeEventListener("pointermove",pointMove);
  window.removeEventListener("pointerup",pointUp);
  window.removeEventListener("pointercancel",pointUp);
  if(!drag) return;
  if(!drag.started){drag=null;return;}
  cancelAnimationFrame(autoRAF);
  document.body.style.cursor="";
  var d=drag; drag=null; S.dragging=false; dropAt=Date.now();
  if(d.ghost) d.ghost.remove();
  $$(".track-body.hot").forEach(function(b){b.classList.remove("hot");});
  if(d.kind==="card") commitCardDrop(d); else commitColDrop(d);
  if(d.slot) d.slot.remove();
  d.host.style.display=""; d.host.classList.remove("drag-src");
  renderMain();
}
function neighbours(slot,sel,attr){
  var prev=slot.previousElementSibling,next=slot.nextElementSibling;
  while(prev&&!prev.matches(sel)) prev=prev.previousElementSibling;
  while(next&&!next.matches(sel)) next=next.nextElementSibling;
  return {prev:prev?prev.getAttribute(attr):null,next:next?next.getAttribute(attr):null};
}
function commitCardDrop(d){
  var body=d.slot.closest("[data-body]"); if(!body) return;
  var colId=body.dataset.body;
  var nb=neighbours(d.slot,"[data-group]","data-group");
  var pc=nb.prev?card(nb.prev):null,nc=nb.next?card(nb.next):null;
  var po=pc?pc.order:null,no=nc?nc.order:null;
  var c=card(d.id); if(!c) return;
  if(c.columnId===colId&&po===null&&no===null&&cardsIn(colId).length===1) return;
  moveCard(d.id,colId,orderBetween(po,no));
  if(needsNormalize(po,no)) normalize(cardsIn(colId),"cards");
}
function commitColDrop(d){
  var nb=neighbours(d.slot,"[data-col]","data-col");
  var pc=nb.prev?column(nb.prev):null,nc=nb.next?column(nb.next):null;
  var po=pc?pc.order:null,no=nc?nc.order:null;
  var col=column(d.id); if(!col) return;
  var order=orderBetween(po,no);
  col.order=order; w(S.store.update("columns",d.id,{order:order}));
  if(needsNormalize(po,no)) normalize(cols(),"columns");
}

/* ═════════ календари ═════════ */
/* Задача в календаре — событие на весь день, с даты начала по дедлайн
   включительно. Тот же формат отдаёт лента supabase/functions/grid-calendar. */
function taskLink(c){return location.origin+location.pathname+"#task="+encodeURIComponent(c.id);}
function calDays(c){
  var a=c.start||c.due,b=c.due||c.start;
  if(a>b){var t=a;a=b;b=t;}
  var end=parseISO(b); end.setDate(end.getDate()+1);   /* конец в календарях не включается */
  return {start:a.replace(/-/g,""),end:iso(end).replace(/-/g,"")};
}
function calDetails(c){
  var col=column(c.columnId);
  return (col?colPath(col):"")+(c.desc?"\n\n"+c.desc:"")+"\n\n"+taskLink(c);
}
function googleLink(c){
  var d=calDays(c);
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(c.title)+
    "&dates="+d.start+"/"+d.end+"&details="+encodeURIComponent(calDetails(c));
}
/* iCalendar: экранирование текста и перенос строк длиннее 75 байт (RFC 5545) */
function icsText(s){return String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");}
function icsFold(line){
  var out="",size=0,enc=new TextEncoder();
  Array.from(line).forEach(function(ch){
    var n=enc.encode(ch).length;
    if(size+n>75){out+="\r\n ";size=1;}
    out+=ch; size+=n;
  });
  return out;
}
function downloadICS(c){
  var d=calDays(c),now=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  var body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Grid//Tasks//RU","METHOD:PUBLISH","BEGIN:VEVENT",
    "UID:"+c.id+"@grid","DTSTAMP:"+now,"DTSTART;VALUE=DATE:"+d.start,"DTEND;VALUE=DATE:"+d.end,
    "SUMMARY:"+icsText(c.title),"DESCRIPTION:"+icsText(calDetails(c)),"URL:"+taskLink(c),
    "TRANSP:TRANSPARENT","END:VEVENT","END:VCALENDAR"].map(icsFold).join("\r\n")+"\r\n";
  saveBlob(new Blob([body],{type:"text/calendar;charset=utf-8"}),fileName(c.title,"Задача")+".ics");
}
function fileName(s,dflt){return String(s||"").replace(/[\\\/:*?"<>|]+/g," ").trim().slice(0,60)||dflt;}
function saveBlob(blob,name){
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
/* ссылка grid.html#task=ID (из события в календаре или уведомления) открывает
   задачу; #life=ключ — задачу Grid Life из напоминания */
function openFromHash(){
  var l=/^#life(?:=(.+))?$/.exec(location.hash);
  if(l){
    history.replaceState(null,"",location.pathname+location.search);
    if(isWork()) setMode("life");
    if(l[1]) GridLife.openKey(decodeURIComponent(l[1]));
    return;
  }
  var m=/^#task=(.+)$/.exec(location.hash); if(!m) return;
  if(!isWork()) setMode("work");          /* задача из доски открывается только в рабочем режиме */
  var c=card(decodeURIComponent(m[1])); if(!c||!onBoard(c)) return;
  history.replaceState(null,"",location.pathname+location.search);
  if(c.projectId!==S.project) switchProject(c.projectId);
  openCard(c.id);
}
window.addEventListener("hashchange",openFromHash);

/* ═════════ резервная копия Grid Work ═════════ */
/* Один файл JSON: проекты со всем живым содержимым (корзина не входит),
   команда и сами файлы в base64. Восстановление добавляет проекты как
   новые, с новыми id, поэтому ничего существующего не задевает. */
var BACKUP_APP="grid-work";
function backupData(all){
  var ps=liveProjects().filter(function(p){return all||p.id===S.project;}),ids=ps.map(function(p){return p.id;});
  function inP(x){return ids.indexOf(x.projectId)>=0;}
  var cards=S.cards.filter(function(c){return inP(c)&&onBoard(c);}),cids=cards.map(function(c){return c.id;});
  function onCard(x){return cids.indexOf(x.cardId)>=0;}
  var comments=S.comments.filter(onCard),who={};
  cards.forEach(function(c){if(c.assignee) who[c.assignee]=1;});
  comments.forEach(function(k){if(k.authorId) who[k.authorId]=1;});
  return {app:BACKUP_APP,version:1,exportedAt:Date.now(),
    projects:ps,statuses:S.statuses.filter(inP),kinds:S.kinds.filter(inP),
    columns:S.columns.filter(function(c){return inP(c)&&!c.deletedAt;}),cards:cards,comments:comments,
    notes:S.notes.filter(inP),
    files:S.files.filter(function(f){return inP(f)&&(!f.cardId||onCard(f));}).map(function(f){return Object.assign({},f);}),
    members:S.project_members.filter(inP).map(function(m){return {projectId:m.projectId,email:m.email,role:m.role};}),
    people:Object.keys(who).map(person).filter(Boolean).map(function(p){return {id:p.id,email:p.email,name:nameOf(p),color:p.color};})};
}
function fileData(f){
  if(f.data) return Promise.resolve(f.data);
  if(f.blob) return new Promise(function(res,rej){
    var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.onerror=function(){rej(fr.error);};fr.readAsDataURL(f.blob);});
  if(S.store.kind!=="supabase"||!f.path) return Promise.resolve("");
  return S.store.sb.storage.from(BUCKET).download(f.path).then(function(r){
    if(r.error) throw r.error;
    return new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsDataURL(r.data);});
  });
}
/* часть Grid Work для общей копии: все проекты с файлами (base64) */
function workCopyPart(){
  var d=backupData(true);
  if(!d.projects.length) return Promise.resolve(null);
  return d.files.reduce(function(p,f){
    return p.then(function(){return fileData(f).then(function(x){f.data=x;delete f.blob;});});
  },Promise.resolve()).then(function(){return d;});
}
function restoreBackup(d){
  var map={},mine=String(S.email||(me()||{}).email||"").toLowerCase(),names=liveProjects().map(function(p){return p.name;});
  var mail={},created=[];
  (d.people||[]).forEach(function(p){mail[p.id]=String(p.email||"").toLowerCase();});
  function nid(old,pre){return map[old]||(map[old]=uid(pre));}
  function list(k){return Array.isArray(d[k])?d[k]:[];}
  function rows(k,pid){return list(k).filter(function(x){return x.projectId===pid;});}
  function put(coll,id,x,extra){var b=Object.assign({},x,extra);delete b.id;return S.store.set(coll,id,b);}
  /* Человек из копии — тот, кто уже есть здесь: с сервером — по почте, иначе
     никто; на устройстве — по имени, а кого нет — добавляется в «Участники». */
  var who={};
  (d.people||[]).forEach(function(p){who[p.id]=p;});
  function here(oldId){
    if(!COLLAB) return localPerson(who[oldId]);
    var e=mail[oldId]; if(!e) return "";
    if(e===mine) return S.me;
    var p=S.profiles.filter(function(x){return String(x.email).toLowerCase()===e;})[0];
    return p?p.id:"";
  }
  function localPerson(p){
    if(!p||!p.name) return "";
    var same=S.profiles.filter(function(x){return nameOf(x)===p.name;})[0];
    if(same) return same.id;
    var id=uid("m"),body={email:"",name:String(p.name).slice(0,60),color:safeColor(p.color),avatar:"",settings:{}};
    S.profiles.push(Object.assign({id:id},body)); w(S.store.set("profiles",id,body));
    return id;
  }
  /* стандартный тип остаётся, свой — тот, что восстановлен из копии */
  function kindId(scope,id){return !id?"":find(scope==="note"?NOTE_KINDS:TASK_KINDS,id)?id:map[id]||"";}
  function restoreFiles(files,pid){
    return files.filter(function(f){return f.data;}).reduce(function(p,f){
      return p.then(function(){
        var id=uid("f"),meta={projectId:pid,cardId:f.cardId?map[f.cardId]||"":"",noteId:f.noteId?map[f.noteId]||"":"",name:f.name,size:f.size,
          mime:f.mime||"application/octet-stream",path:"",createdAt:f.createdAt||Date.now()};
        if(S.store.kind!=="supabase") return put("files",id,meta,{blob:dataURLBlob(f.data)});
        var path=pid+"/"+id+"-"+String(f.name).replace(/[^\w.\-]+/g,"_");
        return S.store.sb.storage.from(BUCKET).upload(path,dataURLBlob(f.data),{contentType:meta.mime})
          .then(function(r){if(r.error) throw r.error; meta.path=path; return put("files",id,meta);});
      });
    },Promise.resolve());
  }
  var chain=Promise.resolve();
  d.projects.forEach(function(p){
    chain=chain.then(function(){
      var pid=nid(p.id,"p"),cs=rows("cards",p.id),ids=cs.map(function(c){return c.id;});
      created.push(pid); flash("Восстанавливаем «"+p.name+"»…");
      function card(c){
        return put("cards",nid(c.id,"t"),c,{projectId:pid,columnId:map[c.columnId],parentId:c.parentId?map[c.parentId]||"":"",
          status:map[c.status]||"",kind:kindId("task",c.kind),assignee:here(c.assignee),deletedAt:0});
      }
      return insertProject(pid,{name:names.indexOf(p.name)>=0?p.name+" (из копии)":p.name,descr:p.descr||"",
          order:projectsEnd(),doneMoveDefault:p.doneMoveDefault!==false,deletedAt:0}).then(function(){
        return Promise.all(rows("statuses",p.id).map(function(s){return put("statuses",nid(s.id,"st"),s,{projectId:pid});})
          .concat(rows("kinds",p.id).map(function(k){return put("kinds",nid(k.id,"k"),k,{projectId:pid});}))
          .concat(rows("columns",p.id).map(function(c){return put("columns",nid(c.id,"c"),c,{projectId:pid,doneTarget:"",deletedAt:0});})));
      }).then(function(){
        return Promise.all(cs.filter(function(c){return !c.parentId;}).map(card));
      }).then(function(){
        return Promise.all(cs.filter(function(c){return c.parentId;}).map(card));
      }).then(function(){
        /* комментарий другого человека восстанавливается с его именем, но без привязки к профилю */
        return Promise.all(list("comments").filter(function(k){return ids.indexOf(k.cardId)>=0;}).map(function(k){
            return put("comments",nid(k.id,"k"),k,{cardId:map[k.cardId],authorId:COLLAB&&here(k.authorId)===S.me?S.me:"",author:k.author||""});})
          .concat(rows("notes",p.id).map(function(n){return put("notes",nid(n.id,"n"),n,{projectId:pid,kind:kindId("note",n.kind)});}))
          .concat(rows("members",p.id).filter(function(m){return COLLAB&&String(m.email).toLowerCase()!==mine;}).map(function(m){
            var e=String(m.email).toLowerCase(),known=S.profiles.filter(function(x){return String(x.email).toLowerCase()===e;})[0];
            return put("project_members",uid("pm"),{projectId:pid,userId:known?known.id:"",email:e,role:m.role,createdAt:Date.now()});
          })));
      }).then(function(){return restoreFiles(rows("files",p.id),pid);});
    });
  });
  /* перенос выполненных в колонку другого проекта из той же копии — когда все колонки уже есть */
  return chain.then(function(){
    return Promise.all(list("columns").filter(function(c){return c.doneTarget&&map[c.doneTarget]&&map[c.id];}).map(function(c){
      return S.store.update("columns",map[c.id],{doneTarget:map[c.doneTarget]});}));
  }).then(function(){return created;});
}

/* ═════════ папка Grid, копия и снимки: Grid Work и Grid Life вместе ═════════ */
/* На сервер ничего не уходит.
   Папка Grid (компьютер, где браузер умеет работать с папками) — основное
   хранилище, браузер — рабочая копия; см. «папка Grid» ниже.
   Копия — один файл JSON с обоими режимами (части — те же, что у прежних
   отдельных копий, и старые файлы тоже восстанавливаются): «Сохранить копию»,
   на телефоне — меню «Поделиться».
   Снимки — раз в день при открытии, последние 7, в IndexedDB grid-backup;
   спасают от ошибок, но лежат там же, где данные. Файл вложения в снимках
   хранится один раз (blobs, ключ w:id или l:id), сколько бы снимков его ни помнили.
   С совместной работой Grid Work живёт на сервере — в снимки попадает только
   Grid Life, а папки Grid нет. */
var COPY_APP="grid",KEEP=7;
var FOLDER_OK=!COLLAB&&typeof window.showDirectoryPicker==="function"&&!matchMedia("(pointer: coarse)").matches;
var SHARE_OK=(function(){
  try{return matchMedia("(pointer: coarse)").matches&&!!navigator.canShare&&
    navigator.canShare({files:[new File(["{}"],"grid.json",{type:"application/json"})]});}catch(e){return false;}
})();
var BK={db:null,meta:{},ver:0,prep:null,prepTimer:0,q:Promise.resolve(),timer:0,first:0,perm:"",ahead:null,later:"",error:"",
  history:null,fileNames:null};
function bkDB(){
  if(!BK.dbP) BK.dbP=new Promise(function(res,rej){
    if(!window.indexedDB){rej(new Error("браузер не поддерживает хранение данных"));return;}
    var r=indexedDB.open("grid-backup",1);
    r.onupgradeneeded=function(){
      var d=r.result;
      d.createObjectStore("snaps",{keyPath:"id"}); d.createObjectStore("blobs",{keyPath:"key"}); d.createObjectStore("meta",{keyPath:"key"});
    };
    r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);};
  }).then(function(db){
    BK.db=db;
    return idbAll(db.transaction("meta").objectStore("meta"));
  }).then(function(rows){rows.forEach(function(x){BK.meta[x.key]=x.value;});})
    .catch(function(e){BK.dbP=null;throw e;});   /* не открылось — в следующий раз пробуем снова */
  return BK.dbP;
}
function bkTx(stores,fn){
  return new Promise(function(res,rej){
    var t=BK.db.transaction(stores,"readwrite"); fn(t);
    t.oncomplete=function(){res();}; t.onerror=t.onabort=function(){rej(t.error);};
  });
}
function bkSet(k,v){BK.meta[k]=v;return bkTx(["meta"],function(t){t.objectStore("meta").put({key:k,value:v});});}
function bkHash(s){
  var h=0x811c9dc5;
  for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36)+"."+s.length;
}
function bkRefresh(){renderNotice();GridLife.refresh();renderSettings();renderFolderStat();renderFolderBar();}
/* любая правка в Grid Work или Grid Life */
function bkChanged(){BK.ver++;if(BK.db&&folder()) scheduleFolder();}

/* что сейчас на устройстве: строки без файлов, файлы отдельно (Blob) */
function bkState(){
  return GridLife.raw().then(function(life){
    var work=null,blobs={};
    function strip(pre){return function(r){
      if(!r.blob) return r;
      blobs[pre+r.id]=r.blob; var o=Object.assign({},r); delete o.blob; return o;};}
    if(!COLLAB&&S.store&&S.store.kind==="local"){
      work={}; COLLS.forEach(function(c){work[c]=(S[c]||[]).map(strip("w:"));});
    }
    if(life) life.files=life.files.map(strip("l:"));
    function part(rows,pre){
      if(!rows) return {sig:"",size:0};
      var json=JSON.stringify(rows);
      return {sig:bkHash(json),size:Object.keys(blobs).reduce(function(s,k){return s+(k.indexOf(pre)===0?blobs[k].size:0);},json.length)};
    }
    var pw=part(work,"w:"),pl=part(life,"l:");
    return {work:work,life:life,blobs:blobs,sig:{work:pw.sig,life:pl.sig},size:{work:pw.size,life:pl.size}};
  });
}

/* ── копия ── */
/* noLife — без Grid Life (PIN не ввели) */
function buildCopy(noLife){
  var ver=BK.ver;
  return Promise.all([workCopyPart(),noLife?null:GridLife.copyPart()]).then(function(r){
    if(!r[0]&&!r[1]) throw new Error("в Grid пока нет данных");
    return {ver:ver,name:"Grid — копия — "+todayISO()+".json",
      json:JSON.stringify({app:COPY_APP,version:1,exportedAt:Date.now(),work:r[0],life:r[1]})};
  });
}
/* Safari открывает «Поделиться» только прямо из нажатия — копию для него собираем заранее */
function prepCopy(){
  if(!SHARE_OK||BK.prep&&BK.prep.ver===BK.ver) return;
  clearTimeout(BK.prepTimer);
  BK.prepTimer=setTimeout(function(){
    if(BK.prep&&BK.prep.ver===BK.ver) return;
    BK.prep={ver:BK.ver};
    buildCopy().then(function(c){if(BK.prep&&BK.prep.ver===c.ver) BK.prep=c;},function(){BK.prep=null;});
  },1500);
}
/* «Сохранить копию»: на телефоне — меню «Поделиться», иначе — скачивание.
   Ответ — true, если копия сохранена */
function saveCopy(){
  return GridLife.copyAllowed().then(function(life){
    if(life===null) return false;
    var c=life&&BK.prep&&BK.prep.ver===BK.ver&&BK.prep.json?BK.prep:null;
    if(c) return deliverCopy(c);
    flash("Собираем копию…");
    return buildCopy(!life).then(function(c){if(SHARE_OK&&life) BK.prep=c;return deliverCopy(c);},
      function(e){flash("Копия не собралась: "+((e&&e.message)||"нет связи с хранилищем"));return false;});
  });
}
function deliverCopy(c){
  var file=new File([c.json],c.name,{type:"application/json"});
  if(!SHARE_OK){saveBlob(file,c.name);return copySaved(c.name);}
  return navigator.share({files:[file],title:c.name}).then(function(){return copySaved(c.name);},function(e){
    if(e&&e.name==="AbortError") return false;
    if(e&&e.name==="NotAllowedError"){flash("Копия готова — нажмите «Сохранить копию» ещё раз");return false;}
    saveBlob(file,c.name); return copySaved(c.name);
  });
}
function copySaved(name){
  return bkDB().then(function(){return bkSet("lastCopyAt",Date.now());}).then(function(){
    flash("Копия сохранена: "+name); bkRefresh(); return true;
  });
}
function pickCopy(){
  filePick.value=""; filePick.accept=".json,application/json";
  filePick.onchange=function(){
    var f=filePick.files&&filePick.files[0]; filePick.accept="";
    if(f) f.text().then(readCopy).catch(function(e){flash("Не удалось восстановить: "+((e&&e.message)||"файл повреждён"));});
  };
  filePick.click();
}
/* общая копия или прежняя отдельная копия Grid Work либо Grid Life */
function readCopy(txt){
  var d=null; try{d=JSON.parse(txt);}catch(e){}
  var wk=d&&(d.app===COPY_APP?d.work:d.app===BACKUP_APP?d:null),lf=d&&(d.app===COPY_APP?d.life:d.app==="grid-life"?d:null);
  if(wk&&!(Array.isArray(wk.projects)&&wk.projects.length)) wk=null;
  if(lf&&!Array.isArray(lf.tasks)) lf=null;
  if(!wk&&!lf){flash("Это не резервная копия Grid");return;}
  var text=[];
  if(wk) text.push("Grid Work: проектов — "+wk.projects.length+", задач — "+(wk.cards||[]).length+", файлов — "+
    (wk.files||[]).filter(function(f){return f.data;}).length+". Они добавятся как новые проекты, то, что уже есть, не изменится."+
    (COLLAB?" Вы станете их владельцем, команда из копии получит приглашения.":""));
  if(lf) text.push("Grid Life: задач — "+lf.tasks.length+". Они заменят задачи Grid Life на этом устройстве.");
  return GridLife.dialog("Восстановить копию от "+fmtWhen(d.exportedAt)+"?",text.join(" "),wk&&lf
      ?[["all","Восстановить всё","main"],["work","Только Grid Work"],["life","Только Grid Life"],["","Отмена"]]
      :[[wk?"work":"life","Восстановить","main"],["","Отмена"]]).then(function(v){
    if(!v) return;
    var p=Promise.resolve(),done=[];
    if(lf&&v!=="work") p=p.then(function(){return GridLife.fromCopy(lf);}).then(function(){done.push("Grid Life");});
    if(wk&&v!=="life") p=p.then(function(){return restoreBackup(wk);}).then(function(ids){switchProject(ids[0]);done.push("Grid Work");});
    return w(p.then(function(){closeSettings();flash("Восстановлено из копии: "+done.join(" и "));}));
  });
}

/* ── папка Grid: основное хранилище на компьютере ── */
/* Где браузер умеет работать с папками (Chrome, Edge, Яндекс Браузер на
   компьютере), данные живут в выбранной папке, а браузер — рабочая копия:
   изменения уходят в папку через 3–5 секунд, и очистка браузера их не сотрёт.
   В папке: grid.json — всё состояние Grid Work и Grid Life (как в снимке, с
   корзиной, и ещё PIN Grid Life), files/ — вложения, каждое пишется один раз,
   history/ — последнее состояние каждого из 7 последних дней работы и версии,
   отложенные при выборе. rev — метка записи: другая метка в папке значит, что файл записал
   другой компьютер или браузер. Сливать версии Grid не пытается — человек
   выбирает, какую оставить, вторая уходит в историю. */
var DATA_FILE="grid.json",FOLDER_APP="grid-folder",HISTORY_DAYS=7;
function folder(){return FOLDER_OK&&BK.meta.dir||null;}
function errText(e){return (e&&(e.message||e.name))||"ошибка записи";}
function hhmm(d){return String(d.getHours()).padStart(2,"0")+"-"+String(d.getMinutes()).padStart(2,"0");}
function bkSetAll(o){
  Object.assign(BK.meta,o);
  return bkTx(["meta"],function(t){Object.keys(o).forEach(function(k){t.objectStore("meta").put({key:k,value:o[k]});});});
}
function sub(dir,name){return dir.getDirectoryHandle(name,{create:true});}
function names(dir){
  var out=[],it=dir.keys();
  function next(){return it.next().then(function(r){if(r.done) return out;out.push(r.value);return next();});}
  return next();
}
function writeText(dir,name,data){
  return dir.getFileHandle(name,{create:true}).then(function(h){return h.createWritable();})
    .then(function(w){return w.write(data).then(function(){return w.close();});});
}
function readText(dir,name){return dir.getFileHandle(name).then(function(h){return h.getFile();}).then(function(f){return f.text();});}
/* файл вложения: w:id → files/w-id */
function blobName(k){return k.replace(":","-").replace(/[^\w.-]/g,"_");}
/* дела папки идут по одному: запись, загрузка, выбор версии */
function inFolder(fn){
  var p=BK.q.then(fn);
  BK.q=p.catch(function(){});
  return p.then(function(r){bkRefresh();return r;},function(e){bkRefresh();throw e;});
}

/* состояние для папки: как для снимка, плюс PIN Grid Life и хозяин устройства */
function folderState(){
  return Promise.all([bkState(),GridLife.pin()]).then(function(r){
    var st=r[0],me=S.store&&S.store.meta&&S.store.meta.me||"";
    st.pin=r[1]; st.me=me;
    st.fsig=bkHash(st.sig.work+"|"+st.sig.life+"|"+JSON.stringify(st.pin)+"|"+me);
    return st;
  });
}
function folderDoc(st,rev){
  return {app:FOLDER_APP,version:1,rev:rev,savedAt:Date.now(),me:st.me,work:st.work,
    life:st.life&&Object.assign({},st.life,{pin:st.pin})};
}
/* что в папке сейчас: метка и время записи; текст читаем, только если файл менялся (или папка новая) */
function readHead(dir,fresh){
  return dir.getFileHandle(DATA_FILE).then(function(h){return h.getFile();}).then(function(f){
    if(!fresh&&BK.meta.dataRev&&f.lastModified===BK.meta.dataMtime)
      return {rev:BK.meta.dataRev,savedAt:BK.meta.dataSavedAt,mtime:f.lastModified};
    return f.text().then(function(t){
      var d=null; try{d=JSON.parse(t);}catch(e){}
      if(!d||d.app!==FOLDER_APP) throw new Error("файл "+DATA_FILE+" в папке повреждён или не от Grid");
      return {rev:d.rev,savedAt:d.savedAt,mtime:f.lastModified,text:t,data:d};
    });
  },function(e){if(e&&e.name==="NotFoundError") return null; throw e;});
}
/* вложения — отдельными файлами, каждое один раз */
function putFiles(dir,blobs){
  var keys=Object.keys(blobs);
  if(!keys.length) return Promise.resolve();
  return sub(dir,"files").then(function(fd){
    return (BK.fileNames?Promise.resolve(BK.fileNames):names(fd).then(function(l){return (BK.fileNames=new Set(l));})).then(function(have){
      return keys.filter(function(k){return !have.has(blobName(k));}).reduce(function(p,k){
        return p.then(function(){return writeText(fd,blobName(k),blobs[k]);}).then(function(){have.add(blobName(k));});
      },Promise.resolve());
    });
  });
}

/* ── история в папке ── */
function readHistory(dir){
  return sub(dir,"history").then(names).then(function(l){
    return (BK.history=l.filter(function(n){return /^grid-\d{4}-\d\d-\d\d.*\.json$/.test(n);}).sort().reverse());
  });
}
function histLabel(n){
  var m=/^grid-(\d{4})-(\d\d)-(\d\d)(?: (\d\d)-(\d\d) (.+))?\.json$/.exec(n); if(!m) return n;
  var day=Number(m[3])+" "+MONTHS[Number(m[2])-1]+" "+m[1];
  return m[4]?day+", "+m[4]+":"+m[5]+" · "+m[6]:day;
}
function setAside(dir,text,label){
  return sub(dir,"history").then(function(hd){return writeText(hd,"grid-"+todayISO()+" "+hhmm(new Date())+" "+label+".json",text);})
    .then(function(){return readHistory(dir);});
}
/* состояние этого браузера — в историю папки, вместе с вложениями */
function asideBrowser(dir,label){
  return folderState().then(function(st){
    return putFiles(dir,st.blobs).then(function(){return setAside(dir,JSON.stringify(folderDoc(st,uid("r"))),label);});
  });
}
/* Первая запись нового дня кладёт прежнее состояние в историю как версию того дня.
   Версий дня храним 7 последних (дни, когда Grid меняли, — после отпуска история не пустеет),
   отложенных — за 7 дней; лишние удаляем, а с ними вложения, которых больше нигде нет. */
function rotate(dir,head,st){
  var day=head&&head.savedAt?iso(new Date(head.savedAt)):"";
  if(!day||day>=todayISO()) return Promise.resolve();
  var edge=iso(new Date(Date.now()-(HISTORY_DAYS-1)*864e5));
  return sub(dir,"history").then(function(hd){
    return (head.text?Promise.resolve(head.text):readText(dir,DATA_FILE)).then(function(t){
      return writeText(hd,"grid-"+day+".json",t);
    }).then(function(){return names(hd);}).then(function(l){
      var old=l.filter(function(n){return /^grid-\d{4}-\d\d-\d\d\.json$/.test(n);}).sort().reverse().slice(HISTORY_DAYS)
        .concat(l.filter(function(n){var m=/^grid-(\d{4}-\d\d-\d\d) /.exec(n);return m&&m[1]<edge;}));
      return Promise.all(old.map(function(n){return hd.removeEntry(n);})).then(function(){
        return Promise.all(l.filter(function(n){return old.indexOf(n)<0&&/\.json$/.test(n);}).map(function(n){
          return readText(hd,n).then(function(t){return JSON.parse(t);},function(){return null;});
        }));
      });
    }).then(function(docs){return gcFiles(dir,st,docs);});
  }).then(function(){return readHistory(dir);});
}
function docFiles(d,used){
  if(d.work) (d.work.files||[]).forEach(function(f){used[blobName("w:"+f.id)]=1;});
  if(d.life) (d.life.files||[]).forEach(function(f){used[blobName("l:"+f.id)]=1;});
}
function gcFiles(dir,st,docs){
  if(docs.some(function(d){return !d;})) return;     /* какую-то версию не прочитать (облако ещё качает) — не рискуем */
  var used={};
  docFiles(st,used); docs.forEach(function(d){docFiles(d,used);});
  return sub(dir,"files").then(function(fd){
    return names(fd).then(function(l){
      return Promise.all(l.filter(function(n){return !used[n];}).map(function(n){return fd.removeEntry(n);})).then(function(){
        BK.fileNames=new Set(l.filter(function(n){return used[n];}));
      });
    });
  });
}

/* ── запись и загрузка ── */
function writeData(dir,st,head){
  var doc=folderDoc(st,uid("r"));
  return rotate(dir,head,st).then(function(){return putFiles(dir,st.blobs);})
    .then(function(){return writeText(dir,DATA_FILE,JSON.stringify(doc));})
    .then(function(){return dir.getFileHandle(DATA_FILE);}).then(function(h){return h.getFile();})
    .then(function(f){
      return bkSetAll({dataRev:doc.rev,dataSig:st.fsig,dataMtime:f.lastModified,dataSavedAt:doc.savedAt,dataAt:Date.now()});
    });
}
/* через 3 секунды после правки, но не позже 5 секунд после первой несохранённой */
function scheduleFolder(){
  if(!folder()) return;
  var now=Date.now();
  if(!BK.first) BK.first=now;
  clearTimeout(BK.timer);
  BK.timer=setTimeout(saveFolder,Math.max(0,Math.min(now+3e3,BK.first+5e3)-now));
}
/* Записать в папку несохранённое. Если файл в папке записал кто-то ещё —
   ничего не трогаем: плашка предлагает загрузить его или выбрать версию. */
function saveFolder(){
  clearTimeout(BK.timer); BK.timer=0; BK.first=0;
  var dir=folder(); if(!dir) return Promise.resolve();
  return inFolder(function(){
    return dir.queryPermission({mode:"readwrite"}).then(function(p){
      BK.perm=p; if(p!=="granted") return;          /* изменения ждут в браузере */
      return Promise.all([readHead(dir),folderState()]).then(function(r){
        var head=r[0],st=r[1];
        if(head&&head.rev!==BK.meta.dataRev){BK.ahead={head:head,dirty:st.fsig!==BK.meta.dataSig};return;}
        BK.ahead=null;
        if(head&&st.fsig===BK.meta.dataSig) return;
        return writeData(dir,st,head);
      });
    }).then(function(){BK.error="";},function(e){BK.error=errText(e);});
  });
}
/* версию из папки — в браузер; вложения берём из files/ */
function applyDoc(dir,d){
  var miss=0;
  return sub(dir,"files").then(function(fd){
    function attach(rows,pre){
      return Promise.all((rows||[]).map(function(f){
        return fd.getFileHandle(blobName(pre+f.id)).then(function(h){return h.getFile();}).then(function(file){
          return file.arrayBuffer().then(function(b){f.blob=new Blob([b],{type:f.mime||file.type||"application/octet-stream"});});
        },function(){miss++;});
      }));
    }
    return Promise.all([d.work&&attach(d.work.files,"w:"),d.life&&attach(d.life.files,"l:")]);
  }).then(function(){
    if(!d.work||!S.store||!S.store.replace) return;
    S.open=null; S.openNote=null; closeDrawer();
    return S.store.replace(d.work).then(function(){
      if(d.me){S.me=d.me;return S.store.setMeta("me",d.me);}
    }).then(renderAll);
  }).then(function(){
    if(d.life) return GridLife.load(d.life).then(function(){GridLife.setPin(d.life.pin||null);});
  }).then(function(){
    if(miss) flash("Не все вложения нашлись в папке ("+miss+") — возможно, облако ещё не докачало их");
  });
}
/* загруженная версия — теперь сохранённая */
function loadedFrom(head){
  return folderState().then(function(st){
    BK.ahead=null;
    return bkSetAll({dataRev:head.rev,dataSig:st.fsig,dataMtime:head.mtime,dataSavedAt:head.savedAt,dataAt:Date.now()});
  });
}
/* «Загрузить» / «Оставить версию из папки»: своё, если было, — в историю */
function takeFolder(){
  var dir=folder(),a=BK.ahead; if(!dir||!a) return Promise.resolve();
  return inFolder(function(){
    return (a.dirty?asideBrowser(dir,"из этого браузера"):Promise.resolve())
      .then(function(){return a.head.data||readText(dir,DATA_FILE).then(JSON.parse);})
      .then(function(d){return applyDoc(dir,d);}).then(function(){return loadedFrom(a.head);})
      .then(function(){flash("Загружена версия из папки — от "+fmtWhen(a.head.savedAt));});
  }).catch(function(e){flash("Не удалось загрузить из папки: "+errText(e));});
}
/* «Оставить версию этого браузера»: та, что в папке, — в историю */
function keepBrowser(){
  var dir=folder(),a=BK.ahead; if(!dir||!a) return Promise.resolve();
  return inFolder(function(){
    return (a.head.text?Promise.resolve(a.head.text):readText(dir,DATA_FILE)).then(function(t){return setAside(dir,t,"из папки");})
      .then(folderState).then(function(st){BK.ahead=null;return writeData(dir,st,null);})
      .then(function(){flash("В папке — версия этого браузера, вторая сохранена в истории папки");});
  }).catch(function(e){flash("Не удалось записать в папку: "+errText(e));});
}
function loadHistory(name){
  var dir=folder(); if(!dir) return;
  GridLife.dialog("Загрузить версию: "+histLabel(name)+"?",
    "Данные Grid Work и Grid Life заменятся этой версией. То, что сейчас, сохранится в истории папки.",
    [["go","Загрузить","main"],["","Отмена"]]).then(function(v){
    if(!v) return;
    return inFolder(function(){
      return asideBrowser(dir,"до загрузки").then(function(){return sub(dir,"history");})
        .then(function(hd){return readText(hd,name);}).then(function(t){return applyDoc(dir,JSON.parse(t));})
        .then(folderState).then(function(st){BK.ahead=null;return writeData(dir,st,null);})
        .then(function(){closeSettings();flash("Загружена версия: "+histLabel(name));});
    }).catch(function(e){flash("Не удалось загрузить версию: "+errText(e));});
  });
}

/* ── выбор папки, доступ, отключение ── */
function connectFolder(h){
  BK.fileNames=null; BK.ahead=null; BK.error=""; BK.perm="granted";
  return bkSetAll({dir:h,dataRev:"",dataSig:"",dataMtime:0,dataSavedAt:0,dataAt:0}).then(function(){return readHistory(h);});
}
/* find — «Найти мои данные»; fresh — с экрана первого запуска: в браузере только пример.
   Ответ — true, если папка подключена. */
function pickFolder(find,fresh){
  return window.showDirectoryPicker({id:"grid-data",mode:"readwrite"}).then(function(h){
    return readHead(h,true).then(function(head){
      if(!head){
        if(!find) return connectFolder(h).then(saveFolder).then(function(){flash("Данные Grid хранятся в папке «"+h.name+"»");return true;});
        return GridLife.dialog("В папке «"+h.name+"» нет данных Grid","Выберите другую папку — или храните данные Grid в этой.",
          [["here","Хранить данные здесь","main"],["other","Выбрать другую папку"],["","Отмена"]]).then(function(v){
          if(v==="other") return pickFolder(true,fresh);
          if(v!=="here") return false;
          return connectFolder(h).then(saveFolder).then(function(){return true;});
        });
      }
      var when="Версия от "+fmtWhen(head.savedAt)+".";
      return GridLife.dialog("В папке «"+h.name+"» есть данные Grid",find||fresh?when:when+
          " Загрузить их или записать туда данные этого браузера? Вторая версия сохранится в истории папки.",
        find||fresh?[["load","Загрузить","main"],["","Отмена"]]
          :[["load","Загрузить из папки","main"],["mine","Записать данные этого браузера"],["","Отмена"]]).then(function(v){
        if(!v) return false;
        return connectFolder(h).then(function(){
          BK.ahead={head:head,dirty:!fresh};
          return v==="load"?takeFolder():keepBrowser();
        }).then(function(){return true;});
      });
    });
  },function(e){
    if(!e||e.name!=="AbortError") flash("Папку выбрать не удалось: "+errText(e));
    return false;
  });
}
function allowFolder(){
  var dir=folder(); if(!dir) return;
  dir.requestPermission({mode:"readwrite"}).then(function(p){
    BK.perm=p;
    if(p==="granted") return readHistory(dir).then(saveFolder);
    bkRefresh();
  },function(e){flash("Доступ не получен: "+errText(e));});
}
function folderOff(){
  GridLife.dialog("Отключить папку Grid?","Данные останутся и в папке, и в браузере, но новые изменения в папку попадать не будут.",
    [["off","Отключить","danger"],["","Отмена"]]).then(function(v){
    if(!v) return;
    clearTimeout(BK.timer); BK.timer=0; BK.ahead=null; BK.error=""; BK.history=null; BK.fileNames=null;
    delete BK.meta.dir;
    return bkTx(["meta"],function(t){t.objectStore("meta").delete("dir");}).then(bkRefresh);
  });
}

/* ── «Как устроен Grid», экран первого запуска, плашка и значок в шапке ── */
/* «Как устроен Grid» коротко: на компьютере с папкой — на экране выбора папки, на телефоне
   и в браузерах без папки — карточкой один раз. Полностью — в «О Grid» (howtoFull) */
function howtoShort(){
  var data="<b>Данные — только на этом "+(FOLDER_OK?"компьютере":"устройстве")+".</b> Grid ничего не отправляет на серверы, у автора нет к ним доступа.",
    lock="<b>Ставьте блокировку экрана.</b> Для Grid Life есть PIN и вход по "+GridLife.bioName()+".",
    list=FOLDER_OK?[data,
      "<b>Выберите папку для данных.</b> В Яндекс Диске или Google Диске она будет и в облаке, и на других ваших компьютерах.",
      "<b>Работайте на одном компьютере за раз.</b> Если версии разойдутся, Grid спросит, какую оставить, а вторую сохранит в истории папки.",
      "<b>С телефоном синхронизации нет.</b> Переносите данные резервной копией: «Настройки» → «Резервная копия».",lock]
    :[data,
      iosDevice()?"<b>Установите Grid на экран «Домой»</b>, иначе Safari может стереть данные.":"",
      "<b>Очистка браузера сотрёт данные.</b> Сохраняйте резервную копию: «Настройки» → «Резервная копия».",
      "<b>Синхронизации нет.</b> Перенести данные на другое устройство можно этой же копией.",lock];
  return '<ul class="howto">'+list.filter(Boolean).map(function(s){return "<li>"+s+"</li>";}).join("")+"</ul>"+
    '<button class="lnk" data-howmore="1">Подробнее</button>';
}
/* Grid открылся без данных, а браузер умеет работать с папками: первый ли это
   запуск или браузер очистили — не различить, поэтому экран один */
function folderGate(){
  gateEl.classList.remove("work-only");
  showGate('<h1>Как устроен Grid</h1><div class="how-text">'+howtoShort()+"</div>"+
    '<div class="how-act"><button class="btn" data-gfind="1">Найти мои данные</button>'+
    '<p class="small gsub">Grid уже хранил данные в папке — загрузится последняя версия.</p>'+
    '<button class="btn ghost" data-gnew="1">Выбрать папку для данных</button>'+
    '<p class="small gsub">Впервые здесь — Grid начнёт с примера.</p>'+
    '<button class="gskip" data-gskip="1">Начать с нуля без папки</button></div>',gateWire,"how cols");
}
/* телефон и браузеры без папки: «Как устроен Grid» один раз, до «Понятно» */
function introSeen(){try{return localStorage.getItem("grid.intro")==="1";}catch(e){return true;}}
function introCard(){
  gateEl.classList.remove("work-only");
  showGate("<h1>Как устроен Grid</h1>"+howtoShort()+'<button class="btn" data-gok="1">Понятно</button>',gateWire,"how");
}
function gateWire(el){
  el.onclick=function(e){
    var t=e.target;
    if(t.closest("[data-howmore]")) openSettings("howto");
    else if(t.closest("[data-gok]")){try{localStorage.setItem("grid.intro","1");}catch(x){} gateClose();}
    else if(t.closest("[data-gfind]")) pickFolder(true,true).then(gateDone);
    else if(t.closest("[data-gnew]")) pickFolder(false,true).then(gateDone);
    else if(t.closest("[data-gskip]")) gateDone(true);
  };
}
function gateClose(){gateEl.onclick=null; gateEl.classList.add("work-only"); hideGate();}
function gateDone(ok){
  if(!ok) return;
  gateClose(); bkSet("gate",0).then(bkRefresh);
}
function folderStatus(){
  if(!folder()) return null;
  if(BK.perm&&BK.perm!=="granted") return {text:"Нет доступа к папке Grid",warn:true};
  if(BK.ahead) return {text:BK.ahead.dirty?"Две версии — выберите одну":"В папке новая версия",warn:true};
  if(BK.error) return {text:"Не сохранено в папку",warn:true};
  var at=BK.meta.dataAt,m=Math.floor((Date.now()-at)/60e3);
  return {text:!at?"Сохраняем в папку…":"Сохранено в папку · "+(m<1?"только что":m<60?m+" мин назад":fmtWhen(at))};
}
function renderFolderStat(){
  var el=$("#folderStat"),s=folderStatus();
  el.hidden=!s||document.body.classList.contains("gated");
  if(!s) return;
  el.className="fstat"+(s.warn?" warn":"");
  el.innerHTML=ic(s.warn?"urgent":"check")+"<span>"+esc(s.text)+"</span>";
  el.title="Папка Grid «"+folder().name+"» — открыть настройки";
}
/* плашка под шапкой: доступ, версия из папки, сбой записи */
function folderBarHTML(){
  var dir=folder(),a=BK.ahead; if(!dir) return "";
  var name=esc(dir.name),when=a?esc(fmtWhen(a.head.savedAt)):"";
  if(BK.perm&&BK.perm!=="granted") return "<span><b>Нет доступа к папке Grid «"+name+"».</b> Изменения пока хранятся в браузере "+
      "и попадут в папку, как только вы разрешите доступ. Чтобы браузер не спрашивал снова, выберите «Разрешать при каждом посещении».</span>"+
    '<span class="row"><button class="btn" data-bkallow="1">Разрешить доступ к папке Grid</button></span>';
  if(a&&a.dirty) return "<span><b>Данные изменены и здесь, и в папке Grid</b> (там версия от "+when+"). Выберите, какую оставить, — "+
      "вторая сохранится в истории папки.</span>"+
    '<span class="row"><button class="btn" data-fkeep="folder">Оставить версию из папки</button>'+
      '<button class="btn ghost" data-fkeep="browser">Оставить версию этого браузера</button></span>';
  if(a&&BK.later!==a.head.rev) return "<span><b>В папке Grid более новая версия</b> — от "+when+
      ", с другого компьютера или браузера.</span>"+
    '<span class="row"><button class="btn" data-fkeep="folder">Загрузить</button><button class="btn ghost" data-flater="1">Не сейчас</button></span>';
  if(BK.error) return "<span><b>Не удалось сохранить в папку Grid:</b> "+esc(BK.error)+". Изменения пока в браузере.</span>"+
    '<span class="row"><button class="btn" data-fretry="1">Повторить</button></span>';
  return "";
}
function renderFolderBar(){
  var el=$("#folderBar"),h=document.body.classList.contains("gated")?"":folderBarHTML();
  el.hidden=!h; el.innerHTML=h;
  el.classList.toggle("warn",!!h&&!(BK.ahead&&!BK.ahead.dirty&&!(BK.perm&&BK.perm!=="granted")&&!BK.error));
}
/* «Папка Grid» — один и тот же раздел в настройках Grid Work и Grid Life */
function folderBody(){
  var dir=folder(),hint='<p class="small">Выберите папку в Яндекс Диске, OneDrive или Google Диске — тогда данные будут и в облаке.</p>';
  if(!dir) return "<p>Grid может хранить данные в папке на компьютере — тогда очистка браузера их не сотрёт. Браузер остаётся "+
      "рабочей копией: изменения попадают в папку через несколько секунд, вложения — отдельными файлами.</p>"+
    '<div class="row"><button class="btn" data-bkfolder="1">Выбрать папку для данных</button></div>'+hint;
  var s=folderStatus(),denied=BK.perm&&BK.perm!=="granted";
  return "<p>Данные Grid хранятся в папке «<b>"+esc(dir.name)+"</b>», браузер — рабочая копия.</p>"+
    '<p class="fline'+(s.warn?" warn":"")+'">'+esc(s.text)+"</p>"+
    '<div class="row">'+(denied?'<button class="btn" data-bkallow="1">Разрешить доступ к папке Grid</button>':"")+
      '<button class="btn ghost" data-bkfolder="1">Сменить папку</button><button class="btn ghost" data-bkoff="1">Отключить</button></div>'+hint+
    "<h4>История в папке</h4>"+
    '<p class="small">По одной версии за день — последние 7 дней, когда вы работали с Grid, — и версии, отложенные при выборе.</p>'+
    (BK.history&&BK.history.length?'<div class="snaps">'+BK.history.map(function(n){
      return '<div class="snap"><span><b>'+esc(histLabel(n))+"</b></span>"+
        '<button class="btn ghost sm" data-fhist="'+esc(n)+'" aria-label="Загрузить версию: '+esc(histLabel(n))+'">Загрузить</button></div>';
    }).join("")+"</div>":'<p class="small">Пока пусто: первая версия появится завтра.</p>');
}

/* ── снимки ── */
function snapWhen(ts){return (new Date(ts).toDateString()===new Date().toDateString()?"сегодня, ":"")+fmtWhen(ts);}
/* before — снимок перед восстановлением; keep — снимок, который сейчас нельзя вытеснить */
function snapNow(before,keep){
  return Promise.all([bkDB(),bkState()]).then(function(r){
    var st=r[1],list=(BK.meta.snaps||[]).slice(),last=list[0];
    if(!st.work&&!st.life) return;
    if(last&&last.sig.work===st.sig.work&&last.sig.life===st.sig.life){
      list[0]=Object.assign({},last,{at:Date.now()}); return bkSet("snaps",list);   /* ничего не изменилось */
    }
    var id=uid("s"),keys=Object.keys(st.blobs),drop=[];
    list.unshift({id:id,at:Date.now(),before:!!before,sig:st.sig,size:st.size,keys:keys});
    while(list.length>KEEP){var i=list.length-1;if(list[i].id===keep)i--;drop.push(list.splice(i,1)[0]);}
    var used={}; list.forEach(function(s){s.keys.forEach(function(k){used[k]=1;});});
    return idbDone(BK.db.transaction("blobs").objectStore("blobs").getAllKeys()).then(function(have){
      var had={}; have.forEach(function(k){had[k]=1;});
      BK.meta.snaps=list;
      return bkTx(["snaps","blobs","meta"],function(t){
        var bs=t.objectStore("blobs"),ss=t.objectStore("snaps");
        keys.forEach(function(k){if(!had[k]) bs.put({key:k,blob:st.blobs[k]});});
        have.forEach(function(k){if(!used[k]) bs.delete(k);});
        ss.put({id:id,work:st.work,life:st.life});
        drop.forEach(function(s){ss.delete(s.id);});
        t.objectStore("meta").put({key:"snaps",value:list});
      });
    });
  });
}
function snapDaily(){
  var last=(BK.meta.snaps||[])[0];
  if(last&&new Date(last.at).toDateString()===new Date().toDateString()) return Promise.resolve();
  return snapNow(false).catch(function(e){flash("Снимок не сохранился: "+((e&&e.message)||""));});
}
/* часть снимка с файлами: part — "work" или "life" */
function snapLoad(id,part){
  return idbDone(BK.db.transaction("snaps").objectStore("snaps").get(id)).then(function(rec){
    var rows=rec&&rec[part]; if(!rows) throw new Error("снимок не найден");
    var os=BK.db.transaction("blobs").objectStore("blobs"),pre=part==="work"?"w:":"l:";
    return Promise.all((rows.files||[]).map(function(f){
      return idbDone(os.get(pre+f.id)).then(function(b){if(b) f.blob=b.blob;});
    })).then(function(){return rows;});
  });
}
function snapRestore(id,part){
  var s=find(BK.meta.snaps||[],id); if(!s) return;
  var what=part==="work"?"Grid Work":"Grid Life",other=part==="work"?"Grid Life":"Grid Work",when=snapWhen(s.at);
  GridLife.dialog("Вернуть "+what+" к снимку: "+when+"?","Всё, что изменилось в "+what+" после этого, пропадёт, "+other+
      " не изменится. Сначала сохранить текущее состояние снимком — чтобы можно было вернуться?",
    [["save","Сохранить текущее и восстановить","main"],["go","Восстановить без сохранения","danger"],["","Отмена"]]).then(function(v){
    if(!v) return;
    return snapLoad(id,part).then(function(rows){
      return (v==="save"?snapNow(true,id):Promise.resolve()).then(function(){
        if(part==="life") return GridLife.load(rows);
        S.open=null; S.openNote=null; closeDrawer();
        return S.store.replace(rows).then(renderAll);
      });
    }).then(function(){flash(what+" восстановлен из снимка: "+when);bkRefresh();});
  }).catch(function(e){flash("Не удалось восстановить: "+((e&&e.message)||""));});
}
/* «Удалить все данные Grid Life» убирает Grid Life и из снимков */
function snapDropLife(){
  return bkDB().then(function(){
    var list=(BK.meta.snaps||[]).filter(function(s){return s.sig.work;}).map(function(s){
      return Object.assign({},s,{sig:{work:s.sig.work,life:""},size:{work:s.size.work,life:0},
        keys:s.keys.filter(function(k){return k.indexOf("l:")!==0;})});
    }),keep={};
    list.forEach(function(s){keep[s.id]=1;});
    var gone=(BK.meta.snaps||[]).filter(function(s){return !keep[s.id];});
    BK.meta.snaps=list;
    return bkTx(["snaps","blobs","meta"],function(t){
      var ss=t.objectStore("snaps"),bs=t.objectStore("blobs");
      list.forEach(function(s){var r=ss.get(s.id);r.onsuccess=function(){if(r.result){r.result.life=null;ss.put(r.result);}};});
      gone.forEach(function(s){ss.delete(s.id);});
      var kr=bs.getAllKeys();
      kr.onsuccess=function(){kr.result.forEach(function(k){if(String(k).indexOf("l:")===0) bs.delete(k);});};
      t.objectStore("meta").put({key:"snaps",value:list});
    });
  });
}

/* ── напоминание и разделы настроек ── */
function copyEvery(){return BK.meta.every||prefs().backupEvery||"week";}
function copyDue(){
  var m=S.store&&S.store.meta||{},every=copyEvery();
  if(!BK.db||folder()||every==="never"||!(liveProjects().length||GridLife.hasData())) return false;
  var last=Math.max(BK.meta.lastCopyAt||0,m.lastBackupAt||0,BK.meta.snooze||0,m.started||0);
  return Date.now()-last>(every==="month"?30:7)*864e5;
}
/* плашка над доской и над списком Grid Life */
function copyNoticeHTML(){
  if(!copyDue()) return "";
  prepCopy();
  return "<span><b>Сохраните резервную копию.</b> Данные Grid хранятся только на этом устройстве — копия пригодится, "+
      "если с ним что-то случится.</span>"+
    '<span class="row"><button class="btn" data-bksave="1">Сохранить копию</button><button class="btn ghost" data-bksnooze="1">Позже</button></span>';
}
/* «Резервная копия» — один и тот же раздел в настройках Grid Work и Grid Life */
function copyBody(){
  prepCopy();
  var last=Math.max(BK.meta.lastCopyAt||0,(S.store&&S.store.meta&&S.store.meta.lastBackupAt)||0),dir=folder(),every=copyEvery();
  return "<p>Один файл со всем, что есть в Grid Work и Grid Life: проекты, задачи, заметки, файлы и настройки Grid Life "+
      "(без PIN). Его можно перенести на другое устройство.</p>"+
    '<p class="small">'+(last?"Последняя копия — "+esc(fmtWhen(last))+".":"Копий ещё не было.")+"</p>"+
    '<div class="row"><button class="btn" data-bksave="1">Сохранить копию</button>'+
      '<button class="btn ghost" data-bkrestore="1">Восстановить из файла</button></div>'+
    (SHARE_OK?'<p class="small">Откроется меню «Поделиться»: сохраните файл в «Файлы» или iCloud Drive либо отправьте себе в Telegram.</p>':"")+
    '<p class="small">При восстановлении проекты Grid Work из файла добавляются как новые, а задачи Grid Life заменяют текущие.</p>'+
    (dir?'<p class="small">Пока папка Grid подключена, Grid не напоминает о копии.</p>'
      :'<label class="opt"><span>Напоминать о копии</span><select class="in" data-bkevery="1">'+
        [["week","раз в неделю"],["month","раз в месяц"],["never","не напоминать"]].map(function(o){
          return '<option value="'+o[0]+'"'+(every===o[0]?" selected":"")+">"+o[1]+"</option>";}).join("")+"</select></label>");
}
/* «Снимки»: part — какой режим вернёт кнопка в этих настройках */
function snapsBody(part){
  var name=part==="work"?"Grid Work":"Grid Life",list=(BK.meta.snaps||[]).filter(function(s){return s.sig[part];});
  return "<p>Раз в день при открытии Grid сохраняет снимок данных Grid Work и Grid Life здесь же, на устройстве, и хранит "+
      "последние 7. Снимок выручит после ошибки — например, если удалили лишнее. От удаления приложения, очистки браузера "+
      "или смены устройства снимки не спасут: они лежат там же, где данные. Для этого нужна резервная копия.</p>"+
    (list.length?'<div class="snaps">'+list.map(function(s){
      var when=snapWhen(s.at);
      return '<div class="snap"><span><b>'+esc(when)+"</b>"+(s.before?" · перед восстановлением":"")+" · "+fmtSize(s.size[part])+"</span>"+
        '<button class="btn ghost sm" data-snap="'+esc(s.id)+'" data-part="'+part+'" aria-label="Восстановить '+name+" из снимка: "+
        esc(when)+'">Восстановить</button></div>';
    }).join("")+"</div>":'<p class="small">Снимков пока нет.</p>');
}
document.addEventListener("click",function(e){
  var t=e.target,b;
  if(t.closest("[data-bksave]")) saveCopy();
  else if(t.closest("[data-bkrestore]")) pickCopy();
  else if(t.closest("[data-bkfolder]")) pickFolder(false,false);
  else if(t.closest("[data-bkallow]")) allowFolder();
  else if(t.closest("[data-bkoff]")) folderOff();
  else if(t.closest("[data-bksnooze]")) bkSet("snooze",Date.now()).then(bkRefresh);
  else if((b=t.closest("[data-fkeep]"))) (b.dataset.fkeep==="folder"?takeFolder:keepBrowser)();
  else if(t.closest("[data-flater]")){BK.later=BK.ahead&&BK.ahead.head.rev;bkRefresh();}
  else if(t.closest("[data-fretry]")) saveFolder();
  else if((b=t.closest("[data-fhist]"))) loadHistory(b.dataset.fhist);
  else if(t.closest("[data-fstat]")) openSettings("folder");
  else if((b=t.closest("[data-snap]"))) snapRestore(b.dataset.snap,b.dataset.part);
});
document.addEventListener("change",function(e){if(e.target.matches("[data-bkevery]")) bkSet("every",e.target.value).then(bkRefresh);});
/* При открытии — снимок дня; папка: доступ, не записал ли её кто-то ещё, несохранённое.
   Grid открылся без данных, а папку подключить можно, — экран выбора папки с «Как устроен Grid»;
   папки нет — карточка «Как устроен Grid», пока её не закрыли «Понятно».
   При возвращении в Grid — то же для папки (её могли изменить с другого компьютера). */
function bkStart(){
  if(BK.started) return;
  BK.started=true;
  bkDB().then(function(){
    var dir=folder();
    if(FOLDER_OK&&!dir&&(BK.meta.gate||S.store.isFresh&&S.store.isFresh()&&!GridLife.used())){bkSet("gate",1);folderGate();}
    else if(!COLLAB&&!FOLDER_OK&&!introSeen()) introCard();
    return dir&&dir.queryPermission({mode:"readwrite"}).then(function(p){
      BK.perm=p;
      if(p==="granted") return readHistory(dir).then(saveFolder);
    });
  }).then(snapDaily).then(bkRefresh,function(e){flash("Снимки и папка Grid недоступны: "+errText(e));});
  document.addEventListener("visibilitychange",function(){
    if(document.hidden||!BK.db) return;
    snapDaily().then(bkRefresh);
    if(folder()) saveFolder();
  });
  window.addEventListener("focus",function(){if(BK.db&&folder()) saveFolder();});
  setInterval(renderFolderStat,30e3);
}

/* ═════════ настройки ═════════ */
var settingsEl=$("#settings");
S.feedScope="mine"; S.storageUsed=null;
function setSection(id,title,html){
  return '<section class="set" data-set="'+id+'"><div class="sect-h"><h3>'+esc(title)+"</h3></div>"+html+"</section>";
}
function groupHead(title,note){return '<div class="set-group"><h2>'+esc(title)+"</h2><p>"+esc(note)+"</p></div>";}
/* фото профиля: квадрат 160×160 из середины снимка, JPEG ~10 КБ — хранится прямо в профиле */
function pickPhoto(){
  filePick.value=""; filePick.accept="image/*";
  filePick.onchange=function(){
    var f=filePick.files&&filePick.files[0]; filePick.accept="";
    if(!f) return;
    var url=URL.createObjectURL(f),img=new Image();
    img.onload=function(){
      var s=Math.min(img.naturalWidth,img.naturalHeight),c=document.createElement("canvas");
      c.width=c.height=160;
      var g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,160,160);
      g.drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,0,0,160,160);
      URL.revokeObjectURL(url);
      patchProfile({avatar:c.toDataURL("image/jpeg",0.85)});
    };
    img.onerror=function(){URL.revokeObjectURL(url);flash("Не удалось открыть картинку");};
    img.src=url;
  };
  filePick.click();
}
/* личное: имя, фото и цвет — в задачах (и у коллег, когда есть сервер) */
function profileHTML(){
  var m=me()||{id:S.me,name:"",email:S.email,color:"",avatar:""};
  return setSection("profile","Мой профиль",
    '<div class="who-row"><div class="av-edit">'+avatar(m,"lg")+
      '<button class="lnk" data-pphoto="1">'+(m.avatar?"Сменить":"Фото")+"</button>"+
      (m.avatar?'<button class="lnk" data-pphotodel="1">Убрать</button>':"")+"</div><div>"+
      '<input class="in" data-pname="1" maxlength="40" placeholder="Ваше имя" aria-label="Ваше имя" value="'+esc(m.name)+'">'+
      (COLLAB?"<small>"+esc(m.email||"")+"</small>":"")+"</div></div>"+
    '<div class="tints" aria-label="Цвет инициалов">'+PALETTE.map(function(c){
      return '<button class="tint" data-pcolor="'+c+'" aria-pressed="'+(m.color===c)+
        '" aria-label="Цвет '+c+'" style="--ki:'+c+'"><i></i></button>';}).join("")+"</div>"+
    (COLLAB&&S.store.kind==="supabase"?'<div class="row"><button class="btn ghost" data-signout="1">Выйти из аккаунта</button></div>':""));
}
/* Без сервера «Участники» — просто имена: кого можно назначить ответственным.
   Список общий для всех проектов, первый в нём — вы (ваш профиль). */
function peopleHTML(){
  var list=people().filter(function(p){return p.id!==S.me;}),m=me();
  return setSection("people","Участники",
    "<p>Имена для поля «Ответственный» и фильтра. Список общий для всех проектов.</p>"+
    "<div>"+(m?'<div class="mrow">'+avatar(m)+'<span class="lbl"><b>'+esc(nameOf(m))+" (вы)</b><small>имя и фото — в «Мой профиль»</small></span></div>":"")+
      list.map(function(p){
        return '<div class="mrow">'+avatar(p)+'<input data-pplname="'+esc(p.id)+'" maxlength="40" value="'+esc(p.name)+
          '" aria-label="Имя участника">'+
          '<button class="x" data-ppldel="'+esc(p.id)+'" aria-label="Удалить «'+esc(nameOf(p))+'»" title="Удалить">'+X_BTN+"</button></div>";
      }).join("")+"</div>"+
    '<div class="invite"><input class="in" data-pplnew="1" maxlength="40" placeholder="Имя" aria-label="Имя нового участника" autocomplete="off">'+
      '<button class="btn" data-ppladd="1">Добавить</button></div>');
}
function addPerson(){
  var i=$("[data-pplnew]",settingsEl),v=(i?i.value:"").trim();
  if(!v){flash("Впишите имя");return;}
  var id=uid("m"),body={email:"",name:v,color:PALETTE[S.profiles.length%PALETTE.length],avatar:"",settings:{}};
  S.profiles.push(Object.assign({id:id},body)); w(S.store.set("profiles",id,body));
  renderAll(); renderSettings(true);
  var n=$("[data-pplnew]",settingsEl); if(n) n.focus();
}
function renamePerson(id,v){
  v=v.trim(); var p=person(id); if(!p) return;
  if(!v){renderSettings(true);return;}
  /* настройки не перерисовываем: имя в поле уже новое, а перерисовка под
     курсором съела бы нажатие на соседнюю кнопку */
  p.name=v; w(S.store.update("profiles",id,{name:v}));
  renderMain(); renderSide(); if(S.open||S.openNote) renderDrawer();
}
/* задачи удалённого участника остаются без ответственного */
function removePerson(id){
  var p=person(id),n=S.cards.filter(function(c){return c.assignee===id;});
  if(!p||!confirm("Удалить «"+nameOf(p)+"» из участников?"+(n.length?" Задач без ответственного станет: "+n.length+".":""))) return;
  n.forEach(function(c){c.assignee="";w(S.store.update("cards",c.id,{assignee:""}));});
  S.profiles=S.profiles.filter(function(x){return x.id!==id;}); w(S.store.del("profiles",id));
  if(S.filter.assignee===id) S.filter.assignee="all";
  renderAll(); renderSettings(true);
}
/* выбор личной настройки (prefs) из списка вариантов [значение, подпись] */
function prefPick(key,label,opts){
  var p=prefs();
  return '<label class="opt"><span>'+label+'</span><select class="in" data-pref="'+key+'">'+opts.map(function(o){
    return '<option value="'+o[0]+'"'+(String(p[key])===String(o[0])?" selected":"")+">"+o[1]+"</option>";}).join("")+"</select></label>";
}
function displayHTML(){
  var p=prefs();
  return setSection("display","Отображение",
    prefPick("view","Вид при открытии",[["board","Доска"],["calendar","Календарь"],["gantt","Диаграмма Ганта"]])+
    prefPick("density","Карточки",[["normal","Обычные"],["compact","Компактные"]])+
    prefPick("weekStart","Неделя начинается с",[[1,"понедельника"],[0,"воскресенья"]])+
    prefPick("dateFmt","Формат даты",[["short","27 окт"],["num","27.10.26"]])+
    '<label class="switch"><input type="checkbox" data-pref="hideDone"'+(p.hideDone?" checked":"")+">"+
      "<span><b>Скрывать выполненные задачи</b><small>Сразу при открытии Grid Work. Кнопка в шапке по-прежнему их показывает.</small></span></label>");
}
/* командные настройки проекта меняет владелец, остальные их видят */
function projectHTML(){
  var p=project(),own=isOwner();
  return setSection("project","Основное",
    (own?'<input class="in" data-projname="1" maxlength="80" aria-label="Название проекта" value="'+esc(p.name)+'">'+
        '<textarea class="in" data-projdescr="1" rows="3" maxlength="2000" placeholder="Описание: цель проекта, сроки, договорённости" aria-label="Описание проекта">'+
          esc(p.descr||"")+"</textarea>"
      :"<p><b>"+esc(p.name)+"</b></p>"+(p.descr?'<p class="pre">'+esc(p.descr)+"</p>":'<p class="small">Описания нет.</p>'))+
    '<label class="switch"><input type="checkbox" data-projmove="1"'+(p.doneMoveDefault!==false?" checked":"")+(own?"":" disabled")+">"+
      "<span><b>Переносить выполненные задачи</b><small>Сразу во всех колонках проекта и в новых: выполненная задача уезжает "+
      "в следующую колонку. У отдельной колонки перенос можно поменять в её меню «⋮».</small></span></label>");
}
/* перенос выполненных — сразу у всех колонок проекта; дальше колонку можно переопределить в её меню */
function setProjectMove(on){
  patchProject(S.project,{doneMoveDefault:on});
  cols().forEach(function(c){
    if(c.doneMove===on) return;
    c.doneMove=on; w(S.store.update("columns",c.id,{doneMove:on}));
  });
  renderMain();
  flash(on?"Перенос выполненных включён во всех колонках":"Перенос выполненных выключен во всех колонках");
}
/* команда проекта: список, роли, приглашения по почте (меняет только владелец) */
function teamHTML(){
  var own=isOwner(),demo=S.store.kind!=="supabase";
  var list=membersOf().slice().sort(function(a,b){
    return ROLES.map(function(r){return r.id;}).indexOf(a.role)-ROLES.map(function(r){return r.id;}).indexOf(b.role)||
      (nameOf(person(a.userId))||a.email).localeCompare(nameOf(person(b.userId))||b.email,"ru");});
  var rows=list.map(function(m){
    var p=person(m.userId),you=m.userId&&m.userId===S.me,r=find(ROLES,m.role)||ROLES[2];
    return '<div class="mrow">'+(p?avatar(p):'<span class="av sm ghost">@</span>')+
      '<span class="lbl"><b>'+esc(p?nameOf(p):m.email)+(you?" (вы)":"")+"</b>"+
        "<small>"+(m.userId?esc(p?p.email:m.email):"ждёт входа")+"</small></span>"+
      (own?'<select class="role" data-mrole="'+esc(m.id)+'" aria-label="Роль">'+ROLES.map(function(x){
          return '<option value="'+x.id+'"'+(x.id===m.role?" selected":"")+">"+x.label+"</option>";}).join("")+"</select>"+
        '<button class="x" data-mdel="'+esc(m.id)+'" aria-label="Убрать из проекта" title="Убрать из проекта">'+X_BTN+"</button>"
        :'<span class="role-l">'+r.label+"</span>")+"</div>";
  }).join("");
  return setSection("team","Участники и роли",
    "<div>"+rows+"</div>"+
    (own?'<div class="invite"><input class="in" type="email" data-inv="1" placeholder="Почта коллеги" aria-label="Почта коллеги" autocomplete="off">'+
        '<select class="in" data-invrole="1" aria-label="Роль">'+ROLES.map(function(x){
          return '<option value="'+x.id+'"'+(x.id==="editor"?" selected":"")+">"+x.label+"</option>";}).join("")+"</select>"+
        '<button class="btn" data-invite="1">Пригласить</button></div>'+
      '<p class="small">'+(demo?"В демо приглашение остаётся в списке, а войти по нему можно будет после подключения базы."
        :"Доступ откроется, когда человек войдёт в Grid через Google с этой почтой. Письмо Grid не отправляет — пришлите ссылку сами.")+"</p>"+
      (demo?"":'<div class="row"><button class="btn ghost" data-copylink="1">Скопировать ссылку на Grid</button></div>')
      :'<p class="small">Приглашать и менять роли может владелец проекта.</p>')+
    '<p class="small">'+ROLES.map(function(x){return "<b>"+x.label+"</b> — "+x.note;}).join("<br>")+"</p>");
}
function typesHTML(){
  var own=isOwner();
  function row(title,html,attr){
    return '<div class="tl"><div class="tl-h"><b>'+title+"</b>"+(own?'<button class="lnk" '+attr+">"+ic("pencil")+"Изменить</button>":"")+
      '</div><div class="chips">'+html+"</div></div>";
  }
  function kinds(scope){
    var l=kindsFor(scope).filter(function(k){return k.projectId;});
    return l.length?l.map(kindChip).join(""):'<span class="none">Своих пока нет</span>';
  }
  return setSection("types","Типы и статусы",
    row("Статусы задач",statusList().map(function(s){return '<span class="chip st" style="'+tint(s.color)+'">'+esc(s.label)+"</span>";}).join(""),'data-setstatus="1"')+
    row("Свои типы задач",kinds("task"),'data-setkinds="task"')+
    row("Свои типы заметок",kinds("note"),'data-setkinds="note"')+
    '<p class="small">Стандартные типы — Отчёты, Обучение, Идея и другие — есть в каждом проекте.'+
      (own?"":" Статусы и свои типы меняет владелец проекта.")+"</p>");
}
function backupHTML(){return setSection("backup","Резервная копия",copyBody());}
function folderHTML(){return FOLDER_OK?setSection("folder","Папка Grid",folderBody()):"";}
function snapsHTML(){return setSection("snaps","Снимки",snapsBody("work"));}
/* сколько места занято: с сервером — файлы в Supabase из 1 ГБ; на устройстве —
   всё, что браузер отвёл сайту (вместе с Grid Life и копией для работы без сети) */
function fetchStorage(){
  if(!S.store) return;
  if(S.store.kind==="supabase"){
    S.store.sb.rpc("grid_storage_used").then(function(r){
      if(!r.error){S.storageUsed=Number(r.data)||0; renderSettings();}});
    return;
  }
  if(navigator.storage&&navigator.storage.estimate) navigator.storage.estimate().then(function(e){S.estimate=e;renderSettings();},function(){});
  if(navigator.storage&&navigator.storage.persisted) navigator.storage.persisted().then(function(p){S.persisted=p;renderSettings();},function(){});
}
function storageHTML(){
  if(S.store.kind!=="supabase"){
    var est=S.estimate,lp=est&&est.quota?Math.min(100,Math.round(est.usage/est.quota*100)):0;
    return setSection("storage","Хранилище",
      "<p>"+esc(localNote())+"</p>"+
      (est&&est.quota?'<div class="meter-h"><span>'+fmtSize(est.usage)+" из "+fmtSize(est.quota)+"</span><span>"+lp+"%</span></div>"+
        '<div class="meter'+(lp>=80?" warn":"")+'" role="progressbar" aria-label="Занято места в браузере" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+lp+'">'+
          '<i style="width:'+lp+'%"></i></div>'+
        '<p class="small">Столько браузер отвёл этому сайту — вместе с Grid Life и копией приложения для работы без сети.</p>'
        :'<p class="small">Браузер не сообщает, сколько места свободно.</p>')+
      (S.persisted===true?'<p class="small">Браузер разрешил постоянное хранение и не удалит данные сам.</p>'
        :S.persisted===false?'<p class="small">Браузер пока не обещал хранить данные постоянно: при нехватке места он может их очистить. '+
          'Сохраняйте резервные копии.</p><div class="row"><button class="btn ghost" data-persist="1">Попросить постоянное хранение</button></div>':"")+
      '<div class="row"><button class="btn danger" data-reset="1">Очистить и начать с нуля</button></div>');
  }
  var used=S.storageUsed,cap=1073741824,pct=used==null?0:Math.min(100,Math.round(used/cap*100));
  return setSection("storage","Хранилище",
    '<div class="meter-h"><span>'+(used==null?"считаем…":fmtSize(used)+" из "+fmtSize(cap))+"</span><span>"+(used==null?"":pct+"%")+"</span></div>"+
    '<div class="meter'+(pct>=80?" warn":"")+'" role="progressbar" aria-label="Занято места" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'">'+
      '<i style="width:'+pct+'%"></i></div>'+
    '<p class="small">Бесплатный план Supabase — 1 ГБ на файлы всех проектов. Место освобождается, когда файлы удаляют.</p>');
}
/* В корзине — удалённое в этом проекте и удалённые проекты, где вы владелец.
   Задача, удалённая вместе с колонкой или задачей-родителем, входит в их строку. */
function trashItems(){
  var out=[];
  S.projects.forEach(function(p){
    if(p.deletedAt&&isOwner(p.id)) out.push({coll:"projects",x:p,title:p.name,what:"проект",back:true});});
  if(!S.project||!canEdit()) return out;
  S.columns.forEach(function(c){
    if(c.projectId!==S.project||!c.deletedAt) return;
    var n=S.cards.filter(function(k){return k.columnId===c.id&&!k.parentId&&!k.deletedAt;}).length;
    out.push({coll:"columns",x:c,title:c.title,what:"колонка"+(n?" · задач: "+n:""),back:isOwner()});
  });
  S.cards.forEach(function(c){
    if(c.projectId!==S.project||!c.deletedAt) return;
    var col=column(c.columnId),par=c.parentId&&card(c.parentId);
    if(!col||col.deletedAt||par&&par.deletedAt) return;
    out.push({coll:"cards",x:c,title:c.title,back:true,
      what:par?"подзадача «"+par.title+"»":"задача · колонка «"+col.title+"»"});
  });
  return out.sort(function(a,b){return b.x.deletedAt-a.x.deletedAt;});
}
function trashHTML(){
  var items=trashItems();
  if(!items.length&&!canEdit()) return "";
  var now=Date.now();
  return setSection("trash","Корзина",
    "<p>Удалённые проекты, колонки и задачи хранятся здесь "+TRASH_DAYS+" дней, потом стираются насовсем.</p>"+
    (items.length?'<div class="arch">'+items.map(function(it){
      var left=Math.max(1,TRASH_DAYS-Math.floor((now-it.x.deletedAt)/864e5)),key=it.coll+":"+it.x.id;
      var own=it.coll==="projects"?isOwner(it.x.id):isOwner();
      return '<div class="arow"><span class="t"><b>'+esc(it.title||"Без названия")+"</b><span>"+esc(it.what)+
          " · удалено "+esc(fmtWhen(it.x.deletedAt))+" · осталось "+left+" дн.</span></span>"+
        (it.back?'<button class="btn ghost" data-trestore="'+esc(key)+'">Вернуть</button>':"")+
        (own?'<button class="icon-btn" data-tpurge="'+esc(key)+'" title="Удалить навсегда" aria-label="Удалить навсегда">'+
          ic("trash")+"</button>":"")+"</div>";
    }).join("")+"</div>":'<div class="drop-hint">Корзина пуста.</div>'));
}
function restoreItem(coll,id){
  if(coll==="cards") restoreCard(id);
  else if(coll==="columns") patchColumn(id,{deletedAt:0});
  else{patchProject(id,{deletedAt:0});switchProject(id);}
  renderAll(); renderSettings(true);
}
/* версия — дата, когда страницу последний раз обновили на сайте */
function versionDate(){var d=new Date(document.lastModified);return isNaN(d)?"":d.getDate()+" "+MONTHS[d.getMonth()]+" "+d.getFullYear();}
/* Telegram для «Сотрудничество и отзывы»: обычная ссылка — пока её не нажали, Grid никуда не обращается */
function telegramName(){var n=String((window.GRID_CONFIG||{}).telegram||"").trim().replace(/^@/,"");return /^\w{5,32}$/.test(n)?n:"";}
/* шрифты лежат на сайте вместе с текстом лицензии (fonts/…/OFL.txt) */
var FONT_LICENSES=[["Golos Text","golos-text"],["Unbounded","unbounded"],["JetBrains Mono","jetbrains-mono"]];
/* «Как устроен Grid» полностью — без сервера; коротко — howtoShort */
function howtoFull(){
  return '<h4 data-set="howto">Как устроен Grid</h4><ul class="howto" data-howto="1">'+[
    "<b>Где данные.</b> Задачи, заметки, файлы и настройки хранятся только на этом устройстве, в браузере. "+
      "Grid ничего не отправляет на серверы, у автора нет к ним доступа.",
    "<b>Компьютер.</b> В Chrome, Edge и Яндекс Браузере выберите папку для данных: «Настройки» → «Папка Grid». "+
      "Тогда очистка браузера их не сотрёт. Если положить папку в Яндекс Диск или Google Диск (через их приложение "+
      "на компьютере), данные будут и в облаке, и на других ваших компьютерах. Работайте на одном компьютере за раз: "+
      "если версии разойдутся, Grid спросит, какую оставить, а вторую сохранит в истории папки.",
    "<b>Телефон.</b> Установите Grid на экран «Домой»: Safari → «Поделиться» → «На экран „Домой“». Иначе Safari "+
      "может стереть данные, если долго не открывать Grid. Автоматической синхронизации с телефоном нет.",
    "<b>Перенос.</b> «Настройки» → «Резервная копия» → «Сохранить копию». На телефоне откроется меню «Поделиться» — "+
      "сохраните файл в Яндекс Диск или «Файлы». На другом устройстве нажмите «Восстановить из файла».",
    "<b>Снимки.</b> Каждый день, когда вы открываете Grid, он сохраняет снимок в этом браузере — к нему можно вернуться "+
      "после неудачной правки. От очистки браузера снимки не спасут: для этого папка или резервная копия.",
    "<b>Защита.</b> Ставьте блокировку экрана на телефон и компьютер: кто откроет устройство, откроет и Grid. "+
      "Для Grid Life есть PIN и вход по Face ID, Touch ID или Windows Hello — «Приватность» в настройках Grid Life. "+
      "Это защита экрана, а не шифрование."
  ].map(function(s){return "<li>"+s+"</li>";}).join("")+"</ul>";
}
/* «О Grid» — одно и то же в настройках Grid Work и Grid Life */
function aboutBody(){
  var tg=telegramName();
  return "<p>"+(COLLAB?"Grid Work — доски для команды, Grid Life — личный календарь на этом устройстве."
      :"Grid Work — доски задач, Grid Life — личный календарь. Всё работает на этом устройстве.")+"</p>"+
    '<p class="small">Версия от '+esc(versionDate())+"</p>"+
    (tg?'<div class="row ab-tg"><a class="btn ghost" href="https://t.me/'+tg+'" target="_blank" rel="noopener noreferrer">'+
        'Сотрудничество и отзывы</a><span>Telegram: @'+tg+"</span></div>":"")+
    (COLLAB?"":howtoFull()+'<h4>Конфиденциальность</h4>'+
      "<p>Grid не собирает и не передаёт ваши данные: задачи, заметки, файлы и настройки хранятся только в браузере "+
        "этого устройства. Сайт размещён на GitHub Pages — как любой хостинг, GitHub видит обычные сведения о посещении "+
        "(адрес и браузер). Если вы напишете нам в Telegram, мы увидим ваш профиль Telegram и используем его только "+
        "для ответа.</p>"+
      '<h4>Условия</h4>'+
      "<p>Grid бесплатный и предоставляется как есть, без гарантий. За сохранность данных отвечаете вы: они хранятся "+
        "только на вашем устройстве, поэтому сохраняйте резервные копии.</p>")+
    '<h4>Лицензии</h4>'+
    '<ul class="ab-lic">'+FONT_LICENSES.map(function(f){
      return "<li>Шрифт "+f[0]+' — SIL Open Font License 1.1, <a href="fonts/'+f[1]+'/OFL.txt" target="_blank" rel="noopener">текст лицензии</a></li>';
    }).join("")+"<li>Значки нарисованы для Grid. "+(COLLAB?"Для совместной работы загружается библиотека supabase-js (лицензия MIT).":
      "Сторонних библиотек сайт не загружает.")+"</li></ul>"+
    '<p class="small">© 2026 Илья Емельянов. Все права защищены.</p>';
}
function aboutHTML(){return setSection("about","О Grid",aboutBody());}
function myFeed(){return S.feeds.filter(function(f){return f.userId===S.me;})[0]||null;}
function feedURL(f){return CFG.url.replace(/\/+$/,"")+"/functions/v1/grid-calendar?token="+f.id;}
function newToken(){
  var b=crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode.apply(null,b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function calendarsHTML(){
  var f=myFeed(),scope=f?f.scope:S.feedScope,block;
  if(S.store.kind!=="supabase"){
    block='<div class="drop-hint">Подписка заработает после подключения базы Supabase и функции календаря — '+
      "шаги в README. Отдельную задачу можно добавить в календарь уже сейчас: кнопки «В календарь» в панели задачи.</div>";
  }else{
    block='<div class="choice" role="radiogroup" aria-label="Какие задачи показывать в календаре">'+
        '<label><input type="radio" name="feedScope" value="mine"'+(scope==="mine"?" checked":"")+">"+
          "<span>Мои задачи<small>Где ответственный — вы</small></span></label>"+
        '<label><input type="radio" name="feedScope" value="all"'+(scope==="all"?" checked":"")+">"+
          "<span>Все задачи команды<small>Из всех ваших проектов</small></span></label></div>"+
      (f?'<div class="feed"><input readonly data-feedurl="1" aria-label="Ссылка на календарь" value="'+esc(feedURL(f))+'">'+
          '<button class="btn" data-feedcopy="1">Скопировать</button></div>'+
        '<details class="steps"><summary>Как добавить в Google Календарь</summary><ol>'+
          "<li>Откройте Google Календарь на компьютере.</li>"+
          "<li>Слева у «Другие календари» нажмите «+» → «Добавить по URL».</li>"+
          "<li>Вставьте ссылку и нажмите «Добавить календарь».</li></ol></details>"+
        '<details class="steps"><summary>Как добавить в Outlook</summary><ol>'+
          "<li>Откройте календарь в Outlook.</li>"+
          "<li>«Добавить календарь» → «Подписаться из Интернета».</li>"+
          "<li>Вставьте ссылку, задайте имя и нажмите «Импорт».</li></ol></details>"+
        '<div class="row"><button class="btn ghost" data-feednew="1">Перевыпустить ссылку</button>'+
          '<button class="btn danger" data-feedoff="1">Отключить</button></div>'+
        '<p class="small">Ссылка секретная: по ней задачи видит любой, у кого она есть. Если она попала не туда, '+
          "перевыпустите её — старая перестанет работать.</p>"
       :'<div class="row"><button class="btn" data-feednew="1">Создать ссылку</button></div>');
  }
  return setSection("calendars","Календари",
    "<p>Задачи с датами появятся в вашем Google Календаре или Outlook — на весь день, с даты начала по дедлайн. "+
    "Календарь сам забирает изменения раз в несколько часов, ускорить это нельзя. Правки в календаре в доску не возвращаются.</p>"+block);
}
/* ═════════ push-уведомления ═════════ */
/* Подписка браузера одна на устройство — общая для Grid Work и Grid Life.
   Открытый ключ VAPID отдаёт функция grid-push: если она не отвечает,
   уведомления владелец ещё не настроил. На iPhone push есть только у Grid,
   добавленного на экран «Домой» (iOS 16.4 и новее). */
function pushURL(){return CFG?CFG.url.replace(/\/+$/,"")+"/functions/v1/grid-push":"";}
function standalone(){return window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;}
function iosDevice(){var u=navigator.userAgent;return /iPhone|iPad|iPod/.test(u)||/Macintosh/.test(u)&&navigator.maxTouchPoints>1;}
/* "ok" — можно включить; "home" — iPhone в Safari, сначала на экран «Домой»;
   "denied" — запрещено в настройках браузера; "no" — браузер не умеет */
function pushSupport(){
  if(iosDevice()&&!standalone()) return "home";
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)) return "no";
  return Notification.permission==="denied"?"denied":"ok";
}
var pushKeyP=null;
function pushKey(){
  if(!pushKeyP) pushKeyP=fetch(pushURL()).then(function(r){return r.ok?r.json():{};}).then(function(d){
    if(!d.key) throw new Error("Уведомления ещё не настроены");
    return d.key;
  }).catch(function(e){pushKeyP=null;throw e;});
  return pushKeyP;
}
function b64uBytes(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  var r=atob(s+"===".slice((s.length+3)%4)),a=new Uint8Array(r.length);
  for(var i=0;i<r.length;i++) a[i]=r.charCodeAt(i);
  return a;
}
/* разрешение спрашиваем первым делом и прямо в нажатии — иначе Safari не покажет вопрос */
function askNotify(){
  var p=Notification.permission==="granted"?Promise.resolve("granted"):Notification.requestPermission();
  return p.then(function(r){if(r!=="granted") throw new Error("denied");});
}
/* подписка этого устройства; create — завести, если её нет (разрешение уже дано) */
function pushSubscription(create){
  return navigator.serviceWorker.ready.then(function(reg){
    return reg.pushManager.getSubscription().then(function(sub){
      if(sub||!create) return sub;
      return pushKey().then(function(key){
        return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uBytes(key)});});
    });
  });
}
function pushError(e){
  return e&&e.message==="denied"?"Уведомления запрещены — разрешите их для Grid в настройках браузера или телефона"
    :"Не удалось включить уведомления"+(e&&e.message?": "+e.message:"");
}
/* устройство в рассылке Grid Work; отметка — чей вход, чтобы после выхода
   или входа другим аккаунтом не приходили чужие уведомления */
var PUSH_FLAG="grid.push.work";
function workPushOn(){try{return !!S.me&&localStorage.getItem(PUSH_FLAG)===S.me;}catch(e){return false;}}
function setWorkPushFlag(on){try{if(on) localStorage.setItem(PUSH_FLAG,S.me); else localStorage.removeItem(PUSH_FLAG);}catch(e){}}
function subscribeWork(sub){
  var j=sub.toJSON();
  return S.sb.rpc("grid_push_subscribe",{p_endpoint:j.endpoint,p_key:j.keys.p256dh,p_auth:j.keys.auth})
    .then(function(r){if(r.error) throw r.error;});
}
/* 9:00 и тихие часы сервер считает по поясу этого телефона */
function saveTZ(){
  var tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"",s=prefs();
  if(!tz||s.tz===tz||!me()) return;
  s.tz=tz; patchProfile({settings:s});
}
function enableWorkPush(){
  askNotify().then(function(){return pushSubscription(true);}).then(subscribeWork).then(function(){
    setWorkPushFlag(true); saveTZ(); renderSettings(true);
    flash("Уведомления включены");
  }).catch(function(e){renderSettings(true);flash(pushError(e));});
}
function unsubscribeWork(){
  return pushSubscription(false).then(function(sub){
    if(!sub) return;
    return S.sb.rpc("grid_push_unsubscribe",{p_endpoint:sub.endpoint}).then(function(r){if(r.error) throw r.error;});
  });
}
function disableWorkPush(){
  unsubscribeWork().then(function(){setWorkPushFlag(false);flash("Уведомления на этом устройстве выключены");},
    function(e){flash("Не удалось выключить уведомления: "+(e&&e.message||"нет связи")+". Попробуйте ещё раз.");})
    .then(function(){renderSettings(true);});
}
/* при входе: подписка могла смениться — обновляем её в базе вместе с поясом.
   Без связи не беда: попробуем при следующем открытии */
function refreshWorkPush(){
  if(!workPushOn()||pushSupport()!=="ok"||Notification.permission!=="granted") return;
  pushSubscription(true).then(subscribeWork).then(saveTZ).catch(function(){});
}
/* при выходе устройство уходит из рассылки этого аккаунта; без связи всё
   равно выходим — устройство перейдёт к тому, кто войдёт на нём следующим */
function signOut(){
  if(!S.sb) return;
  (workPushOn()?unsubscribeWork().catch(function(){}):Promise.resolve()).then(function(){
    setWorkPushFlag(false); S.sb.auth.signOut();});
}
function sendTestPush(){
  S.sb.functions.invoke("grid-push",{body:{test:true}}).then(function(r){
    flash(r.data&&r.data.sent?"Пробное уведомление отправлено":"Не удалось отправить пробное уведомление"+
      (r.error&&r.error.message?": "+r.error.message:""));
  });
}
/* переключатель личной настройки (prefs) */
function prefSwitch(key,title,note){
  return '<label class="switch"><input type="checkbox" data-pref="'+key+'"'+(prefs()[key]?" checked":"")+"><span><b>"+title+"</b>"+
    (note?"<small>"+note+"</small>":"")+"</span></label>";
}
function quietHTML(){
  var p=prefs();
  return prefSwitch("quiet","Тихие часы",COLLAB?"Уведомления за это время придут, когда тихие часы закончатся."
      :"Напоминание, которое пришлось на них, Grid покажет, когда они закончатся.")+
    (p.quiet?'<div class="quiet"><input class="in" type="time" data-pref="quietFrom" value="'+esc(p.quietFrom)+'" aria-label="Тихие часы с">'+
      '<span>–</span><input class="in" type="time" data-pref="quietTo" value="'+esc(p.quietTo)+'" aria-label="Тихие часы до"></div>':"");
}
/* Системные уведомления браузера, пока Grid открыт (без сервера): спросить
   разрешение. Общее для Grid Work и Grid Life — его зовёт и life.js. */
function systemNotifyHTML(){
  var perm=window.Notification?Notification.permission:"none";
  return perm==="default"?'<div class="row"><button class="btn ghost" data-notifyask="1">Разрешить системные уведомления</button></div>'+
      '<p class="small">Тогда напоминание придёт, даже если вкладка Grid не на экране.</p>'
    :perm==="denied"?'<p class="small">Системные уведомления запрещены в настройках браузера — напоминания появляются внутри Grid.</p>':"";
}
function notifyHTML(){
  if(!COLLAB) return setSection("notify","Уведомления",
    "<p>Пока Grid открыт, он напоминает о дедлайнах ваших задач и задач без ответственного — за день и в день дедлайна, в 9:00.</p>"+
    prefSwitch("pushDue","Напоминать о дедлайнах")+quietHTML()+systemNotifyHTML()+
    "<p><b>Когда Grid закрыт.</b> Сохраните дедлайны в календарь телефона — он напомнит сам, даже без интернета.</p>"+
    '<div class="row"><button class="btn ghost" data-dueics="1">Файл .ics</button></div>'+
    '<p class="small">В файле — невыполненные задачи с дедлайном и напоминания за день и в день дедлайна в 9:00. '+
      "Когда дедлайны поменяются, сохраните файл заново.</p>");
  var p=prefs(),sup=pushSupport(),on=workPushOn()&&sup==="ok"&&Notification.permission==="granted",device;
  if(S.store.kind!=="supabase")
    device='<div class="drop-hint">Уведомления заработают после подключения базы Supabase и функции grid-push — шаги в README.</div>';
  else if(S.pushKey==="off")
    device='<div class="drop-hint">Уведомления ещё не настроены: владельцу Grid нужно развернуть функцию grid-push — шаги в README.</div>';
  else if(sup==="home")
    device='<div class="drop-hint">На iPhone уведомления приходят, только если Grid добавлен на экран «Домой»: Safari → «Поделиться» → '+
      "«На экран „Домой“». Потом откройте Grid с иконки и включите уведомления здесь.</div>";
  else if(sup==="no") device='<div class="drop-hint">Этот браузер не умеет показывать уведомления.</div>';
  else device='<label class="switch"><input type="checkbox" data-pushon="1"'+(on?" checked":"")+(sup==="denied"?" disabled":"")+">"+
      "<span><b>Уведомления на этом устройстве</b><small>"+(sup==="denied"
        ?"Запрещены в настройках браузера или телефона — разрешите их для Grid, затем включите здесь."
        :"Приходят, даже когда Grid закрыт.")+"</small></span></label>"+
    (on?'<div class="row"><button class="btn ghost" data-pushtest="1">Прислать пробное</button></div>':"");
  return setSection("notify","Уведомления",
    "<p>О задачах, где вы ответственный, а если ответственного нет — где вы автор.</p>"+device+
    prefSwitch("pushDue","Дедлайны","За день и в день дедлайна, в 9:00 по времени телефона.")+
    prefSwitch("pushAssigned","Вас назначили ответственным")+
    prefSwitch("pushComment","Комментарий к вашей задаче")+
    quietHTML());
}

/* ═════════ напоминания о дедлайнах без сервера ═════════ */
/* Пока Grid открыт: за день и в день дедлайна, в 9:00 — о ваших задачах и
   задачах без ответственного. В тихие часы напоминание ждёт их конца.
   Системное уведомление — если браузер разрешил, иначе подсказка в окне.
   После сна устройства пропущенное старше 10 минут не показываем. */
function mins(hm){var p=String(hm||"").split(":");return (+p[0]||0)*60+(+p[1]||0);}
function afterQuiet(ts){
  var p=prefs(); if(!p.quiet) return ts;
  var a=mins(p.quietFrom),b=mins(p.quietTo),d=new Date(ts),t=d.getHours()*60+d.getMinutes();
  if(a===b||!(a<b?t>=a&&t<b:t>=a||t<b)) return ts;
  return ts+((b-t+1440)%1440)*60000;
}
function mineToRemind(c){return !!c.due&&!c.done&&!c.archived&&onBoard(c)&&(!c.assignee||c.assignee===S.me);}
function dueBetween(from,to){
  var out=[];
  S.cards.filter(mineToRemind).forEach(function(c){
    [[-1,"Дедлайн завтра"],[0,"Дедлайн сегодня"]].forEach(function(k){
      var d=parseISO(c.due); d.setDate(d.getDate()+k[0]); d.setHours(9,0,0,0);
      var at=afterQuiet(d.getTime());
      if(at>from&&at<=to) out.push({c:c,at:at,what:k[1]});
    });
  });
  return out.sort(function(x,y){return x.at-y.at;});
}
var dueTickAt=Date.now();
function dueTick(){
  var now=Date.now(),from=Math.max(dueTickAt,now-600000); dueTickAt=now;
  if(COLLAB||!S.store||S.store.kind!=="local"||!prefs().pushDue) return;
  var due=dueBetween(from,now); if(!due.length) return;
  var x=due[0],p=project(x.c.projectId),body=x.what+(p?" · "+p.name:"")+(due.length>1?" · и ещё "+(due.length-1):"");
  if(window.Notification&&Notification.permission==="granted"&&navigator.serviceWorker&&navigator.serviceWorker.controller){
    navigator.serviceWorker.ready.then(function(reg){
      reg.showNotification(x.c.title||"Без названия",{body:body,tag:"due-"+x.c.id,icon:"icons/grid-192.png",
        data:{url:"grid.html#task="+encodeURIComponent(x.c.id)}});});
    return;
  }
  flash((x.c.title||"Без названия")+" — "+body,function(){location.hash="#task="+encodeURIComponent(x.c.id);},"Открыть");
}
setInterval(dueTick,20000);
/* дедлайны в календарь телефона: напоминания за день и в день, в 9:00 */
function deadlinesICS(){
  var list=S.cards.filter(mineToRemind);
  if(!list.length){flash("Нет невыполненных задач с дедлайном");return;}
  var now=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,""),lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Grid//Work//RU"];
  list.forEach(function(c){
    var next=parseISO(c.due); next.setDate(next.getDate()+1);
    lines.push("BEGIN:VEVENT","UID:"+c.id+"-due@grid","DTSTAMP:"+now,"DTSTART;VALUE=DATE:"+c.due.replace(/-/g,""),
      "DTEND;VALUE=DATE:"+iso(next).replace(/-/g,""),"SUMMARY:"+icsText("Дедлайн: "+(c.title||"Без названия")),
      "DESCRIPTION:"+icsText(calDetails(c)),"TRANSP:TRANSPARENT",
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsText("Дедлайн завтра"),"TRIGGER:-PT15H","END:VALARM",
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsText("Дедлайн сегодня"),"TRIGGER:PT9H","END:VALARM","END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  saveBlob(new Blob([lines.map(icsFold).join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}),"Grid Work — дедлайны.ics");
}
/* ключ VAPID спрашиваем при открытии настроек: так видно, настроены ли уведомления */
function checkPush(){
  if(!CFG||S.pushKey==="ok"||S.pushKey==="loading") return;
  S.pushKey="loading";
  pushKey().then(function(){S.pushKey="ok";},function(){S.pushKey="off";}).then(function(){renderSettings();});
}

/* ═════════ доступ к Grid — видит только владелец Grid ═════════ */
/* Войти в Grid Work могут приглашённые в любой проект и почты из списка
   grid_access. Список держит база: читать и менять его может только admin. */
function loadAccess(){
  if(!S.admin||!S.sb) return;
  S.sb.from("grid_access").select("email,admin,created_at").order("created_at").then(function(r){
    if(r.error){flash("Список доступа не загрузился: "+r.error.message);return;}
    S.access=r.data||[]; renderSettings();
  });
}
function accessHTML(){
  if(!S.admin||S.store.kind!=="supabase") return "";
  var list=S.access;
  return groupHead("Grid","Видите только вы — владелец Grid.")+setSection("access","Доступ к Grid",
    "<p>Войти в Grid Work могут почты, приглашённые в любой проект, и почты из этого списка — например, друзья, "+
      "у которых пока нет проекта: войдя, они смогут создать свой.</p>"+
    (!list?'<div class="drop-hint">Загружаем…</div>':!list.length?'<div class="drop-hint">Список пуст.</div>':"<div>"+list.map(function(a){
      return '<div class="mrow"><span class="lbl"><b>'+esc(a.email)+"</b><small>"+(a.admin?"владелец Grid":"в списке с "+esc(fmtWhen(Date.parse(a.created_at))))+
        "</small></span>"+(a.admin?"":'<button class="x" data-accdel="'+esc(a.email)+'" aria-label="Убрать из списка" title="Убрать из списка">'+X_BTN+"</button>")+"</div>";
    }).join("")+"</div>")+
    '<div class="invite"><input class="in" type="email" data-accin="1" placeholder="Почта" aria-label="Почта для доступа" autocomplete="off">'+
      '<button class="btn" data-accadd="1">Добавить</button></div>'+
    '<p class="small">Если почты нет ни в одном проекте, без этого списка войти с ней нельзя. Из проектов человека убирают в их настройках.</p>');
}
function addAccess(){
  var i=$("[data-accin]",settingsEl),v=(i?i.value:"").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){flash("Проверьте почту");return;}
  S.sb.from("grid_access").insert({email:v}).then(function(r){
    if(r.error){flash(r.error.code==="23505"?"Эта почта уже в списке":"Не удалось добавить: "+r.error.message);return;}
    flash("Почта "+v+" добавлена в список доступа"); loadAccess();
  });
}
function removeAccess(email){
  if(!confirm("Убрать "+email+" из списка доступа?")) return;
  S.sb.from("grid_access").delete().eq("email",email).then(function(r){
    if(r.error){flash("Не удалось убрать: "+r.error.message);return;}
    flash("Почта убрана из списка доступа"); loadAccess();
  });
}

/* сверху — личное, ниже — проект (меняет владелец, действует для всех), данные и о программе */
function settingsHTML(){
  var p=project()&&!project().deletedAt?project():null;
  if(!COLLAB) return drawerHead("Настройки")+'<div class="d-body wset">'+
    groupHead("Вы и участники","Профиль, имена для поля «Ответственный», вид и напоминания.")+
      profileHTML()+peopleHTML()+displayHTML()+notifyHTML()+
    (p?groupHead("Проект «"+p.name+"»","Название, перенос выполненных, статусы и свои типы.")+projectHTML()+typesHTML():"")+
    groupHead("Данные",localNote())+folderHTML()+backupHTML()+snapsHTML()+storageHTML()+trashHTML()+
    aboutHTML()+"</div>";
  return drawerHead("Настройки")+'<div class="d-body wset">'+
    groupHead("Лично для вас","Видите и меняете только вы.")+profileHTML()+displayHTML()+notifyHTML()+calendarsHTML()+
    (p?groupHead("Проект «"+p.name+"»",isOwner()?"Вы владелец: изменения действуют для всей команды."
        :"Меняет владелец проекта, действует для всей команды.")+projectHTML()+teamHTML()+typesHTML():"")+
    accessHTML()+
    groupHead("Данные","Копия, место для файлов и корзина.")+backupHTML()+storageHTML()+trashHTML()+
    aboutHTML()+"</div>";
}
function settingsOpen(){return settingsEl.classList.contains("on");}
function settingsContent(){return isWork()?settingsHTML():GridLife.settingsHTML();}
/* Перерисовка открытых настроек. Пока человек печатает в поле, её
   откладываем (force — перерисовать всё равно); прокрутку сохраняем. */
/* Пока в настройках нажата мышь или палец, не перерисовываем: иначе кнопка
   под курсором сменится и нажатие пропадёт (на устройстве данные меняются
   мгновенно — например, имя сохраняется в момент ухода из поля). Дорисуем
   сразу после нажатия. */
var settingsPressed=false,settingsPending=false;
function renderSettings(force){
  if(!settingsOpen()) return;
  if(!force&&settingsPressed){settingsPending=true;return;}
  var ae=document.activeElement;
  if(!force&&settingsEl.contains(ae)&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)&&ae.type!=="radio") return;
  var was=$(".d-body",settingsEl),keep=was?was.scrollTop:0;
  settingsEl.innerHTML=settingsContent();
  var now=$(".d-body",settingsEl); if(now&&keep) now.scrollTop=keep;
}
/* section — к какому разделу сразу прокрутить */
function openSettings(section){
  closeSide(); closeDrawer(); closeSheet();
  settingsEl.innerHTML=settingsContent();
  settingsEl.classList.add("on"); scrimEl.classList.add("on"); settingsEl.setAttribute("aria-hidden","false");
  var s=typeof section==="string"&&$('[data-set="'+section+'"],[data-lset="'+section+'"]',settingsEl);
  if(s) s.scrollIntoView({block:"start"});
  var b=$("[data-dclose]",settingsEl); if(b) b.focus({preventScroll:true});
  if(isWork()){fetchStorage();checkPush();loadAccess();}
}
function closeSettings(){
  if(!settingsOpen()) return;
  settingsEl.classList.remove("on"); scrimEl.classList.remove("on"); settingsEl.setAttribute("aria-hidden","true");
}
function createFeed(scope){
  var id=newToken(),body={userId:S.me,scope:scope,createdAt:Date.now()};
  S.feeds.push(Object.assign({id:id},body));
  w(S.store.set("feeds",id,body));
}
function dropFeed(f){
  S.feeds=S.feeds.filter(function(x){return x.id!==f.id;});
  w(S.store.del("feeds",f.id));
}
function patchProfile(patch){
  var m=me(); if(m) Object.assign(m,patch);
  w(S.store.update("profiles",S.me,patch));
  renderAll(); pushPresence();
}
function sendInvite(){
  var i=$("[data-inv]",settingsEl),r=$("[data-invrole]",settingsEl);
  if(i&&invite(i.value,r.value)){
    renderSettings(true);
    var n=$("[data-inv]",settingsEl); if(n) n.focus();
  }
}
function copyText(text,ok){
  navigator.clipboard.writeText(text).then(function(){flash(ok);},function(){flash("Не удалось скопировать");});
}
settingsEl.addEventListener("pointerdown",function(){settingsPressed=true;},true);
document.addEventListener("pointerup",function(){
  if(!settingsPressed) return;
  settingsPressed=false;
  if(settingsPending){settingsPending=false;setTimeout(function(){renderSettings();},0);}
},true);
settingsEl.addEventListener("click",function(e){
  var t=e.target,f=myFeed(),b;
  if(t.closest("[data-dclose]")){closeSettings();return;}
  /* разрешение на системные уведомления — общее для Grid Work и Grid Life */
  if(t.closest("[data-notifyask]")){Notification.requestPermission().then(function(){renderSettings(true);});return;}
  if(!isWork()) return;
  if(t.closest("[data-dueics]")){deadlinesICS();return;}
  if((b=t.closest("[data-pcolor]"))){patchProfile({color:b.dataset.pcolor});return;}
  if(t.closest("[data-pphoto]")){pickPhoto();return;}
  if(t.closest("[data-pphotodel]")){patchProfile({avatar:""});return;}
  if(t.closest("[data-signout]")){signOut();return;}
  if(t.closest("[data-pushtest]")){sendTestPush();return;}
  if(t.closest("[data-accadd]")){addAccess();return;}
  if((b=t.closest("[data-accdel]"))){removeAccess(b.dataset.accdel);return;}
  if(t.closest("[data-invite]")){sendInvite();return;}
  if(t.closest("[data-ppladd]")){addPerson();return;}
  if((b=t.closest("[data-ppldel]"))){removePerson(b.dataset.ppldel);return;}
  if((b=t.closest("[data-mdel]"))){removeMember(b.dataset.mdel);renderSettings(true);return;}
  if(t.closest("[data-copylink]")){copyText(location.origin+location.pathname,"Ссылка на Grid скопирована");return;}
  if((b=t.closest("[data-setstatus]"))){statusSheet(b);return;}
  if((b=t.closest("[data-setkinds]"))){kindList(b,b.dataset.setkinds);return;}
  if(t.closest("[data-reset]")){resetLocal();return;}
  if(t.closest("[data-persist]")){persistAsked=false;askPersist();return;}
  if((b=t.closest("[data-trestore]"))){var r=b.dataset.trestore.split(":");restoreItem(r[0],r.slice(1).join(":"));return;}
  if((b=t.closest("[data-tpurge]"))){
    var p=b.dataset.tpurge.split(":"),pid=p.slice(1).join(":");
    if(confirm("Удалить навсегда? Вернуть будет нельзя.")){purge(p[0],pid);renderSettings(true);}
    return;}
  if(t.closest("[data-feedcopy]")){
    var inp=$("[data-feedurl]",settingsEl);
    navigator.clipboard.writeText(inp.value).then(function(){flash("Ссылка скопирована");},
      function(){inp.select();flash("Скопируйте выделенную ссылку вручную");});
    return;}
  if(t.closest("[data-feednew]")){
    if(f&&!confirm("Старая ссылка перестанет работать, в календаре её нужно будет заменить. Перевыпустить?")) return;
    var scope=f?f.scope:S.feedScope;
    if(f) dropFeed(f);
    createFeed(scope); renderSettings(true); return;}
  if(t.closest("[data-feedoff]")){
    if(f&&confirm("Отключить ссылку? Задачи пропадут из календаря при его следующем обновлении.")){dropFeed(f);renderSettings(true);}
  }
});
settingsEl.addEventListener("keydown",function(e){
  if(e.key!=="Enter") return;
  if(e.target.matches("[data-inv]")){e.preventDefault();sendInvite();}
  else if(e.target.matches("[data-pplnew]")){e.preventDefault();addPerson();}
  else if(e.target.matches("[data-pplname]")){e.preventDefault();e.target.blur();}
  else if(e.target.matches("[data-accin]")){e.preventDefault();addAccess();}
  else if(e.target.matches("[data-pname],[data-projname]")) e.target.blur();
});
settingsEl.addEventListener("change",function(e){
  var t=e.target,v;
  if(!isWork()) return;
  if(t.matches("[data-pplname]")){renamePerson(t.dataset.pplname,t.value);return;}
  if(t.matches("[data-pname]")){
    v=t.value.trim(); if(!v){t.value=(me()||{}).name||"";return;}
    patchProfile({name:v}); return;}
  /* включение — прямо в нажатии: так Safari спросит разрешение */
  if(t.matches("[data-pushon]")){if(t.checked) enableWorkPush(); else disableWorkPush();return;}
  if(t.matches("[data-pref]")){
    var k=t.dataset.pref,s=prefs();
    v=t.type==="checkbox"?t.checked:k==="weekStart"?Number(t.value):t.type==="time"?t.value||PREFS[k]:t.value;
    s[k]=v;
    if(k==="view") S.tab=v;
    if(k==="hideDone"){S.filter.hideDone=v;$("#fDone").setAttribute("aria-pressed",String(v));}
    patchProfile({settings:s});
    if(k==="quiet") renderSettings(true);
    return;}
  if(t.matches("[data-projname]")){
    v=t.value.trim(); if(!v){t.value=projName();return;}
    patchProject(S.project,{name:v}); renderAll(); return;}
  if(t.matches("[data-projdescr]")){patchProject(S.project,{descr:t.value});return;}
  if(t.matches("[data-projmove]")){setProjectMove(t.checked);return;}
  if(t.matches("[data-mrole]")){setRole(t.dataset.mrole,t.value);return;}
  if(t.name!=="feedScope") return;
  var f=myFeed();
  if(f){f.scope=t.value;w(S.store.update("feeds",f.id,{scope:f.scope}));}
  else S.feedScope=t.value;
  renderSettings(true);
});

/* ═════════ события ═════════ */
mainEl.addEventListener("pointerdown",pointDown);
/* меню колонки: главный список и вложенные экраны внутри того же окна */
function colMenuHTML(col,view){
  function back(label,to){
    return '<button class="back" data-cview="'+(to||"main")+'">'+ic("chevL")+esc(label)+"</button>";
  }
  if(view==="move"){
    var others=liveProjects().filter(function(p){return p.id!==col.projectId&&canEdit(p.id);});
    return back("Переместить в проект")+(others.length?others.map(function(p){
        return '<button class="mi" data-cmoveto="'+esc(p.id)+'">'+ic("folder")+"<span>"+esc(p.name)+"</span></button>";
      }).join(""):'<p class="note">Других проектов, где вы можете править, пока нет. Создайте проект в боковой панели.</p>');
  }
  if(view==="sort") return back("Сортировать задачи по…")+SORTS.map(function(s){
      return '<button class="mi" data-cview="sort:'+s.id+'">'+ic(s.icon)+"<span>"+esc(s.label)+"</span>"+
        '<span class="more">'+ic("chevR")+"</span></button>";
    }).join("");
  if(view.indexOf("sort:")===0){
    var s=find(SORTS,view.slice(5));
    return back("По "+s.label.toLowerCase(),"sort")+
      '<button class="mi" data-csort="'+s.id+'" data-cdir="up">'+ic("up")+
        "<span>По возрастанию<small>"+esc(s.up)+"</small></span></button>"+
      '<button class="mi" data-csort="'+s.id+'" data-cdir="down">'+ic("down")+
        "<span>По убыванию<small>"+esc(s.down)+"</small></span></button>"+
      '<p class="note">Сортировка разовая: потом карточки можно снова двигать вручную.</p>';
  }
  if(view==="auto") return back("Перенос выполненных")+'<div class="pad">'+autoHTML(col)+"</div>";
  var t=doneTarget(col);
  return menuHTML([
      {act:"rename",icon:"pencil",label:"Переименовать"},
      {act:"archall",icon:"archive",label:"Архивировать все задачи"},
      {act:"archdone",icon:"archiveDone",label:"Архивировать выполненные"},
      {act:"view:move",icon:"move",label:"Переместить",more:""},
      {act:"dup",icon:"copy",label:"Дублировать"},
      {act:"view:sort",icon:"sort",label:"Сортировать задачи по…",more:""},
      {act:"view:auto",icon:"urgent",label:"Перенос выполненных",
        more:col.doneMove===false?"выкл.":t?t.title:"нет"}
    ])+
    '<hr><div class="cap">Цвет колонки</div>'+HUE_ROWS.map(function(row){
      return '<div class="hues">'+row.map(function(h){
        return '<button class="hue'+(h.id?"":" none")+'" data-hue="'+h.id+'" aria-pressed="'+((col.hue||"")===h.id)+
          '" aria-label="'+h.label+'" title="'+h.label+'"'+(h.id?' style="'+hueStyle(h.id)+'"':"")+"><i>"+ic("tick")+"</i></button>";
      }).join("")+"</div>";
    }).join("")+
    (isOwner(col.projectId)?"<hr>"+menuHTML([{act:"del",icon:"trash",label:"Удалить колонку",danger:true}]):"");
}
function openColMenu(el,col){
  var view="main";
  openSheet(el,colMenuHTML(col,view),function(sh){
    function go(v){
      view=v; sh.innerHTML=colMenuHTML(col,view);
      var f=$("button",sh); if(f) f.focus({preventScroll:true});
    }
    sh.addEventListener("click",function(ev){
      var b;
      if((b=ev.target.closest("[data-cview]"))){go(b.dataset.cview);return;}
      if((b=ev.target.closest("[data-hue]"))){
        patchColumn(col.id,{hue:b.dataset.hue}); sh.innerHTML=colMenuHTML(col,view); return;}
      if((b=ev.target.closest("[data-cmoveto]"))){closeSheet();moveColumn(col.id,b.dataset.cmoveto);return;}
      if((b=ev.target.closest("[data-csort]"))){closeSheet();sortColumn(col.id,b.dataset.csort,b.dataset.cdir==="down");return;}
      if(!(b=ev.target.closest("[data-act]"))) return;
      var a=b.dataset.act;
      if(a.indexOf("view:")===0){go(a.slice(5));return;}
      closeSheet();
      if(a==="rename"){S.renaming=col.id;renderMain();}
      else if(a==="archall") archiveColumn(col.id,false);
      else if(a==="archdone") archiveColumn(col.id,true);
      else if(a==="dup") duplicateColumn(col.id);
      else if(a==="del") removeColumn(col.id);
    });
    sh.addEventListener("change",function(ev){
      var t=ev.target;
      if(t.matches("[data-cmove]")) patchColumn(col.id,{doneMove:t.checked});
      else if(t.matches("[data-ctarget]")) patchColumn(col.id,{doneTarget:t.value});
      else return;
      sh.innerHTML=colMenuHTML(col,view);
    });
  },"menu");
}

mainEl.addEventListener("click",function(e){
  if(Date.now()-dropAt<220||calSwiped()) return;
  var t=e.target,el;
  /* календарь */
  if((el=t.closest("[data-wcview]"))){calSetView(el.dataset.wcview);return;}
  if((el=t.closest("[data-wcnav]"))){calStep(+el.dataset.wcnav);return;}
  if(t.closest("[data-wctoday]")){S.cal.cursor=S.cal.selected=todayISO();renderMain();if(S.cal.view==="list")listToToday();return;}
  if((el=t.closest("[data-wcgoto]"))){S.cal.selected=el.dataset.wcgoto;calSetView("day");return;}
  if((el=t.closest("[data-wcnew]"))){quickTask(el.dataset.wcnew);return;}
  if((el=t.closest("[data-wcday]"))){calDayClick(el.dataset.wcday);return;}
  if((el=t.closest("[data-check]"))){toggleDone(el.dataset.check);return;}
  if((el=t.closest("[data-expand]"))){
    setExpanded(el.dataset.expand,!S.expanded[el.dataset.expand]);renderMain();return;}
  if((el=t.closest("[data-cmenu]"))){cardMenu(el,el.dataset.cmenu);return;}
  if(t.closest("[data-addcol]")){addColumn();return;}
  if(t.closest("[data-addproj]")){
    var nm=prompt("Название проекта:","Новый проект");
    if(nm){var id=addProject(nm);if(id)switchProject(id);}
    return;}
  if((el=t.closest("[data-colmenu]"))){
    var col=column(el.dataset.colmenu); if(col) openColMenu(el,col);
    return;}
  if((el=t.closest("[data-colname]"))){S.renaming=el.dataset.colname;renderMain();return;}
  if((el=t.closest("[data-addcard]"))){S.composer=el.dataset.addcard;S.composerText="";renderMain();return;}
  if((el=t.closest("[data-compadd]"))){addCard(el.dataset.compadd,S.composerText);S.composerText="";renderMain();return;}
  if(t.closest("[data-compcancel]")){S.composer=null;S.composerText="";renderMain();return;}
  if((el=t.closest("[data-upload]"))&&el.dataset.upload==="project"){pickFile({});return;}
  if((el=t.closest("[data-fopen]"))){var f=find(S.files,el.dataset.fopen);if(f)openFile(f);return;}
  if((el=t.closest("[data-fdel]"))){var fd=find(S.files,el.dataset.fdel);if(fd)dropFile(fd);return;}
  if(t.closest("[data-nnew]")){addNote();return;}
  if((el=t.closest("[data-note]"))){openNote(el.dataset.note);return;}
  if((el=t.closest("[data-arestore]"))){setArchived(el.dataset.arestore,false);flash("Задача вернулась на доску");return;}
  if((el=t.closest("[data-adel]"))){trashCard(el.dataset.adel);return;}
  if((el=t.closest("[data-card]"))){openCard(el.dataset.card);return;}
});
mainEl.addEventListener("input",function(e){
  if(e.target.matches("[data-comp]")) S.composerText=e.target.value;
});
mainEl.addEventListener("keydown",function(e){
  if(e.target.matches("[data-comp]")){
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();
      addCard(e.target.dataset.comp,S.composerText);S.composerText="";renderMain();}
    if(e.key==="Escape"){S.composer=null;S.composerText="";renderMain();}
    return;}
  if(e.target.matches("[data-rename]")){
    if(e.key==="Enter"){e.preventDefault();e.target.blur();}
    /* прежнее название и уход из поля — дальше всё сделает обработчик focusout */
    if(e.key==="Escape"){var rc=column(e.target.dataset.rename);e.target.value=rc?rc.title:"";e.target.blur();}
    return;}
  if(e.key==="Enter"&&e.target.matches("[data-card]")){e.preventDefault();openCard(e.target.dataset.card);}
  if(e.key==="Enter"&&e.target.matches("[data-note]")){e.preventDefault();openNote(e.target.dataset.note);}
});
mainEl.addEventListener("focusout",function(e){
  if(e.target.matches("[data-rename]")){
    var id=e.target.dataset.rename,v=e.target.value.trim(),col=column(id);
    if(col&&v&&v!==col.title){col.title=v;w(S.store.update("columns",id,{title:v}));}
    S.renaming=null; renderMain();
  }
  if(e.target.matches("[data-comp]")){
    setTimeout(function(){
      if(S.composer&&!mainEl.contains(document.activeElement)){
        if(S.composerText.trim()) addCard(S.composer,S.composerText);
        S.composer=null;S.composerText="";renderMain();}
    },140);
  }
});
tabsEl.addEventListener("click",function(e){
  var t=e.target.closest("[data-tab]"); if(!t) return;
  S.tab=t.dataset.tab; renderMain();
});

/* панель задачи и заметки */
/* «+ Свой тип» и правка своих типов работают одинаково для задачи и заметки */
function kindClick(t,scope,current,assign){
  var el;
  if((el=t.closest("[data-kind]"))){assign(current===el.dataset.kind?"":el.dataset.kind);return true;}
  if((el=t.closest("[data-kindnew]"))){kindEditor(el,scope,null,assign);return true;}
  if((el=t.closest("[data-kindlist]"))){kindList(el,scope);return true;}
  return false;
}
drawerEl.addEventListener("click",function(e){
  var t=e.target,el;
  if(t.closest("button")) flushText();
  if(t.closest("[data-dclose]")){closeDrawer();return;}
  if(S.openNote){
    var n=find(S.notes,S.openNote); if(!n) return;
    if(kindClick(t,"note",n.kind,function(k){patchNote(n.id,{kind:k});})) return;
    if((el=t.closest("[data-ncolor]"))){patchNote(n.id,{color:el.dataset.ncolor});return;}
    if(t.closest('[data-upload="note"]')){pickFile({noteId:n.id});return;}
    if((el=t.closest("[data-fview]"))){var fv=find(S.files,el.dataset.fview);if(fv)showImage(fv);return;}
    if((el=t.closest("[data-fopen]"))){var fo=find(S.files,el.dataset.fopen);if(fo)openFile(fo);return;}
    if((el=t.closest("[data-fdel]"))){var fx=find(S.files,el.dataset.fdel);if(fx)dropFile(fx);return;}
    if(t.closest("[data-ndel]")) removeNote(n.id);
    return;
  }
  var c=S.open?card(S.open):null; if(!c) return;
  if(t.closest("[data-dcheck]")){toggleDone(c.id);return;}
  if((el=t.closest("[data-dprio]"))){patchCard(c.id,{priority:el.dataset.dprio});return;}
  if((el=t.closest("[data-dcolor]"))){patchCard(c.id,{color:el.dataset.dcolor});return;}
  if(kindClick(t,"task",c.kind,function(k){patchCard(c.id,{kind:k});renderDrawer(true);})) return;
  if((el=t.closest("[data-stlist]"))){statusSheet(el);return;}
  if(t.closest("[data-dics]")){downloadICS(c);return;}
  if((el=t.closest("[data-dsubcheck]"))){toggleDone(el.dataset.dsubcheck);return;}
  if((el=t.closest("[data-dopen]"))){openCard(el.dataset.dopen);return;}
  if((el=t.closest("[data-upload]"))&&el.dataset.upload==="card"){pickFile({cardId:c.id});return;}
  if((el=t.closest("[data-fopen]"))){var f=find(S.files,el.dataset.fopen);if(f)openFile(f);return;}
  if((el=t.closest("[data-fdel]"))){var fd=find(S.files,el.dataset.fdel);if(fd)dropFile(fd);return;}
  if(t.closest("[data-ksend]")){
    var box=$("[data-kadd]",drawerEl);
    if(box&&box.value.trim()){addComment(c.id,box.value);box.value="";}
    return;}
  if((el=t.closest("[data-kdel]"))){
    var kid=el.dataset.kdel;
    S.comments=S.comments.filter(function(k){return k.id!==kid;});
    w(S.store.del("comments",kid)); renderDrawer(true); renderMain(); return;}
  if(t.closest("[data-drestore]")){setArchived(c.id,false);flash("Задача вернулась на доску");return;}
  if(t.closest("[data-ddel]")) trashCard(c.id);
});
drawerEl.addEventListener("change",function(e){
  flushText();
  var c=S.open?card(S.open):null; if(!c) return;
  var t=e.target;
  if(t.matches("[data-dcol]")) moveCard(c.id,t.value,endOf(t.value));
  else if(t.matches("[data-dstatus]")) patchCard(c.id,{status:t.value});
  else if(t.matches("[data-dassign]")) patchCard(c.id,{assignee:t.value});
  else if(t.matches("[data-dstart]")) patchCard(c.id,{start:t.value||""});
  else if(t.matches("[data-ddue]")) patchCard(c.id,{due:t.value||""});
});
/* Текстовые поля сохраняются с задержкой, пока человек печатает. Любое
   другое действие в панели сначала дописывает отложенную правку — иначе она
   терялась, а перерисованная панель показывала старый текст. */
var TEXT_FIELDS={"data-dtitle":"title","data-ddesc":"desc","data-ntitle":"title","data-nbody":"body"};
var pendingText=null;
function flushText(){
  if(!pendingText) return;
  var p=pendingText; pendingText=null; clearTimeout(p.timer); p.run();
}
drawerEl.addEventListener("input",function(e){
  var t=e.target;
  if(t.matches(".d-title,[data-kadd]")){
    t.style.height="auto"; t.style.height=Math.min(t.scrollHeight,140)+"px";
  }
  var attr=Object.keys(TEXT_FIELDS).filter(function(a){return t.hasAttribute(a);})[0];
  var isNote=!!S.openNote,id=S.openNote||S.open,field=TEXT_FIELDS[attr],val=t.value;
  if(!attr||!id) return;
  if(pendingText&&pendingText.key!==id+field) flushText();
  if(pendingText) clearTimeout(pendingText.timer);
  pendingText={key:id+field,run:function(){
    var cur=isNote?find(S.notes,id):card(id); if(!cur) return;
    var v=field==="title"?(val.trim()||"Без названия"):val;
    if(cur[field]===v) return;
    var patch={}; patch[field]=v;
    if(isNote){patchNote(id,patch,true);return;}
    cur[field]=v;
    w(S.store.update("cards",id,patch));
    renderMain();
  }};
  pendingText.timer=setTimeout(flushText,420);
});
drawerEl.addEventListener("keydown",function(e){
  var t=e.target;
  if(t.matches(".d-title")&&e.key==="Enter"){e.preventDefault();t.blur();return;}
  var c=S.open?card(S.open):null; if(!c) return;
  if(t.matches("[data-dsubadd]")&&e.key==="Enter"){
    e.preventDefault();
    var v=t.value.trim(); if(!v) return;
    addSubtask(c.id,v);
    setTimeout(function(){var i=$("[data-dsubadd]",drawerEl);if(i)i.focus();},0);
  }
  if(t.matches("[data-kadd]")&&e.key==="Enter"&&!e.shiftKey){
    e.preventDefault();
    if(t.value.trim()){addComment(c.id,t.value);t.value="";}
  }
});
drawerEl.addEventListener("focusout",function(){setTimeout(function(){renderDrawer();},180);});
scrimEl.addEventListener("click",function(){closeDrawer();closeSettings();});
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape") return;
  if(lightboxEl) closeLightbox();
  else if(sheetEl) closeSheet(); else if(sideOpen()) closeSide(); else if(!isWork()&&GridLife.escape()) return;
  else if(settingsOpen()) closeSettings(); else if(S.open||S.openNote) closeDrawer();
});

$("#q").addEventListener("input",function(e){S.filter.q=e.target.value.trim();renderMain();});
$("#fAssignee").addEventListener("change",function(e){S.filter.assignee=e.target.value;renderMain();});
$("#fPriority").addEventListener("change",function(e){S.filter.priority=e.target.value;renderMain();});
$("#fDone").addEventListener("click",function(e){
  S.filter.hideDone=!S.filter.hideDone;
  e.currentTarget.setAttribute("aria-pressed",String(S.filter.hideDone)); renderMain();});
$("#fPriority").innerHTML='<option value="all">Любой приоритет</option>'+
  PRIOS.map(function(p){return '<option value="'+p.id+'">'+esc(p.label)+"</option>";}).join("");
$("#btnSide").addEventListener("click",function(){if(sideOpen())closeSide();else openSide();});
$("#btnMembers").addEventListener("click",function(){openSettings(COLLAB?"team":"people");});
$("#btnMe").addEventListener("click",function(){openSettings("profile");});
$("#boardTitle").addEventListener("click",function(e){
  var btn=e.currentTarget,p=project(); if(!p) return;
  var inp=document.createElement("input");
  inp.className="b-title-in"; inp.value=p.name;
  btn.replaceWith(inp); inp.focus(); inp.select();
  var fired=false;
  function finish(){
    if(fired) return; fired=true;
    var v=inp.value.trim()||p.name;
    inp.replaceWith(btn); btn.textContent=v;
    if(v!==p.name){p.name=v;w(S.store.update("projects",p.id,{name:v}));}
    renderAll();
  }
  inp.addEventListener("blur",finish);
  inp.addEventListener("keydown",function(ev){
    if(ev.key==="Enter")inp.blur();
    if(ev.key==="Escape"){inp.value=p.name;inp.blur();}});
});

/* ═════════ присутствие ═════════ */
var MYKEY=Math.random().toString(36).slice(2)+Date.now().toString(36);
function pushPresence(){
  if(!S.chan) return;
  var m=me();
  try{S.chan.track({key:MYKEY,who:m?nameOf(m).slice(0,40):"Гость",
    tint:m?safeColor(m.color):"#7F8C8D"});}catch(e){}
}
/* Правки коллег приходят через общий канал: база отдаёт каждому только то,
   что ему видно по правилам RLS. «Кто онлайн» — отдельный канал у каждого
   проекта: название из id проекта знают только его участники. */
function wireRealtime(sb,store){
  var ch=sb.channel("grid-board");
  COLLS.forEach(function(coll){
    ch.on("postgres_changes",{event:"*",schema:"public",table:coll},function(){
      /* сменился состав команды — у кого-то поменялось, что ему видно */
      if(coll==="project_members") COLLS.forEach(function(c){store.refetch(c);}); else store.refetch(coll);
    });
  });
  ch.subscribe();
  presenceFor(S.project);
  setInterval(pushPresence,45000);
}
/* presCh — канал «кто онлайн» текущего проекта; S.chan — он же, когда подписка подтверждена */
var presFor,presCh=null;
function presenceFor(pid){
  if(!S.sb||!S.store||S.store.kind!=="supabase"||presFor===(pid||null)) return;
  presFor=pid||null;
  if(presCh){S.sb.removeChannel(presCh);presCh=null;S.chan=null;}
  S.peers=[]; renderPresence();
  if(!pid) return;
  var ch=presCh=S.sb.channel("grid-presence-"+pid);
  ch.on("presence",{event:"sync"},function(){
    var st=ch.presenceState(),list=[];
    Object.keys(st).forEach(function(k){(st[k]||[]).forEach(function(p){
      list.push({kind:"viewer",isMe:p.key===MYKEY,
        presence:{who:typeof p.who==="string"?p.who:"Гость",tint:p.tint}});});});
    if(presFor===pid){S.peers=list;renderPresence();}
  });
  ch.subscribe(function(status){if(status==="SUBSCRIBED"&&presFor===pid){S.chan=ch;pushPresence();}});
}

/* ═════════ запуск ═════════ */
function attach(store){
  S.store=store; S.mode=store.kind;
  var loaded={};
  COLLS.forEach(function(coll){
    store.subscribe(coll,function(rows){
      S[coll]=rows;
      if(coll==="profiles"&&!S.prefsOn&&me()){S.prefsOn=true;applyPrefs();if(store.kind==="supabase")refreshWorkPush();}
      renderMain();
      if(S.open||S.openNote) renderDrawer();
      renderSide(); renderSettings();
      openFromHash();
      if(coll==="profiles") pushPresence();
      bkChanged();
      /* когда загрузилось всё, владелец чистит корзину от просроченного; на устройстве — снимок дня */
      if(!loaded.all){loaded[coll]=1;
        if(COLLS.every(function(c){return loaded[c];})){loaded.all=1;purgeOld();if(store.kind==="local") bkStart();}}
    });
  });
}
/* Плашка над доской (без сервера): при первом запуске — что это пример и
   где хранятся данные; потом — мягкое напоминание о резервной копии. */
/* где лежат данные: в браузере — или, если подключена, в папке Grid */
function localNote(){
  var dir=folder();
  return dir?"Данные хранятся в папке Grid «"+dir.name+"» на этом компьютере, браузер — рабочая копия. Сам Grid никуда их не отправляет."
    :"Все данные хранятся только на этом устройстве и никуда не отправляются. "+
      "Сохраняйте резервную копию: при очистке браузера или смене устройства данные пропадут.";
}
function renderNotice(){
  var el=$("#notice"),m=S.store&&S.store.kind==="local"&&!COLLAB?S.store.meta:null,copy;
  if(!m||!isWork()){el.hidden=true;el.innerHTML="";return;}
  if(m.sample){
    el.hidden=false;
    el.innerHTML='<span><b>Это пример</b> — проекты, задачи и заметки, чтобы было видно, как всё устроено. '+esc(localNote())+"</span>"+
      '<span class="row"><button class="btn" data-nreset="1">Очистить и начать с нуля</button>'+
      '<button class="btn ghost" data-nkeep="1">Оставить пример</button></span>';
  }else if((copy=copyNoticeHTML())){el.hidden=false;el.innerHTML=copy;}
  else{el.hidden=true;el.innerHTML="";}
}
/* «Очистить и начать с нуля»: всё Grid Work на устройстве, кроме вашего профиля */
function resetLocal(){
  if(!confirm("Удалить все проекты, задачи, заметки и файлы Grid Work на этом устройстве? Ваш профиль останется.\n\n"+
    "Вернуть их можно из снимка (Настройки → Снимки) или из резервной копии.")) return;
  S.open=null; S.openNote=null; closeDrawer(); closeSettings();
  S.store.reset().then(function(){renderAll();flash("Grid Work очищен — можно начинать с нуля");});
}
$("#notice").addEventListener("click",function(e){
  var t=e.target;
  if(t.closest("[data-nreset]")) resetLocal();
  else if(t.closest("[data-nkeep]")) S.store.setMeta("sample",false).then(renderNotice);
});
/* без сервера Grid Work открывается сразу — данные на этом устройстве */
function startLocal(){
  var st=localStore();
  st.ready.then(function(m){S.me=m.me;attach(st);},function(e){
    mainEl.innerHTML='<div class="empty"><h2>Доска не открылась</h2><p>Браузер не дал хранить данные на устройстве'+
      (e&&e.message?": "+esc(e.message):"")+". Проверьте, не включён ли режим инкогнито с запретом хранения.</p></div>";
  });
}
try{S.project=localStorage.getItem("grid.project")||null;}catch(e){}
try{(JSON.parse(localStorage.getItem("grid.expanded"))||[]).forEach(function(id){S.expanded[id]=true;});}catch(e){}
renderRail(); renderTabs();

/* без совместной работы ключи и вход не нужны: прежние ключи (grid.cfg) и
   сессии Supabase (sb-…) из браузера убираем */
if(!COLLAB){try{Object.keys(localStorage).forEach(function(k){
  if(k==="grid.cfg"||k==="grid.push.work"||/^sb-/.test(k)) localStorage.removeItem(k);});}catch(e){}}
var CFG=COLLAB&&window.GRID_CONFIG.url?window.GRID_CONFIG:null;
if(COLLAB&&!CFG){try{var raw=localStorage.getItem("grid.cfg");
  if(raw){var o=JSON.parse(raw);if(o&&o.url&&o.anonKey)CFG=o;}}catch(e){}}
var AUTH=(CFG&&CFG.auth)||"google";

function hideGate(){gateEl.hidden=true;gateEl.innerHTML="";document.body.classList.remove("gated");}
function showGate(html,wire,cls){
  gateEl.hidden=false; document.body.classList.add("gated");
  gateEl.innerHTML='<div class="gate-box'+(cls?" "+cls:"")+'">'+html+"</div>";
  if(wire) wire(gateEl);
}
/* в демо «вы» — один из примеров; кого выбрать, решают в настройках профиля */
function demoMode(){hideGate();startLocal();}
function setupScreen(msg){
  showGate('<div class="gate-mark">Grid Work</div><h1>Подключите базу</h1>'+
    "<p>Доски хранятся в Supabase. Вставьте адрес проекта и публичный ключ <code>anon</code> — они лежат в Supabase в разделе Project&nbsp;Settings → API.</p>"+
    (msg?'<div class="msg bad">'+esc(msg)+"</div>":"")+
    '<div class="fld"><label for="gu">Project URL</label><input id="gu" placeholder="https://xxxx.supabase.co" autocomplete="off" spellcheck="false"></div>'+
    '<div class="fld"><label for="gk">Anon key</label><input id="gk" placeholder="eyJhbGciOi…" autocomplete="off" spellcheck="false"></div>'+
    '<button class="btn" id="gsave">Подключить</button>'+
    '<button class="btn ghost" id="gdemo">Сначала посмотреть демо</button>'+
    '<p class="small">Ключ <code>anon</code> не секретный — он рассчитан на работу в браузере. Данные защищает вход и правила доступа на стороне базы.</p>',
  function(el){
    $("#gsave",el).addEventListener("click",function(){
      var u=$("#gu",el).value.trim().replace(/\/+$/,""),k=$("#gk",el).value.trim();
      if(!/^https:\/\/[^ ]+$/.test(u)||!k){
        setupScreen("Проверьте адрес проекта и ключ — одно из полей пустое или заполнено неверно.");return;}
      try{localStorage.setItem("grid.cfg",JSON.stringify({url:u,anonKey:k,auth:AUTH}));}catch(e){}
      location.reload();
    });
    $("#gdemo",el).addEventListener("click",demoMode);
  });
}
function signInScreen(sb,msg,kind){
  var provider=(AUTH==="github")?"github":"google";
  var pname=(provider==="github")?"GitHub":"Google";
  var body='<div class="gate-mark">Grid Work</div><h1>Вход на доску</h1>'+
    "<p>Доски общие для команды — войдите, чтобы видеть задачи и сохранять изменения.</p>"+
    (msg?'<div class="msg '+(kind||"bad")+'">'+esc(msg)+"</div>":"");
  if(AUTH==="email"){
    body+='<div class="fld"><label for="gm">Рабочая почта</label>'+
      '<input id="gm" type="email" placeholder="you@company.com" autocomplete="email"></div>'+
      '<button class="btn" id="gmail">Прислать ссылку для входа</button>';
  }else body+='<button class="btn" id="goauth">Войти через '+pname+"</button>";
  body+='<button class="btn ghost" id="gdemo">Посмотреть демо без входа</button>'+
    '<p class="small">Вход — по приглашению: подойдёт почта, которую пригласили в проект.</p>';
  showGate(body,function(el){
    $("#gdemo",el).addEventListener("click",demoMode);
    var o=$("#goauth",el);
    if(o) o.addEventListener("click",function(){
      o.disabled=true; o.textContent="Открываем "+pname+"…";
      sb.auth.signInWithOAuth({provider:provider,
        options:{redirectTo:location.origin+location.pathname}})
        .then(function(r){if(r&&r.error) signInScreen(sb,r.error.message);});
    });
    var m=$("#gmail",el);
    if(m) m.addEventListener("click",function(){
      var email=($("#gm",el).value||"").trim();
      if(!/.+@.+\..+/.test(email)){signInScreen(sb,"Введите корректный адрес почты.");return;}
      m.disabled=true; m.textContent="Отправляем…";
      sb.auth.signInWithOtp({email:email,options:{emailRedirectTo:location.origin+location.pathname}})
        .then(function(r){
          if(r&&r.error) signInScreen(sb,r.error.message);
          else signInScreen(sb,"Письмо отправлено на "+email+". Откройте ссылку из него — можно на любом устройстве.","ok");});
    });
  });
}
/* после входа база заводит профиль и принимает приглашения на эту почту —
   только потом грузим данные, чтобы новые проекты сразу были видны */
function start(sb,user){
  if(S.started) return; S.started=true;
  S.me=user.id; S.email=String(user.email||"").toLowerCase();
  hideGate();
  sb.rpc("grid_after_login").then(function(r){
    if(r&&r.error) flash("База не приняла вход: "+r.error.message+". Возможно, схему нужно выполнить заново — см. README.");
    var a=r&&r.data;
    if(a&&a.allowed===false){deny(sb);return;}
    S.admin=!!(a&&a.admin);
    var st=supaStore(sb);
    attach(st); wireRealtime(sb,st);
  });
}
/* Почта не приглашена ни в один проект и нет в списке доступа: выходим
   (страница перезагрузится) и на экране входа объясняем, что делать. */
var DENIED="grid.denied";
function deny(sb){
  try{sessionStorage.setItem(DENIED,S.email);}catch(e){}
  sb.auth.signOut();
}
function deniedMessage(){
  var m="";
  try{m=sessionStorage.getItem(DENIED)||"";sessionStorage.removeItem(DENIED);}catch(e){}
  return m?"Почта "+m+" не приглашена в Grid Work. Попросите владельца проекта пригласить её, а потом войдите снова. Grid Life работает и без входа.":"";
}
/* отказ Supabase при входе (например, проверка почты перед регистрацией) приходит в адресе страницы */
function authRedirectError(){
  var p=new URLSearchParams((location.hash||"").replace(/^#/,"")+"&"+(location.search||"").replace(/^\?/,"")),d=p.get("error_description");
  if(!d) return "";
  history.replaceState(null,"",location.pathname);
  return "Не удалось войти: "+d;
}
function boot(){
  if(!window.supabase||!window.supabase.createClient){
    showGate('<div class="gate-mark">Grid Work</div><h1>Библиотека не загрузилась</h1>'+
      "<p>Не удалось получить supabase-js с CDN. Проверьте соединение и обновите страницу.</p>"+
      '<button class="btn ghost" id="gdemo">Посмотреть демо</button>',
      function(el){$("#gdemo",el).addEventListener("click",demoMode);});
    return;
  }
  var sb,refused=authRedirectError()||deniedMessage();
  try{sb=window.supabase.createClient(CFG.url,CFG.anonKey);}
  catch(e){setupScreen("Не удалось подключиться: "+((e&&e.message)||"проверьте адрес и ключ."));return;}
  S.sb=sb;
  sb.auth.onAuthStateChange(function(ev,session){
    if(session&&!S.started) start(sb,session.user);
    else if(ev==="SIGNED_OUT") location.reload();
  });
  sb.auth.getSession().then(function(r){
    if(r&&r.data&&r.data.session) start(sb,r.data.session.user); else signInScreen(sb,refused);
  }).catch(function(){signInScreen(sb,refused);});
}
/* С сервером рабочая часть запускается при первом входе в Grid Work: библиотеку
   Supabase грузим только тогда, и Grid Life не зависит ни от сети, ни от входа.
   Без сервера данные Grid Work грузятся при открытии Grid в любом режиме. */
var workBooted=false;
function bootWork(){
  if(workBooted) return; workBooted=true;
  if(!COLLAB){startLocal();return;}
  if(!CFG){setupScreen();return;}
  var sc=document.createElement("script");
  sc.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  sc.onload=sc.onerror=boot;
  document.head.appendChild(sc);
}

/* ═════════ режимы: Grid Work и Grid Life ═════════ */
var root=document.documentElement,lifeMain=$("#lifeMain");
function isWork(){return root.dataset.mode!=="life";}
function setMode(m){
  var changed=root.dataset.mode!==m,life=m==="life";
  closeSheet(); closeSide(); closeSettings(); closeDrawer(); GridLife.close();
  root.dataset.mode=m;
  try{localStorage.setItem("grid.mode",m);}catch(e){}
  document.title=life?"Grid Life":"Grid Work";
  $("#modeName").textContent=life?"Life":"Work";
  var sw=$("#modeSwitch");
  sw.setAttribute("aria-checked",String(life));
  sw.title=life?"Перейти в Grid Work":"Перейти в Grid Life";
  $("#modeIcon").innerHTML=ic(life?"leaf":"briefcase");
  $("#btnSide").title=life?"Календарь и типы задач":"Проекты";
  $("#btnSide").setAttribute("aria-label",life?"Календарь и типы задач":"Проекты");
  sideEl.setAttribute("aria-label",life?"Grid Life":"Проекты");
  if(life) GridLife.show(lifeMain); else bootWork();
  if(changed){
    var shown=life?lifeMain:mainEl;
    shown.classList.remove("mode-in"); void shown.offsetWidth; shown.classList.add("mode-in");
  }
}
$("#modeSwitch").addEventListener("click",function(){setMode(isWork()?"life":"work");});

/* ═════════ прокрутка под открытой панелью ═════════ */
/* Пока открыта панель или окно (задача, настройки, боковая панель, выбор,
   вопрос, экран PIN, экран папки), страница под ними не прокручивается, а
   после закрытия стоит на прежнем месте. Прокрутку панели у края держит CSS
   (overscroll-behavior), но Safari на iPhone всё равно тянет страницу, если
   палец лёг на шапку панели или на фон, — такие касания гасим сами: сдвинуться
   может только прокручиваемая часть панели и только пока ей есть куда. */
var OVERLAYS="#settings.on,#drawer.on,#lifePanel.on,.side.on,.sheet,.ldialog,.llock,#gate:not([hidden])";
var lockY=0,touch0=null;
function syncLock(){
  var on=!!document.querySelector(OVERLAYS),root=document.documentElement;
  if(on===root.classList.contains("locked")) return;
  if(on) lockY=window.scrollY;
  root.classList.toggle("locked",on);
  if(!on&&window.scrollY!==lockY) window.scrollTo(0,lockY);
}
function watchLock(){
  var mo=new MutationObserver(syncLock);
  mo.observe(document.body,{childList:true});           /* окна выбора, вопросы и экран PIN — новые узлы body */
  ["settings","drawer","lifePanel","side","gate"].forEach(function(id){
    var el=document.getElementById(id); if(el) mo.observe(el,{attributes:true,attributeFilter:["class","hidden"]});
  });
  syncLock();
}
/* может ли элемент ещё прокрутиться: d>0 — палец идёт вниз (к началу), d<0 — вверх (к концу) */
function canScroll(el,vert,d){
  var cs=getComputedStyle(el),ov=vert?cs.overflowY:cs.overflowX;
  if(ov!=="auto"&&ov!=="scroll") return false;
  var pos=vert?el.scrollTop:el.scrollLeft,max=vert?el.scrollHeight-el.clientHeight:el.scrollWidth-el.clientWidth;
  return max>1&&(d>0?pos>0:pos<max-1);
}
document.addEventListener("touchstart",function(e){
  var t=e.touches[0]; touch0=e.touches.length===1?{x:t.clientX,y:t.clientY}:null;
},{passive:true});
document.addEventListener("touchmove",function(e){
  if(!touch0||!document.documentElement.classList.contains("locked")||e.touches.length!==1) return;
  var t=e.target;
  if(t===document.activeElement&&/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;   /* выделяют текст в поле */
  var p=e.touches[0],dx=p.clientX-touch0.x,dy=p.clientY-touch0.y,vert=Math.abs(dy)>=Math.abs(dx);
  for(var el=t;el&&el.nodeType===1&&el!==document.body;el=el.parentNode){if(canScroll(el,vert,vert?dy:dx)) return;}
  if(e.cancelable) e.preventDefault();
},{passive:false});

/* общие помощники для life.js */
window.GridKit={$:$,$$:$$,esc:esc,uid:uid,clamp:clamp,ic:ic,ICONS:ICONS,ICON_CHOICES:ICON_CHOICES,
  TINTS:TINTS,tint:tint,PRIOS:PRIOS,prioVar:prioVar,prioSoft:prioSoft,MONTHS:MONTHS,MONTHS_FULL:MONTHS_FULL,
  WEEK:WEEK,iso:iso,parseISO:parseISO,todayISO:todayISO,shortDate:shortDate,daysBetween:daysBetween,
  fmtSize:fmtSize,fmtWhen:fmtWhen,flash:flash,openSheet:openSheet,closeSheet:closeSheet,menuHTML:menuHTML,
  drawerHead:drawerHead,X_BTN:X_BTN,CHECK_SVG:CHECK_SVG,closeSide:closeSide,openSettings:openSettings,
  renderSide:renderSide,renderSettings:renderSettings,scrim:scrimEl,
  typeEditor:typeEditor,kindChip:kindChip,orderBetween:orderBetween,byOrder:byOrder,find:find,setMode:setMode,
  attachSwipe:attachSwipe,fitNavTitle:fitNavTitle,navDates:navDates,icsText:icsText,lanes:lanes,
  collab:COLLAB,systemNotifyHTML:systemNotifyHTML,icsFold:icsFold,saveBlob:saveBlob,fileName:fileName,aboutBody:aboutBody,
  copyBody:copyBody,snapsBody:snapsBody,copyNoticeHTML:copyNoticeHTML,saveCopy:saveCopy,bkChanged:bkChanged,snapDropLife:snapDropLife,
  folderOK:FOLDER_OK,folderBody:folderBody,localNote:localNote,
  push:{url:pushURL,key:pushKey,support:pushSupport,ask:askNotify,subscription:pushSubscription,error:pushError}};
/* работа без сети и установка на главный экран (только на http/https) */
if("serviceWorker" in navigator&&/^https?:$/.test(location.protocol)){
  window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){});});
  /* нажатие на уведомление, когда Grid уже открыт: sw.js присылает ссылку на задачу */
  navigator.serviceWorker.addEventListener("message",function(e){
    var u=e.data&&e.data.open,h=u?new URL(u).hash:"";
    if(!h) return;
    if(h!==location.hash) location.hash=h; else openFromHash();
  });
}
/* life.js подключается следующим скриптом, поэтому стартуем, когда он загружен */
document.addEventListener("DOMContentLoaded",function(){
  setMode(root.dataset.mode);openFromHash();GridLife.boot();watchLock();
  /* снимкам и папке Grid нужны оба режима: без сервера данные Grid Work грузим сразу,
     даже если открыт Grid Life (снимок — из attach, когда всё загрузилось) */
  if(COLLAB) bkStart(); else bootWork();
});
})();
