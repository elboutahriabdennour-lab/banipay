// ZELTO — relances.js — Relances automatiques intelligentes
// ============================================================
// Vérifie chaque facture active et génère une notification + propose
// l'envoi d'une relance (avant échéance / jour J / après échéance), avec
// un message personnalisable. Ne relance jamais deux fois le même type le
// même jour (table relances_envoyees).
STATE.relancesEnvoyees = STATE.relancesEnvoyees || [];
async function loadRelancesEnvoyees() {
  try {
    STATE.relancesEnvoyees = (await sb.get('relances_envoyees', 'user_id=eq.' + (STATE.entrepriseId || sb.user.id))) || [];
  } catch(e) { STATE.relancesEnvoyees = []; }
}
function _relanceDejaEnvoyee(factureId, type) {
  const aujourdHui = new Date().toISOString().split('T')[0];
  return (STATE.relancesEnvoyees || []).some(function(r) {
    return r.facture_id === factureId && r.type_relance === type && r.date_envoi === aujourdHui;
  });
}
function calculerRelancesDues() {
  const p = STATE.profil || {};
  if (p.relance_activee === false) return [];
  const joursAvant = Number(p.relance_jours_avant || 3);
  const aujourdHui = new Date();
  aujourdHui.setHours(0,0,0,0);
  const dues = [];
  (STATE.factures || []).forEach(function(f) {
    if (f.statut === 'payee' || f.statut === 'annulee' || f.statut === 'brouillon' || !f.echeance) return;
    const echeance = new Date(f.echeance);
    echeance.setHours(0,0,0,0);
    const diffJours = Math.round((echeance - aujourdHui) / 86400000);
    let type = null;
    if (diffJours === joursAvant) type = 'avant';
    else if (diffJours === 0) type = 'jour';
    else if (diffJours < 0) type = 'retard';
    if (type && !_relanceDejaEnvoyee(f.id, type)) {
      dues.push({ facture: f, type: type });
    }
  });
  return dues;
}
function _formaterMessageRelance(f, type) {
  const p = STATE.profil || {};
  const templates = { avant: p.relance_msg_avant, jour: p.relance_msg_jour, retard: p.relance_msg_retard };
  let msg = templates[type] || '';
  return msg
    .replace(/\{client\}/g, f.client || '')
    .replace(/\{ref\}/g, f.ref || '')
    .replace(/\{montant\}/g, fmt(Math.max(0, (f.ttc||0) - (f.montant_recu||0))))
    .replace(/\{echeance\}/g, f.echeance || '');
}
function ajouterNotificationsRelances() {
  const dues = calculerRelancesDues();
  const labels = { avant: '⏰ Relance à envoyer (avant échéance)', jour: '📅 Relance à envoyer (échéance aujourd\'hui)', retard: '🔴 Relance à envoyer (en retard)' };
  dues.forEach(function(d) {
    STATE.notifications.push({
      type: d.type === 'retard' ? 'danger' : 'warning',
      icon: d.type === 'retard' ? '🔴' : '⏰',
      title: labels[d.type] + ' — ' + d.facture.ref,
      body: d.facture.client + ' · ' + fmt(d.facture.ttc||0) + ' MAD',
      _relanceFactureId: d.facture.id,
      _relanceType: d.type,
    });
  });
  // NOUVEAU (chantier demandé) : même principe, mais côté achats — ce
  // qu'on doit payer À un fournisseur, pas ce qu'un client nous doit.
  // Contrairement aux relances de vente (qui envoient un message au
  // client), ici il n'y a personne à qui écrire automatiquement : c'est
  // un simple rappel pour soi-même, avec un bouton "Marquer comme payé"
  // ou "Voir l'achat" plutôt qu'un envoi WhatsApp.
  if (typeof ajouterNotificationsRelancesAchats === 'function') ajouterNotificationsRelancesAchats();
}

