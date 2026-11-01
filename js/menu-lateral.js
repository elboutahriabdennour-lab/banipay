// Tafir — menu latéral du téléphone (bouton ☰) : même contenu que le menu de gauche de l'ordinateur.
function fermerMenuLateral() {
  var o = document.getElementById('ml-overlay'); if (!o) return;
  o.classList.remove('ouvert');
  setTimeout(function () { if (o.parentNode) o.remove(); }, 220);
  document.removeEventListener('keydown', _toucheMenuLateral, true);
}
function _toucheMenuLateral(e) { if (e.key === 'Escape') fermerMenuLateral(); }

// ── Registre des modules ────────────────────────────────────────────────────
// Pour AJOUTER un module au menu, une seule ligne suffit (ici ou depuis le fichier du module) :
//   enregistrerModule({ id:'stock', groupe:'Gestion', libelle:'Stock', icone:'package', ecran:'stock' });
// Options : ecran (nom de l'écran) OU action (fonction) ; visible (fonction → true/false) ; complet:true (mode complet seulement).
var TAFIR_MODULES = [
  { id: 'mes-factures', groupe: 'Facturation', libelle: 'Factures', icone: 'receipt', ecran: 'mes-factures' },
  { id: 'devis-list', groupe: 'Facturation', libelle: 'Devis', icone: 'file-pen', ecran: 'devis-list' },
  { id: 'avoir-list', groupe: 'Facturation', libelle: 'Avoirs', icone: 'undo-2', ecran: 'avoir-list' },
  { id: 'brouillons', groupe: 'Facturation', libelle: 'Brouillons', icone: 'file-stack', ecran: 'brouillons' },
  { id: 'paiements', groupe: 'Facturation', libelle: 'Paiements', icone: 'banknote', ecran: 'historique-paiements' },
  { id: 'clients', groupe: 'Gestion', libelle: 'Clients', icone: 'users', ecran: 'clients' },
  { id: 'produits', groupe: 'Gestion', libelle: 'Produits', icone: 'package', ecran: 'produits' },
  { id: 'stats', groupe: 'Gestion', libelle: 'Statistiques', icone: 'chart-column', ecran: 'stats' },
  { id: 'tva', groupe: 'Gestion', libelle: 'TVA', icone: 'calculator', ecran: 'tva' },
  { id: 'achats', groupe: 'Dépenses', libelle: 'Achats', icone: 'shopping-cart', complet: true, action: function () { loadAchats(); renderHubAchats(); goScreen('hub-achats', null); } },
  { id: 'releves', groupe: 'Dépenses', libelle: 'Relevés bancaires', icone: 'banknote', complet: true, action: function () { window._retourReleves = 'dashboard'; loadReleves(); goScreen('releves', null); } },
  { id: 'parametres', groupe: 'Compte', libelle: 'Paramètres', icone: 'settings', ecran: 'parametres' },
  { id: 'support', groupe: 'Compte', libelle: 'Support', icone: 'message-circle', action: function () { window._retourSupport = 'dashboard'; goScreen('support', null); } },
  { id: 'test-creer', groupe: 'Compte', libelle: 'Créer l’entreprise de test', icone: 'package', visible: function () { return typeof _testActif === 'function' && _testActif(); }, action: function () { creerDonneesTest(); } },
  { id: 'test-suppr', groupe: 'Compte', libelle: 'Supprimer les données de test', icone: 'undo-2', visible: function () { return typeof _testActif === 'function' && _testActif(); }, action: function () { supprimerDonneesTest(); } }
];
function enregistrerModule(m) {
  if (!m || !m.id) return;
  for (var i = 0; i < TAFIR_MODULES.length; i++) if (TAFIR_MODULES[i].id === m.id) { TAFIR_MODULES[i] = m; return; }
  // Un nouveau module s'insère à la fin de son groupe (avant « Compte » s'il crée un groupe).
  var dernier = -1; for (var j = 0; j < TAFIR_MODULES.length; j++) if (TAFIR_MODULES[j].groupe === m.groupe) dernier = j;
  if (dernier >= 0) TAFIR_MODULES.splice(dernier + 1, 0, m);
  else { var k = TAFIR_MODULES.findIndex(function (x) { return x.groupe === 'Compte'; }); if (k < 0) TAFIR_MODULES.push(m); else TAFIR_MODULES.splice(k, 0, m); }
}
function _mlAller(id) {
  fermerMenuLateral();
  if (id === 'dashboard') { goScreen('dashboard', null); return; }
  if (id === 'deco') { doLogout(); return; }
  var m = TAFIR_MODULES.filter(function (x) { return x.id === id; })[0];
  if (!m) return;
  if (typeof m.action === 'function') m.action(); else if (m.ecran) goScreen(m.ecran, null);
}
function ouvrirMenuLateral(event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  if (document.getElementById('ml-overlay')) { fermerMenuLateral(); return; }
  var complet = document.body.getAttribute('data-mode') === 'complet';
  var groupes = [], index = {};
  TAFIR_MODULES.forEach(function (m) {
    if (m.complet && !complet) return;
    if (typeof m.visible === 'function' && !m.visible()) return;
    if (!(m.groupe in index)) { index[m.groupe] = groupes.length; groupes.push([m.groupe, []]); }
    groupes[index[m.groupe]][1].push(m);
  });
  var h = '';
  groupes.forEach(function (g) {
    h += '<div class="ml-titre"></div>';
    g[1].forEach(function (m) { h += '<button class="ml-it" data-id="' + m.id + '"><i class="ic ic-' + (m.icone || 'package') + ' ml-ico"></i><span></span></button>'; });
  });
  var o = document.createElement('div');
  o.id = 'ml-overlay';
  o.onclick = function (e) { if (e.target === o) fermerMenuLateral(); };
  o.innerHTML = '<nav class="ml-panneau" role="navigation" aria-label="Menu principal">' +
    '<div class="ml-tete"><div><div class="ml-logo">Ta<span>fir</span></div><div class="ml-nom"></div><div class="ml-mail"></div></div>' +
    '<button class="ml-x" onclick="fermerMenuLateral()" aria-label="Fermer">&#10005;</button></div>' +
    '<button class="ml-it ml-accueil" data-id="dashboard"><i class="ic ic-house ml-ico"></i><span>Accueil</span></button>' + h +
    '<button class="ml-it ml-deco" data-id="deco"><i class="ic ic-log-out ml-ico"></i><span>Se déconnecter</span></button><div style="height:28px"></div></nav>';
  // Textes insérés en texte brut (jamais en HTML), même pour un module ajouté par un tiers.
  var titres = o.querySelectorAll('.ml-titre'); groupes.forEach(function (g, i) { titres[i].textContent = g[0]; });
  var k = 0; o.querySelectorAll('.ml-it').forEach(function (b) {
    var id = b.getAttribute('data-id');
    if (id !== 'dashboard' && id !== 'deco') { var m = TAFIR_MODULES.filter(function (x) { return x.id === id; })[0]; b.querySelector('span').textContent = m ? m.libelle : id; }
    b.onclick = function () { _mlAller(id); };
  });
  o.querySelector('.ml-nom').textContent = (STATE.profil && STATE.profil.raison) || 'Mon entreprise';
  o.querySelector('.ml-mail').textContent = (sb.user && sb.user.email) || '';
  document.body.appendChild(o);
  requestAnimationFrame(function () { o.classList.add('ouvert'); });
  document.addEventListener('keydown', _toucheMenuLateral, true);
}

