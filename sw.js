/* Grid — работа без сети.
   Всё, что нужно сайту, лежит на нём самом (и шрифты): сначала сеть, чтобы
   обновления приходили сразу, без сети — копия. Чужие адреса не трогаем. */
var CACHE="grid-v2";
var FONTS=["golos-text/golos-text-cyrillic-400-normal","golos-text/golos-text-latin-400-normal",
  "golos-text/golos-text-cyrillic-500-normal","golos-text/golos-text-latin-500-normal",
  "golos-text/golos-text-cyrillic-600-normal","golos-text/golos-text-latin-600-normal",
  "golos-text/golos-text-cyrillic-700-normal","golos-text/golos-text-latin-700-normal",
  "unbounded/unbounded-cyrillic-600-normal","unbounded/unbounded-latin-600-normal",
  "jetbrains-mono/jetbrains-mono-cyrillic-400-normal","jetbrains-mono/jetbrains-mono-latin-400-normal",
  "jetbrains-mono/jetbrains-mono-cyrillic-500-normal","jetbrains-mono/jetbrains-mono-latin-500-normal"];
var SHELL=["./","grid.html","grid.config.js","life.js","life.css","manifest.webmanifest",
  "icons/grid-192.png","icons/grid-512.png","icons/apple-touch-icon.png","fonts/fonts.css"]
  .concat(FONTS.map(function(f){return "fonts/"+f+".woff2";}));

self.addEventListener("install",function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener("activate",function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
function keep(req,res){
  var copy=res.clone();
  caches.open(CACHE).then(function(c){c.put(req,copy);});
  return res;
}
self.addEventListener("fetch",function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method!=="GET") return;
  if(url.origin===location.origin){
    e.respondWith(fetch(req).then(function(res){return res.ok?keep(req,res):res;}).catch(function(){
      return caches.match(req,{ignoreSearch:true}).then(function(hit){
        return hit||(req.mode==="navigate"?caches.match("grid.html"):Response.error());
      });
    }));
  }
});

/* ── Push-уведомления ──
   Grid Work присылает готовые заголовок и текст. Напоминание Grid Life
   приходит без названия — только случайный номер: какая это задача и можно
   ли показать её название на экране блокировки, решаем по данным устройства. */
function lifeDB(){
  return new Promise(function(res,rej){
    var r=indexedDB.open("grid-life");
    r.onupgradeneeded=function(){r.transaction.abort();};   /* базы нет — Grid Life здесь не открывали */
    r.onsuccess=function(){res(r.result);};
    r.onerror=function(){rej(r.error);};
  });
}
function get(db,store,key){
  return new Promise(function(res){
    var r=db.transaction(store).objectStore(store).get(key);
    r.onsuccess=function(){res(r.result);}; r.onerror=function(){res(null);};
  });
}
function lifeNote(rid){
  var note={title:"Grid Life",body:rid==="test"?"Пробное напоминание: всё работает":"Напоминание о задаче",tag:"life-"+rid,url:"grid.html#life"};
  if(rid==="test") return Promise.resolve(note);
  return lifeDB().then(function(db){
    return Promise.all([get(db,"meta","remind"),get(db,"meta","prefs"),get(db,"meta","pin")]).then(function(m){
      var map=(m[0]&&m[0].value)||{},r=map[rid],prefs=(m[1]&&m[1].value)||{},pin=m[2]&&m[2].value;
      if(!r) return note;
      note.url="grid.html#life="+encodeURIComponent(r.k); note.body="Напоминание · "+r.w;
      var show=prefs.remindTitle===true||prefs.remindTitle!==false&&!pin;
      if(!show) return note;
      return get(db,"tasks",r.k.split("|")[0]).then(function(t){
        if(!t||t.deletedAt) return note;
        var o=t.occ&&t.occ[r.k.split("|")[1]],p=o&&o.patch||{};
        note.title=p.title||t.title||"Без названия"; note.body=r.w;
        return note;
      });
    });
  }).catch(function(){return note;});
}
self.addEventListener("push",function(e){
  var d={};
  try{d=e.data?e.data.json():{};}catch(x){}
  e.waitUntil((d.life?lifeNote(String(d.rid||"")):Promise.resolve({title:d.title||"Grid Work",body:d.body||"",tag:d.tag,url:d.url||"grid.html"}))
    .then(function(n){
      return self.registration.showNotification(n.title,{body:n.body,tag:n.tag,icon:"icons/grid-192.png",data:{url:n.url}});
    }));
});
/* нажатие: открытая вкладка Grid сама откроет задачу, иначе — новое окно */
self.addEventListener("notificationclick",function(e){
  e.notification.close();
  var url=new URL((e.notification.data&&e.notification.data.url)||"grid.html",self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(function(list){
    var page=list.filter(function(c){return /\/(grid\.html)?$/.test(c.url.split("#")[0].split("?")[0]);})[0];
    if(page){page.postMessage({open:url});return page.focus();}
    return self.clients.openWindow(url);
  }));
});
