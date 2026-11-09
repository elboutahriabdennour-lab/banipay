// Tafir — mode.js : tout est visible. Les modules pas encore fiables portent un cadenas.
//
// POUR OUVRIR UN MODULE : supprimer sa ligne dans ECRANS_VERROUILLES (plus bas). Rien d'autre à faire.
// POUR VERROUILLER UN MODULE : ajouter une ligne  'nom-de-l-ecran': 'Nom affiché',
//
// Interrupteur de TEST, valable seulement sur l'appareil où on l'active :
//   ouvrir  app.html?mode_test=complet  -> lève les cadenas sur cet appareil et affiche les outils de test
//   ouvrir  app.html?mode_test=off      -> remet les cadenas et masque les outils de test
// (À RETIRER avant le lancement public, avec js/demo-test.js.)
var MODE_ZELTO = 'complet';

(function () {
  try {
    var q = new URLSearchParams(location.search).get('mode_test');
    if (q === 'complet') localStorage.setItem('tafir_mode_test', 'complet');
    if (q === 'off') localStorage.removeItem('tafir_mode_test');
  } catch (e) {}
})();

// ── Modules verrouillés : écran → nom affiché dans le message ──────────────────────────────────
var ECRANS_VERROUILLES = {
  'messages': 'La messagerie', 'chat': 'La messagerie',
  'annuaire': 'L’annuaire des entreprises',
  'marche': 'Le marché', 'nouvelle-annonce': 'Le marché', 'mes-annonces': 'Le marché',
  'tresorerie': 'La trésorerie', 'position-financiere': 'La position financière',
  'releves': 'Les relevés bancaires', 'rapprochement-releve': 'Les relevés bancaires', 'rapprochement': 'Le rapprochement bancaire',
  'employes': 'Le registre du personnel', 'nouvel-employe': 'Le registre du personnel',
  'contrats': 'Les contrats', 'nouveau-contrat': 'Les contrats',
  'carnet-chantier': 'Le carnet de chantier',
  'rapport-stock': 'La gestion de stock',
  'abonnements': 'Les factures récurrentes', 'nouvel-abonnement': 'Les factures récurrentes', 'detail-abonnement': 'Les factures récurrentes'
};

// Compatibilité avec l'ancien lancement « facturation seule » : plus utilisé, tout est autorisé.
var ECRANS_FACTURATION = [];
function modeFacturation() { return false; }
function ecranAutorise() { return true; }

function _modeTestActif() { try { return localStorage.getItem('tafir_mode_test') === 'complet'; } catch (e) { return false; } }
// Un écran verrouillé reste ouvert pour le propriétaire qui a activé le mode test sur son appareil.
function ecranVerrouille(name) {
  if (!name || _modeTestActif()) return false;
  return Object.prototype.hasOwnProperty.call(ECRANS_VERROUILLES, name);
}
function nomModuleVerrouille(name) { return ECRANS_VERROUILLES[name] || 'Cette fonction'; }

// ── Message « bientôt disponible » ─────────────────────────────────────────────────────────────
function fermerVerrou() {
  var o = document.getElementById('tf-verrou-overlay'); if (o) o.remove();
  document.removeEventListener('keydown', _toucheVerrou, true);
}
function _toucheVerrou(e) { if (e.key === 'Escape') fermerVerrou(); }
function afficherVerrou(name, nomLibre) {
  fermerVerrou();
  var nom = nomLibre || nomModuleVerrouille(name);
  var o = document.createElement('div');
  o.id = 'tf-verrou-overlay';
  o.onclick = function (e) { if (e.target === o) fermerVerrou(); };
  o.innerHTML = '<div class="tf-verrou-carte" role="dialog" aria-modal="true" aria-labelledby="tf-verrou-titre">' +
    '<div class="tf-verrou-ico" aria-hidden="true">🔒</div>' +
    '<div class="tf-verrou-titre" id="tf-verrou-titre">Bientôt disponible</div>' +
    '<p class="tf-verrou-txt"></p>' +
    '<button type="button" class="tf-verrou-ok">Compris</button></div>';
  o.querySelector('.tf-verrou-txt').textContent = nom + ' ne fonctionne pas encore pour le moment. Nous l’ouvrons dès qu’il est fiable.';
  o.querySelector('.tf-verrou-ok').onclick = fermerVerrou;
  document.body.appendChild(o);
  o.querySelector('.tf-verrou-ok').focus();
  document.addEventListener('keydown', _toucheVerrou, true);
}

