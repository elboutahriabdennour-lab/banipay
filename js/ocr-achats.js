// ZELTO — ocr-achats.js — Lecture automatique basique des factures d'achat
// ============================================================
// IMPORTANT — à bien calibrer les attentes : ceci est de la reconnaissance
// de texte (OCR, via Tesseract.js) combinée à des heuristiques simples
// (expressions régulières) pour deviner le fournisseur / la date / le
// montant total. Ce n'est PAS une IA qui "comprend" une facture comme le
// ferait un comptable — sur une photo floue, mal cadrée, ou une facture
// dans un format inhabituel, les suggestions seront fausses ou vides.
// Les champs sont pré-remplis comme SUGGESTIONS à vérifier, jamais
// enregistrés directement sans passage par l'utilisateur.
// NOUVEAU: Tesseract.js (~2-3 Mo) n'est chargé qu'au moment où une photo
// est réellement prise — plus de ralentissement du chargement de l'app
// pour tout le monde alors que peu l'utilisent à chaque session.
let _tesseractChargement = null;
function _chargerTesseract() {
  if (typeof Tesseract !== 'undefined') return Promise.resolve();
  if (_tesseractChargement) return _tesseractChargement;
  _tesseractChargement = new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _tesseractChargement;
}
async function _lireFactureTesseract(imageDataUrl) {
  try {
    await _chargerTesseract();
  } catch(e) {
    console.warn('Tesseract.js n\'a pas pu être chargé — lecture automatique indisponible');
    return;
  }
  const zoneStatut = document.createElement('div');
  zoneStatut.id = 'ocr-statut';
  zoneStatut.style.cssText = 'margin-top:8px;padding:8px 12px;background:#F7EFDC;color:#B8860B;border-radius:8px;font-size:11px;font-weight:600';
  zoneStatut.textContent = '🔍 Lecture automatique en cours...';
  const preview = el('achat-pj-preview');
  if (preview) preview.appendChild(zoneStatut);
  try {
    const resultat = await Tesseract.recognize(imageDataUrl, 'fra', {
      logger: function() {} // pas de log verbeux
    });
    const texte = resultat.data.text || '';
    const suggestions = _extraireSuggestionsFacture(texte);
    if (zoneStatut) {
      const nbTrouve = Object.values(suggestions).filter(Boolean).length;
      zoneStatut.style.background = nbTrouve ? '#EEF3E4' : '#F5E4E1';
      zoneStatut.style.color = nbTrouve ? '#55702E' : '#B23A2E';
      zoneStatut.textContent = nbTrouve
        ? '✅ Lecture automatique : ' + nbTrouve + ' info(s) suggérée(s) — à vérifier avant d\'enregistrer'
        : '⚠️ Lecture automatique : aucune info fiable détectée — remplissez manuellement';
    }
    // Pré-remplissage EN SUGGESTION (l'utilisateur voit et corrige, rien
    // n'est appliqué silencieusement) — seulement si le champ est vide.
    if (suggestions.fournisseur && el('achat-fournisseur') && !el('achat-fournisseur').value) {
      el('achat-fournisseur').value = suggestions.fournisseur;
      el('achat-fournisseur').style.background = '#E7F2EC';
    }
    if (suggestions.date && el('achat-date') && !el('achat-date').value) {
      el('achat-date').value = suggestions.date;
    }
    // FIX (retour utilisateur) : le montant — le champ le plus risqué en
    // cas d'erreur de lecture (une virgule mal interprétée peut
    // transformer 1250 en 12,50 sans que rien ne l'indique) — était
    // ajouté directement à la ligne d'achat sans jamais demander
    // confirmation. Le nom du fournisseur et la date restent pré-remplis
    // sans confirmation bloquante (déjà visuellement signalés en orange,
    // risque bien moindre qu'un montant faux), mais le montant demande
    // désormais une confirmation explicite avant d'être ajouté.
    if (suggestions.montantTTC && !STATE.lignesAchat.length) {
      const confirme = confirm('Montant détecté par la lecture automatique : ' + suggestions.montantTTC.toFixed(2) + ' MAD\n\nAjouter une ligne avec ce montant ? Vérifiez-le bien avant de confirmer.');
      if (confirme) {
        STATE.lignesAchat.push({ desc: 'Ligne suggérée par lecture automatique (à vérifier)', qte: 1, pu: suggestions.montantTTC, unite: 'u', produit_id: null });
        if (typeof renderLignesAchat === 'function') renderLignesAchat();
      }
    }
  } catch(e) {
    if (zoneStatut) {
      zoneStatut.style.background = '#F5E4E1';
      zoneStatut.style.color = '#B23A2E';
      zoneStatut.textContent = '❌ Lecture automatique indisponible (' + e.message + ') — remplissez manuellement';
    }
  }
}
let _pdfjsChargement = null;
function _chargerPdfJs() {
  if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
  if (_pdfjsChargement) return _pdfjsChargement;
  _pdfjsChargement = new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    // FIX (bug réel signalé — même souci que SheetJS, un utilisateur ne
    // pouvait charger aucune bibliothèque venant de cdnjs.cloudflare.com)
    // : bascule sur cdn.jsdelivr.net, déjà utilisé ailleurs dans l'app
    // sans problème chez lui (QR code, Tesseract.js).
    script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    script.onload = function() {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _pdfjsChargement;
}
async function _lireFacturePDFLocal(pdfDataUrl) {
  try {
    await _chargerPdfJs();
  } catch(e) {
    console.warn('PDF.js n\'a pas pu être chargé — lecture automatique du PDF indisponible');
    return;
  }
  const zoneStatut = document.createElement('div');
  zoneStatut.id = 'ocr-statut';
  zoneStatut.style.cssText = 'margin-top:8px;padding:8px 12px;background:#F7EFDC;color:#B8860B;border-radius:8px;font-size:11px;font-weight:600';
  zoneStatut.textContent = '🔍 Lecture du PDF en cours...';
  const preview = el('achat-pj-preview');
  if (preview) preview.appendChild(zoneStatut);
  try {
    const base64 = pdfDataUrl.split(',')[1];
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: octets }).promise;
    let texte = '';
    const nbPages = Math.min(doc.numPages, 3);
    for (let p = 1; p <= nbPages; p++) {
      const page = await doc.getPage(p);
      const contenu = await page.getTextContent();
      texte += contenu.items.map(function(it) { return it.str; }).join('\n') + '\n';
    }
    const suggestions = _extraireSuggestionsFacture(texte);
    if (zoneStatut) {
      const nbTrouve = Object.values(suggestions).filter(Boolean).length;
      zoneStatut.style.background = nbTrouve ? '#EEF3E4' : '#F5E4E1';
      zoneStatut.style.color = nbTrouve ? '#55702E' : '#B23A2E';
      zoneStatut.textContent = nbTrouve
        ? '✅ Lecture du PDF : ' + nbTrouve + ' info(s) suggérée(s) — à vérifier avant d\'enregistrer'
        : '⚠️ Lecture du PDF : aucune info fiable détectée — remplissez manuellement';
    }
    if (suggestions.fournisseur && el('achat-fournisseur') && !el('achat-fournisseur').value) {
      el('achat-fournisseur').value = suggestions.fournisseur;
      el('achat-fournisseur').style.background = '#E7F2EC';
    }
    if (suggestions.date && el('achat-date') && !el('achat-date').value) {
      el('achat-date').value = suggestions.date;
    }
    // FIX (retour utilisateur) : même correctif que pour la lecture par
    // photo — voir le commentaire détaillé dans lireFactureParOCR().
    if (suggestions.montantTTC && !STATE.lignesAchat.length) {
      const confirme = confirm('Montant détecté par la lecture automatique : ' + suggestions.montantTTC.toFixed(2) + ' MAD\n\nAjouter une ligne avec ce montant ? Vérifiez-le bien avant de confirmer.');
      if (confirme) {
        STATE.lignesAchat.push({ desc: 'Ligne suggérée par lecture automatique du PDF (à vérifier)', qte: 1, pu: suggestions.montantTTC, unite: 'u', produit_id: null });
        if (typeof renderLignesAchat === 'function') renderLignesAchat();
      }
    }
  } catch(e) {
    if (zoneStatut) {
      zoneStatut.style.background = '#F5E4E1';
      zoneStatut.style.color = '#B23A2E';
      zoneStatut.textContent = '❌ Lecture du PDF indisponible (' + e.message + ') — remplissez manuellement. Si le PDF est un scan (image), la lecture automatique ne fonctionne que sur les PDF texte.';
    }
  }
}
function _extraireSuggestionsFacture(texte) {
  const suggestions = { fournisseur: null, date: null, montantTTC: null };
  const matchDate = texte.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchDate) {
    const j = matchDate[1].padStart(2,'0'), m = matchDate[2].padStart(2,'0'), a = matchDate[3];
    suggestions.date = a + '-' + m + '-' + j;
  }
  const motifsMontant = [
    /TOTAL\s*TTC[^\d]{0,15}(\d[\d\s.,]{1,12}\d)/i,
    /MONTANT\s*TTC[^\d]{0,15}(\d[\d\s.,]{1,12}\d)/i,
    /NET\s*[ÀA]\s*PAYER[^\d]{0,15}(\d[\d\s.,]{1,12}\d)/i,
    /(?<!SOUS[\s-])TOTAL(?!\s*H\.?T\.?)[^\d]{0,15}(\d[\d\s.,]{1,12}\d)/i,
  ];
  for (const motif of motifsMontant) {
    const m = texte.match(motif);
    if (!m) continue;
    const brut = m[1].replace(/\s/g, '').replace(',', '.');
    const val = parseFloat(brut);
    if (!isNaN(val) && val > 0 && val < 10000000) { suggestions.montantTTC = val; break; }
  }
  const motsTitreAExclure = /^(FACTURE|DEVIS|BON\s*DE\s*(LIVRAISON|COMMANDE)|RE[CÇ]U|TICKET|INVOICE|QUITTANCE|ORIGINAL|DUPLICATA)S?\s*(N[°O]?\.?\s*[\d-]*)?$/i;
  const lignes = texte.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  for (const ligne of lignes.slice(0, 8)) {
    if (motsTitreAExclure.test(ligne)) continue;
    if (/[a-zA-ZÀ-ÿ]{3,}/.test(ligne) && !/^\d+$/.test(ligne) && ligne.length < 60) {
      suggestions.fournisseur = ligne;
      break;
    }
  }
  return suggestions;
}

