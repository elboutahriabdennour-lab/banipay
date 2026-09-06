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

    const description = ligne
      .replace(m[1], '')
      .replace(m[2], '')
      .replace(/[|;]/g, ' ')
      .trim()
      .slice(0, 80);
    if (description.length < 3) continue;

    transactions.push({ dateBrute: dateBrute, description: description, montant: montant });
  }
  return transactions;
}

// FIX (retour utilisateur) : ne cherchait auparavant que du côté des
// factures de vente (encaissements clients) — un virement SORTANT vers
// un fournisseur, même correspondant exactement à un achat déjà
// enregistré, s'affichait toujours comme "aucune correspondance",
// puisque STATE.achats n'était jamais consulté. Cherche désormais des
// deux côtés, et marque chaque correspondance par son type (_type)
// pour que l'affichage et la confirmation sachent quelle table mettre
// à jour.
function suggererRapprochements(transactions) {
  const facturesCandidates = (STATE.factures || []).filter(function(f) {
    return f.statut !== 'payee' && f.statut !== 'refusee';
  });
  const achatsCandidats = (STATE.achats || []).filter(function(a) {
    return a.statut !== 'payee';
  });
  return transactions.map(function(t) {
    const correspondancesFactures = facturesCandidates.filter(function(f) {
      return Math.abs(Number(f.ttc || 0) - t.montant) < 1;
    }).map(function(f) {
      return { id: f.id, ref: f.ref, client: f.client, _type: 'facture' };
    });
    const correspondancesAchats = achatsCandidats.filter(function(a) {
      return Math.abs(Number(a.ttc || 0) - t.montant) < 1;
    }).map(function(a) {
      return { id: a.id, ref: a.ref_fournisseur || '', client: a.fournisseur || '', _type: 'achat' };
    });
    return Object.assign({}, t, { correspondances: correspondancesFactures.concat(correspondancesAchats) });
  });
}

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
              const estAchat = f._type === 'achat';
              const libelle = estAchat ? 'l\'achat' : 'la facture';
              const couleurFond = estAchat ? '#F5E4E1' : '#EEF3E4';
              const couleurTexte = estAchat ? '#8E2E24' : '#55702E';
              return '<button onclick="confirmerRapprochementReleve(\'' + f.id + '\',\'' + f._type + '\',' + i + ')" style="width:100%;padding:9px;background:' + couleurFond + ';color:' + couleurTexte + ';border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:4px">✅ Lier à ' + libelle + ' ' + escapeHTML(f.ref || '') + ' — ' + escapeHTML(f.client || '') + '</button>';
            }).join('')
          : '<div style="font-size:11px;color:#9C9186">Aucune correspondance trouvée</div>') +
      '</div>';
    }).join('');
}

// FIX (retour utilisateur) : prend maintenant un paramètre type
// ('facture' ou 'achat') pour mettre à jour la bonne table — auparavant
// cette fonction ne savait faire que des factures de vente.
async function confirmerRapprochementReleve(id, type, indexTransaction) {
  if (type === 'achat') {
    try {
      await sb.patch('factures_achat', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'payee' });
      const a = (STATE.achats || []).find(function(x) { return String(x.id) === String(id); });
      if (a) a.statut = 'payee';
    } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }
  } else if (typeof marquerPayee === 'function') {
    await marquerPayee(id);
  } else {
    try {
      await sb.patch('factures', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'payee' });
      const f = (STATE.factures || []).find(function(x) { return String(x.id) === String(id); });
      if (f) f.statut = 'payee';
    } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }
  }
  if (STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction]) {
    STATE._transactionsReleveActuel[indexTransaction].correspondances = [];
    STATE._transactionsReleveActuel[indexTransaction]._traitee = true;
  }
  renderTransactionsReleve();
  showToast(type === 'achat' ? '✅ Achat rapproché' : '✅ Facture rapprochée', 'success');
}
