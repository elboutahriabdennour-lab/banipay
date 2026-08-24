// ZELTO — devis.js

function renderDevisList() {
  const list = el('devis-list');
  if (!list) return;
  let data = STATE.filterD === 'tous' ? STATE.devis : STATE.devis.filter(d => d.statut === STATE.filterD);
  if (!data.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">📝</div><div class="empty-title">Aucun devis</div></div>`;
    return;
  }
  const icons = { envoye:'📤', accepte:'✅', refuse:'❌', converti:'🧾', expire:'⏰' };
  const bgs   = { envoye:'#F7EFDC', accepte:'#EEF3E4', refuse:'#F5E4E1', converti:'#E9F4F3', expire:'#EAE4DA' };
  list.innerHTML = data.map(d => {
    const enSelection = typeof estEnSelection === 'function' && estEnSelection('devis');
    return `
    <div class="card" onclick="${enSelection ? 'toggleSelectionItem(' + d.id + ')' : 'openDetailDevis(' + d.id + ')'}">
      ${typeof checkboxSelection === 'function' ? checkboxSelection('devis', d.id) : ''}
      <div class="card-ico" style="background:${bgs[d.statut]||'#EAE4DA'}">${icons[d.statut]||'📝'}</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(d.client)}</div>
        <div class="card-ref">${d.ref} · ${d.date_emission||''} · ${d.validite||30}j</div>
        ${d.statut==='accepte'?'<div style="display:inline-block;background:#EEF3E4;color:#6E8F4E;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-top:2px">✅ Accepté</div>':d.statut==='refuse'?'<div style="display:inline-block;background:#F5E4E1;color:#8E2E24;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-top:2px">❌ Refusé</div>':''}
      </div>
      <div class="card-end">
        <div class="card-amt">${fmt(d.ttc)} ${d.devise||'MAD'}</div>
        <div class="badge b-${d.statut}">${badgeDV(d.statut)}</div>
      </div>
    </div>`;
  }).join('');
}