// ============================================================
// LECTURE PAR IA (api/lire-document.js) — avec repli sur la lecture locale
// L'IA propose, l'utilisateur vérifie. Les montants ne sont remplis que si les calculs de la facture tombent juste.
// ============================================================
function _iaDocConsentement() {
  try { if (localStorage.getItem('tafir_ia_doc_ok') === '1') return true; } catch (e) {}
  var ok = confirm('Cette facture (photo ou PDF) sera envoyée à un service d’intelligence artificielle (Anthropic) pour être lue. Elle est traitée selon les conditions de ce prestataire. N’envoyez pas de document sensible. Continuer ?');
  if (ok) { try { localStorage.setItem('tafir_ia_doc_ok', '1'); } catch (e) {} }
  return ok;
}
function _reduireImage(dataUrl, maxCote) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var k = Math.min(1, maxCote / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = function () { resolve(dataUrl); };
    img.src = dataUrl;
  });
}
function _statutLecture(texte, ton) {
  var z = document.getElementById('ocr-statut');
  if (!z) {
    z = document.createElement('div'); z.id = 'ocr-statut';
    var pv = el('achat-pj-preview'); if (pv) pv.appendChild(z);
  }
  var couleurs = { info: ['#F7EFDC', '#8A5A00'], ok: ['#EEF3E4', '#55702E'], alerte: ['#F5E4E1', '#B23A2E'] };
  var c = couleurs[ton || 'info'];
  z.style.cssText = 'margin-top:8px;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:600;line-height:1.5;background:' + c[0] + ';color:' + c[1];
  z.textContent = texte;
}
function _fmtMad(n) { return (typeof fmt === 'function' ? fmt(n) : Number(n).toFixed(2)) + ' MAD'; }