// ── Bouton ☰ sur tous les écrans (téléphone) ────────────────────────────────
function _injecterBoutonsMenu() {
  document.querySelectorAll('.screen').forEach(function (sc) {
    if (sc.id === 'screen-auth' || sc.id === 'screen-dashboard' || sc.querySelector('.t-burger, .t-burger-tous')) return;
    if (/comptable|cpt-|verification|mot-passe/.test(sc.id) || sc.id === 'screen-chat' || sc.id === 'screen-chat-ticket') return;   // espaces séparés et conversations
    var tete = sc.querySelector('.topbar, .form-header, .detail-top, .auth-wrap');
    var flottant = false;
    if (!tete) {   // en-têtes sans classe (fiche client, fournisseur, conversation)
      var p0 = sc.firstElementChild;
      if (p0 && /gradient/.test(p0.getAttribute('style') || '')) { tete = p0; flottant = true; }
    }
    if (!tete || tete.classList.contains('auth-wrap')) return;
    if (tete.classList.contains('detail-top')) flottant = true;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 't-burger-tous' + (flottant ? ' t-burger-abs' : ''); b.setAttribute('aria-label', 'Menu'); b.innerHTML = '&#9776;';
    b.onclick = ouvrirMenuLateral;
    if (flottant) {
      tete.style.position = 'relative';
      if (tete.firstElementChild) tete.firstElementChild.style.paddingLeft = '48px';
      tete.appendChild(b);
    } else tete.insertBefore(b, tete.firstChild);   // ☰ tout à gauche
  });
}
document.addEventListener('DOMContentLoaded', _injecterBoutonsMenu);
if (document.readyState !== 'loading') _injecterBoutonsMenu();