function filterDevis(f, btn) {
  STATE.filterD = f;
  document.querySelectorAll('#screen-devis-list .ftab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDevisList();
}

function initNouveauDevis(prefill) {
  // Populate client suggestions
  const _dl2 = document.getElementById('client-datalist-devis');
  if (_dl2 && STATE.clients) {
    _dl2.innerHTML = STATE.clients.map(function(c){return '<option value="'+escapeHTML(c.nom||'')+'">'+escapeHTML(c.nom||'')+'</option>';}).join('');
  }
  STATE.lignesD = prefill?.lignes ? [...prefill.lignes] : [];
  STATE.deviseD = prefill?.devise || 'MAD';
  el('d-client') && (el('d-client').value = prefill?.client || '');
  el('d-chantier') && (el('d-chantier').value = prefill?.chantier || '');
  el('d-date') && (el('d-date').value = prefill?.date_emission || today());
  el('d-ref') && (el('d-ref').value = prefill?.ref || getRef('DEV', STATE.devis));
  el('d-validite') && (el('d-validite').value = prefill?.validite || '30');
  el('d-note') && (el('d-note').value = prefill?.note || '');
  updateClientDatalist();
  renderLignesD();
}

function renderLignesD() {
  const c = el('d-lignes-container');
  if (!c) return;
  c.innerHTML = STATE.lignesD.map((l,i) => `
    <div class="ligne-item">
      <div class="ligne-body">
        <div class="ligne-desc">${l.desc}</div>
        <div class="ligne-meta">${l.qte} ${l.unite||'u'} × ${fmt(l.pu)} ${STATE.deviseD}</div>
      </div>
      <div class="ligne-amt">${fmt(l.qte*l.pu)} ${STATE.deviseD}</div>
      <button class="ligne-del" onclick="supprimerLigneD(${i})">×</button>
    </div>`).join('');
  updateTotauxD();
}

function supprimerLigneD(i) { STATE.lignesD.splice(i,1); renderLignesD(); }

function updateTotauxD() {
  const ht = STATE.lignesD.reduce((s,l) => s+l.qte*l.pu, 0);
  setEl('d-total-ht', fmt(ht)+' '+STATE.deviseD);
  setEl('d-total-tva', fmt(ht*0.2)+' '+STATE.deviseD);
  setEl('d-total-ttc', fmt(ht*1.2)+' '+STATE.deviseD);
}

function openAddLigneDevis() {
  el('mld-desc') && (el('mld-desc').value = '');
  el('mld-qte') && (el('mld-qte').value = '1');
  el('mld-pu') && (el('mld-pu').value = '');
  el('mld-unite') && (el('mld-unite').value = 'u');
  el('modal-ligne-d')?.classList.add('active');
  setTimeout(() => el('mld-desc')?.focus(), 100);
  // NOUVEAU (chantier ajouté) : même suggestion de prix que côté facture
  // — voir chercherHistoriquePrixClient() dans factures.js.
  const champDesc = el('mld-desc');
  if (champDesc && !champDesc.dataset.suggestionPrixAttachee && typeof afficherSuggestionPrixClient === 'function') {
    champDesc.addEventListener('blur', function() { afficherSuggestionPrixClient('d-client', 'mld-desc'); });
    champDesc.dataset.suggestionPrixAttachee = '1';
  }
}

function confirmerLigneDevis() {
  const desc = el('mld-desc')?.value.trim();
  const qte = parseFloat(el('mld-qte')?.value.replace(',','.'))||1;
  const pu = parseFloat(el('mld-pu')?.value.replace(',','.'))||0;
  const unite = el('mld-unite')?.value||'u';
  if (!desc) { showToast('Entrez une description', 'error'); return; }
  if (pu <= 0) { showToast('Entrez un prix unitaire', 'error'); return; }
  STATE.lignesD.push({desc,qte,pu,unite});
  closeAllModals();
  renderLignesD();
}

// NOUVEAU: liste des BC disponibles à lier à ce devis
function remplirPickerBCPourDevis() {
  const sel = el('d-bc-lie');
  if (!sel) return;
  sel.innerHTML = '<option value="">Aucun</option>' +
    (STATE.bonsCommande || []).map(function(bc) {
      return '<option value="' + bc.id + '">' + escapeHTML(bc.ref||'') + ' — ' + escapeHTML(bc.fournisseur||'') + '</option>';
    }).join('');
}

async function sauvegarderDevis() {
  const client = el('d-client')?.value.trim();
  if (!client) { showToast('Entrez le nom du client', 'error'); return; }
  if (!STATE.lignesD.length) { showToast('Ajoutez au moins une ligne', 'error'); return; }
  const ht = STATE.lignesD.reduce((s,l)=>s+l.qte*l.pu,0);
  showToast('⏳ Sauvegarde...');
  try {
    // NOUVEAU : si ce client est un compte Zelto déjà connu (choisi dans
    // l'annuaire, pas juste tapé), on verrouille le devis à SON compte —
    // lui seul (connecté) pourra l'ouvrir/agir dessus via le lien public.
    const clientConnu = (STATE.clients || []).find(function(c) { return c.nom === client; });
    const r = await sb.post('devis', {
      user_id: (STATE.entrepriseId || sb.user.id),
      ref: el('d-ref')?.value,
      client, chantier: el('d-chantier')?.value.trim(),
      date_emission: el('d-date')?.value,
      validite: parseInt(el('d-validite')?.value)||30,
      note: el('d-note')?.value.trim(),
      bc_id: el('d-bc-lie')?.value ? parseInt(el('d-bc-lie').value) : null,
      statut: 'envoye', ht, tva:ht*0.2, ttc:ht*1.2,
      lignes: STATE.lignesD, devise: STATE.deviseD,
      destinataire_id: clientConnu?.reference_id || null,
    });
    if (r && r.length > 0) { STATE.devis.unshift(r[0]); } else { throw new Error("Erreur serveur"); }
    autoAddClient(client);
    showToast('✅ Devis enregistré !', 'success');
    logAudit('devis', r[0].id, 'creation', (r[0].ref || '') + ' — ' + client + ' — ' + fmt(r[0].ttc) + ' MAD');
    setTimeout(()=>goScreen('devis-list'), 800);
  } catch(e) { showToast('❌ '+e.message, 'error'); }
}

// NOUVEAU: l'entreprise peut résoudre elle-même un devis en attente/envoyé
// (accepté ou refusé), sans dépendre du client qui n'a peut-être jamais agi
// via le lien (réponse reçue par téléphone, par exemple).
async function resoudreManuellementDevis(id, nouveauStatut) {
  const d = STATE.devis.find(function(x) { return x.id === id; });
  if (!d) return;
  const libelle = nouveauStatut === 'accepte' ? 'accepté' : 'refusé';
  if (!confirm('Marquer ce devis comme ' + libelle + ' ?')) return;
  try {
    await sb.patch('devis', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: nouveauStatut });
    d.statut = nouveauStatut;
    showToast('✅ Devis marqué ' + libelle, 'success');
    logAudit('devis', id, nouveauStatut === 'accepte' ? 'acceptation' : 'refus', (d.ref||'') + ' (manuel)');
    openDetailDevis(id);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function openDetailDevis(id) {
  STATE.currentDevis = STATE.devis.find(d => d.id === id);
  if (!STATE.currentDevis) return;
  renderDetailDevis();
  goScreen('detail-devis');
}

function renderDetailDevis() {
  const d = STATE.currentDevis;
  if (!d) return;
  const dv = d.devise||'MAD';
  const clientTrouveDv = (STATE.clients || []).find(function(c) { return c.nom === d.client; });
  const dvClientEl = document.getElementById('dv-client');
  if (dvClientEl) {
    if (clientTrouveDv) {
      dvClientEl.style.cursor = 'pointer';
      dvClientEl.style.textDecoration = 'underline';
      dvClientEl.onclick = function() { openDetailClient(clientTrouveDv.id); };
    } else {
      dvClientEl.style.cursor = '';
      dvClientEl.style.textDecoration = '';
      dvClientEl.onclick = null;
    }
  }
  setEl('dv-client', d.client);
  setEl('dv-amount', fmt(d.ttc)+' '+dv+' TTC');
  setEl('dv-ref', `${d.ref} · ${d.date_emission||''} · Validité: ${d.validite||30}j`);
  const lignesEl = el('dv-lignes');
  if (lignesEl) lignesEl.innerHTML = (d.lignes||[]).map(l=>`
    <div class="d-ligne">
      <div><div style="font-size:13px;font-weight:500">${l.desc}</div><div style="font-size:11px;color:#9C9186">${l.qte} ${l.unite||'u'} × ${fmt(l.pu)} ${dv}</div></div>
      <div style="font-size:13px;font-weight:600">${fmt(l.qte*l.pu)} ${dv}</div>
    </div>`).join('');
  const totEl = el('dv-totals');
  if (totEl) totEl.innerHTML = `
    <div class="d-tot-row"><span>HT</span><span>${fmt(d.ht)} ${dv}</span></div>
    <div class="d-tot-row"><span>TVA 20%</span><span>${fmt(d.tva)} ${dv}</span></div>
    <div class="d-tot-row main"><span>Total TTC</span><span>${fmt(d.ttc)} ${dv}</span></div>`;
  const actEl = el('dv-actions');
  if (!actEl) return;
  const actions = [];

  // Badge statut
  const statutColors = { envoye:'#B8860B', accepte:'#6E8F4E', refuse:'#8E2E24', expire:'#9C9186', en_attente:'#B8860B' };
  const statutLabels = { envoye:'📤 Envoyé', accepte:'✅ Accepté', refuse:'❌ Refusé', expire:'⏰ Expiré', en_attente:'⏳ En attente (client)' };
  actions.push(`<div style="background:${statutColors[d.statut]||'#6B5F54'}20;border-left:3px solid ${statutColors[d.statut]||'#6B5F54'};border-radius:0 8px 8px 0;padding:8px 12px;font-size:12px;font-weight:600;color:${statutColors[d.statut]||'#6B5F54'};margin-bottom:4px">${statutLabels[d.statut]||d.statut}</div>`);

  // NOUVEAU: si le devis est "en attente" (mis de côté par le client, ou
  // simplement pas encore de réponse), l'entreprise peut le résoudre
  // elle-même — utile si le client a répondu par téléphone par exemple.
  if (d.statut === 'envoye' || d.statut === 'en_attente') {
    actions.push(`<div style="display:flex;gap:8px;margin-bottom:4px">
      <button class="action-item success" style="flex:1;margin-bottom:0" onclick="resoudreManuellementDevis(${d.id},'accepte')"><div class="action-ico" style="background:#EEF3E4">✅</div>Marquer accepté</button>
      <button class="action-item danger" style="flex:1;margin-bottom:0" onclick="resoudreManuellementDevis(${d.id},'refuse')"><div class="action-ico" style="background:#F5E4E1">❌</div>Marquer refusé</button>
    </div>`);
  }

  // Bouton "Envoyer" unifié (WhatsApp / Email / Lien / Compte Zelto) — en premier
  actions.push(`<button class="action-item" style="color:#1F6F72;border-left-color:#1F6F72" onclick="ouvrirModalEnvoi('devis',${d.id})"><div class="action-ico" style="background:#FBF0DA">📨</div>Envoyer</button>`);

  // Actions selon statut
  if (d.statut === 'envoye') {
    actions.push(`<button class="action-item success" onclick="changerStatutDevis(${d.id},'accepte')"><div class="action-ico" style="background:#EEF3E4">✅</div>Marquer accepté</button>`);
    actions.push(`<button class="action-item danger" onclick="changerStatutDevis(${d.id},'refuse')"><div class="action-ico" style="background:#F5E4E1">❌</div>Marquer refusé</button>`);
  }
  if (d.statut === 'accepte') {
    actions.push(`<button class="action-item" style="color:#C9971F;border-left-color:#C9971F" onclick="convertirEnFacture(${d.id})"><div class="action-ico" style="background:#E9F4F3">🧾</div>Convertir en facture</button>`);
  }

  // Partage
  // FIX: boutons "Partager WhatsApp" / "Partager / Copier lien" retirés —
  // redondants avec le bouton "Envoyer" unifié (WhatsApp/Email/Lien/Zelto)
  // déjà en premier dans cette liste d'actions.
  actions.push(`<button class="action-item" onclick="exportDevisPDF(${d.id})"><div class="action-ico" style="background:#F7EFDC">📄</div>Voir PDF</button>`);
  actions.push(`<button class="action-item" onclick="dupliquerDevis(${d.id})"><div class="action-ico" style="background:#EDE6F0">📋</div>Dupliquer</button>`);
  actions.push(`<button class="action-item danger" onclick="supprimerDevis(${d.id})"><div class="action-ico" style="background:#F5E4E1">🗑️</div>Supprimer</button>`);
  actEl.innerHTML = actions.join('');
}

async function changerStatutDevis(id, statut) {
  // FIX (audit) : sans le fallback entrepriseId, un membre d'équipe ne
  // pouvait jamais changer le statut d'un devis créé sous l'id entreprise.
  await sb.patch('devis', `id=eq.${id}&user_id=eq.${(STATE.entrepriseId || sb.user.id)}`, {statut});
  const d = STATE.devis.find(x=>x.id===id); if(d) d.statut=statut;
  STATE.currentDevis = d; renderDetailDevis();
  showToast('Statut mis à jour');
}

async function convertirEnFacture(id) {
  const d = STATE.devis.find(x=>x.id===id); if(!d) return;
  showToast('⏳ Conversion...');
  try {
    const ht = d.ht; const ref = getRef('FAC', STATE.factures);
    const r = await sb.post('factures', {
      user_id: (STATE.entrepriseId || sb.user.id), ref, client: d.client, chantier: d.chantier,
      date_emission: today(), paiement: 'virement', statut: 'envoyee',
      lignes: d.lignes, ht, tva: ht*0.2, ttc: ht*1.2, devis_ref: d.ref,
      bc_id: d.bc_id || null,
      devise: d.devise||'MAD', montant_recu: 0,
      destinataire_id: d.destinataire_id || null,
    });
    if (r && r.length > 0) { STATE.factures.unshift(r[0]); } else { throw new Error("Erreur serveur"); }
    await sb.patch('devis',`id=eq.${id}&user_id=eq.${(STATE.entrepriseId || sb.user.id)}`,{statut:'converti',facture_ref:ref});
    d.statut='converti'; d.facture_ref=ref;
    // FIX: la conversion devis→facture ne décrémentait jamais le stock,
    // contrairement à la création directe d'une facture — deux chemins
    // vers le même résultat (une facture avec des lignes liées au
    // catalogue), un seul des deux mettait le stock à jour.
    if (typeof decrementerStockDepuisLignes === 'function') await decrementerStockDepuisLignes(d.lignes, ref);
    showToast('🎉 Facture '+ref+' créée !','success');
    setTimeout(()=>goScreen('dashboard'),1200);
  } catch(e){showToast('❌ '+e.message,'error');}
}

async function supprimerDevis(id) {
  if (!confirm('Supprimer ce devis ?')) return;
  const d = STATE.devis.find(x=>x.id===id);
  // FIX (audit) : même bug — la suppression échouait silencieusement
  // pour un membre d'équipe (clause WHERE ne correspondant jamais).
  await sb.del('devis',`id=eq.${id}&user_id=eq.${(STATE.entrepriseId || sb.user.id)}`);
  STATE.devis = STATE.devis.filter(x=>x.id!==id);
  showToast('Supprimé'); goScreen('devis-list');
  logAudit('devis', id, 'suppression', d?.ref || '');
}

function dupliquerDevis(id) {
  const d = STATE.devis.find(x=>x.id===id); if(!d) return;
  initNouveauDevis({...d, ref:getRef('DEV',STATE.devis), statut:'envoye', date_emission:today()});
  goScreen('nouveau-devis');
  showToast('📋 Devis dupliqué');
}

// ============================================================
// AVOIR
// ============================================================

function initAvoir() {
  el('av-client') && (el('av-client').value = '');
  el('av-montant') && (el('av-montant').value = '');
  el('av-date') && (el('av-date').value = today());
  el('av-ref') && (el('av-ref').value = getRef('AV', STATE.avoirs));
  const sel = el('av-facture-origine');
  if (sel) {
    sel.innerHTML = '<option value="">Sélectionner...</option>' +
      STATE.factures.map(f=>`<option value="${f.id}">${f.ref} — ${f.client} — ${fmt(f.ttc)} MAD</option>`).join('');
    sel.onchange = function() {
      const f = STATE.factures.find(x=>String(x.id)===this.value);
      if(f){el('av-client').value=f.client;el('av-montant').value=Number(f.ht).toFixed(2);updateAvoirTotal();}
    };
  }
  updateAvoirTotal();
}

function updateAvoirTotal() {
  const ht = parseFloat(el('av-montant')?.value)||0;
  setEl('av-total-ht',fmt(ht)+' MAD');
  setEl('av-total-tva',fmt(ht*0.2)+' MAD');
  setEl('av-total-ttc',fmt(ht*1.2)+' MAD');
}

async function sauvegarderAvoir() {
  const client = el('av-client')?.value.trim();
  const ht = parseFloat(el('av-montant')?.value)||0;
  if(!client||ht<=0){showToast('Remplissez tous les champs','error');return;}
  showToast('⏳ Émission...');
  try {
    const r = await sb.post('avoirs',{
      user_id: (STATE.entrepriseId || sb.user.id), ref:el('av-ref')?.value,
      client, ht, tva:ht*0.2, ttc:ht*1.2,
      date_emission:el('av-date')?.value,
      motif:el('av-motif')?.value,
      facture_origine_ref:STATE.factures.find(f=>String(f.id)===el('av-facture-origine')?.value)?.ref||''
    });
    STATE.avoirs.unshift(r[0]);
    // L'avoir est un document distinct - ne pas modifier la facture d'origine
    // Lier l'avoir à la facture d'origine pour référence uniquement
    const factureId = el('av-facture-origine')?.value;
    if (factureId) {
      const f = STATE.factures.find(x => String(x.id) === factureId);
      if (f && el('av-motif')?.value === 'annulation') {
        // Annulation totale : marquer la facture comme annulée (pas payée)
        await sb.patch('factures', 'id=eq.' + f.id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'annulee' });
        f.statut = 'annulee';
        // FIX (audit) : l'avoir n'a pas de lignes détaillées (juste un
        // montant global), donc on ne peut pas savoir QUOI restaurer en
        // général — mais pour une annulation TOTALE d'une facture liée,
        // on connaît ses vraies lignes (avec produit_id) : on restaure le
        // stock sur celles-ci. Sans ça, annuler une facture ne rendait
        // jamais les articles vendus au stock.
        try {
          const lignesOrigine = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
          for (const ligne of lignesOrigine) {
            if (ligne.produit_id && typeof enregistrerEntreeStock === 'function') {
              await enregistrerEntreeStock(ligne.produit_id, Number(ligne.qte) || 0, Number(ligne.pu) || 0, 'Annulation facture ' + (f.ref || ''), r[0]?.ref || '');
            }
          }
        } catch(eStock) { console.warn('Restauration stock après annulation:', eStock.message); }
      }
    }
    showToast('✅ Avoir émis !', 'success');

    // NOUVEAU : si ce client a un compte Zelto lié, il est prévenu qu'un
    // avoir a été émis sur sa facture — avant, aucune notification n'était
    // envoyée dans ce cas.
    const clientInfo = STATE.clients.find(function(c) { return c.nom === client; });
    if (clientInfo && clientInfo.reference_id) {
      try {
        const p = STATE.profil || {};
        await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_notification', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_user_id: clientInfo.reference_id,
            p_destinataire_email: clientInfo.email || '',
            p_type: 'avoir_recu',
            p_titre: '↩️ Avoir reçu — ' + (p.raison || sb.user?.email),
            p_corps: (p.raison || sb.user?.email) + ' vous a envoyé un avoir de ' + fmt(ht * 1.2) + ' MAD.',
            p_meta: JSON.stringify({ emetteur_raison: p.raison || '' })
          })
        });
      } catch(eNotifAvoir) {}
    }

    // Aller vers la liste des avoirs
    setTimeout(() => goScreen('avoir-list'), 800);
  } catch(e){showToast('❌ '+e.message,'error');}
}

