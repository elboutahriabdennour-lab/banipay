// Tafir — menu du compte (clic sur l'avatar) : court, avec « Se déconnecter » toujours visible.
function fermerMenuCompte() {
  var m = document.getElementById('menu-compte');
  if (m) m.remove();
  document.removeEventListener('click', _clicHorsMenuCompte, true);
  document.removeEventListener('keydown', _toucheMenuCompte, true);
}
function _clicHorsMenuCompte(e) {
  var m = document.getElementById('menu-compte');
  if (m && !m.contains(e.target)) fermerMenuCompte();
}
function _toucheMenuCompte(e) { if (e.key === 'Escape') fermerMenuCompte(); }
function _mcAller(ecran) { fermerMenuCompte(); goScreen(ecran, null); }
function ouvrirMenuCompte(event) {
  if (event) event.stopPropagation();
  if (document.getElementById('menu-compte')) { fermerMenuCompte(); return; }
  var nom = (STATE.profil && STATE.profil.raison) || 'Mon entreprise';
  var email = (sb.user && sb.user.email) || '';
  var m = document.createElement('div');
  m.id = 'menu-compte';
  m.setAttribute('role', 'menu');
  m.innerHTML =
    '<div class="mc-tete"><div class="mc-nom"></div><div class="mc-mail"></div></div>' +
    '<button class="mc-item mc-mobile" role="menuitem" onclick="_mcAller(\'parametres\')">Param\u00e8tres</button>' +
    '<button class="mc-item" role="menuitem" onclick="window._retourSupport=\'dashboard\';_mcAller(\'support\')">Support</button>' +
    '<a class="mc-item" role="menuitem" href="legal.html" target="_blank" rel="noopener">Mentions l\u00e9gales</a>' +
    (typeof _testActif === 'function' && _testActif() ?
      '<button class="mc-item" role="menuitem" onclick="fermerMenuCompte();creerDonneesTest()">\ud83e\uddea Cr\u00e9er l\u2019entreprise de test</button>' +
      '<button class="mc-item" role="menuitem" onclick="fermerMenuCompte();supprimerDonneesTest()">\ud83e\uddf9 Supprimer les donn\u00e9es de test</button>' : '') +
    '<button class="mc-item mc-deco" role="menuitem" onclick="fermerMenuCompte();doLogout()">Se d\u00e9connecter</button>';
  m.querySelector('.mc-nom').textContent = nom;
  m.querySelector('.mc-mail').textContent = email;
  document.body.appendChild(m);
  setTimeout(function () {
    document.addEventListener('click', _clicHorsMenuCompte, true);
    document.addEventListener('keydown', _toucheMenuCompte, true);
  }, 0);
}
