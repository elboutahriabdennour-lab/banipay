// ZELTO — abonnements.js — Facturation récurrente

STATE.abonnements = STATE.abonnements || [];
STATE.lignesAB = STATE.lignesAB || [];

// ============================================================
// CHARGEMENT
// ============================================================

// ============================================================
// ALERTES DE RENOUVELLEMENT DE CONTRAT (suivi de contrats)
// ============================================================
// Un contrat avec une date de fin qui approche (30 jours ou moins)
// mérite une alerte — pour éviter qu'un abonnement s'arrête sans que
// personne n'ait pensé à le renouveler ou à en discuter avec le client.
function verifierContratsAExpirer() {
  const aujourdhui = new Date();
  const alertes = [];
  (STATE.abonnements || []).forEach(function(a) {
    if (!a.date_fin || a.statut !== 'actif') return;
    const dateFin = new Date(a.date_fin);
    const joursRestants = Math.ceil((dateFin - aujourdhui) / (1000 * 60 * 60 * 24));
    if (joursRestants <= 30 && joursRestants >= 0) {
      alertes.push({ id: a.id, client: a.client, dateFin: a.date_fin, joursRestants: joursRestants });
    }
  });
  return alertes;
}
// Ajoutée à la même notification centrale que les autres alertes — voir
// genNotifications() dans nav.js.
function ajouterNotificationsContratsAExpirer() {
  const alertes = verifierContratsAExpirer();
  alertes.forEach(function(a) {
    STATE.notifications.push({
      type: a.joursRestants <= 7 ? 'danger' : 'warning',
      icon: '📅',
      title: 'Contrat bientôt terminé — ' + a.client,
      body: a.joursRestants === 0 ? 'Se termine aujourd\'hui' : 'Se termine dans ' + a.joursRestants + ' jour(s) (' + a.dateFin + ')',
    });
  });
}

async function loadAbonnements() {
  try {
    const uid = STATE.entrepriseId || sb.user?.id;
    if (!uid) return;
    const r = await sb.get('abonnements', 'user_id=eq.' + uid + '&order=created_at.desc');
    STATE.abonnements = r || [];
  } catch(e) { STATE.abonnements = []; }
}

// ============================================================
// CALCUL PROCHAINE DATE
// ============================================================