// ============================================================
// BON DE COMMANDE
// ============================================================

// ============================================================
// SÉLECTION FOURNISSEUR POUR LE BON DE COMMANDE
// (existant dans l'historique / lien Zelto / recherche annuaire)
// ============================================================

// ============================================================
// PICKER FOURNISSEUR GÉNÉRIQUE — utilisé par le Bon de commande, la
// facture d'achat, et la demande de devis fournisseur. Combine : (1)
// l'historique des fournisseurs déjà utilisés dans CETTE entreprise
// (achats + BC confondus), (2) une recherche dans l'annuaire Zelto.
window._pickerFournisseurCtx = null; // { champNom, champId }

function ouvrirPickerFournisseur(champNom, champId) {
  window._pickerFournisseurCtx = { champNom: champNom, champId: champId || null };
  el('search-fournisseur-bc') && (el('search-fournisseur-bc').value = '');
  afficherFournisseursHistoriqueBC();
  el('modal-fournisseur-bc')?.classList.add('active');
  setTimeout(function() { el('search-fournisseur-bc')?.focus(); }, 100);
}

// Conservé pour compatibilité — le BC utilisait cette fonction directement.
function ouvrirPickerFournisseurBC() {
  ouvrirPickerFournisseur('bc-fournisseur', 'bc-fournisseur-id');
}

function afficherFournisseursHistoriqueBC(filtreTexte) {
  // Union des fournisseurs déjà vus dans les achats ET les bons de commande
  const nomsAchats = (STATE.achats || []).map(function(a) { return a.fournisseur; });
  const nomsBC = (STATE.bonsCommande || []).map(function(bc) { return bc.fournisseur; });
  const noms = Array.from(new Set(nomsAchats.concat(nomsBC).filter(Boolean)));
  const q = (filtreTexte || '').toLowerCase();
  const filtres = q ? noms.filter(function(n) { return n.toLowerCase().includes(q); }) : noms;
  const list = el('fournisseur-bc-picker-list');
  if (!list) return;
  list.innerHTML = (filtres.length ? filtres.map(function(n) {
    return '<div class="card" onclick="choisirFournisseurBC(' + "'" + n.replace(/'/g,"\\'") + "'" + ',null)"><div class="card-ico" style="background:#EDE6F0">🏢</div><div class="card-body"><div class="card-name">' + escapeHTML(n) + '</div><div class="card-ref">Déjà utilisé</div></div></div>';
  }).join('') : '<div style="text-align:center;padding:16px;color:#9C9186;font-size:12px">Aucun fournisseur dans l\'historique</div>');
}

let _timeoutRechercheFournisseurBC = null;
function rechercherFournisseurBC() {
  const q = el('search-fournisseur-bc')?.value || '';
  afficherFournisseursHistoriqueBC(q);
  clearTimeout(_timeoutRechercheFournisseurBC);
  if (q.length < 2) return;
  // Recherche dans l'annuaire Zelto (profils_entreprise) après une courte
  // pause, pour ne pas spammer une requête à chaque frappe.
  _timeoutRechercheFournisseurBC = setTimeout(async function() {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?raison=ilike.*' + encodeURIComponent(q) + '*&select=id,raison,secteur,ville&limit=10', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
      });
      const resultats = r.ok ? ((await r.json()) || []) : [];
      const list = el('fournisseur-bc-picker-list');
      if (!list) return;
      if (resultats.length) {
        list.innerHTML += '<div style="font-size:10px;font-weight:700;color:#9C9186;text-transform:uppercase;padding:8px 4px 4px">Sur Zelto</div>' +
          resultats.map(function(p) {
            return '<div class="card" onclick="choisirFournisseurBC(' + "'" + escapeHTML(p.raison||'').replace(/'/g,"\\'") + "'" + ',\'' + p.id + '\')"><div class="card-ico" style="background:#E9F4F3">📲</div><div class="card-body"><div class="card-name">' + escapeHTML(p.raison||'') + '</div><div class="card-ref">' + escapeHTML(p.secteur||'') + (p.ville?' · '+escapeHTML(p.ville):'') + '</div></div></div>';
          }).join('');
      }
    } catch(e) {}
  }, 400);
}

function choisirFournisseurBC(nom, id) {
  // Écrit dans le champ ciblé — soit celui du contexte générique (achat,
  // demande de devis...), soit par défaut celui du BC pour compatibilité
  // avec les anciens appels directs.
  const ctx = window._pickerFournisseurCtx || { champNom: 'bc-fournisseur', champId: 'bc-fournisseur-id' };
  el(ctx.champNom) && (el(ctx.champNom).value = nom);
  if (ctx.champId) el(ctx.champId) && (el(ctx.champId).value = id || '');
  window._pickerFournisseurCtx = null;
  closeAllModals();
}

