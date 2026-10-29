// Tafir — dictée de facture : micro (si le navigateur le permet) + remplissage par l'IA.
// L'IA propose, l'utilisateur vérifie toujours avant d'enregistrer.
var _dicteeReco = null;
var _dicteeEnCours = false;

function _dicteeNote(msg, erreur) {
  var n = document.getElementById('dictee-note');
  if (!n) return;
  n.textContent = msg;
  n.style.color = erreur ? '#B23A2E' : '';
}
function _dicteeConsentement() {
  try { if (localStorage.getItem('tafir_ia_ok') === '1') return true; } catch (e) {}
  var ok = confirm('Votre phrase sera envoyée à un service d’intelligence artificielle (Anthropic) pour préremplir la facture. N’y mettez pas de données sensibles. Continuer ?');
  if (ok) { try { localStorage.setItem('tafir_ia_ok', '1'); } catch (e) {} }
  return ok;
}
function _normNom(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function _trouverClient(nom) {
  var n = _normNom(nom);
  if (!n) return null;
  var liste = (STATE && STATE.clients) || [];
  var exact = liste.filter(function (c) { return _normNom(c.nom) === n; });
  if (exact.length === 1) return exact[0];
  var proches = liste.filter(function (c) { var m = _normNom(c.nom); return m && (m.indexOf(n) >= 0 || n.indexOf(m) >= 0); });
  return proches.length === 1 ? proches[0] : null;
}

function dicterFacture() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var zone = document.getElementById('dictee-texte');
  if (!SR) { _dicteeNote('Le micro n’est pas disponible ici. Utilisez le micro de votre clavier, ou écrivez la phrase.', true); if (zone) zone.focus(); return; }
  if (_dicteeEnCours && _dicteeReco) { _dicteeReco.stop(); return; }
  var base = zone ? zone.value.trim() : '';
  _dicteeReco = new SR();
  _dicteeReco.lang = 'fr-FR';
  _dicteeReco.interimResults = true;
  _dicteeReco.continuous = false;
  var btn = document.getElementById('dictee-mic');
  _dicteeReco.onstart = function () { _dicteeEnCours = true; if (btn) { btn.textContent = '⏹ Arrêter'; btn.classList.add('actif'); } _dicteeNote('Je vous écoute…'); };
  _dicteeReco.onresult = function (e) {
    var t = '';
    for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    if (zone) zone.value = (base ? base + ' ' : '') + t;
  };
  _dicteeReco.onerror = function (e) {
    var refuse = e && (e.error === 'not-allowed' || e.error === 'service-not-allowed');
    _dicteeNote(refuse ? 'Accès au micro refusé. Autorisez-le dans votre navigateur, ou écrivez la phrase.' : 'Le micro n’a rien entendu. Réessayez ou écrivez la phrase.', true);
  };
  _dicteeReco.onend = function () { _dicteeEnCours = false; if (btn) { btn.innerHTML = '&#127908; Dicter'; btn.classList.remove('actif'); } };
  try { _dicteeReco.start(); } catch (e) { _dicteeNote('Le micro n’a pas pu démarrer.', true); }
}

async function remplirFactureParIA() {
  var zone = document.getElementById('dictee-texte');
  var texte = zone ? zone.value.trim() : '';
  if (texte.length < 5) { _dicteeNote('Dictez ou écrivez d’abord une phrase.', true); return; }
  if (!_dicteeConsentement()) return;
  if (_dicteeEnCours && _dicteeReco) { try { _dicteeReco.stop(); } catch (e) {} }
  var bouton = document.getElementById('dictee-ok');
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Lecture en cours…'; }
  _dicteeNote('Je prépare votre facture…');
  try {
    var r = await fetch('/api/dicter-facture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (sb.token || '') },
      body: JSON.stringify({ texte: texte, tva_defaut: Number((STATE.profil && STATE.profil.tva_defaut) || 20), devise: STATE.deviseF || 'MAD' })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { _dicteeNote(d.erreur || 'Impossible pour le moment, réessayez.', true); return; }
    if (!d.lignes || !d.lignes.length) { _dicteeNote('Je n’ai trouvé aucun article. Précisez les articles et les prix.', true); return; }
    var champ = document.getElementById('f-client');
    if (champ && d.client) {
      var c = _trouverClient(d.client);
      champ.value = c ? c.nom : d.client;
    }
    STATE.lignesF = STATE.lignesF || [];
    d.lignes.forEach(function (l) { STATE.lignesF.push({ desc: l.desc, qte: l.qte, pu: l.pu, unite: l.unite || 'u', tva: l.tva }); });
    renderLignesF();
    if (zone) zone.value = '';
    var sans = d.lignes.filter(function (l) { return !(l.pu > 0); }).length;
    var msg = d.lignes.length + ' ligne' + (d.lignes.length > 1 ? 's' : '') + ' ajoutée' + (d.lignes.length > 1 ? 's' : '') + '. Vérifiez avant d’enregistrer.';
    if (sans) msg += ' ' + sans + ' sans prix : complétez-le.';
    if (d.avertissement) msg += ' ' + d.avertissement;
    _dicteeNote(msg);
    showToast('Facture préremplie, vérifiez les lignes');
  } catch (e) {
    _dicteeNote('Connexion impossible, réessayez.', true);
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = 'Remplir la facture'; }
  }
}