async function _lireParIA(dataUrl) {
  // Retourne true si l'IA a répondu (même avec un résultat incertain), false pour passer à la lecture locale.
  if (!sb.token) return false;
  if (!_iaDocConsentement()) return false;
  _statutLecture('🔍 Lecture par IA en cours… (quelques secondes)', 'info');
  var envoi = dataUrl;
  if (dataUrl.indexOf('data:image/') === 0) envoi = await _reduireImage(dataUrl, 1800);
  var r;
  try {
    r = await fetch('/api/lire-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sb.token },
      body: JSON.stringify({ fichier: envoi })
    });
  } catch (e) { return false; }
  var d = await r.json().catch(function () { return {}; });
  if (r.status === 503 || r.status === 404 || r.status === 401) return false;
  if (!r.ok) { if (typeof showToast === 'function') showToast(d.erreur || 'Lecture par IA impossible, lecture locale à la place.', 'error'); return false; }
  _appliquerLectureIA(d);
  return true;
}

function _appliquerLectureIA(d) {
  if (!d.lisible) { _statutLecture('⚠️ Document illisible ou ce n’est pas une facture. Prenez une photo plus nette, bien cadrée, ou remplissez à la main.', 'alerte'); return; }
  var mettre = function (id, val) { var e = el(id); if (e && val && !e.value) { e.value = val; e.style.background = '#E7F2EC'; } };
  mettre('achat-fournisseur', d.fournisseur);
  mettre('achat-ref', d.numero);
  mettre('achat-date', d.date);
  mettre('achat-echeance', d.echeance);
  var notes = (d.avertissements || []).slice();
  var montantsRemplis = false;
  if (d.coherent && !(STATE.lignesAchat && STATE.lignesAchat.length)) {
    STATE.lignesAchat = STATE.lignesAchat || [];
    if (d.lignes && d.lignes.length) {
      d.lignes.forEach(function (l) { STATE.lignesAchat.push({ desc: l.desc, qte: l.qte, pu: l.pu, unite: 'u', produit_id: null }); });
    } else if (d.ht != null) {
      STATE.lignesAchat.push({ desc: 'Facture ' + (d.numero || d.fournisseur || 'fournisseur'), qte: 1, pu: d.ht, unite: 'u', produit_id: null });
    }
    // Taux de TVA principal : celui de la plus grosse base.
    var taux = null;
    if (d.parTaux && d.parTaux.length) {
      taux = d.parTaux.slice().sort(function (a, b) { return (b.base || 0) - (a.base || 0); })[0].taux;
      if (d.parTaux.length > 1) notes.push('Plusieurs taux de TVA sur cette facture : l’application en applique un seul, comparez avec le total TTC imprimé.');
    } else if (d.ht > 0 && d.tva != null) taux = Math.round(d.tva / d.ht * 100);
    var sel = el('achat-tva-taux');
    if (sel && taux != null && Array.prototype.some.call(sel.options, function (o) { return Number(o.value) === Number(taux); })) sel.value = String(taux);
    if (typeof renderLignesAchat === 'function') renderLignesAchat();
    if (typeof calcAchatTotaux === 'function') calcAchatTotaux();
    montantsRemplis = STATE.lignesAchat.length > 0;
    // Dernier contrôle : le total calculé par l'application doit égaler le TTC imprimé.
    var htApp = STATE.lignesAchat.reduce(function (s, l) { return s + (Number(l.qte) || 0) * (Number(l.pu) || 0); }, 0);
    var ttcApp = htApp * (1 + (parseFloat((el('achat-tva-taux') || {}).value || 20) / 100));
    if (d.ttc != null && Math.abs(ttcApp - d.ttc) > 0.05) notes.push('Le total calculé (' + _fmtMad(ttcApp) + ') diffère du TTC imprimé (' + _fmtMad(d.ttc) + ') : vérifiez les lignes et le taux.');
  }
  if (!d.coherent) {
    _statutLecture('⚠️ Les montants lus ne s’additionnent pas : je ne les ai pas remplis pour éviter une erreur. Le fournisseur, le numéro et les dates sont proposés. Saisissez les montants à la main (ou refaites une photo plus nette).' + (notes.length ? ' ' + notes.join(' ') : ''), 'alerte');
    return;
  }
  var base = '✅ Lue par IA' + (d.modeleFort ? ' (seconde lecture renforcée)' : '') + '. Contrôle des calculs : OK' + (d.ttc != null ? ' (total TTC lu : ' + _fmtMad(d.ttc) + ')' : '') + '. Vérifiez avant d’enregistrer.';
  _statutLecture(base + (notes.length ? ' ⚠️ ' + notes.join(' ') : ''), notes.length ? 'info' : 'ok');
}

async function lireFactureParOCR(imageDataUrl) {
  var ok = false;
  try { ok = await _lireParIA(imageDataUrl); } catch (e) { ok = false; }
  if (!ok) { var z1 = document.getElementById('ocr-statut'); if (z1) z1.remove(); return _lireFactureTesseract(imageDataUrl); }
}
async function lireFacturePDF(pdfDataUrl) {
  var ok = false;
  try { if (pdfDataUrl.length <= 4000000) ok = await _lireParIA(pdfDataUrl); } catch (e) { ok = false; }
  if (!ok) { var z2 = document.getElementById('ocr-statut'); if (z2) z2.remove(); return _lireFacturePDFLocal(pdfDataUrl); }
}