async function importerFournisseurBCDepuisLien() {
  const lien = (el('bc-fournisseur-lien')?.value || '').trim();
  if (!lien) { showToast('Collez un lien Zelto', 'error'); return; }
  try {
    const url = new URL(lien.startsWith('http') ? lien : 'https://x.com?' + lien);
    const profilId = url.searchParams.get('profil') || url.searchParams.get('portail');
    if (!profilId) { showToast('Lien non reconnu', 'error'); return; }
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + profilId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    const data = await r.json();
    const p = data && data[0];
    if (!p) { showToast('Profil introuvable', 'error'); return; }
    el('bc-fournisseur') && (el('bc-fournisseur').value = p.raison || '');
    el('bc-fournisseur-id') && (el('bc-fournisseur-id').value = p.id || '');
    el('bc-fournisseur-lien') && (el('bc-fournisseur-lien').value = '');
    showToast('✅ Fournisseur importé : ' + p.raison, 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function rechercherFournisseurBCAnnuaire() {
  ouvrirPickerFournisseurBC();
  setTimeout(function() { el('search-fournisseur-bc')?.focus(); }, 150);
}

function initBonCommande(prefill) {
  STATE.lignesBC = prefill?.lignes||[];
  el('bc-fournisseur')&&(el('bc-fournisseur').value=prefill?.fournisseur||'');
  el('bc-fournisseur-id')&&(el('bc-fournisseur-id').value='');
  el('bc-ref')&&(el('bc-ref').value=getRef('BC',STATE.bonsCommande||[]));
  el('bc-date')&&(el('bc-date').value=today());
  el('bc-livraison')&&(el('bc-livraison').value='');
  el('bc-note')&&(el('bc-note').value='');
  renderLignesBC();
}

function renderLignesBC() {
  const c=el('bc-lignes'); if(!c) return;
  c.innerHTML=STATE.lignesBC.map((l,i)=>`
    <div class="ligne-item">
      <div class="ligne-body"><div class="ligne-desc">${l.desc}</div><div class="ligne-meta">${l.qte} × ${fmt(l.pu)} MAD</div></div>
      <div class="ligne-amt">${fmt(l.qte*l.pu)} MAD</div>
      <button class="ligne-del" onclick="STATE.lignesBC.splice(${i},1);renderLignesBC()">×</button>
    </div>`).join('');
  const ht=STATE.lignesBC.reduce((s,l)=>s+l.qte*l.pu,0);
  setEl('bc-ht',fmt(ht)+' MAD'); setEl('bc-tva',fmt(ht*0.2)+' MAD'); setEl('bc-ttc',fmt(ht*1.2)+' MAD');
}

function openAddLigneBC() {
  el('mlbc-desc')&&(el('mlbc-desc').value='');
  el('mlbc-qte')&&(el('mlbc-qte').value='1');
  el('mlbc-pu')&&(el('mlbc-pu').value='');
  el('modal-ligne-bc')?.classList.add('active');
  setTimeout(()=>el('mlbc-desc')?.focus(),100);
}

function confirmerLigneBC() {
  const desc=el('mlbc-desc')?.value.trim(), qte=parseFloat(el('mlbc-qte')?.value.replace(',','.'))||1, pu=parseFloat(el('mlbc-pu')?.value.replace(',','.'))||0;
  if(!desc||pu<=0){showToast('Remplissez tous les champs','error');return;}
  STATE.lignesBC.push({desc,qte,pu});
  closeAllModals(); renderLignesBC();
}

function genBonCommandePDF() {
  const fournisseur = el('bc-fournisseur')?.value.trim();
  if (!fournisseur || !STATE.lignesBC.length) { showToast('Remplissez le formulaire', 'error'); return; }
  const ht = STATE.lignesBC.reduce((s,l) => s + (l.qte||1)*(l.pu||0), 0);
  genDocPDF({
    type: 'BON DE COMMANDE', ref: el('bc-ref')?.value, color: '#7C5CA6',
    emetteur: STATE.profil || {},
    destinataire: { nom: fournisseur },
    date: el('bc-date')?.value,
    paiement: '',
    lignes: STATE.lignesBC,
    note: el('bc-note')?.value || '',
    ht, tva: ht*0.2, ttc: ht*1.2,
    devise: 'MAD',
    bl_ref: el('bc-livraison')?.value ? 'Livraison prévue: ' + el('bc-livraison').value : '',
    showPrices: true,
  });
}

// NOUVEAU: enregistre le bon de commande en base (auparavant : PDF à la
// volée, jamais sauvegardé — aucun historique, aucune liste possible).
async function sauvegarderBonCommande() {
  const fournisseur = el('bc-fournisseur')?.value.trim();
  if (!fournisseur || !STATE.lignesBC.length) { showToast('Remplissez le formulaire', 'error'); return; }
  const bc = {
    // FIX (audit) : même bug que sauvegarderAchat — sans ce fallback, un
    // bon de commande créé par un membre d'équipe serait invisible pour
    // le reste de l'entreprise.
    user_id: (STATE.entrepriseId || sb.user?.id),
    ref: el('bc-ref')?.value,
    fournisseur: fournisseur,
    fournisseur_id: el('bc-fournisseur-id')?.value || null,
    date_commande: el('bc-date')?.value || today(),
    livraison_prevue: el('bc-livraison')?.value || null,
    lignes: STATE.lignesBC,
    note: el('bc-note')?.value || '',
    statut: 'brouillon'
  };
  try {
    const result = await sb.post('bons_commande', bc);
    if (result) {
      STATE.bonsCommande = STATE.bonsCommande || [];
      STATE.bonsCommande.unshift(result[0] || bc);
      showToast('✅ Bon de commande enregistré', 'success');
      genBonCommandePDF();
      goScreen('bons-commande-list', null);
    }
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// NOUVEAU: envoyer le BC au fournisseur — lien public où il peut confirmer
// ou refuser, symétrique au cycle devis (accepter/refuser).
// NOUVEAU: quand un client (avec compte Zelto) accepte un devis reçu, un
// bon de commande se crée automatiquement chez lui, adressé à
// l'entreprise émettrice du devis — même principe que l'achat
// auto-enregistré à l'acceptation d'une facture (achats.js).
async function enregistrerBCDepuisDevisAccepte(devisId) {
  const uid = STATE.entrepriseId || sb.user?.id;
  if (!uid) return;
  try {
    // Éviter les doublons si la notification est traitée deux fois
    const existant = (STATE.bonsCommande || []).find(function(bc) { return bc.devis_source_id === parseInt(devisId); });
    if (existant) return;

    const r = await fetch(SUPABASE_URL + '/rest/v1/devis?id=eq.' + devisId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const d = data && data[0];
    if (!d) return;

    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + d.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const profils = await rp.json();
    const emetteur = (profils && profils[0]) || {};
    const lignesDevis = typeof d.lignes === 'string' ? JSON.parse(d.lignes || '[]') : (d.lignes || []);

    const bc = {
      user_id: uid,
      ref: getRef('BC', STATE.bonsCommande || []),
      fournisseur: emetteur.raison || 'Fournisseur Zelto',
      fournisseur_id: d.user_id,
      date_commande: today(),
      livraison_prevue: null,
      lignes: lignesDevis.map(function(l) { return { desc: l.desc, qte: l.qte, pu: l.pu, unite: l.unite || 'u' }; }),
      note: 'Généré automatiquement à l\'acceptation du devis ' + (d.ref || ''),
      devis_source_id: parseInt(devisId),
      statut: 'confirme',
      reponse_fournisseur: 'confirme',
      reponse_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    const result = await sb.post('bons_commande', bc);
    if (result) {
      STATE.bonsCommande = STATE.bonsCommande || [];
      STATE.bonsCommande.unshift(result[0] || bc);
      showToast('📋 Bon de commande ' + bc.ref + ' généré automatiquement', 'success');
      if (typeof logAudit === 'function') logAudit('bon_commande', (result[0]||bc).id, 'creation', 'Auto — depuis devis ' + (d.ref||''));
      // Notifie le fournisseur (l'entreprise émettrice du devis) — ce BC
      // étant auto-confirmé, il doit apparaître immédiatement chez lui.
      try {
        await fetch(SUPABASE_URL + '/rest/v1/rpc/notifier_bc_recu', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_bc_id: (result[0]||bc).id })
        });
      } catch(e4) {}
    }
  } catch(e) {
    console.warn('enregistrerBCDepuisDevisAccepte:', e);
  }
}

async function envoyerBonCommande(id) {
  const bc = (STATE.bonsCommande || []).find(function(x) { return x.id === id; });
  if (!bc) return;
  try {
    await sb.patch('bons_commande', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'envoye' });
    bc.statut = 'envoye';
  } catch(e) {}

  // NOUVEAU: si le fournisseur a un compte Zelto, il reçoit une
  // notification directe (en plus du lien partageable ci-dessous).
  if (bc.fournisseur_id) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/notifier_bc_recu', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_bc_id: id })
      });
    } catch(e3) {}
  }

  const lien = window.location.origin + window.location.pathname + '?bc=' + id + '&t=' + (bc.token_public||'');
  if (navigator.share) {
    try { await navigator.share({ title: 'Bon de commande ' + (bc.ref||''), text: 'Bon de commande ' + (bc.ref||'') + ' — merci de confirmer la réception : ' + lien }); }
    catch(e2) { navigator.clipboard?.writeText(lien); showToast('Lien copié', 'success'); }
  } else {
    navigator.clipboard?.writeText(lien);
    showToast('✅ Lien copié — envoyez-le à votre fournisseur', 'success');
  }
  renderBonsCommandeListe();
}