function calculerProchaineDateAbonnement(dateBase, frequence, jourGeneration) {
  const d = new Date(dateBase);
  if (frequence === 'trimestriel') d.setMonth(d.getMonth() + 3);
  else if (frequence === 'annuel') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // mensuel par défaut

  const jour = Math.min(jourGeneration || 1, 28);
  d.setDate(jour);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

// ============================================================
// LISTE DES ABONNEMENTS
// ============================================================

function renderAbonnements() {
  const list = el('abonnements-list');
  if (!list) return;
  const abs = STATE.abonnements || [];
  if (!abs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🔁</div><div class="empty-title">Aucun abonnement</div><div>Créez une facturation récurrente pour un client</div></div>';
    return;
  }
  const freqLabels = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel' };
  const statutColors = { actif: '#6E8F4E', suspendu: '#B8860B', annule: '#9C9186' };
  const statutLabels = { actif: '● Actif', suspendu: '⏸ Suspendu', annule: '✕ Annulé' };
  list.innerHTML = abs.map(function(a) {
    const lignes = typeof a.lignes === 'string' ? JSON.parse(a.lignes || '[]') : (a.lignes || []);
    const total = lignes.reduce(function(s, l) { return s + (Number(l.qte)||0) * (Number(l.pu)||0); }, 0) * 1.2;
    return '<div class="card" onclick="openDetailAbonnement(' + a.id + ')">' +
      '<div class="card-ico" style="background:#FBF0DA">🔁</div>' +
      '<div class="card-body">' +
        '<div class="card-name">' + escapeHTML(a.client) + '</div>' +
        '<div class="card-ref">' + (freqLabels[a.frequence]||a.frequence) + ' · Prochaine: ' + formatDate(a.prochaine_date) + '</div>' +
      '</div>' +
      '<div class="card-end">' +
        '<div class="card-amt">' + fmt(total) + ' ' + (a.devise||'MAD') + '</div>' +
        '<div style="font-size:10px;font-weight:600;color:' + (statutColors[a.statut]||'#6B5F54') + '">' + (statutLabels[a.statut]||a.statut) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ============================================================
// NOUVEL ABONNEMENT
// ============================================================

function initNouvelAbonnement() {
  const _dl = document.getElementById('client-datalist-ab');
  if (_dl && STATE.clients) {
    _dl.innerHTML = STATE.clients.map(function(c){return '<option value="'+escapeHTML(c.nom||'')+'">'+escapeHTML(c.nom||'')+'</option>';}).join('');
  }
  STATE.lignesAB = [];
  el('ab-client') && (el('ab-client').value = '');
  el('ab-chantier') && (el('ab-chantier').value = '');
  el('ab-frequence') && (el('ab-frequence').value = 'mensuel');
  el('ab-jour') && (el('ab-jour').value = '1');
  el('ab-date-debut') && (el('ab-date-debut').value = today());
  el('ab-note') && (el('ab-note').value = '');
  renderLignesAB();
}

function renderLignesAB() {
  const c = el('ab-lignes-container');
  if (!c) return;
  c.innerHTML = STATE.lignesAB.map(function(l, i) {
    return '<div class="ligne-item">' +
      '<div class="ligne-body"><div class="ligne-desc">' + l.desc + '</div><div class="ligne-meta">' + l.qte + ' ' + (l.unite||'u') + ' × ' + fmt(l.pu) + ' MAD</div></div>' +
      '<div class="ligne-amt">' + fmt(l.qte * l.pu) + ' MAD</div>' +
      '<button class="ligne-del" onclick="STATE.lignesAB.splice(' + i + ',1);renderLignesAB()">×</button>' +
    '</div>';
  }).join('');
  const ht = STATE.lignesAB.reduce(function(s, l) { return s + l.qte * l.pu; }, 0);
  setEl('ab-total-ht', fmt(ht) + ' MAD');
  setEl('ab-total-ttc', fmt(ht * 1.2) + ' MAD');
}

function openAddLigneAB() {
  el('mlab-desc') && (el('mlab-desc').value = '');
  el('mlab-qte') && (el('mlab-qte').value = '1');
  el('mlab-pu') && (el('mlab-pu').value = '');
  el('mlab-unite') && (el('mlab-unite').value = 'u');
  el('modal-ligne-ab')?.classList.add('active');
  setTimeout(function() { el('mlab-desc')?.focus(); }, 100);
}

function confirmerLigneAB() {
  const desc = el('mlab-desc')?.value.trim();
  const qte = parseFloat(el('mlab-qte')?.value.replace(',','.')) || 1;
  const pu = parseFloat(el('mlab-pu')?.value.replace(',','.')) || 0;
  const unite = el('mlab-unite')?.value || 'u';
  if (!desc) { showToast('Entrez une description', 'error'); return; }
  if (pu <= 0) { showToast('Entrez un prix', 'error'); return; }
  STATE.lignesAB.push({ desc, qte, pu, unite });
  closeAllModals();
  renderLignesAB();
}

async function sauvegarderAbonnement() {
  const client = el('ab-client')?.value.trim();
  if (!client) { showToast('Entrez le nom du client', 'error'); return; }
  if (!STATE.lignesAB.length) { showToast('Ajoutez au moins une ligne', 'error'); return; }

  const frequence = el('ab-frequence')?.value || 'mensuel';
  const jourGeneration = parseInt(el('ab-jour')?.value) || 1;
  const dateDebut = el('ab-date-debut')?.value || today();

  showToast('⏳ Sauvegarde...');
  try {
    const r = await sb.post('abonnements', {
      user_id: (STATE.entrepriseId || sb.user.id),
      client,
      chantier: el('ab-chantier')?.value.trim(),
      lignes: STATE.lignesAB,
      frequence,
      jour_generation: jourGeneration,
      prochaine_date: dateDebut,
      // NOUVEAU (suivi de contrats) : optionnelle, permet les alertes
      // de renouvellement — un abonnement sans date de fin se comporte
      // exactement comme avant (récurrence indéfinie).
      date_fin: el('ab-date-fin')?.value || null,
      statut: 'actif',
      devise: 'MAD',
      note: el('ab-note')?.value.trim(),
    });
    if (r && r.length > 0) { STATE.abonnements.unshift(r[0]); } else { throw new Error("Erreur serveur"); }
    autoAddClient(client);
    showToast('✅ Abonnement créé !', 'success');
    logAudit('abonnement', r[0].id, 'creation', client + ' — ' + frequence);
    setTimeout(function() { goScreen('abonnements'); }, 700);
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ============================================================
// DÉTAIL / ACTIONS
// ============================================================

function openDetailAbonnement(id) {
  STATE.currentAbonnement = STATE.abonnements.find(function(a) { return a.id === id; });
  if (!STATE.currentAbonnement) return;
  renderDetailAbonnement();
  goScreen('detail-abonnement');
}

function renderDetailAbonnement() {
  const a = STATE.currentAbonnement;
  if (!a) return;
  const lignes = typeof a.lignes === 'string' ? JSON.parse(a.lignes || '[]') : (a.lignes || []);
  const ht = lignes.reduce(function(s, l) { return s + (Number(l.qte)||0) * (Number(l.pu)||0); }, 0);
  const freqLabels = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel' };

  setEl('dab-client', a.client);
  setEl('dab-amount', fmt(ht * 1.2) + ' ' + (a.devise||'MAD') + ' TTC / ' + (freqLabels[a.frequence]||a.frequence).toLowerCase());
  setEl('dab-ref', 'Prochaine génération : ' + formatDate(a.prochaine_date) + (a.chantier ? ' · ' + a.chantier : ''));

  // NOUVEAU (suivi de contrats) : affiche l'échéance du contrat si elle
  // existe, avec un avertissement visuel si elle approche.
  const dabEcheance = el('dab-echeance-contrat');
  if (dabEcheance) {
    if (a.date_fin) {
      const joursRestants = Math.ceil((new Date(a.date_fin) - new Date()) / (1000*60*60*24));
      const urgent = joursRestants <= 30;
      dabEcheance.style.display = 'block';
      dabEcheance.innerHTML = '<div style="background:' + (urgent ? '#F7EFDC' : '#F1EEE8') + ';border-radius:10px;padding:10px 14px;margin:0 20px 14px;font-size:12px;color:' + (urgent ? '#B8860B' : '#6B5F54') + ';font-weight:' + (urgent ? '700' : '400') + '">📅 Contrat jusqu\'au ' + formatDate(a.date_fin) + (urgent ? ' — ' + (joursRestants <= 0 ? 'terminé' : joursRestants + ' jour(s) restant(s)') : '') + '</div>';
    } else {
      dabEcheance.style.display = 'none';
    }
  }

  const lignesEl = el('dab-lignes');
  if (lignesEl) lignesEl.innerHTML = lignes.map(function(l) {
    return '<div class="d-ligne"><div><div style="font-size:13px;font-weight:500">' + l.desc + '</div><div style="font-size:11px;color:#9C9186">' + l.qte + ' ' + (l.unite||'u') + ' × ' + fmt(l.pu) + ' MAD</div></div><div style="font-size:13px;font-weight:600">' + fmt(l.qte*l.pu) + ' MAD</div></div>';
  }).join('');

  const actEl = el('dab-actions');
  if (!actEl) return;
  const actions = [];
  const statutLabels = { actif: '● Actif', suspendu: '⏸ Suspendu', annule: '✕ Annulé' };
  const statutColors = { actif: '#6E8F4E', suspendu: '#B8860B', annule: '#9C9186' };
  actions.push('<div style="background:' + statutColors[a.statut] + '20;border-left:3px solid ' + statutColors[a.statut] + ';border-radius:0 8px 8px 0;padding:8px 12px;font-size:12px;font-weight:600;color:' + statutColors[a.statut] + ';margin-bottom:4px">' + (statutLabels[a.statut]||a.statut) + '</div>');

  if (a.statut === 'actif') {
    actions.push('<button class="action-item" onclick="genererFactureImmediate(' + a.id + ')"><div class="action-ico" style="background:#E9F4F3">⚡</div>Générer une facture maintenant</button>');
    // NOUVEAU (suivi de contrats) : seulement si une date de fin existe.
    if (a.date_fin) {
      actions.push('<button class="action-item" style="color:#1F6F72;border-left-color:#1F6F72" onclick="renouvelerContrat(' + a.id + ')"><div class="action-ico" style="background:#E9F4F3">🔄</div>Renouveler le contrat</button>');
    }
    actions.push('<button class="action-item" style="color:#B8860B;border-left-color:#B8860B" onclick="changerStatutAbonnement(' + a.id + ',\'suspendu\')"><div class="action-ico" style="background:#F7EFDC">⏸</div>Suspendre</button>');
  } else if (a.statut === 'suspendu') {
    actions.push('<button class="action-item success" onclick="changerStatutAbonnement(' + a.id + ',\'actif\')"><div class="action-ico" style="background:#EEF3E4">▶️</div>Réactiver</button>');
  }
  if (a.statut !== 'annule') {
    actions.push('<button class="action-item danger" onclick="changerStatutAbonnement(' + a.id + ',\'annule\')"><div class="action-ico" style="background:#F5E4E1">✕</div>Annuler l\'abonnement</button>');
  }
  actions.push('<button class="action-item danger" onclick="supprimerAbonnement(' + a.id + ')"><div class="action-ico" style="background:#F5E4E1">🗑️</div>Supprimer définitivement</button>');
  actEl.innerHTML = actions.join('');
}

async function changerStatutAbonnement(id, statut) {
  await sb.patch('abonnements', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: statut });
  const a = STATE.abonnements.find(function(x) { return x.id === id; });
  if (a) a.statut = statut;
  STATE.currentAbonnement = a;
  renderDetailAbonnement();
  showToast('Statut mis à jour', 'success');
  logAudit('abonnement', id, 'modification', 'Statut → ' + statut);
}

// NOUVEAU (suivi de contrats) : demande une nouvelle date de fin et
// l'enregistre — l'historique du renouvellement est conservé via le
// journal d'audit déjà existant (logAudit), pas besoin d'une nouvelle
// table dédiée pour ce premier besoin.
async function renouvelerContrat(id) {
  const a = STATE.abonnements.find(function(x) { return x.id === id; });
  if (!a) return;
  const ancienneDate = a.date_fin;
  const nouvelleDate = prompt('Nouvelle date de fin du contrat (AAAA-MM-JJ) :', ancienneDate || '');
  if (!nouvelleDate) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nouvelleDate)) {
    showToast('❌ Format de date invalide — utilisez AAAA-MM-JJ', 'error');
    return;
  }
  try {
    await sb.patch('abonnements', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { date_fin: nouvelleDate });
    a.date_fin = nouvelleDate;
    STATE.currentAbonnement = a;
    renderDetailAbonnement();
    showToast('✅ Contrat renouvelé jusqu\'au ' + formatDate(nouvelleDate), 'success');
    logAudit('abonnement', id, 'renouvellement', (ancienneDate ? 'Ancienne échéance : ' + formatDate(ancienneDate) + ' → ' : '') + 'Nouvelle échéance : ' + formatDate(nouvelleDate));
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function supprimerAbonnement(id) {
  if (!confirm('Supprimer définitivement cet abonnement ?')) return;
  await sb.del('abonnements', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id));
  STATE.abonnements = STATE.abonnements.filter(function(x) { return x.id !== id; });
  showToast('Abonnement supprimé', 'success');
  logAudit('abonnement', id, 'suppression', '');
  goScreen('abonnements');
}

// ============================================================
// GÉNÉRATION DE FACTURE DEPUIS UN ABONNEMENT
// ============================================================

async function genererFactureDepuisAbonnement(a) {
  const lignes = typeof a.lignes === 'string' ? JSON.parse(a.lignes || '[]') : (a.lignes || []);
  const ht = lignes.reduce(function(s, l) { return s + (Number(l.qte)||0) * (Number(l.pu)||0); }, 0);
  const ref = getRef('FAC', STATE.factures);
  // FIX (même trou que les autres chemins de facturation) : si le client
  // de cet abonnement est un compte Zelto connu, verrouille la facture
  // générée à son compte réel.
  const clientConnu = (STATE.clients || []).find(function(c) { return c.nom === a.client; });

  const r = await sb.post('factures', {
    user_id: (STATE.entrepriseId || sb.user.id),
    ref: ref,
    client: a.client,
    chantier: a.chantier || '',
    date_emission: today(),
    paiement: 'virement',
    statut: 'envoyee',
    lignes: lignes,
    ht: ht, tva: ht * 0.2, ttc: ht * 1.2,
    devise: a.devise || 'MAD',
    montant_recu: 0,
    note: a.note ? '(Facturation récurrente) ' + a.note : '(Facturation récurrente)',
    destinataire_id: clientConnu?.reference_id || null,
  });
  if (r && r.length > 0) {
    STATE.factures.unshift(r[0]);
    logAudit('facture', r[0].id, 'creation', ref + ' — générée automatiquement depuis abonnement ' + a.client);
    // FIX: même trou que les autres chemins de création de facture — la
    // facturation récurrente ne décrémentait jamais le stock.
    if (typeof decrementerStockDepuisLignes === 'function') await decrementerStockDepuisLignes(lignes, ref);
  }
  return r && r[0];
}

async function genererFactureImmediate(id) {
  const a = STATE.abonnements.find(function(x) { return x.id === id; });
  if (!a) return;
  showToast('⏳ Génération de la facture...');
  try {
    const facture = await genererFactureDepuisAbonnement(a);
    // FIX (audit workflow — argent) : avant, la date de prochaine
    // génération avançait même si la facture n'avait pas été créée
    // (échec silencieux de sb.post sans exception) — l'abonnement
    // pensait avoir facturé cette échéance alors que non, et le client
    // n'aurait jamais été facturé pour cette période.
    if (!facture) { showToast('❌ La facture n\'a pas pu être créée', 'error'); return; }
    const prochaine = calculerProchaineDateAbonnement(a.prochaine_date, a.frequence, a.jour_generation);
    await sb.patch('abonnements', 'id=eq.' + a.id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), {
      prochaine_date: prochaine,
      derniere_generation: today()
    });
    a.prochaine_date = prochaine;
    a.derniere_generation = today();
    renderDetailAbonnement();
    showToast('✅ Facture ' + facture.ref + ' générée !', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ============================================================
// VÉRIFICATION AUTOMATIQUE (appelée à la connexion)
// ============================================================

// Génère automatiquement les factures des abonnements actifs dont la date est échue.
// Limite connue : se déclenche uniquement à la connexion de l'entreprise (pas de cron serveur).
async function verifierAbonnements() {
  const todayStr = today();
  const aTraiter = (STATE.abonnements || []).filter(function(a) {
    return a.statut === 'actif' && a.prochaine_date <= todayStr;
  });
  if (!aTraiter.length) return;

  let count = 0;
  for (const a of aTraiter) {
    try {
      const facture = await genererFactureDepuisAbonnement(a);
      // FIX (audit workflow — argent) : même risque qu'en génération
      // manuelle, mais plus grave ici car ce chemin tourne sans
      // supervision humaine à chaque connexion — sans ce garde-fou, une
      // échéance de facturation aurait pu être silencieusement sautée.
      if (!facture) { console.warn('verifierAbonnements: facture non créée pour', a.client); continue; }
      const prochaine = calculerProchaineDateAbonnement(a.prochaine_date, a.frequence, a.jour_generation);
      await sb.patch('abonnements', 'id=eq.' + a.id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), {
        prochaine_date: prochaine,
        derniere_generation: todayStr
      });
      a.prochaine_date = prochaine;
      a.derniere_generation = todayStr;
      count++;
    } catch(e) {
      console.warn('verifierAbonnements:', e);
    }
  }
  if (count > 0) {
    showToast('🔁 ' + count + ' facture(s) générée(s) automatiquement (abonnements)', 'success');
  }
}