// ── Cadenas sur tous les raccourcis qui mènent à un module verrouillé ──────────────────────────
var VERROUS_PAR_ID = { 'param-card-stock': 'La gestion de stock', 'valeur-stock-card': 'La gestion de stock' };

function _cibles(oc) {
  var re = /goScreen\(\s*['"]([a-z0-9-]+)['"]/g, m, c = [];
  while ((m = re.exec(oc))) c.push(m[1]);
  return c;
}
function _poserCadenas(e, nom) {
  if (e.classList.contains('tf-verrou')) return;
  e.classList.add('tf-verrou');
  e.setAttribute('data-verrou-nom', nom);
  var s = document.createElement('span');
  s.className = 'tf-cadenas'; s.setAttribute('aria-hidden', 'true'); s.textContent = '🔒';
  e.appendChild(s);
  e.setAttribute('title', 'Bientôt disponible');
}
function marquerVerrous() {
  document.querySelectorAll('[onclick]').forEach(function (e) {
    if (e.classList.contains('tf-verrou') || e.classList.contains('back-btn')) return;
    var sc = e.closest('.screen');
    if (sc && sc.id && Object.prototype.hasOwnProperty.call(ECRANS_VERROUILLES, sc.id.replace('screen-', ''))) return;
    var oc = e.getAttribute('onclick') || '';
    if (oc.indexOf('ouvrirMessagerie') >= 0) { _poserCadenas(e, 'La messagerie'); return; }
    var cibles = _cibles(oc);
    if (!cibles.length) return;
    var tous = cibles.every(function (c) { return Object.prototype.hasOwnProperty.call(ECRANS_VERROUILLES, c); });
    if (tous) _poserCadenas(e, nomModuleVerrouille(cibles[0]));
  });
  Object.keys(VERROUS_PAR_ID).forEach(function (id) {
    var x = document.getElementById(id); if (x) _poserCadenas(x, VERROUS_PAR_ID[id]);
  });
}

// Clic sur un élément verrouillé : on bloque avant que son action ne s'exécute.
document.addEventListener('click', function (ev) {
  var t = ev.target && ev.target.closest ? ev.target.closest('.tf-verrou') : null;
  if (!t || _modeTestActif()) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  afficherVerrou(null, t.getAttribute('data-verrou-nom'));
}, true);

// Pastille visible tant que le mode test est actif sur cet appareil : les cadenas sont alors levés.
function majPastilleTest() {
  var p = document.getElementById('tf-testpill');
  if (!_modeTestActif()) { if (p) p.remove(); return; }
  if (p) return;
  p = document.createElement('div');
  p.id = 'tf-testpill';
  p.innerHTML = '<span>Mode test : cadenas levés</span><button type="button">Désactiver</button>';
  p.querySelector('button').onclick = function () {
    try { localStorage.removeItem('tafir_mode_test'); } catch (e) {}
    location.href = location.pathname + '?mode_test=off';
  };
  document.body.appendChild(p);
}

function appliquerMode() {
  majPastilleTest();
  document.body.setAttribute('data-mode', 'complet');
  marquerVerrous();
}

document.addEventListener('DOMContentLoaded', function () {
  appliquerMode(); setTimeout(appliquerMode, 600); setTimeout(appliquerMode, 2500);
  // Les écrans générés plus tard (listes, hubs) sont aussi marqués.
  var t = null;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(marquerVerrous, 250); })
    .observe(document.body, { childList: true, subtree: true });
});