// ============================================================
// BC REÇUS (côté fournisseur) — conversion en facture
// ============================================================
STATE.bcRecus = STATE.bcRecus || [];

async function loadBCRecus() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_bons_commande_recus', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.bcRecus = r.ok ? ((await r.json()) || []) : [];
  } catch(e) { STATE.bcRecus = []; }
  renderBCRecus();
}

function renderBCRecus() {
  const container = el('bc-recus-liste');
  if (!container) return;
  const bcs = STATE.bcRecus || [];
  const statutLabel = { envoye: '📤 Envoyé', confirme: '✅ Confirmé', refuse: '❌ Refusé', brouillon: 'Brouillon' };

  container.innerHTML = !bcs.length
    ? '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucun bon de commande reçu</div></div>'
    : bcs.map(function(bc) {
        const ht = (bc.lignes||[]).reduce(function(s,l){return s+(l.qte||1)*(l.pu||0);},0);
        const dejaConverti = bc.facture_generee_id ? true : false;
        return '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
            '<div><div style="font-size:13px;font-weight:700">' + (bc.ref||'') + '</div><div style="font-size:11px;color:#9C9186">' + (bc.date_commande||'') + ' · ' + (statutLabel[bc.statut]||bc.statut) + '</div></div>' +
            '<div style="font-size:13px;font-weight:800">' + fmt(ht*1.2) + ' MAD</div>' +
          '</div>' +
          (bc.note ? '<div style="font-size:11px;color:#6B5F54;margin-top:6px;background:#F1EEE8;padding:6px 8px;border-radius:6px">' + escapeHTML(bc.note) + '</div>' : '') +
          (dejaConverti
            ? '<div style="margin-top:8px;font-size:11px;color:#6E8F4E;font-weight:600">✅ Déjà converti en facture</div>'
            : '<button onclick="convertirBCEnFacture(' + bc.id + ')" style="width:100%;margin-top:8px;padding:9px;background:#C9971F;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">🧾 Convertir en facture</button>') +
        '</div>';
      }).join('');
}

// Convertit un BC reçu en facture, pré-remplie et liée (bc_id), adressée
// au client qui a émis ce bon de commande.
async function convertirBCEnFacture(bcId) {
  const bc = (STATE.bcRecus || []).find(function(x) { return x.id === bcId; });
  if (!bc) return;
  try {
    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + bc.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    const profils = await rp.json();
    const client = (profils && profils[0]) || {};
    const ht = (bc.lignes||[]).reduce(function(s,l){return s+(l.qte||1)*(l.pu||0);},0);

    const facture = {
      user_id: (STATE.entrepriseId || sb.user.id),
      ref: getRef('FAC', STATE.factures || []),
      client: client.raison || 'Client Zelto',
      date_emission: today(),
      paiement: 'virement',
      statut: 'envoyee',
      lignes: (bc.lignes||[]).map(function(l) { return { desc: l.desc, qte: l.qte, pu: l.pu, unite: l.unite || 'u', produit_id: l.produit_id || null }; }),
      ht: ht, tva: ht*0.2, ttc: ht*1.2,
      bc_id: bc.id,
      devise: 'MAD', montant_recu: 0,
      note: 'Générée à partir du bon de commande ' + (bc.ref||''),
      // FIX (même trou que le décrément de stock trouvé plus tôt) : cette
      // facture concerne un BC reçu d'une AUTRE entreprise Zelto — son
      // compte réel (bc.user_id) est connu avec certitude, donc on
      // verrouille directement dessus.
      destinataire_id: bc.user_id || null,
    };

    const r = await sb.post('factures', facture);
    if (r && r.length) {
      STATE.factures.unshift(r[0]);
      bc.facture_generee_id = r[0].id;
      // FIX: même trou que convertirEnFacture — la facturation d'un BC
      // reçu ne décrémentait jamais le stock.
      if (typeof decrementerStockDepuisLignes === 'function') await decrementerStockDepuisLignes(facture.lignes, facture.ref);
      // Persiste le marquage côté BC (le fournisseur n'est pas propriétaire
      // de cette ligne, d'où la RPC dédiée plutôt qu'un simple patch).
      try {
        await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_bc_converti', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_bc_id: bc.id, p_facture_id: r[0].id })
        });
      } catch(e5) {}
      showToast('✅ Facture ' + facture.ref + ' créée depuis le BC ' + (bc.ref||''), 'success');
      renderBCRecus();
      openDetail(r[0].id);
    }
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function loadBonsCommande() {
  try {
    STATE.bonsCommande = (await sb.get('bons_commande', 'user_id=eq.' + (STATE.entrepriseId || sb.user.id) + '&order=created_at.desc')) || [];
  } catch(e) { STATE.bonsCommande = []; }
  renderBonsCommandeListe();
}

