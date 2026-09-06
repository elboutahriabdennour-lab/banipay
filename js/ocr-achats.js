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
async function lireFactureParOCR(imageDataUrl) {
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
      el('achat-fournisseur').style.background = '#FBF0DA';
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
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = function() {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _pdfjsChargement;
}
async function lireFacturePDF(pdfDataUrl) {
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
      el('achat-fournisseur').style.background = '#FBF0DA';
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
