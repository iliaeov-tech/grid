/* режим ставим до отрисовки, чтобы не мелькал акцент другого режима:
   последний открытый или Grid Life, если так выбрано в его настройках;
   ссылка на задачу (#task=…) всегда ведёт в рабочий режим, напоминание Grid Life (#life…) — в личный */
(function(){var m="work";
  try{m=/^#life/.test(location.hash)||(localStorage.getItem("grid.mode")==="life"||localStorage.getItem("grid.openLife")==="1")&&
    !/^#task=/.test(location.hash)?"life":"work";}catch(e){}
  document.documentElement.dataset.mode=m;})();