function renderBonsCommandeListe() {
  const list = el('bons-commande-liste');
  if (!list) return;
  const bcs = STATE.bonsCommande || [];
  if (!bcs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucun bon de commande</div></div>';
    return;
  }
  const statutLabel = { brouillon: 'Brouillon', envoye: 'Envoyé', confirme: '✅ Confirmé', refuse: '❌ Refusé' };
  const statutColor = { brouillon: '#9C9186', envoye: '#B8860B', confirme: '#6E8F4E', refuse: '#B23A2E' };
  list.innerHTML = bcs.map(function(bc) {
    const ht = (bc.lignes || []).reduce(function(s, l) { return s + (l.qte||1)*(l.pu||0); }, 0);
    const enSelection = typeof estEnSelection === 'function' && estEnSelection('bc');
    return '<div class="card" style="align-items:flex-start" onclick="' + (enSelection ? 'toggleSelectionItem(' + bc.id + ')' : 'voirBonCommande(' + bc.id + ')') + '">' +
      (typeof checkboxSelection === 'function' ? checkboxSelection('bc', bc.id) : '') +
      '<div class="card-ico" style="background:#EDE6F0">📋</div>' +
      '<div class="card-body"><div class="card-name">' + escapeHTML(bc.fournisseur||'') + '</div><div class="card-ref">' + (bc.ref||'') + ' · ' + (bc.date_commande||'') + '</div>' +
        '<span style="font-size:9px;font-weight:600;color:' + (statutColor[bc.statut]||'#9C9186') + '">' + (statutLabel[bc.statut]||bc.statut) + '</span>' +
      '</div>' +
      '<div class="card-end"><div class="card-amount">' + fmt(ht*1.2) + ' MAD</div>' +
        (!enSelection ? '<div style="display:flex;gap:4px;margin-top:6px">' +
          (bc.statut === 'brouillon' ? '<button onclick="event.stopPropagation();ouvrirModalEnvoi(\'bon-commande\',' + bc.id + ')" style="padding:5px 8px;background:#7C5CA6;color:#fff;border:none;border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">📤</button>' : '') +
          '<button onclick="event.stopPropagation();supprimerBonCommande(' + bc.id + ')" style="padding:5px 8px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">🗑️</button>' +
        '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

// NOUVEAU: suppression individuelle — n'existait pas du tout jusqu'ici.
async function supprimerBonCommande(id) {
  if (!confirm('Supprimer ce bon de commande ?')) return;
  try {
    await sb.del('bons_commande', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id));
    STATE.bonsCommande = (STATE.bonsCommande || []).filter(function(x) { return x.id !== id; });
    renderBonsCommandeListe();
    showToast('✅ Bon de commande supprimé', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function voirBonCommande(id) {
  const bc = (STATE.bonsCommande || []).find(function(x) { return x.id === id; });
  if (!bc) return;
  STATE.lignesBC = bc.lignes || [];
  el('bc-fournisseur') && (el('bc-fournisseur').value = bc.fournisseur || '');
  el('bc-fournisseur-id') && (el('bc-fournisseur-id').value = bc.fournisseur_id || '');
  el('bc-ref') && (el('bc-ref').value = bc.ref || '');
  el('bc-date') && (el('bc-date').value = bc.date_commande || '');
  el('bc-livraison') && (el('bc-livraison').value = bc.livraison_prevue || '');
  el('bc-note') && (el('bc-note').value = bc.note || '');
  renderLignesBC();
  genBonCommandePDF();
}

function initBonLivraison(prefill) {
  STATE.lignesBL = prefill?.lignes || [];
  el('bl-client') && (el('bl-client').value = prefill?.client || '');
  el('bl-ref') && (el('bl-ref').value = getRef('BL', STATE.bonsLivraison||[]));
  el('bl-date') && (el('bl-date').value = today());
  window._blFactureId = prefill?.facture_id || null;
  renderPickerFactureBL();
  renderLignesBL();
}

// NOUVEAU: sélecteur de la facture liée (remplace le champ texte libre
// "Facture réf" — c'est ce vrai lien qui permet au client de retrouver le
// bon de livraison depuis sa facture).
function renderPickerFactureBL() {
  const sel = el('bl-facture-liee');
  if (!sel) return;
  const factures = (STATE.factures || []).slice(0, 100);
  sel.innerHTML = '<option value="">Aucune (BL indépendant)</option>' +
    factures.map(function(f) {
      return '<option value="' + f.id + '"' + (window._blFactureId === f.id ? ' selected' : '') + '>' + escapeHTML(f.ref||'') + ' — ' + escapeHTML(f.client||'') + '</option>';
    }).join('');
}

function surChangementFactureBL() {
  const id = parseInt(el('bl-facture-liee')?.value || '');
  window._blFactureId = id || null;
  const f = (STATE.factures || []).find(function(x) { return x.id === id; });
  if (f && el('bl-client') && !el('bl-client').value) el('bl-client').value = f.client || '';
}

function renderLignesBL() {
  const c=el('bl-lignes'); if(!c) return;
  c.innerHTML=STATE.lignesBL.map((l,i)=>`
    <div class="ligne-item">
      <div class="ligne-body"><div class="ligne-desc">${l.desc}</div><div class="ligne-meta">Qté: ${l.qte} ${l.unite||'u'}</div></div>
      <div class="ligne-amt">${l.qte} ${l.unite||'u'}</div>
      <button class="ligne-del" onclick="STATE.lignesBL.splice(${i},1);renderLignesBL()">×</button>
    </div>`).join('');
}

function openAddLigneBL() {
  el('mlbl-desc')&&(el('mlbl-desc').value='');
  el('mlbl-qte')&&(el('mlbl-qte').value='1');
  el('modal-ligne-bl')?.classList.add('active');
  setTimeout(()=>el('mlbl-desc')?.focus(),100);
}

function confirmerLigneBL() {
  const desc=el('mlbl-desc')?.value.trim(),qte=parseFloat(el('mlbl-qte')?.value.replace(',','.'))||1;
  if(!desc){showToast('Entrez une description','error');return;}
  STATE.lignesBL.push({desc,qte,unite:'u'});
  closeAllModals();renderLignesBL();
}

function genBonLivraisonPDF(refFactureLiee, blIdPourQR, blTokenPourQR) {
  const client = el('bl-client')?.value.trim();
  if (!client || !STATE.lignesBL.length) { showToast('Remplissez le formulaire', 'error'); return; }

  // NOUVEAU: le BL doit afficher le devis ET le BC liés (via la facture),
  // plus son propre QR (pour qu'on puisse le retrouver/vérifier).
  const refsQR = [];
  const factureLiee = window._blFactureId ? (STATE.factures || []).find(function(f) { return f.id === window._blFactureId; }) : null;
  if (factureLiee) {
    if (factureLiee.devis_ref) {
      const devisTrouve = (STATE.devis || []).find(function(d) { return d.ref === factureLiee.devis_ref; });
      refsQR.push({ icon: '📝', label: 'Devis', ref: factureLiee.devis_ref, url: devisTrouve ? (window.location.origin + window.location.pathname + '?doc=' + devisTrouve.id + '&type=devis' + '&t=' + (devisTrouve.token_public||'')) : '' });
    }
    if (factureLiee.bc_id) {
      const bcTrouve = (STATE.bonsCommande || []).find(function(b) { return b.id === factureLiee.bc_id; });
      if (bcTrouve) refsQR.push({ icon: '📋', label: 'Bon de commande', ref: bcTrouve.ref, url: window.location.origin + window.location.pathname + '?bc=' + bcTrouve.id + '&t=' + (bcTrouve.token_public||'') });
    }
  }
  if (blIdPourQR) {
    refsQR.push({ icon: '📦', label: 'Ce bon de livraison', ref: el('bl-ref')?.value, url: window.location.origin + window.location.pathname + '?bl=' + blIdPourQR + '&t=' + (blTokenPourQR||'') });
  }

  genDocPDF({
    type: 'BON DE LIVRAISON', ref: el('bl-ref')?.value, color: '#6E8F4E',
    emetteur: STATE.profil || {},
    destinataire: { nom: client },
    date: el('bl-date')?.value,
    paiement: '',
    lignes: STATE.lignesBL.map(l => ({ desc: l.desc||l.designation||'', qte: l.qte||1, pu: 0, unite: l.unite||'u' })),
    note: '',
    ht: 0, tva: 0, ttc: 0,
    devise: 'MAD',
    showPrices: false,
    devis_ref: (!refsQR.length && refFactureLiee) ? 'Facture réf: ' + refFactureLiee : '',
    refsQR: refsQR,
  });
}

// NOUVEAU: enregistre le BL en base avec un vrai facture_id — c'est ce qui
// permet au client de le retrouver depuis sa facture (voir
// afficherDocumentPublic dans app.js).
async function sauvegarderBonLivraison() {
  const client = el('bl-client')?.value.trim();
  if (!client || !STATE.lignesBL.length) { showToast('Remplissez le formulaire', 'error'); return; }
  const factureId = window._blFactureId || null;
  const factureLiee = factureId ? (STATE.factures || []).find(function(f) { return f.id === factureId; }) : null;

  const bl = {
    // FIX (audit) : même bug — bon de livraison invisible pour le reste
    // de l'entreprise sans ce fallback.
    user_id: (STATE.entrepriseId || sb.user?.id),
    ref: el('bl-ref')?.value,
    client: client,
    facture_id: factureId,
    date_livraison: el('bl-date')?.value || today(),
    lignes: STATE.lignesBL,
    note: '',
    statut: 'prepare'
  };
  try {
    const result = await sb.post('bons_livraison', bl);
    if (result) {
      STATE.bonsLivraison = STATE.bonsLivraison || [];
      STATE.bonsLivraison.unshift(result[0] || bl);
      showToast('✅ Bon de livraison enregistré' + (factureLiee ? ' et lié à ' + factureLiee.ref : ''), 'success');
      genBonLivraisonPDF(factureLiee ? factureLiee.ref : '', (result[0]||bl).id, (result[0]||bl).token_public);

      // NOUVEAU : si ce client a un compte Zelto lié, il est prévenu
      // qu'un bon de livraison a été créé — avant, aucune notification.
      const clientInfo = STATE.clients.find(function(c) { return c.nom === client; });
      if (clientInfo && clientInfo.reference_id) {
        try {
          const p = STATE.profil || {};
          await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_notification', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              p_user_id: clientInfo.reference_id,
              p_destinataire_email: clientInfo.email || '',
              p_type: 'bl_recu',
              p_titre: '📦 Bon de livraison — ' + (p.raison || sb.user?.email),
              p_corps: (p.raison || sb.user?.email) + ' a créé un bon de livraison ' + bl.ref + ' pour vous.',
              p_meta: JSON.stringify({ emetteur_raison: p.raison || '' })
            })
          });
        } catch(eNotifBL) {}
      }

      goScreen('bons-livraison-list', null);
    }
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function loadBonsLivraison() {
  try {
    STATE.bonsLivraison = (await sb.get('bons_livraison', 'user_id=eq.' + (STATE.entrepriseId || sb.user.id) + '&order=created_at.desc')) || [];
  } catch(e) { STATE.bonsLivraison = []; }
  renderBonsLivraisonListe();
}

function renderBonsLivraisonListe() {
  const list = el('bons-livraison-liste');
  if (!list) return;
  const bls = STATE.bonsLivraison || [];
  if (!bls.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun bon de livraison</div></div>';
    return;
  }
  list.innerHTML = bls.map(function(bl) {
    const facture = bl.facture_id ? (STATE.factures || []).find(function(f) { return f.id === bl.facture_id; }) : null;
    return '<div class="card" onclick="voirBonLivraison(' + bl.id + ')">' +
      '<div class="card-ico" style="background:#EEF3E4">📦</div>' +
      '<div class="card-body"><div class="card-name">' + escapeHTML(bl.client||'') + '</div><div class="card-ref">' + (bl.ref||'') + ' · ' + (bl.date_livraison||'') + (facture ? ' · 🔗 ' + escapeHTML(facture.ref) : '') + '</div></div>' +
    '</div>';
  }).join('');
}

function voirBonLivraison(id) {
  const bl = (STATE.bonsLivraison || []).find(function(x) { return x.id === id; });
  if (!bl) return;
  STATE.lignesBL = bl.lignes || [];
  el('bl-client') && (el('bl-client').value = bl.client || '');
  el('bl-ref') && (el('bl-ref').value = bl.ref || '');
  el('bl-date') && (el('bl-date').value = bl.date_livraison || '');
  window._blFactureId = bl.facture_id || null;
  renderPickerFactureBL();
  renderLignesBL();
  const facture = bl.facture_id ? (STATE.factures || []).find(function(f) { return f.id === bl.facture_id; }) : null;
  genBonLivraisonPDF(facture ? facture.ref : '', bl.id, bl.token_public);
}

// NOUVEAU: création directe depuis une facture — pré-remplit client +
// lignes + lie automatiquement le facture_id (le moyen le plus fiable
// d'avoir une liaison correcte, sans ressaisie).
function creerBonLivraisonDepuisFacture(factureId) {
  const f = (STATE.factures || []).find(function(x) { return x.id === factureId; });
  if (!f) return;
  const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
  // FIX: goScreen('bon-livraison') appelle initBonLivraison() SANS argument
  // (remise à zéro) — on navigue donc D'ABORD, puis on applique le
  // pré-remplissage APRÈS, sinon la navigation écraserait immédiatement ce
  // qu'on vient de préparer.
  goScreen('bon-livraison');
  initBonLivraison({
    client: f.client,
    facture_id: f.id,
    lignes: lignes.map(function(l) { return { desc: l.desc, qte: l.qte, unite: l.unite || 'u' }; })
  });
}

function exportDevisPDF(id) {
  const d = STATE.devis.find(x=>x.id===id); if(!d) return;
  const lignes = typeof d.lignes === 'string' ? JSON.parse(d.lignes||'[]') : (d.lignes||[]);
  const bc = d.bc_id ? (STATE.bonsCommande || []).find(function(b) { return b.id === d.bc_id; }) : null;
  genDocPDF({
    type: 'DEVIS', ref: d.ref, color: '#B8860B',
    emetteur: STATE.profil || {},
    destinataire: (function() {
      const clientTrouve = (STATE.clients || []).find(function(c) { return c.nom === d.client; });
      return { nom: d.client, chantier: d.chantier, ice: clientTrouve?.ice || '', tel: clientTrouve?.tel || '', adresse: clientTrouve?.adresse || '' };
    })(),
    date: d.date_emission, validite: d.validite,
    paiement: '',
    lignes: lignes, note: d.note||'',
    ht: d.ht, tva: d.tva, ttc: d.ttc,
    devise: d.devise || 'MAD',
    doc_id: id,
    doc_url: window.location.origin + window.location.pathname + '?doc=' + id + '&t=' + (d.token_public||''),
    signatureClient: d.signature_data || null,
    refsQR: bc ? [{ icon: '📋', label: 'Bon de commande', ref: bc.ref, url: window.location.origin + window.location.pathname + '?bc=' + bc.id + '&t=' + (bc.token_public||'') }] : [],
  });
}

function previewDevisPDF() {
  const client = el('d-client')?.value.trim();
  if (!client) { showToast('Remplissez le formulaire', 'error'); return; }
  const ht = STATE.lignesD.reduce((s,l) => s + l.qte*l.pu, 0);
  genDocPDF({
    type: 'DEVIS', ref: el('d-ref')?.value, color: '#B8860B',
    emetteur: STATE.profil || {},
    destinataire: { nom: client, chantier: el('d-chantier')?.value },
    date: el('d-date')?.value,
    validite: el('d-validite')?.value,
    paiement: '',
    lignes: STATE.lignesD,
    note: el('d-note')?.value || '',
    ht, tva: ht*0.2, ttc: ht*1.2,
    devise: STATE.deviseF || 'MAD',
    doc_id: STATE.currentDevis?.id || '',
    doc_url: STATE.currentDevis?.id ? (window.location.origin + window.location.pathname + '?doc=' + STATE.currentDevis.id + '&t=' + (STATE.currentDevis.token_public||'')) : '',
  });
}
function previewAvoirPDF() {
  const client = el('av-client')?.value.trim();
  if (!client) { showToast('Remplissez le formulaire', 'error'); return; }
  const ht = parseFloat(el('av-montant')?.value) || 0;
  // Trouver la facture d'origine
  const factureId = el('av-facture-origine')?.value;
  const factureOrig = factureId ? STATE.factures.find(x => String(x.id) === factureId) : null;
  const motifLabels = {
    'annulation': 'Annulation totale de facture',
    'remboursement': 'Remboursement partiel',
    'correction': "Correction d'erreur",
    'retour': 'Retour marchandise'
  };
  const motif = el('av-motif')?.value || 'annulation';
  genDocPDF({
    type: 'AVOIR',
    ref: el('av-ref')?.value,
    color: '#8E2E24',
    emetteur: STATE.profil || {},
    destinataire: { nom: client },
    date: el('av-date')?.value,
    motif: motifLabels[motif] || motif,
    devis_ref: factureOrig ? 'Facture annulée: ' + factureOrig.ref : '',
    lignes: [{ desc: motifLabels[motif] || 'Avoir', qte: 1, pu: ht, unite: 'Fft', tva: 20 }],
    ht, tva: ht*0.2, ttc: ht*1.2,
    devise: STATE.deviseF || 'MAD',
    showStamp: false,
  });
}

// ============================================================
// LISTE DES AVOIRS
// ============================================================

function renderAvoirList() {
  const list = el('avoir-list-items');
  if (!list) return;
  const avoirs = STATE.avoirs || [];
  if (!avoirs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">↩️</div><div class="empty-title">Aucun avoir</div><div>Créez un avoir depuis le formulaire</div></div>';
    return;
  }
  list.innerHTML = avoirs.map(a => `
    <div class="card" style="margin:0 20px 10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700;color:#8E2E24">↩️ ${escapeHTML(a.ref||'')}</div>
          <div style="font-size:12px;color:#2A2420;margin-top:2px">${escapeHTML(a.client||'')}</div>
          <div style="font-size:11px;color:#6B5F54;margin-top:2px">${a.motif||''} · ${a.date_emission||''}</div>
          ${a.facture_origine_ref?`<div style="font-size:10px;color:#9C9186">Facture: ${a.facture_origine_ref}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:700;color:#8E2E24">-${fmt(a.ttc||0)} MAD</div>
          <button onclick="exportAvoirPDF('${a.id}')" style="background:#F5E4E1;color:#8E2E24;border:none;border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;margin-top:4px">📄 PDF</button>
        </div>
      </div>
    </div>
  `).join('');
}

function exportAvoirPDF(id) {
  const a = STATE.avoirs.find(x => x.id === id);
  if (!a) return;
  const motifLabels = {
    'annulation': 'Annulation totale de facture',
    'remboursement': 'Remboursement partiel',
    'correction': "Correction d'erreur",
    'retour': 'Retour marchandise'
  };
  genDocPDF({
    type: 'AVOIR',
    ref: a.ref,
    color: '#8E2E24',
    emetteur: STATE.profil || {},
    destinataire: { nom: a.client || '' },
    date: a.date_emission,
    motif: motifLabels[a.motif] || a.motif || '',
    devis_ref: a.facture_origine_ref ? 'Facture: ' + a.facture_origine_ref : '',
    lignes: [{ desc: motifLabels[a.motif] || 'Avoir', qte: 1, pu: a.ht || 0, unite: 'Fft', tva: 20 }],
    ht: a.ht, tva: a.tva, ttc: a.ttc,
    devise: 'MAD',
  });
}



// NOTE : les anciennes fonctions dédiées partagerDevisWhatsApp() et
// partagerDevisNatif() ont été retirées (2026) — remplacées depuis par
// la fonction générique envoyerVia() (produits.js), qui gère devis/BC/
// facture de façon uniforme (WhatsApp, email, lien, compte Zelto).

// ============================================================
// ACCEPTER / REFUSER — DEVIS ET FACTURES (via lien public)
// ============================================================

// Fonction générique : gère à la fois les devis (champ `statut`) et les
// factures (champ `reponse_client`, car les factures n'avaient pas de
// champ de réponse client dédié avant).
// NOUVEAU: bascule en "expiré" tout devis envoyé dont la date de validité
// (date_emission + validite jours) est dépassée. Le statut/couleur/libellé
// "expire" existaient déjà dans l'affichage mais rien ne le déclenchait.
async function verifierExpirationDevis() {
  const aujourdHui = new Date();
  const aExpirer = (STATE.devis || []).filter(function(d) {
    if (d.statut !== 'envoye' || !d.date_emission) return false;
    const dateValidite = new Date(d.date_emission);
    dateValidite.setDate(dateValidite.getDate() + (d.validite || 30));
    return dateValidite < aujourdHui;
  });
  if (!aExpirer.length) return;

  for (const d of aExpirer) {
    try {
      await sb.patch('devis', 'id=eq.' + d.id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'expire' });
      d.statut = 'expire';
    } catch(e) { console.warn('verifierExpirationDevis:', e); }
  }
}

async function traiterActionDocument(docId, type, action, signatureData, token) {
  const isFacture = type === 'facture';
  const table = isFacture ? 'factures' : 'devis';
  const champ = isFacture ? 'reponse_client' : 'statut';
  const valeurAcceptee = isFacture ? 'acceptee' : 'accepte';
  const valeurRefusee = isFacture ? 'refusee' : 'refuse';
  const valeurAttente = 'en_attente';
  const libelleDoc = isFacture ? 'facture' : 'devis';
  const libelleAction = action === 'accepter' ? 'Acceptation' : action === 'refuser' ? 'Refus' : 'Mise en attente';
  const iconAction = action === 'accepter' ? '✅' : action === 'refuser' ? '❌' : '⏳';

  // Afficher une page de confirmation propre
  document.body.innerHTML = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">${iconAction}</div>
      <h2 style="color:#2A2420;margin-bottom:8px">${libelleAction} ${isFacture ? 'de la facture' : 'du devis'}</h2>
      <p style="color:#6B5F54;margin-bottom:24px">Chargement...</p>
    </div>
  `;

  try {
    // FIX SÉCURITÉ : remplace le fetch REST direct (filtré uniquement par
    // id, donc devinable) par la RPC sécurisée qui exige aussi le jeton.
    // Utilise la session réelle si connectée, nécessaire pour vérifier
    // "c'est bien le bon destinataire" sur un document verrouillé.
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_document_public', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_doc_id: docId, p_token: token, p_type: type })
    });
    const d = r.ok ? (await r.json()) : null;
    if (d && d._verrouille) { if (typeof afficherEcranAccesReserve === 'function') afficherEcranAccesReserve(docId, type); return; }
    if (!d) { document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial">' + (isFacture ? 'Facture' : 'Devis') + ' introuvable</div>'; return; }

    // FIX: un document déjà accepté ou refusé ne doit plus jamais changer
    // d'état — que ce soit via un lien réutilisé (ancien message WhatsApp/
    // email), un double-clic, ou un rechargement de page. "En attente" ne
    // verrouille rien : le client peut toujours accepter/refuser après.
    const statutActuel = d[champ];
    const dejaTraite = statutActuel === valeurAcceptee || statutActuel === valeurRefusee;
    if (dejaTraite) {
      document.body.innerHTML = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
          <div style="font-size:64px;margin-bottom:16px">${statutActuel === valeurAcceptee ? '✅' : '❌'}</div>
          <h2 style="color:#2A2420;margin-bottom:8px">Ce ${isFacture ? 'facture' : 'devis'} a déjà été ${statutActuel === valeurAcceptee ? 'accepté' : 'refusé'}</h2>
          <div style="background:${statutActuel === valeurAcceptee ? '#EEF3E4' : '#F5E4E1'};border-radius:12px;padding:16px;margin:16px 0;text-align:left">
            <div style="font-size:13px;color:#6B5F54">Référence : <strong>${d.ref}</strong></div>
            <div style="font-size:13px;color:#6B5F54;margin-top:4px">Client : <strong>${d.client}</strong></div>
          </div>
          <p style="color:#6B5F54;font-size:13px">Aucune action supplémentaire n'est nécessaire.</p>
          <div style="margin-top:24px;font-size:11px;color:#9C9186">Propulsé par <strong style="color:#C9971F">Zelto</strong></div>
        </div>
      `;
      return;
    }

    // Mettre à jour le statut / la réponse client
    // FIX SÉCURITÉ : remplace le PATCH direct (filtré uniquement par id,
    // donc n'importe qui pouvait accepter/refuser n'importe quel document
    // en devinant son identifiant) par la RPC sécurisée qui exige le jeton.
    const signatureFinale = action === 'accepter'
      ? (signatureData || ('TEXTE:Accepté électroniquement le ' + new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })))
      : null;
    const rReponse = await fetch(SUPABASE_URL + '/rest/v1/rpc/repondre_document_public', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_doc_id: docId, p_token: token, p_type: type, p_action: action, p_signature: signatureFinale })
    });
    // FIX (audit workflow — important) : avant, cette réponse n'était
    // jamais vérifiée. fetch() ne lève une exception qu'en cas d'échec
    // réseau, PAS en cas d'erreur HTTP (400/403/500) — donc si la RPC
    // refusait silencieusement (jeton limite, politique de sécurité, panne
    // passagère), le client voyait quand même l'écran "Accepté !" alors
    // que rien n'était enregistré côté entreprise. Un vrai risque de litige
    // commercial ("j'ai pourtant accepté ce devis").
    if (!rReponse.ok) {
      document.body.innerHTML = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2 style="color:#B23A2E;margin-bottom:8px">Votre réponse n'a pas pu être enregistrée</h2>
          <p style="color:#6B5F54;font-size:13px;margin-bottom:20px">Une erreur s'est produite. Merci de réessayer dans un instant, ou de contacter directement l'entreprise si le problème persiste.</p>
          <button onclick="window.location.reload()" style="padding:12px 24px;background:#1F6F72;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Réessayer</button>
        </div>
      `;
      return;
    }

    // Journal d'audit (côté émetteur du document — utilise sa propre session si connectée)
    try { await logAudit(libelleDoc, docId, action === 'accepter' ? 'acceptation' : action === 'refuser' ? 'refus' : 'mise en attente', d.ref || ''); } catch(eAudit) {}

    // FIX: envoie une VRAIE notification stockée à l'émetteur (fournisseur)
    // — avant, seul un recalcul local sans bouton signalait qu'un devis
    // était accepté, et rien n'existait pour les factures.
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/notifier_reponse_document', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_doc_type: isFacture ? 'facture' : 'devis', p_doc_id: docId, p_action: action })
      });
    } catch(eNotif) {}

    // Page de confirmation
    const messageFinal = action === 'accepter'
      ? 'L\u2019entreprise a \u00e9t\u00e9 notifi\u00e9e. Elle vous contactera prochainement.'
      : action === 'refuser'
      ? 'Votre r\u00e9ponse a \u00e9t\u00e9 transmise \u00e0 l\u2019entreprise.'
      : 'Vous pourrez accepter ou refuser ce document \u00e0 tout moment via ce m\u00eame lien.';
    const titreFinal = action === 'accepter' ? (isFacture ? 'Facture acceptée' : 'Devis accepté') + ' !'
      : action === 'refuser' ? (isFacture ? 'Facture refusée' : 'Devis refusé') + ' !'
      : 'Mis en attente';
    const bg = action === 'accepter' ? '#EEF3E4' : action === 'refuser' ? '#F5E4E1' : '#F7EFDC';

    document.body.innerHTML = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
        <div style="font-size:64px;margin-bottom:16px">${iconAction}</div>
        <h2 style="color:#2A2420;margin-bottom:8px">${titreFinal}</h2>
        <div style="background:${bg};border-radius:12px;padding:16px;margin:16px 0;text-align:left">
          <div style="font-size:13px;color:#6B5F54">Référence : <strong>${d.ref}</strong></div>
          <div style="font-size:13px;color:#6B5F54;margin-top:4px">Client : <strong>${d.client}</strong></div>
          <div style="font-size:13px;color:#6B5F54;margin-top:4px">Montant : <strong>${(d.ttc||0).toLocaleString('fr-FR', {minimumFractionDigits:2})} MAD TTC</strong></div>
        </div>
        <p style="color:#6B5F54;font-size:13px">${messageFinal}</p>
        ${(action === 'accepter' && !isFacture && sb.user?.id) ? '<button id="btn-convertir-bc-manuel" style="width:100%;padding:12px;background:#7C5CA6;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:8px">📋 Convertir en bon de commande</button>' : ''}
        <div style="margin-top:24px;font-size:11px;color:#9C9186">Propulsé par <strong style="color:#C9971F">Zelto</strong></div>
        <div style="margin-top:16px;font-size:11px;color:#9C9186">Redirection dans <span id="compte-redirect">4</span>s...</div>
      </div>
    `;
    // NOUVEAU: bouton manuel de conversion en BC — complète la génération
    // automatique (qui ne se déclenche que via le panneau de
    // notifications) pour couvrir aussi ce cas du lien autonome.
    const btnBCManuel = document.getElementById('btn-convertir-bc-manuel');
    if (btnBCManuel) {
      btnBCManuel.onclick = async function() {
        btnBCManuel.disabled = true;
        btnBCManuel.textContent = '⏳ Génération...';
        if (typeof enregistrerBCDepuisDevisAccepte === 'function') await enregistrerBCDepuisDevisAccepte(docId);
        btnBCManuel.textContent = '✅ Bon de commande généré';
      };
    }
    // NOUVEAU: retour automatique à l'accueil après 4 secondes, avec un
    // petit compte à rebours visible plutôt qu'une redirection surprise.
    let secondesRestantes = 4;
    const intervalRedirect = setInterval(function() {
      secondesRestantes--;
      const span = document.getElementById('compte-redirect');
      if (span) span.textContent = secondesRestantes;
      if (secondesRestantes <= 0) {
        clearInterval(intervalRedirect);
        window.location.href = window.location.origin + window.location.pathname;
      }
    }, 1000);
  } catch(e) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#B23A2E">Erreur: ' + e.message + '</div>';
  }
}

// Alias de compatibilité pour les anciens liens ?devis=ID&action=...
async function traiterActionDevis(devisId, action) {
  return traiterActionDocument(devisId, 'devis', action);
}
