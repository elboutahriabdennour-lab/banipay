// ZELTO — refonte.js : barre du bas, menu « + », accueil (bonjour + factures récentes).
function _ouvrirMenuNouveau() { var s = document.getElementById('sheet-nouveau'); if (s) s.classList.add('active'); }
function _fermerMenuNouveau() { var s = document.getElementById('sheet-nouveau'); if (s) s.classList.remove('active'); }
function _allerCreer(ecran) {
  _fermerMenuNouveau();
  if (ecran === 'nouvelle' && typeof initNouvelle === 'function') { try { STATE._prefillNouvelle = null; } catch (e) {} }
  goScreen(ecran, null);
}

function _statutLibelle(s) {
  return ({ payee: 'Payée', attente: 'En attente', envoyee: 'Envoyée', retard: 'En retard', brouillon: 'Brouillon', annulee: 'Annulée' })[s] || (s || '');
}

function renderAccueilRecents() {
  var z = document.getElementById('accueil-recents');
  if (!z) return;
  var fs = (STATE.factures || []).slice().sort(function (a, b) {
    return String(b.date_emission || b.created_at || '').localeCompare(String(a.date_emission || a.created_at || ''));
  }).slice(0, 5);
  if (!fs.length) {
    z.innerHTML = '<div class="empty-card"><div class="empty-ico"><i class="ic ic-file-text"></i></div>' +
      '<div class="empty-t">Aucune facture pour l\'instant</div>' +
      '<div class="empty-s">Créez votre première facture en moins de 3 minutes.</div>' +
      '<button class="btn-primary" onclick="goScreen(\'nouvelle\',null)">Créer ma première facture</button></div>';
    return;
  }
  z.innerHTML = fs.map(function (f) {
    var reste = Math.max(0, Number(f.ttc || 0) - Number(f.montant_recu || 0));
    return '<div class="rec-row" onclick="openDetail(' + valeurPourOnclick(f.id) + ')">' +
      '<div class="rec-main"><div class="rec-name">' + escapeHTML(f.client || '—') + '</div>' +
      '<div class="rec-ref">' + escapeHTML(f.ref || '') + ' · ' + escapeHTML(f.date_emission || '') + '</div></div>' +
      '<div class="rec-end"><div class="rec-amt">' + fmt(f.ttc || 0) + ' ' + escapeHTML(f.devise || 'MAD') + '</div>' +
      '<span class="pill pill-' + escapeHTML(f.statut || '') + '">' + _statutLibelle(f.statut) + '</span></div></div>';
  }).join('');
}

function renderAccueilBonjour() {
  var h = document.getElementById('dash-hi'); if (!h) return;
  var nom = (sb.user && sb.user.user_metadata && sb.user.user_metadata.nom) || '';
  var prenom = String(nom).trim().split(/\s+/)[0] || '';
  var heure = new Date().getHours();
  var salut = heure >= 18 || heure < 5 ? 'Bonsoir' : 'Bonjour';
  h.textContent = prenom ? salut + ', ' + prenom : salut;
}

// Brancher l'accueil sur renderDashboard sans le réécrire.
(function () {
  function brancher() {
    if (typeof renderDashboard !== 'function' || renderDashboard._refonte) return;
    var orig = renderDashboard;
    window.renderDashboard = function () { var r = orig.apply(this, arguments); try { renderAccueilBonjour(); renderAccueilRecents(); } catch (e) { console.warn('refonte:', e); } return r; };
    window.renderDashboard._refonte = true;
  }
  window.addEventListener('load', brancher);
  brancher();
})();
