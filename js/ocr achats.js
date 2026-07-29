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

async function lireFactureParOCR(imageDataUrl) {
  if (typeof Tesseract === 'undefined') {
    console.warn('Tesseract.js non chargé — lecture automatique indisponible');
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
    if (suggestions.montantTTC && !STATE.lignesAchat.length) {
      // Propose une ligne unique avec le montant détecté — l'utilisateur
      // peut la modifier ou la remplacer par des lignes détaillées.
      STATE.lignesAchat.push({ desc: 'Ligne suggérée par lecture automatique (à vérifier)', qte: 1, pu: suggestions.montantTTC, unite: 'u', produit_id: null });
      if (typeof renderLignesAchat === 'function') renderLignesAchat();
    }
  } catch(e) {
    if (zoneStatut) {
      zoneStatut.style.background = '#F5E4E1';
      zoneStatut.style.color = '#B23A2E';
      zoneStatut.textContent = '❌ Lecture automatique indisponible (' + e.message + ') — remplissez manuellement';
    }
  }
}

// Heuristiques simples sur le texte brut extrait par l'OCR
function _extraireSuggestionsFacture(texte) {
  const suggestions = { fournisseur: null, date: null, montantTTC: null };

  // Date : formats JJ/MM/AAAA ou JJ-MM-AAAA
  const matchDate = texte.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchDate) {
    const j = matchDate[1].padStart(2,'0'), m = matchDate[2].padStart(2,'0'), a = matchDate[3];
    suggestions.date = a + '-' + m + '-' + j;
  }

  // Montant : cherche "TOTAL"/"MONTANT TTC"/"NET A PAYER" suivi d'un nombre
  const matchMontant = texte.match(/(?:TOTAL\s*TTC|MONTANT\s*TTC|NET\s*A\s*PAYER|TOTAL)[^\d]{0,15}(\d[\d\s.,]{1,12}\d)/i);
  if (matchMontant) {
    const brut = matchMontant[1].replace(/\s/g, '').replace(',', '.');
    const val = parseFloat(brut);
    if (!isNaN(val) && val > 0 && val < 10000000) suggestions.montantTTC = val;
  }

  // Fournisseur : première ligne non vide avec au moins 3 lettres, en
  // écartant les lignes qui ressemblent à une date ou un numéro seul —
  // heuristique volontairement simple (souvent le nom de l'entreprise est
  // en haut du document).
  const lignes = texte.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  for (const ligne of lignes.slice(0, 5)) {
    if (/[a-zA-ZÀ-ÿ]{3,}/.test(ligne) && !/^\d+$/.test(ligne) && ligne.length < 60) {
      suggestions.fournisseur = ligne;
      break;
    }
  }

  return suggestions;
}
