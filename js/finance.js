// ZELTO — finance.js — Position financière consolidée
// Combine factures impayées (à recevoir), achats impayés (à payer) et
// valeur du stock pour donner une photo de trésorerie en un coup d'œil.

function renderPositionFinanciere() {
  const container = el('position-financiere-content');
  if (!container) return;

  const factures = STATE.factures || [];
  const achats = STATE.achats || [];
  const produits = STATE.produits || [];

  const aRecevoir = factures
    .filter(function(f) { return f.statut !== 'payee' && f.statut !== 'annulee' && f.statut !== 'brouillon'; })
    .reduce(function(s, f) { return s + Math.max(0, Number(f.ttc || 0) - Number(f.montant_recu || 0)); }, 0);

  const aPayer = achats
    .filter(function(a) { return a.statut !== 'payee'; })
    .reduce(function(s, a) { return s + Number(a.ttc || 0); }, 0);

  const valeurStock = typeof calculerValeurStockTotale === 'function' ? calculerValeurStockTotale() : 0;
  const suiviStock = produits.some(function(p) { return p.stock !== null && p.stock !== undefined; });

  const soldeNet = aRecevoir + valeurStock - aPayer;

  const nbFacturesImpayees = factures.filter(function(f) { return f.statut !== 'payee' && f.statut !== 'annulee' && f.statut !== 'brouillon'; }).length;
  const nbAchatsImpayes = achats.filter(function(a) { return a.statut !== 'payee'; }).length;

  container.innerHTML =
    '<div style="background:linear-gradient(160deg,#241F1B,#154F52);border-radius:16px;padding:20px;margin-bottom:16px">' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Solde net estimé</div>' +
      '<div style="font-size:30px;font-weight:800;color:' + (soldeNet >= 0 ? '#9CBB7A' : '#D98177') + '">' + fmt(soldeNet) + ' MAD</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">À recevoir + valeur du stock − à payer</div>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
      '<div style="background:#EEF3E4;border-radius:12px;padding:14px">' +
        '<div style="font-size:11px;font-weight:600;color:#55702E">💰 À recevoir</div>' +
        '<div style="font-size:18px;font-weight:800;color:#55702E">' + fmt(aRecevoir) + ' MAD</div>' +
        '<div style="font-size:10px;color:#55702E;margin-top:2px">' + nbFacturesImpayees + ' facture(s) impayée(s)</div>' +
      '</div>' +
      '<div style="background:#F5E4E1;border-radius:12px;padding:14px">' +
        '<div style="font-size:11px;font-weight:600;color:#B23A2E">🛒 À payer</div>' +
        '<div style="font-size:18px;font-weight:800;color:#B23A2E">' + fmt(aPayer) + ' MAD</div>' +
        '<div style="font-size:10px;color:#B23A2E;margin-top:2px">' + nbAchatsImpayes + ' achat(s) en attente</div>' +
      '</div>' +
    '</div>' +

    (suiviStock ?
      '<div style="background:#FBF0DA;border-radius:12px;padding:14px;margin-bottom:16px">' +
        '<div style="font-size:11px;font-weight:600;color:#A67A16">📦 Valeur du stock</div>' +
        '<div style="font-size:18px;font-weight:800;color:#A67A16">' + fmt(valeurStock) + ' MAD</div>' +
      '</div>' : '') +

    '<div style="font-size:11px;color:#9C9186;text-align:center;padding:0 8px">Estimation indicative basée sur les factures/achats enregistrés dans Zelto — ne remplace pas un état de trésorerie comptable complet.</div>' +
    '<div style="padding:16px 0"><button onclick="exporterEcrituresComptables(STATE.factures, STATE.achats, STATE.paiements, STATE.profil)" style="width:100%;padding:12px;background:#241F1B;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📤 Export comptable (CSV, plan comptable marocain)</button></div>' +
    '<button onclick="goScreen(\'rapprochement\',null)" style="width:100%;padding:12px;background:#1F6F72;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">🔗 Rapprocher mes paiements</button>';
}

// ============================================================
// RAPPROCHEMENT PAIEMENTS (mini lettrage côté entreprise)
// ============================================================
// Contrairement au lettrage comptable (controles_factures, réservé au
// comptable), ceci est un auto-pointage simple : l'entreprise coche
// elle-même les factures qu'elle a vérifiées sur son relevé bancaire.

