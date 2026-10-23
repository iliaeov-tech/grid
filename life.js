/* ============================================================
   Grid Life — личный календарь задач.
   Данные хранятся только на этом устройстве; вход и сеть не нужны.
   Общие помощники приходят из grid.html через window.GridKit.
   ============================================================ */
(function(){
"use strict";
var K=window.GridKit,$=K.$,ic=K.ic;

function sideHTML(){
  return '<div class="side-head"><h2>Grid Life</h2>'+
      '<button class="icon-btn" data-sclose="1" aria-label="Закрыть">'+K.X_BTN+"</button></div>"+
    '<div class="side-body"><p class="note side-note">Личный календарь. Виды календаря и типы задач появятся здесь вместе с ним.</p></div>'+
    '<div class="side-foot"><p class="note side-note">Данные Grid Life хранятся только на этом устройстве.</p>'+
      '<button class="mi" data-settings="1">'+ic("gear")+"<span>Настройки</span></button></div>";
}
function settingsHTML(){
  return K.drawerHead("Настройки Grid Life")+'<div class="d-body"><section class="set">'+
    "<p>Здесь будут резервная копия и напоминания — они появятся вместе с календарём.</p>"+
    '<p class="small">Данные Grid Life хранятся только на этом устройстве и никуда не отправляются.</p>'+
    "</section></div>";
}

window.GridLife={
  show:function(el){
    if(el.dataset.ready) return;
    el.dataset.ready="1";
    el.innerHTML='<div class="empty"><h2>Личный календарь</h2>'+
      "<p>Здесь появится календарь ваших задач. Данные Grid Life хранятся только на этом устройстве "+
      "и работают без интернета и без входа в аккаунт.</p></div>";
  },
  close:function(){},
  escape:function(){return false;},
  sideHTML:sideHTML,
  settingsHTML:settingsHTML
};
})();
