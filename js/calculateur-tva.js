(function(){
  var mt=document.getElementById('mt'),sens=document.getElementById('sens'),taux=document.getElementById('taux');
  var fmt=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  function maj(){
    var v=parseFloat(mt.value);if(isNaN(v)||v<0)v=0;
    var t=parseFloat(taux.value)/100,ht,ttc;
    if(sens.value==='ht'){ht=v;ttc=v*(1+t);}else{ttc=v;ht=v/(1+t);}
    var tva=ttc-ht;
    document.getElementById('r-ht').textContent=fmt.format(ht)+' MAD';
    document.getElementById('r-tva').textContent=fmt.format(tva)+' MAD';
    document.getElementById('r-ttc').textContent=fmt.format(ttc)+' MAD';
  }
  [mt,sens,taux].forEach(function(e){e.addEventListener('input',maj);e.addEventListener('change',maj);});
  maj();
})();
