// Tafir — tableau de bord administrateur (réservé au propriétaire du produit).
// Les chiffres viennent de la fonction SQL admin_tableau_de_bord(), qui REFUSE tout autre compte et ne renvoie que des totaux
// (aucun nom, aucun email, aucune facture). Ce fichier ne contient aucun secret.
(function () {
  window._estAdmin = false;
  var _verifie = null, _donnees = null, _chargement = false;

  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function nb(n) { return Number(n || 0).toLocaleString('fr-FR'); }
  function appel(fn) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: '{}'
    });
  }

  // Vérifie une seule fois par compte si l'utilisateur est administrateur, puis affiche l'entrée de menu.
  async function verifier() {
    if (!sb || !sb.user || !sb.token || _verifie === sb.user.id) return;
    _verifie = sb.user.id;
    try {
      var r = await appel('est_admin');
      window._estAdmin = r.ok && (await r.json()) === true;
    } catch (x) { window._estAdmin = false; }
    var n = document.getElementById('nav-admin');
    if (n) n.style.display = window._estAdmin ? '' : 'none';
  }
  setInterval(verifier, 2500);

  function barres(serie, couleur) {
    var max = 1; serie.forEach(function (p) { if (p.n > max) max = p.n; });
    var h = '<div class="ad-bars" role="img" aria-label="Évolution sur 14 jours">';
    serie.forEach(function (p) {
      var hauteur = Math.max(p.n ? 8 : 3, Math.round(p.n / max * 64));
      h += '<div class="ad-bar" title="' + e(p.j) + ' : ' + p.n + '"><i style="height:' + hauteur + 'px;background:' + couleur + (p.n ? '' : ';opacity:.25') + '"></i></div>';
    });
    return h + '</div><div class="ad-axe"><span>il y a 14 j</span><span>aujourd’hui</span></div>';
  }
  function tuile(valeur, libelle, note) {
    return '<div class="ad-tuile"><div class="ad-val">' + nb(valeur) + '</div><div class="ad-lib">' + e(libelle) + '</div>' + (note ? '<div class="ad-note">' + e(note) + '</div>' : '') + '</div>';
  }
  function liste(objet, ordre) {
    var h = '';
    ordre.forEach(function (c) { h += '<div class="ad-ligne"><span>' + e(c[1]) + '</span><b>' + nb(objet && objet[c[0]]) + '</b></div>'; });
    return h;
  }

  window.renderAdmin = async function () {
    var box = document.getElementById('ad-contenu'); if (!box) return;
    if (!window._estAdmin) { box.innerHTML = '<div class="cx-bloc"><div class="cx-vide">Cet écran est réservé à l’administrateur.</div></div>'; return; }
    if (_chargement) return;
    _chargement = true;
    box.innerHTML = '<div class="cx-bloc"><div class="cx-vide">Chargement…</div></div>';
    try {
      var r = await appel('admin_tableau_de_bord');
      if (!r.ok) throw new Error('refus');
      _donnees = await r.json();
    } catch (x) { _donnees = null; }
    _chargement = false;
    if (!_donnees) { box.innerHTML = '<div class="cx-bloc"><div class="cx-vide">Impossible de charger les chiffres. Vérifiez que le SQL 041 a été lancé, puis réessayez.</div></div>'; return; }
    var u = _donnees.utilisateurs || {}, a = _donnees.activite || {}, p = _donnees.prospection || {}, g = _donnees.usage_jour || {}, i = _donnees.interet || {};
    var h = '<div class="ad-grille">' +
      tuile(u.total, 'Comptes créés', nb(u.confirmes) + ' confirmés') +
      tuile(u.sept_jours, 'Nouveaux (7 jours)', nb(u.trente_jours) + ' sur 30 jours') +
      tuile(a.entreprises_actives, 'Entreprises actives', 'au moins 1 facture') +
      tuile(a.factures_total, 'Factures créées', nb(a.factures_7j) + ' ces 7 jours') + '</div>';
    h += '<div class="cx-bloc"><h3>Inscriptions, 14 derniers jours</h3>' + barres(u.serie || [], '#1B5E4B') + '</div>';
    h += '<div class="cx-bloc"><h3>Factures créées, 14 derniers jours</h3>' + barres(a.serie || [], '#2F7F82') +
         '<div class="ad-ligne" style="margin-top:10px"><span>Devis (total)</span><b>' + nb(a.devis_total) + '</b></div>' +
         '<div class="ad-ligne"><span>Clients enregistrés (total)</span><b>' + nb(a.clients_total) + '</b></div></div>';
    h += '<div class="cx-bloc"><h3>Prospection par email</h3>' +
         liste(p, [['a_contacter', 'À contacter'], ['email_envoye', 'Email envoyé'], ['repondu', 'Ont répondu'], ['interesse', 'Intéressés'], ['refus', 'Retirés (refus ou adresse inexistante)']]) + '</div>';
    h += '<div class="cx-bloc"><h3>Usage aujourd’hui</h3>' +
         liste(g, [['dictee', 'Dictées'], ['lecture', 'Lectures de documents'], ['rapport', 'Rapports'], ['email', 'Emails envoyés depuis l’application']]) + '</div>';
    h += '<div class="cx-bloc"><h3>Intérêt pour les connecteurs</h3>' +
         liste(i, [['odoo', 'Odoo'], ['sage', 'Sage'], ['sap', 'SAP'], ['d365', 'Dynamics 365'], ['autre', 'Autre']]) +
         '<div class="cx-note" style="margin-top:8px">Seulement les personnes ayant demandé à être prévenues.</div></div>';
    h += '<button class="ad-maj" onclick="renderAdmin()">Actualiser</button>';
    box.innerHTML = h;
  };

  if (typeof enregistrerModule === 'function') {
    enregistrerModule({ id: 'admin', groupe: 'Compte', libelle: 'Administration', icone: 'chart-column', ecran: 'admin', visible: function () { return window._estAdmin === true; } });
  }
})();