// ============================================================
// RELANCES ACHATS (chantier ajouté) — rappels de paiement fournisseur
// ============================================================
STATE.relancesAchatsVues = STATE.relancesAchatsVues || [];
async function loadRelancesAchatsVues() {
  try {
    STATE.relancesAchatsVues = (await sb.get('relances_achats_vues', 'user_id=eq.' + (STATE.entrepriseId || sb.user.id))) || [];
  } catch(e) { STATE.relancesAchatsVues = []; }
}
function _relanceAchatDejaVue(achatId, type) {
  const aujourdHui = new Date().toISOString().split('T')[0];
  return (STATE.relancesAchatsVues || []).some(function(r) {
    return r.achat_id === achatId && r.type_relance === type && r.date_vue === aujourdHui;
  });
}
function calculerRelancesAchatsDues() {
  const p = STATE.profil || {};
  if (p.relance_achats_activee === false) return [];
  const joursAvant = Number(p.relance_achats_jours_avant || 3);
  const aujourdHui = new Date();
  aujourdHui.setHours(0,0,0,0);
  const dues = [];
  (STATE.achats || []).forEach(function(a) {
    if (a.statut === 'payee' || !a.echeance) return;
    const echeance = new Date(a.echeance);
    echeance.setHours(0,0,0,0);
    const diffJours = Math.round((echeance - aujourdHui) / 86400000);
    let type = null;
    if (diffJours === joursAvant) type = 'avant';
    else if (diffJours === 0) type = 'jour';
    else if (diffJours < 0) type = 'retard';
    if (type && !_relanceAchatDejaVue(a.id, type)) {
      dues.push({ achat: a, type: type });
    }
  });
  return dues;
}
function ajouterNotificationsRelancesAchats() {
  const dues = calculerRelancesAchatsDues();
  const labels = { avant: '⏰ Paiement fournisseur à venir', jour: '📅 Paiement fournisseur dû aujourd\'hui', retard: '🔴 Paiement fournisseur en retard' };
  dues.forEach(function(d) {
    STATE.notifications.push({
      type: d.type === 'retard' ? 'danger' : 'warning',
      icon: d.type === 'retard' ? '🔴' : '⏰',
      title: labels[d.type] + ' — ' + (d.achat.fournisseur || ''),
      body: fmt(d.achat.ttc||0) + ' MAD · échéance ' + formatDate(d.achat.echeance),
      _relanceAchatId: d.achat.id,
      _relanceAchatType: d.type,
    });
  });
}
// Marque le rappel comme vu pour aujourd'hui (sans le "renvoyer" comme
// côté vente, puisqu'il n'y a personne à qui écrire) — évite qu'il
// réapparaisse en boucle une fois consulté.
async function marquerRelanceAchatVue(achatId, type) {
  try {
    await sb.post('relances_achats_vues', {
      user_id: (STATE.entrepriseId || sb.user.id), achat_id: achatId, type_relance: type, date_vue: new Date().toISOString().split('T')[0]
    });
    STATE.relancesAchatsVues.push({ achat_id: achatId, type_relance: type, date_vue: new Date().toISOString().split('T')[0] });
  } catch(e) { console.warn('marquerRelanceAchatVue:', e); }
  if (typeof genNotifications === 'function') genNotifications();
}
function afficherParametresRelanceAchats() {
  const p = STATE.profil || {};
  el('param-relance-achats-activee') && (el('param-relance-achats-activee').checked = p.relance_achats_activee !== false);
  el('param-relance-achats-jours') && (el('param-relance-achats-jours').value = p.relance_achats_jours_avant || 3);
}
async function sauvegarderParametresRelanceAchats() {
  const maj = {
    relance_achats_activee: !!el('param-relance-achats-activee')?.checked,
    relance_achats_jours_avant: parseInt(el('param-relance-achats-jours')?.value) || 3,
  };
  try {
    await sb.patch('profils_entreprise', 'id=eq.' + (STATE.entrepriseId || sb.user.id), maj);
    Object.assign(STATE.profil, maj);
    showToast('✅ Rappels d\'achats enregistrés', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
async function envoyerRelance(factureId, type) {
  const f = (STATE.factures || []).find(function(x) { return x.id === factureId; });
  if (!f) return;
  const message = _formaterMessageRelance(f, type);
  const tel = (STATE.clients || []).find(function(c) { return c.nom === f.client; })?.tel;
  if (tel) {
    const telClean = tel.replace(/[^0-9+]/g, '');
    window.open('https://wa.me/' + telClean.replace(/^0/, '212') + '?text=' + encodeURIComponent(message), '_blank');
  } else {
    navigator.clipboard?.writeText(message);
    showToast('Numéro du client introuvable — message copié, collez-le manuellement', 'success');
  }
  try {
    await sb.post('relances_envoyees', {
      user_id: (STATE.entrepriseId || sb.user.id), facture_id: factureId, type_relance: type, date_envoi: new Date().toISOString().split('T')[0]
    });
    STATE.relancesEnvoyees.push({ facture_id: factureId, type_relance: type, date_envoi: new Date().toISOString().split('T')[0] });
  } catch(e) { }
  if (typeof genNotifications === 'function') genNotifications();
}
function afficherParametresRelance() {
  const p = STATE.profil || {};
  el('param-relance-activee') && (el('param-relance-activee').checked = p.relance_activee !== false);
  el('param-relance-jours') && (el('param-relance-jours').value = p.relance_jours_avant || 3);
  el('param-relance-msg-avant') && (el('param-relance-msg-avant').value = p.relance_msg_avant || 'Bonjour {client}, un rappel amical : la facture {ref} de {montant} MAD arrive à échéance le {echeance}. Merci !');
  el('param-relance-msg-jour') && (el('param-relance-msg-jour').value = p.relance_msg_jour || 'Bonjour {client}, la facture {ref} de {montant} MAD arrive à échéance aujourd\'hui. Merci de procéder au règlement.');
  el('param-relance-msg-retard') && (el('param-relance-msg-retard').value = p.relance_msg_retard || 'Bonjour {client}, la facture {ref} de {montant} MAD est en retard de paiement depuis le {echeance}. Merci de régulariser rapidement.');
}
async function sauvegarderParametresRelance() {
  const activationDemandee = !!el('param-relance-activee')?.checked;
  if (activationDemandee && typeof verifierAccesFeature === 'function' && !verifierAccesFeature('relances_auto', 'Relances automatiques')) {
    el('param-relance-activee') && (el('param-relance-activee').checked = false);
    return;
  }
  const maj = {
    relance_activee: activationDemandee,
    relance_jours_avant: parseInt(el('param-relance-jours')?.value) || 3,
    relance_msg_avant: el('param-relance-msg-avant')?.value || '',
    relance_msg_jour: el('param-relance-msg-jour')?.value || '',
    relance_msg_retard: el('param-relance-msg-retard')?.value || '',
  };
  try {
    await sb.patch('profils_entreprise', 'id=eq.' + sb.user.id, maj);
    Object.assign(STATE.profil, maj);
    showToast('✅ Paramètres de relance enregistrés', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
