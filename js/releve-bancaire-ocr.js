// ZELTO — releve-bancaire-ocr.js — Lecture et rapprochement des relevés
// ============================================================
// PÉRIMÈTRE HONNÊTE : les relevés bancaires marocains ont des mises en
// page très différentes d'une banque à l'autre — contrairement aux
// factures d'achat (assez similaires entre elles), il n'existe pas de
// format universel. Cette première version utilise une heuristique
// générique (ligne = date + description + montant) qui fonctionnera
// raisonnablement sur beaucoup de relevés, mais certainement pas tous.
// Chaque suggestion reste à vérifier — rien n'est jamais lié
// automatiquement sans confirmation.

async function lireReleveBancaire(pdfDataUrl) {
  try {
    await _chargerPdfJs();
  } catch(e) {
    console.warn('PDF.js indisponible — lecture automatique du relevé impossible');
    return null;
  }
  try {
    const base64 = pdfDataUrl.split(',')[1];
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: octets }).promise;
    let texte = '';
    // NOUVEAU : contrairement à une facture (info sur la 1ère page), un
    // relevé mensuel peut compter de nombreuses transactions sur
    // plusieurs pages — limite montée à 20 pages (un relevé mensuel
    // dépasse rarement cette longueur).
    const nbPages = Math.min(doc.numPages, 20);
    for (let p = 1; p <= nbPages; p++) {
      const page = await doc.getPage(p);
      const contenu = await page.getTextContent();
      texte += contenu.items.map(function(it) { return it.str; }).join(' ') + '\n';
    }
    return _extraireTransactionsReleve(texte);
  } catch(e) {
    console.warn('lireReleveBancaire:', e);
    return null;
  }
}

// Détecte les lignes ressemblant à une transaction : une date, puis du
// texte, puis un montant. Volontairement tolérant sur les formats de
// date et de montant (espaces, virgule ou point comme séparateur
// décimal, espace comme séparateur de milliers).
function _extraireTransactionsReleve(texte) {
  const transactions = [];
  const lignes = texte.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

  const motifLigne = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}).{3,80}?([\d\s]{1,9}[.,]\d{2})\s*$/;

  for (const ligne of lignes) {
    const m = ligne.match(motifLigne);
    if (!m) continue;

    const dateBrute = m[1];
    const montantBrut = m[2].replace(/\s/g, '').replace(',', '.');
    const montant = parseFloat(montantBrut);
    if (isNaN(montant) || montant <= 0 || montant > 10000000) continue;

    // Description : tout ce qui reste entre la date et le montant
    const description = ligne
      .replace(m[1], '')
      .replace(m[2], '')
      .replace(/[|;]/g, ' ')
      .trim()
      .slice(0, 80);
    if (description.length < 3) continue; // trop court pour être fiable

    transactions.push({ dateBrute: dateBrute, description: description, montant: montant });
  }
  return transactions;
}

// Pour chaque transaction, cherche des factures dont le montant TTC est
// proche (tolérance de 1 MAD pour absorber d'éventuels arrondis) et qui
// ne sont pas déjà marquées payées — jamais de lien automatique, juste
// une proposition que l'entreprise doit confirmer elle-même.
function suggererRapprochements(transactions) {
  const facturesCandidates = (STATE.factures || []).filter(function(f) {
    return f.statut !== 'payee' && f.statut !== 'refusee';
  });
  return transactions.map(function(t) {
    const correspondances = facturesCandidates.filter(function(f) {
      return Math.abs(Number(f.ttc || 0) - t.montant) < 1;
    });
    return Object.assign({}, t, { correspondances: correspondances });
  });
}

// ============================================================
// AFFICHAGE — déclenché depuis l'écran Relevés, sur un relevé déjà uploadé
// ============================================================
async function analyserReleve(releveId) {
  const releve = (STATE.releves || []).find(function(r) { return String(r.id) === String(releveId); });
  if (!releve) return;
  showToast('🔍 Lecture du relevé en cours...');
  const transactions = await lireReleveBancaire(releve.data);
  if (!transactions || !transactions.length) {
    showToast('⚠️ Aucune transaction reconnue dans ce relevé — la mise en page de cette banque n\'est peut-être pas encore prise en charge', 'error');
    return;
  }
  const avecSuggestions = suggererRapprochements(transactions);
  STATE._transactionsReleveActuel = avecSuggestions;
  renderTransactionsReleve();
  goScreen('rapprochement-releve', null);
}

function renderTransactionsReleve() {
  const zone = el('rapprochement-releve-content');
  if (!zone) return;
  const transactions = STATE._transactionsReleveActuel || [];
  if (!transactions.length) {
    zone.innerHTML = '<div class="empty"><div class="empty-ico">🏦</div><div class="empty-title">Aucune transaction</div></div>';
    return;
  }
  zone.innerHTML = '<div style="padding:10px 20px;font-size:11px;color:#9C9186">Lecture automatique — à vérifier avant de confirmer. Certaines transactions peuvent manquer ou être mal reconnues selon la mise en page de votre banque.</div>' +
    transactions.map(function(t, i) {
      const aDesCorrespondances = t.correspondances && t.correspondances.length > 0;
      return '<div style="background:#fff;border-radius:12px;padding:14px;margin:0 20px 10px;border:1px solid #E3DCCF">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
          '<span style="font-size:12px;color:#6B5F54">' + escapeHTML(t.dateBrute) + ' · ' + escapeHTML(t.description) + '</span>' +
          '<span style="font-weight:700;font-size:13px">' + fmt(t.montant) + ' MAD</span>' +
        '</div>' +
        (aDesCorrespondances
          ? t.correspondances.map(function(f) {
              return '<button onclick="confirmerRapprochementReleve(\'' + f.id + '\',' + i + ')" style="width:100%;padding:9px;background:#EEF3E4;color:#55702E;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">✅ Lier à la facture ' + escapeHTML(f.ref || '') + ' — ' + escapeHTML(f.client || '') + '</button>';
            }).join('')
          : '<div style="font-size:11px;color:#9C9186">Aucune facture correspondante trouvée</div>') +
      '</div>';
    }).join('');
}

// Marque la facture comme payée — ne fait RIEN d'automatique au-delà de
// cette seule confirmation explicite de la personne.
async function confirmerRapprochementReleve(factureId, indexTransaction) {
  if (typeof marquerPayee === 'function') {
    await marquerPayee(factureId);
  } else {
    try {
      await sb.patch('factures', 'id=eq.' + factureId + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'payee' });
      const f = (STATE.factures || []).find(function(x) { return String(x.id) === String(factureId); });
      if (f) f.statut = 'payee';
    } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }
  }
  if (STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction]) {
    STATE._transactionsReleveActuel[indexTransaction].correspondances = [];
    STATE._transactionsReleveActuel[indexTransaction]._traitee = true;
  }
  renderTransactionsReleve();
  showToast('✅ Facture rapprochée', 'success');
}