function renderRapprochement() {
  const container = el('rapprochement-content');
  if (!container) return;

  const factures = (STATE.factures || []).filter(function(f) { return f.statut !== 'brouillon'; });
  if (!factures.length) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">🔗</div><div class="empty-title">Aucune facture</div></div>';
    return;
  }

  const filtre = STATE._filtreRapprochement || 'tous';
  let filtrees = factures;
  if (filtre === 'a_faire') filtrees = factures.filter(function(f) { return !f.rapproche; });
  else if (filtre === 'fait') filtrees = factures.filter(function(f) { return f.rapproche; });

  const nbFait = factures.filter(function(f) { return f.rapproche; }).length;

  container.innerHTML =
    '<div style="background:#EEF3E4;border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-size:12px;font-weight:600;color:#55702E">Rapprochées</span>' +
      '<span style="font-size:15px;font-weight:800;color:#55702E">' + nbFait + ' / ' + factures.length + '</span>' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:12px">' +
      ['tous', 'a_faire', 'fait'].map(function(f) {
        const label = f === 'tous' ? 'Toutes' : f === 'a_faire' ? 'À faire' : 'Faites';
        const actif = filtre === f;
        return '<button onclick="STATE._filtreRapprochement=\'' + f + '\';renderRapprochement()" style="flex:1;padding:8px;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:' + (actif ? '#1F6F72' : '#EAE4DA') + ';color:' + (actif ? '#fff' : '#6B5F54') + '">' + label + '</button>';
      }).join('') +
    '</div>' +
    filtrees.map(function(f) {
      const recu = Number(f.montant_recu || 0);
      return '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF;display:flex;align-items:center;gap:12px">' +
        '<button onclick="toggleRapprochementFacture(' + f.id + ')" style="width:32px;height:32px;border-radius:8px;border:2px solid ' + (f.rapproche ? '#6E8F4E' : '#E3DCCF') + ';background:' + (f.rapproche ? '#EEF3E4' : '#fff') + ';font-size:16px;cursor:pointer;flex-shrink:0;font-family:inherit">' + (f.rapproche ? '✓' : '') + '</button>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700">' + escapeHTML(f.client||'') + '</div>' +
          '<div style="font-size:11px;color:#9C9186">' + (f.ref||'') + ' · ' + (f.date_emission||'') + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          '<div style="font-size:13px;font-weight:700">' + fmt(f.ttc||0) + ' MAD</div>' +
          '<div style="font-size:10px;color:' + (recu >= Number(f.ttc||0) ? '#6E8F4E' : '#B8860B') + '">' + fmt(recu) + ' MAD reçu(s)</div>' +
        '</div>' +
      '</div>';
    }).join('');
}

async function toggleRapprochementFacture(factureId) {
  const f = (STATE.factures || []).find(function(x) { return x.id === factureId; });
  if (!f) return;
  const nouvelleValeur = !f.rapproche;
  try {
    await sb.patch('factures', 'id=eq.' + factureId + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), {
      rapproche: nouvelleValeur,
      rapproche_at: nouvelleValeur ? new Date().toISOString() : null
    });
    f.rapproche = nouvelleValeur;
    renderRapprochement();
    showToast(nouvelleValeur ? '✅ Marquée rapprochée' : 'Rapprochement retiré', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// EXPORT COMPTABLE STRUCTURÉ — Plan Comptable Général Marocain (CGNC)
// ============================================================
// Génère un fichier d'écritures comptables (Date, Journal, Compte, Libellé,
// Débit, Crédit, Pièce) importable dans N'IMPORTE QUEL logiciel comptable
// (Sage, Odoo, Ciel, WinBiz...) — pas d'API propriétaire à maintenir, pas
// de pari sur quel logiciel choisir.
//
// Comptes utilisés (CGNC) :
//   3421 Clients            4411 Fournisseurs
//   7111 Ventes de biens/services produits (au Maroc)
//   6111 Achats de marchandises
//   4455 État, TVA facturée (collectée)
//   3455 État, TVA récupérable (déductible)
//   5141 Banques

const COMPTES_CGNC = {
  clients: '3421',
  fournisseurs: '4411',
  ventes: '7111',
  achats: '6111',
  tvaCollectee: '4455',
  tvaDeductible: '3455',
  banque: '5141',
};

let _sheetjsChargement = null;
function _chargerSheetJS() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_sheetjsChargement) return _sheetjsChargement;
  _sheetjsChargement = new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _sheetjsChargement;
}

