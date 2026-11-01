// Tafir — menu latéral du téléphone (bouton ☰) : même contenu que le menu de gauche de l'ordinateur.
function fermerMenuLateral() {
  var o = document.getElementById('ml-overlay'); if (!o) return;
  o.classList.remove('ouvert');
  setTimeout(function () { if (o.parentNode) o.remove(); }, 220);
  document.removeEventListener('keydown', _toucheMenuLateral, true);
}
function _toucheMenuLateral(e) { if (e.key === 'Escape') fermerMenuLateral(); }
function _mlAller(code) {
  fermerMenuLateral();
  if (code === 'achats') { loadAchats(); renderHubAchats(); goScreen('hub-achats', null); }
  else if (code === 'releves') { window._retourReleves = 'dashboard'; loadReleves(); goScreen('releves', null); }
  else if (code === 'support') { window._retourSupport = 'dashboard'; goScreen('support', null); }
  else if (code === 'test-creer') creerDonneesTest();
  else if (code === 'test-suppr') supprimerDonneesTest();
  else if (code === 'deco') doLogout();
  else goScreen(code, null);
}
function ouvrirMenuLateral(event) {
  if (event) event.stopPropagation();
  if (document.getElementById('ml-overlay')) { fermerMenuLateral(); return; }
  var complet = document.body.getAttribute('data-mode') === 'complet';
  var test = typeof _testActif === 'function' && _testActif();
  var groupes = [
    ['Facturation', [['mes-factures', 'receipt', 'Factures'], ['devis-list', 'file-pen', 'Devis'], ['avoir-list', 'undo-2', 'Avoirs'], ['brouillons', 'file-stack', 'Brouillons'], ['historique-paiements', 'banknote', 'Paiements']]],
    ['Gestion', [['clients', 'users', 'Clients'], ['produits', 'package', 'Produits'], ['tva', 'calculator', 'TVA']]]
  ];
  if (complet) groupes.push(['Dépenses', [['achats', 'shopping-cart', 'Achats'], ['releves', 'banknote', 'Relevés bancaires']]]);
  var compte = [['parametres', 'settings', 'Paramètres'], ['support', 'message-circle', 'Support']];
  if (test) compte.push(['test-creer', 'package', 'Créer l’entreprise de test'], ['test-suppr', 'undo-2', 'Supprimer les données de test']);
  groupes.push(['Compte', compte]);
  var h = '';
  groupes.forEach(function (g) {
    h += '<div class="ml-titre">' + g[0] + '</div>';
    g[1].forEach(function (it) { h += '<button class="ml-it" onclick="_mlAller(\'' + it[0] + '\')"><i class="ic ic-' + it[1] + ' ml-ico"></i><span>' + it[2] + '</span></button>'; });
  });
  h += '<button class="ml-it ml-deco" onclick="_mlAller(\'deco\')"><i class="ic ic-log-out ml-ico"></i><span>Se déconnecter</span></button>';
  var o = document.createElement('div');
  o.id = 'ml-overlay';
  o.onclick = function (e) { if (e.target === o) fermerMenuLateral(); };
  o.innerHTML = '<nav class="ml-panneau" role="navigation" aria-label="Menu principal">' +
    '<div class="ml-tete"><div><div class="ml-logo">Ta<span>fir</span></div><div class="ml-nom"></div><div class="ml-mail"></div></div>' +
    '<button class="ml-x" onclick="fermerMenuLateral()" aria-label="Fermer">&#10005;</button></div>' +
    '<button class="ml-it ml-accueil" onclick="_mlAller(\'dashboard\')"><i class="ic ic-house ml-ico"></i><span>Accueil</span></button>' + h + '<div style="height:28px"></div></nav>';
  o.querySelector('.ml-nom').textContent = (STATE.profil && STATE.profil.raison) || 'Mon entreprise';
  o.querySelector('.ml-mail').textContent = (sb.user && sb.user.email) || '';
  document.body.appendChild(o);
  requestAnimationFrame(function () { o.classList.add('ouvert'); });
  document.addEventListener('keydown', _toucheMenuLateral, true);
}
