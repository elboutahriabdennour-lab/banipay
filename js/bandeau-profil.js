// Tafir — bandeau-profil.js
// Informations légales de l'entreprise incomplètes : un bandeau sur l'accueil le rappelle, et la création d'une facture est bloquée (voir nav.js).
function profilLegalIncomplet() {
  var p = (typeof STATE !== 'undefined' && STATE.profil) ? STATE.profil : null;
  if (!p || !Object.keys(p).length) return false; // profil pas encore chargé : on ne bloque pas par erreur
  var rcRequis = p.forme !== 'Auto-entrepreneur'; // l'auto-entrepreneur n'a pas de RC
  return !p.raison || !p.secteur || (rcRequis && !p.rc) || !p.identifiant_fiscal || !p.ice;
}

function majBandeauProfil() {
  var sc = document.getElementById('screen-dashboard');
  if (!sc) return;
  var ancien = document.getElementById('bandeau-profil');
  if (ancien) ancien.remove();
  if (!profilLegalIncomplet()) return;
  var b = document.createElement('div');
  b.id = 'bandeau-profil';
  b.setAttribute('role', 'status');
  b.innerHTML = '<div class="bp-txt"><b>Informations légales à compléter</b><span>Raison sociale, secteur, RC, IF et ICE sont nécessaires pour créer une facture.</span></div>' +
    '<button type="button" class="bp-btn">Compléter</button>';
  b.querySelector('.bp-btn').onclick = function () {
    goScreen('profil', null);
    setTimeout(function () { if (typeof goProfilEdit === 'function') goProfilEdit(true); }, 200);
  };
  var apres = sc.querySelector('.dash-hello');
  if (apres && apres.parentNode) apres.parentNode.insertBefore(b, apres.nextSibling);
}