async function exporterEcrituresComptables(factures, achats, paiements, profil) {
  const raison = (profil && profil.raison) || 'Entreprise';
  const headers = ['Date', 'Journal', 'N° Compte', 'Libellé Compte', 'Libellé Écriture', 'Référence Pièce', 'Débit', 'Crédit'];

  const lignesVentes = [];
  (factures || []).forEach(function(f) {
    if (!f.date_emission) return;
    const ht = Number(f.ht) || 0;
    const tva = Number(f.tva) || 0;
    const ttc = Number(f.ttc) || 0;
    const libelle = 'Facture ' + (f.ref || '') + ' — ' + (f.client || '');
    lignesVentes.push([f.date_emission, 'VE', COMPTES_CGNC.clients, 'Clients', libelle, f.ref || '', ttc.toFixed(2), '']);
    lignesVentes.push([f.date_emission, 'VE', COMPTES_CGNC.ventes, 'Ventes de biens et services produits', libelle, f.ref || '', '', ht.toFixed(2)]);
    if (tva > 0) lignesVentes.push([f.date_emission, 'VE', COMPTES_CGNC.tvaCollectee, 'État, TVA facturée', libelle, f.ref || '', '', tva.toFixed(2)]);
  });

  const lignesAchats = [];
  (achats || []).forEach(function(a) {
    if (!a.date_achat) return;
    const ht = Number(a.ht) || 0;
    const tva = Number(a.tva) || 0;
    const ttc = Number(a.ttc) || 0;
    const libelle = 'Achat ' + (a.ref_fournisseur || '') + ' — ' + (a.fournisseur || '');
    lignesAchats.push([a.date_achat, 'AC', COMPTES_CGNC.achats, 'Achats de marchandises', libelle, a.ref_fournisseur || '', ht.toFixed(2), '']);
    if (tva > 0) lignesAchats.push([a.date_achat, 'AC', COMPTES_CGNC.tvaDeductible, 'État, TVA récupérable', libelle, a.ref_fournisseur || '', tva.toFixed(2), '']);
    lignesAchats.push([a.date_achat, 'AC', COMPTES_CGNC.fournisseurs, 'Fournisseurs', libelle, a.ref_fournisseur || '', '', ttc.toFixed(2)]);
  });

  const lignesReglements = [];
  (paiements || []).forEach(function(p) {
    if (!p.date) return;
    const montant = Number(p.montant) || 0;
    const facture = (factures || []).find(function(f) { return f.id === p.facture_id; });
    const libelle = 'Règlement client — ' + (facture ? facture.ref : ('facture #' + p.facture_id));
    lignesReglements.push([p.date, 'BQ', COMPTES_CGNC.banque, 'Banques', libelle, facture ? facture.ref : '', montant.toFixed(2), '']);
    lignesReglements.push([p.date, 'BQ', COMPTES_CGNC.clients, 'Clients', libelle, facture ? facture.ref : '', '', montant.toFixed(2)]);
  });

  const toutesLignes = lignesVentes.concat(lignesAchats).concat(lignesReglements);
  if (!toutesLignes.length) { showToast('Aucune écriture à exporter', 'error'); return; }

  const nomFichier = 'ecritures_comptables_' + raison.replace(/\s+/g, '_') + '_' + new Date().toISOString().split('T')[0] + '.xlsx';

  try {
    await _chargerSheetJS();
    const wb = XLSX.utils.book_new();
    // Un onglet "Toutes écritures" (le plus utile pour un import direct
    // dans un logiciel comptable qui attend une seule feuille), plus des
    // onglets séparés par journal pour une lecture plus facile à l'œil.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers].concat(toutesLignes.sort(function(a,b){return (a[0]||'').localeCompare(b[0]||'');}))), 'Toutes écritures');
    if (lignesVentes.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers].concat(lignesVentes)), 'Ventes (VE)');
    if (lignesAchats.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers].concat(lignesAchats)), 'Achats (AC)');
    if (lignesReglements.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers].concat(lignesReglements)), 'Règlements (BQ)');
    XLSX.writeFile(wb, nomFichier);
    showToast('✅ Export Excel téléchargé (' + toutesLignes.length + ' lignes)', 'success');
  } catch(e) {
    // Repli CSV si le chargement de la bibliothèque Excel échoue (ex:
    // pas de connexion au moment du clic) — mieux vaut un CSV qui
    // fonctionne qu'un échec total.
    console.warn('Export Excel indisponible, repli CSV:', e.message);
    const csv = [headers].concat(toutesLignes).map(function(r) {
      return r.map(function(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier.replace('.xlsx', '.csv');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
    showToast('✅ Export téléchargé en CSV (Excel indisponible)', 'success');
  }
}

// ============================================================
// RAPPORT DE MARGE PAR CHANTIER (chantier ajouté)
// ============================================================
// Compare, pour chaque chantier identifié par son nom (même champ texte
// libre que sur les factures/devis), ce qu'il a rapporté (factures) et
// ce qu'il a coûté (achats rattachés). Nécessite que le champ "chantier"
// soit renseigné des deux côtés pour que le rapprochement fonctionne —
// un achat sans chantier renseigné n'apparaît simplement dans aucun total.
function calculerMargeParChantier() {
  const chantiers = {};
  (STATE.factures || []).forEach(function(f) {
    if (!f.chantier) return;
    if (!chantiers[f.chantier]) chantiers[f.chantier] = { revenus: 0, depenses: 0, nbFactures: 0, nbAchats: 0 };
    chantiers[f.chantier].revenus += Number(f.ttc) || 0;
    chantiers[f.chantier].nbFactures++;
  });
  (STATE.achats || []).forEach(function(a) {
    if (!a.chantier) return;
    if (!chantiers[a.chantier]) chantiers[a.chantier] = { revenus: 0, depenses: 0, nbFactures: 0, nbAchats: 0 };
    chantiers[a.chantier].depenses += Number(a.ttc) || 0;
    chantiers[a.chantier].nbAchats++;
  });
  return Object.keys(chantiers).map(function(nom) {
    const c = chantiers[nom];
    return { nom: nom, revenus: c.revenus, depenses: c.depenses, marge: c.revenus - c.depenses, nbFactures: c.nbFactures, nbAchats: c.nbAchats };
  }).sort(function(a, b) { return b.marge - a.marge; });
}
// À appeler depuis un écran doté d'un élément #rapport-marge-chantiers-content
// (pas encore créé dans le HTML — en attente de app.html).
function renderRapportMargeChantiers() {
  const container = el('rapport-marge-chantiers-content');
  if (!container) return;
  const chantiers = calculerMargeParChantier();
  if (!chantiers.length) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">🏗️</div><div class="empty-title">Aucun chantier identifié</div><div>Renseignez un nom de chantier sur vos factures et achats pour voir leur rentabilité ici</div></div>';
    return;
  }
  container.innerHTML = chantiers.map(function(c) {
    const positif = c.marge >= 0;
    return '<div class="card" style="flex-direction:column;align-items:stretch;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
        '<div style="font-size:14px;font-weight:700">' + escapeHTML(c.nom) + '</div>' +
        '<div style="font-size:14px;font-weight:800;color:' + (positif ? '#6E8F4E' : '#B23A2E') + '">' + (positif ? '+' : '') + fmt(c.marge) + ' MAD</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6B5F54">' +
        '<span>💰 Revenus : ' + fmt(c.revenus) + ' MAD (' + c.nbFactures + ' facture(s))</span>' +
        '<span>🛒 Dépenses : ' + fmt(c.depenses) + ' MAD (' + c.nbAchats + ' achat(s))</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ============================================================
// ALERTE DÉPASSEMENT DE BUDGET CHANTIER (chantier ajouté)
// ============================================================
// Le "budget" d'un chantier = le total des devis ACCEPTÉS portant ce
// nom de chantier (l'engagement pris avec le client). Si les achats
// rattachés dépassent ce montant, alerte — utile pour réagir avant que
// le chantier ne devienne déficitaire, pas seulement le constater après coup.
function verifierDepassementsBudgetChantier() {
  const budgets = {};
  (STATE.devis || []).forEach(function(d) {
    if (!d.chantier || d.statut !== 'accepte') return;
    budgets[d.chantier] = (budgets[d.chantier] || 0) + (Number(d.ttc) || 0);
  });
  const depenses = {};
  (STATE.achats || []).forEach(function(a) {
    if (!a.chantier) return;
    depenses[a.chantier] = (depenses[a.chantier] || 0) + (Number(a.ttc) || 0);
  });
  const alertes = [];
  Object.keys(budgets).forEach(function(nom) {
    const budget = budgets[nom];
    const depense = depenses[nom] || 0;
    if (budget > 0 && depense > budget) {
      alertes.push({ chantier: nom, budget: budget, depense: depense, depassement: depense - budget });
    }
  });
  return alertes;
}
// Ajoutée à la même notification centrale que les relances — voir
// genNotifications() dans nav.js, qui appelle déjà ajouterNotificationsRelances().
function ajouterNotificationsDepassementChantier() {
  const alertes = verifierDepassementsBudgetChantier();
  alertes.forEach(function(a) {
    STATE.notifications.push({
      type: 'danger',
      icon: '🚨',
      title: 'Budget dépassé — ' + a.chantier,
      body: 'Dépensé : ' + fmt(a.depense) + ' MAD pour un budget de ' + fmt(a.budget) + ' MAD (dépassement de ' + fmt(a.depassement) + ' MAD)',
    });
  });
}
