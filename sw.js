/* Grid — работа без сети.
   Свои файлы: сначала сеть (чтобы обновления приходили сразу), без сети — копия.
   Шрифты и библиотеки с CDN: сначала копия. Запросы к Supabase не трогаем. */
var CACHE="grid-v1";
var SHELL=["./","grid.html","grid.config.js","life.js","life.css","manifest.webmanifest",
  "icons/grid-192.png","icons/grid-512.png","icons/apple-touch-icon.png"];

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
    return;
  }
  if(/(^|\.)fonts\.(googleapis|gstatic)\.com$|^cdn\.jsdelivr\.net$/.test(url.hostname)){
    e.respondWith(caches.match(req).then(function(hit){
      return hit||fetch(req).then(function(res){return keep(req,res);});
    }));
  }
});
