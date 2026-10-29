// ZELTO — mode.js : lancement « facturation seule ».
// Pour remettre toute l'application : mettre MODE_ZELTO = 'complet' (rien n'est supprimé, seulement masqué).
var MODE_ZELTO = 'facturation';

// Interrupteur de TEST, valable seulement sur l'appareil où on l'active (rien ne change pour les autres utilisateurs) :
//   ouvrir  app.html?mode_test=complet  -> montre tous les modules (achats, relevés...) sur cet appareil
//   ouvrir  app.html?mode_test=off      -> revient à « facturation seule »
(function () {
  try {
    var q = new URLSearchParams(location.search).get('mode_test');
    if (q === 'complet') localStorage.setItem('tafir_mode_test', 'complet');
    if (q === 'off') localStorage.removeItem('tafir_mode_test');
    if (localStorage.getItem('tafir_mode_test') === 'complet') MODE_ZELTO = 'complet';
  } catch (e) {}
})();

var ECRANS_FACTURATION = ['dashboard','mes-factures','nouvelle','detail','historique-paiements','acomptes','brouillons',
  'avoir','avoir-list','devis-list','nouveau-devis','detail-devis','clients','nouveau-client','detail-client','modifier-client',
  'produits','nouveau-produit','modifier-produit','tva','recherche','profil','parametres','modele-facture','audit',
  'support','espace-support','mes-tickets-support','chat-ticket','qui-sommes-nous','auth','definir-mot-passe','verification-telephone',
  'comptable','cpt-entreprise','comptable-profil','attributions-cabinet','pdf-viewer','portail','profil-public'];

function modeFacturation() { return MODE_ZELTO === 'facturation'; }

// Un écran est autorisé s'il est dans la liste, ou s'il n'existe pas comme écran (pages spéciales).
function ecranAutorise(name) {
  if (!modeFacturation() || !name) return true;
  if (!document.getElementById('screen-' + name)) return true;
  return ECRANS_FACTURATION.indexOf(name) >= 0;
}

// Masque tout raccourci (bouton, tuile, ligne) dont le clic mène vers un écran hors périmètre.
function appliquerMode() {
  if (!modeFacturation()) { document.body.setAttribute('data-mode', 'complet'); return; }
  var re = /goScreen\(\s*['"]([a-z0-9-]+)['"]/g;
  document.querySelectorAll('[onclick]').forEach(function (e) {
    var oc = e.getAttribute('onclick') || '', m, cibles = [];
    re.lastIndex = 0;
    while ((m = re.exec(oc))) cibles.push(m[1]);
    if (!cibles.length) return;
    if (e.closest('.screen:not(#screen-dashboard):not(#screen-profil):not(#screen-parametres)') && e.classList.contains('back-btn')) return;
    var interdit = cibles.some(function (c) { return !ecranAutorise(c); });
    var autorise = cibles.some(function (c) { return ecranAutorise(c); });
    if (interdit && !autorise && !e.classList.contains('back-btn')) e.style.display = 'none';
  });
  document.querySelectorAll('[onclick*="ouvrirMessagerie"]').forEach(function (e) { e.style.display = 'none'; });
  // Blocs du tableau de bord et du profil liés aux autres modules
  ['param-card-stock', 'param-card-bons', 'param-card-relance-achats', 'dashboard-achats-resume', 'valeur-stock-card', 'groupe-label-suivi', 'qa-suivi-equipe', 'groupe-label-reseau', 'qa-reseau-zelto'].forEach(function (id) {
    var x = document.getElementById(id); if (x) x.style.display = 'none';
  });
  var plus = document.getElementById('lbl-plus-outils');
  if (plus && plus.parentNode) plus.parentNode.parentNode.style.display = 'none';
  var ga = document.getElementById('param-g-autres'); if (ga) ga.style.display = 'none';
  // Titres de groupes vides + renommage
  document.querySelectorAll('.groupe-label').forEach(function (g) {
    var nx = g.nextElementSibling;
    if (nx && nx.classList.contains('quick-actions')) {
      var vis = [].some.call(nx.children, function (c) { return c.style.display !== 'none'; });
      g.style.display = vis ? '' : 'none';
      if (nx) nx.style.display = vis ? '' : 'none';
    }
  });
  var labs = document.querySelectorAll('.groupe-label');
  if (labs[0] && labs[0].textContent.indexOf('Achats') >= 0) labs[0].textContent = 'Facturation';
  document.body.setAttribute('data-mode', 'facturation');
}

document.addEventListener('DOMContentLoaded', function () { appliquerMode(); setTimeout(appliquerMode, 600); });
