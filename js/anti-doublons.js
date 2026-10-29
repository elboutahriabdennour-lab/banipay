// Tafir — détection des doublons : une même facture, un même client ou un même relevé n'entre qu'une fois.
// Doublon CERTAIN (même fournisseur + même n° de facture) : on bloque.
// Doublon PROBABLE (même fournisseur + même montant + même date) : on demande confirmation.
function _adNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function _adRef(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function _adMemeNom(a, b) {
  a = _adNorm(a); b = _adNorm(b);
  if (!a || !b) return false;
  return a === b || (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
}
// Cherche, parmi les achats déjà enregistrés, celui qui ressemble à "a". Renvoie { niveau, achat } ou null.
function trouverDoublonAchat(a, ignorerId) {
  var liste = STATE.achats || [];
  var ref = _adRef(a.ref_fournisseur), probable = null;
  for (var i = 0; i < liste.length; i++) {
    var x = liste[i];
    if (ignorerId && String(x.id) === String(ignorerId)) continue;
    if (a.facture_source_id && x.facture_source_id && String(x.facture_source_id) === String(a.facture_source_id)) return { niveau: 'certain', achat: x };
    if (!_adMemeNom(x.fournisseur, a.fournisseur)) continue;
    var refX = _adRef(x.ref_fournisseur);
    if (ref && refX && ref === refX) return { niveau: 'certain', achat: x };
    var memeMontant = Math.abs((Number(x.ttc) || 0) - (Number(a.ttc) || 0)) < 0.01 && (Number(a.ttc) || 0) > 0;
    var memeDate = x.date_achat && a.date_achat && String(x.date_achat).slice(0, 10) === String(a.date_achat).slice(0, 10);
    var refsDifferentes = ref && refX && ref !== refX;
    if (memeMontant && memeDate && !refsDifferentes && !probable) probable = { niveau: 'probable', achat: x };
  }
  return probable;
}
function _adDescription(x) {
  return (x.fournisseur || '') + (x.ref_fournisseur ? ' — n° ' + x.ref_fournisseur : '') + ' — ' + (typeof fmt === 'function' ? fmt(x.ttc || 0) : x.ttc) + ' MAD' + (x.date_achat ? ' — ' + String(x.date_achat).slice(0, 10).split('-').reverse().join('/') : '');
}
// Renvoie true si on peut enregistrer, false sinon (le message est déjà affiché).
async function _adControleAchat(achat) {
  var d = trouverDoublonAchat(achat);
  if (!d) return true;
  if (d.niveau === 'certain') {
    showToast('⛔ Cette facture est déjà enregistrée : ' + _adDescription(d.achat), 'error');
    return false;
  }
  return confirm('⚠️ Une facture très semblable existe déjà :\n' + _adDescription(d.achat) + '\n\nSi c’est la même, ne l’enregistrez pas une seconde fois.\n\nEnregistrer quand même ?');
}
// Avertissement dès la lecture automatique, avant même d'appuyer sur « Enregistrer ».
function _adAlerteLecture() {
  try {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    var ht = (STATE.lignesAchat || []).reduce(function (s, l) { return s + (Number(l.qte) || 0) * (Number(l.pu) || 0); }, 0);
    var ttc = ht * (1 + (parseFloat(g('achat-tva-taux')) || 20) / 100);
    var d = trouverDoublonAchat({ fournisseur: g('achat-fournisseur'), ref_fournisseur: g('achat-ref'), date_achat: g('achat-date'), ttc: ttc });
    if (!d) return;
    var z = document.getElementById('ocr-statut');
    var avert = document.createElement('div');
    avert.style.cssText = 'margin-top:6px;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;line-height:1.5;background:#F5E4E1;color:#B23A2E';
    avert.textContent = (d.niveau === 'certain' ? '⛔ Doublon : cette facture est déjà enregistrée (' : '⚠️ Doublon possible : une facture très semblable existe (') + _adDescription(d.achat) + ').';
    if (z && z.parentNode) z.parentNode.appendChild(avert);
  } catch (e) {}
}
if (typeof _appliquerLectureIA === 'function') {
  var _adAncienneLecture = _appliquerLectureIA;
  _appliquerLectureIA = function (d) { _adAncienneLecture(d); _adAlerteLecture(); };
}

// Clients : même ICE, ou même nom.
function trouverDoublonClient(nom, ice, ignorerId) {
  var liste = STATE.clients || [], iceN = String(ice || '').replace(/\s/g, '');
  for (var i = 0; i < liste.length; i++) {
    var c = liste[i];
    if (ignorerId && String(c.id) === String(ignorerId)) continue;
    if (iceN && String(c.ice || '').replace(/\s/g, '') === iceN) return c;
    if (_adNorm(c.nom) && _adNorm(c.nom) === _adNorm(nom)) return c;
  }
  return null;
}
// Relevés : même fichier (nom + taille), ou même banque et même mois.
function trouverDoublonReleve(file, banque, mois, annee) {
  var liste = STATE.releves || [], taille = (file.size / 1024).toFixed(0) + ' KB';
  for (var i = 0; i < liste.length; i++) {
    var r = liste[i];
    if (r.nom_fichier === file.name && r.taille === taille) return r;
    if (String(r.mois) === String(mois) && String(r.annee) === String(annee) && _adNorm(r.banque) === _adNorm(banque)) return r;
  }
  return null;
}
