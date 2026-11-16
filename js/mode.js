// Tafir — mode.js : tout est visible. Les modules pas encore fiables portent un cadenas.
//
// POUR OUVRIR UN MODULE : supprimer sa ligne dans ECRANS_VERROUILLES (plus bas). Rien d'autre à faire.
// POUR VERROUILLER UN MODULE : ajouter une ligne  'nom-de-l-ecran': 'Nom affiché',
//
var MODE_ZELTO = 'complet';

// ── Modules verrouillés : écran → nom affiché dans le message ──────────────────────────────────
var ECRANS_VERROUILLES = {
  'messages': 'La messagerie', 'chat': 'La messagerie',
  'annuaire': 'L’annuaire des entreprises',
  'marche': 'Le marché', 'nouvelle-annonce': 'Le marché', 'mes-annonces': 'Le marché',
  'releves': 'Les relevés bancaires', 'rapprochement-releve': 'Les relevés bancaires', 'rapprochement': 'Le rapprochement bancaire',
  'employes': 'Le registre du personnel', 'nouvel-employe': 'Le registre du personnel',
  // Recentrage (16/11) : Tafir ouvre d'abord la facturation + l'accès comptable. Tout le reste attend d'être finalisé.
  'caisse': 'La caisse', 'rapport-stock': 'La gestion de stock',
  'stats': 'Les statistiques', 'rapports': 'Les rapports', 'tva': 'La TVA', 'connexions': 'Les connexions',
  'position-financiere': 'La trésorerie', 'abonnements': 'Les factures récurrentes', 'nouvel-abonnement': 'Les factures récurrentes', 'detail-abonnement': 'Les factures récurrentes',
  'contrats': 'Les contrats', 'nouveau-contrat': 'Les contrats', 'carnet-chantier': 'Le carnet de chantier', 'archive': 'L’archive de documents',
  'hub-achats': 'Les achats', 'achats': 'Les achats', 'nouvelle-achat': 'Les achats',
  'fournisseurs': 'Les fournisseurs', 'fournisseur-form': 'Les fournisseurs', 'fournisseur-detail': 'Les fournisseurs', 'demande-devis-fournisseur': 'Les fournisseurs',
  'demandes-devis': 'Les demandes de devis', 'devis-recus': 'Les devis reçus', 'bc-recus': 'Les bons de commande', 'factures-recues': 'Les factures reçues',
  'bon-commande': 'Les bons de commande', 'bons-commande-list': 'Les bons de commande', 'bon-livraison': 'Les bons de livraison', 'bons-livraison-list': 'Les bons de livraison',
};

// Compatibilité avec l'ancien lancement « facturation seule » : plus utilisé, tout est autorisé.
var ECRANS_FACTURATION = [];
function modeFacturation() { return false; }
function ecranAutorise() { return true; }

function ecranVerrouille(name) {
  if (!name) return false;
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
var VERROUS_PAR_ID = { 'valeur-stock-card': 'La gestion de stock' };

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
  try { ordonnerAccueil(); ordonnerMenuBureau(); } catch (x) { console.warn('ordonner:', x); }
}

// Clic sur un élément verrouillé : on bloque avant que son action ne s'exécute.
document.addEventListener('click', function (ev) {
  var t = ev.target && ev.target.closest ? ev.target.closest('.tf-verrou') : null;
  if (!t) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  afficherVerrou(null, t.getAttribute('data-verrou-nom'));
}, true);


// ── Réorganisation automatique : ce qui est ouvert d'abord, ce qui est verrouillé regroupé à part ─────
// S'adapte tout seul : si un module est rouvert (ligne retirée de ECRANS_VERROUILLES), sa tuile revient dans « Outils ».
function ordonnerAccueil() {
  var d = document.getElementById('screen-dashboard'); if (!d) return;
  var tuiles = Array.prototype.slice.call(d.querySelectorAll('.quick-actions .qa-item'));
  if (!tuiles.length) return;
  var ouv = document.getElementById('qa-ouverts'), bie = document.getElementById('qa-bientot-grille');
  if (!ouv) {
    var premier = d.querySelector('.groupe-label'); if (!premier) return;
    var bloc = document.createElement('div'); bloc.id = 'qa-bloc';
    bloc.innerHTML = '<div class="groupe-label">Outils</div><div class="quick-actions" id="qa-ouverts"></div>'
      + '<div style="padding:4px 20px 6px;text-align:center"><span id="qa-bientot-btn" style="font-size:12px;color:#5B6B64;font-weight:600;cursor:pointer;padding:8px 16px;border-radius:20px;background:#EEF0EA;display:inline-block"></span></div>'
      + '<div class="quick-actions" id="qa-bientot-grille" style="display:none"></div>';
    premier.parentNode.insertBefore(bloc, premier);
    ouv = bloc.querySelector('#qa-ouverts'); bie = bloc.querySelector('#qa-bientot-grille');
    var btn = bloc.querySelector('#qa-bientot-btn');
    btn.onclick = function () { var v = bie.style.display === 'none'; bie.style.display = v ? 'grid' : 'none'; majBtn(); };
  }
  function majBtn() {
    var btn = document.getElementById('qa-bientot-btn'); if (!btn) return;
    var n = bie.children.length; btn.style.display = n ? 'inline-block' : 'none';
    btn.textContent = (bie.style.display === 'none' ? '🔒 Bientôt disponible (' + n + ')  ▼' : '🔒 Bientôt disponible  ▲');
  }
  tuiles.forEach(function (t) {
    var cible = t.classList.contains('tf-verrou') ? bie : ouv;
    if (t.parentNode !== cible) cible.appendChild(t);
  });
  // anciens groupes devenus vides : on les masque
  Array.prototype.slice.call(d.querySelectorAll('.quick-actions')).forEach(function (q) {
    if (q === ouv || q === bie) return;
    var vide = !q.querySelector('.qa-item'), lab = q.previousElementSibling;
    q.style.display = vide ? 'none' : ''; 
    if (lab && lab.classList && lab.classList.contains('groupe-label')) lab.style.display = vide ? 'none' : '';
  });
  var plus = document.getElementById('lbl-plus-outils'); if (plus && plus.parentNode && plus.parentNode.parentNode) plus.parentNode.parentNode.style.display = 'none';
  majBtn();
}
function ordonnerMenuBureau() {
  var sep = Array.prototype.slice.call(document.querySelectorAll('.nav-sep')).filter(function (s) { return /Bientôt disponible/.test(s.textContent); })[0];
  if (!sep || !sep.parentNode) return;
  var parent = sep.parentNode, fixes = { 'nav-parametres': 1, 'nav-deconnexion': 1, 'nav-toggle': 1, 'nav-admin': 1, 'nav-abonnements-offres': 1 };
  var items = Array.prototype.slice.call(parent.querySelectorAll('.nav-item.nav-desk')).filter(function (i) { return !fixes[i.id]; });
  var verr = items.filter(function (i) { return i.classList.contains('tf-verrou'); });
  var ouv = items.filter(function (i) { return !i.classList.contains('tf-verrou'); });
  var ref = sep;
  verr.forEach(function (i) { if (i.previousElementSibling !== ref) parent.insertBefore(i, ref.nextElementSibling === i ? i : ref.nextElementSibling); ref = i; });
  ouv.forEach(function (i) { var apres = i.compareDocumentPosition(sep) & Node.DOCUMENT_POSITION_FOLLOWING; if (!apres) parent.insertBefore(i, sep); });
}

function appliquerMode() {
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
