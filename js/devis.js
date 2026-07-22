// BANIPAY — devis.js

function renderDevisList() {
  const list = el('devis-list');
  if (!list) return;
  let data = STATE.filterD === 'tous' ? STATE.devis : STATE.devis.filter(d => d.statut === STATE.filterD);
  if (!data.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">📝</div><div class="empty-title">Aucun devis</div></div>`;
    return;
  }
  const icons = { envoye:'📤', accepte:'✅', refuse:'❌', converti:'🧾', expire:'⏰' };
  const bgs   = { envoye:'#FFFBEB', accepte:'#ECFDF5', refuse:'#FEF2F2', converti:'#EFF6FF', expire:'#F1F5F9' };
  list.innerHTML = data.map(d => `
    <div class="card" onclick="openDetailDevis(${d.id})">
      <div class="card-ico" style="background:${bgs[d.statut]||'#F1F5F9'}">${icons[d.statut]||'📝'}</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(d.client)}</div>
        <div class="card-ref">${d.ref} · ${d.date_emission||''} · ${d.validite||30}j</div>
        ${d.statut==='accepte'?'<div style="display:inline-block;background:#ECFDF5;color:#059669;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-top:2px">✅ Accepté</div>':d.statut==='refuse'?'<div style="display:inline-block;background:#FEF2F2;color:#DC2626;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-top:2px">❌ Refusé</div>':''}
      </div>
      <div class="card-end">
        <div class="card-amt">${fmt(d.ttc)} ${d.devise||'MAD'}</div>
        <div class="badge b-${d.statut}">${badgeDV(d.statut)}</div>
      </div>
    </div>`).join('');
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

async function sauvegarderDevis() {
  const client = el('d-client')?.value.trim();
  if (!client) { showToast('Entrez le nom du client', 'error'); return; }
  if (!STATE.lignesD.length) { showToast('Ajoutez au moins une ligne', 'error'); return; }
  const ht = STATE.lignesD.reduce((s,l)=>s+l.qte*l.pu,0);
  showToast('⏳ Sauvegarde...');
  try {
    const r = await sb.post('devis', {
      user_id: sb.user.id,
      ref: el('d-ref')?.value,
      client, chantier: el('d-chantier')?.value.trim(),
      date_emission: el('d-date')?.value,
      validite: parseInt(el('d-validite')?.value)||30,
      note: el('d-note')?.value.trim(),
      statut: 'envoye', ht, tva:ht*0.2, ttc:ht*1.2,
      lignes: STATE.lignesD, devise: STATE.deviseD,
    });
    if (r && r.length > 0) { STATE.devis.unshift(r[0]); } else { throw new Error("Erreur serveur"); }
    autoAddClient(client);
    showToast('✅ Devis enregistré !', 'success');
    setTimeout(()=>goScreen('devis-list'), 800);
  } catch(e) { showToast('❌ '+e.message, 'error'); }
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
  setEl('dv-client', d.client);
  setEl('dv-amount', fmt(d.ttc)+' '+dv+' TTC');
  setEl('dv-ref', `${d.ref} · ${d.date_emission||''} · Validité: ${d.validite||30}j`);
  const lignesEl = el('dv-lignes');
  if (lignesEl) lignesEl.innerHTML = (d.lignes||[]).map(l=>`
    <div class="d-ligne">
      <div><div style="font-size:13px;font-weight:500">${l.desc}</div><div style="font-size:11px;color:#94A3B8">${l.qte} ${l.unite||'u'} × ${fmt(l.pu)} ${dv}</div></div>
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
  const statutColors = { envoye:'#D97706', accepte:'#059669', refuse:'#DC2626', expire:'#94A3B8' };
  const statutLabels = { envoye:'📤 Envoyé', accepte:'✅ Accepté', refuse:'❌ Refusé', expire:'⏰ Expiré' };
  actions.push(`<div style="background:${statutColors[d.statut]||'#64748B'}20;border-left:3px solid ${statutColors[d.statut]||'#64748B'};border-radius:0 8px 8px 0;padding:8px 12px;font-size:12px;font-weight:600;color:${statutColors[d.statut]||'#64748B'};margin-bottom:4px">${statutLabels[d.statut]||d.statut}</div>`);

  // Bouton "Envoyer" unifié (WhatsApp / Email / Lien / Compte BaniPay) — en premier
  actions.push(`<button class="action-item" style="color:#4338CA;border-left-color:#4338CA" onclick="ouvrirModalEnvoi('devis',${d.id})"><div class="action-ico" style="background:#EEF2FF">📨</div>Envoyer</button>`);

  // Actions selon statut
  if (d.statut === 'envoye') {
    actions.push(`<button class="action-item success" onclick="changerStatutDevis(${d.id},'accepte')"><div class="action-ico" style="background:#ECFDF5">✅</div>Marquer accepté</button>`);
    actions.push(`<button class="action-item danger" onclick="changerStatutDevis(${d.id},'refuse')"><div class="action-ico" style="background:#FEF2F2">❌</div>Marquer refusé</button>`);
  }
  if (d.statut === 'accepte') {
    actions.push(`<button class="action-item" style="color:#2563EB;border-left-color:#2563EB" onclick="convertirEnFacture(${d.id})"><div class="action-ico" style="background:#EFF6FF">🧾</div>Convertir en facture</button>`);
  }

  // Partage
  actions.push(`<button class="action-item" onclick="partagerDevisWhatsApp(${d.id})"><div class="action-ico" style="background:#ECFDF5">📱</div>Partager WhatsApp</button>`);
  actions.push(`<button class="action-item" onclick="partagerDevisNatif(${d.id})"><div class="action-ico" style="background:#EFF6FF">📤</div>Partager / Copier lien</button>`);
  actions.push(`<button class="action-item" onclick="exportDevisPDF(${d.id})"><div class="action-ico" style="background:#FFFBEB">📄</div>Voir PDF</button>`);
  actions.push(`<button class="action-item" onclick="dupliquerDevis(${d.id})"><div class="action-ico" style="background:#F3E8FF">📋</div>Dupliquer</button>`);
  actions.push(`<button class="action-item danger" onclick="supprimerDevis(${d.id})"><div class="action-ico" style="background:#FEF2F2">🗑️</div>Supprimer</button>`);
  actEl.innerHTML = actions.join('');
}

async function changerStatutDevis(id, statut) {
  await sb.patch('devis', `id=eq.${id}&user_id=eq.${sb.user.id}`, {statut});
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
      user_id: sb.user.id, ref, client: d.client, chantier: d.chantier,
      date_emission: today(), paiement: 'virement', statut: 'envoyee',
      lignes: d.lignes, ht, tva: ht*0.2, ttc: ht*1.2, devis_ref: d.ref,
      devise: d.devise||'MAD', montant_recu: 0
    });
    if (r && r.length > 0) { STATE.factures.unshift(r[0]); } else { throw new Error("Erreur serveur"); }
    await sb.patch('devis',`id=eq.${id}&user_id=eq.${sb.user.id}`,{statut:'converti',facture_ref:ref});
    d.statut='converti'; d.facture_ref=ref;
    showToast('🎉 Facture '+ref+' créée !','success');
    setTimeout(()=>goScreen('dashboard'),1200);
  } catch(e){showToast('❌ '+e.message,'error');}
}

async function supprimerDevis(id) {
  if (!confirm('Supprimer ce devis ?')) return;
  await sb.del('devis',`id=eq.${id}&user_id=eq.${sb.user.id}`);
  STATE.devis = STATE.devis.filter(x=>x.id!==id);
  showToast('Supprimé'); goScreen('devis-list');
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
      user_id:sb.user.id, ref:el('av-ref')?.value,
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
        await sb.patch('factures', 'id=eq.' + f.id + '&user_id=eq.' + sb.user.id, { statut: 'annulee' });
        f.statut = 'annulee';
      }
    }
    showToast('✅ Avoir émis !', 'success');
    // Aller vers la liste des avoirs
    setTimeout(() => goScreen('avoir-list'), 800);
  } catch(e){showToast('❌ '+e.message,'error');}
}

// ============================================================
// BON DE COMMANDE
// ============================================================

function initBonCommande(prefill) {
  STATE.lignesBC = prefill?.lignes||[];
  el('bc-fournisseur')&&(el('bc-fournisseur').value=prefill?.fournisseur||'');
  el('bc-ref')&&(el('bc-ref').value=getRef('BC',[]));
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
  el('ml-desc')&&(el('ml-desc').value='');
  el('ml-qte')&&(el('ml-qte').value='1');
  el('ml-pu')&&(el('ml-pu').value='');
  el('modal-ligne-bc')?.classList.add('active');
  setTimeout(()=>el('ml-desc')?.focus(),100);
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
    type: 'BON DE COMMANDE', ref: el('bc-ref')?.value, color: '#7C3AED',
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
function initBonLivraison() {
  STATE.lignesBL=[];
  el('bl-client')&&(el('bl-client').value='');
  el('bl-ref')&&(el('bl-ref').value=getRef('BL',[]));
  el('bl-date')&&(el('bl-date').value=today());
  el('bl-facture-ref')&&(el('bl-facture-ref').value='');
  renderLignesBL();
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

function genBonLivraisonPDF() {
  const client = el('bl-client')?.value.trim();
  if (!client || !STATE.lignesBL.length) { showToast('Remplissez le formulaire', 'error'); return; }
  genDocPDF({
    type: 'BON DE LIVRAISON', ref: el('bl-ref')?.value, color: '#059669',
    emetteur: STATE.profil || {},
    destinataire: { nom: client },
    date: el('bl-date')?.value,
    paiement: '',
    lignes: STATE.lignesBL.map(l => ({ desc: l.desc||l.designation||'', qte: l.qte||1, pu: 0, unite: l.unite||'u' })),
    note: '',
    ht: 0, tva: 0, ttc: 0,
    devise: 'MAD',
    showPrices: false,
    devis_ref: el('bl-facture-ref')?.value ? 'Facture réf: ' + el('bl-facture-ref').value : '',
  });
}
function exportDevisPDF(id) {
  const d = STATE.devis.find(x=>x.id===id); if(!d) return;
  const lignes = typeof d.lignes === 'string' ? JSON.parse(d.lignes||'[]') : (d.lignes||[]);
  genDocPDF({
    type: 'DEVIS', ref: d.ref, color: '#D97706',
    emetteur: STATE.profil || {},
    destinataire: { nom: d.client, chantier: d.chantier },
    date: d.date_emission, validite: d.validite,
    paiement: '',
    lignes: lignes, note: d.note||'',
    ht: d.ht, tva: d.tva, ttc: d.ttc,
    devise: d.devise || 'MAD',
    doc_id: id,
    doc_url: window.location.origin + window.location.pathname + '?doc=' + id,
  });
}

function previewDevisPDF() {
  const client = el('d-client')?.value.trim();
  if (!client) { showToast('Remplissez le formulaire', 'error'); return; }
  const ht = STATE.lignesD.reduce((s,l) => s + l.qte*l.pu, 0);
  genDocPDF({
    type: 'DEVIS', ref: el('d-ref')?.value, color: '#D97706',
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
    doc_url: STATE.currentDevis?.id ? (window.location.origin + window.location.pathname + '?doc=' + STATE.currentDevis.id) : '',
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
    color: '#DC2626',
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
          <div style="font-size:13px;font-weight:700;color:#DC2626">↩️ ${escapeHTML(a.ref||'')}</div>
          <div style="font-size:12px;color:#0F172A;margin-top:2px">${escapeHTML(a.client||'')}</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px">${a.motif||''} · ${a.date_emission||''}</div>
          ${a.facture_origine_ref?`<div style="font-size:10px;color:#94A3B8">Facture: ${a.facture_origine_ref}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:700;color:#DC2626">-${fmt(a.ttc||0)} MAD</div>
          <button onclick="exportAvoirPDF('${a.id}')" style="background:#FEF2F2;color:#DC2626;border:none;border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;margin-top:4px">📄 PDF</button>
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
    color: '#DC2626',
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



// ============================================================
// PARTAGE DEVIS WHATSAPP
// ============================================================

function partagerDevisWhatsApp(id) {
  const d = STATE.devis.find(x => x.id === id);
  if (!d) return;
  const p = STATE.profil || {};
  // Lien vers le DEVIS (pas la facture) avec paramètre type=devis
  const docUrl = window.location.origin + window.location.pathname + '?doc=' + id + '&type=devis';
  const validiteDate = d.date_emission ? (() => {
    const dt = new Date(d.date_emission);
    dt.setDate(dt.getDate() + (d.validite || 30));
    return dt.toLocaleDateString('fr-FR');
  })() : '';

  const msg = encodeURIComponent(
    'Bonjour ' + (d.client||'') + ',\n\n' +
    'Veuillez trouver notre devis *' + d.ref + '*' + (d.chantier ? ' pour ' + d.chantier : '') + '.\n\n' +
    '• Montant TTC : *' + fmt(d.ttc) + ' MAD*\n' +
    (validiteDate ? '• Valide jusqu\'au : ' + validiteDate + '\n' : '') +
    '\n📎 Consulter et répondre :\n' + docUrl + '\n\n' +
    'Cordialement,\n' +
    (p.raison||'') +
    (p.tel ? '\n📞 ' + p.tel : '')
  );
  window.open('https://wa.me/?text=' + msg, '_blank');
}

async function partagerDevisNatif(id) {
  const d = STATE.devis.find(x => x.id === id);
  if (!d) return;
  const p = STATE.profil || {};
  const docUrl = window.location.origin + window.location.pathname + '?doc=' + id;
  const acceptUrl = window.location.origin + window.location.pathname + '?devis=' + id + '&action=accepter';

  const texte = 'Devis ' + d.ref + ' - ' + (d.client||'') + '\n' +
    'Montant: ' + fmt(d.ttc) + ' MAD TTC\n\n' +
    'Voir: ' + docUrl + '\n' +
    'Accepter: ' + acceptUrl;

  if (navigator.share) {
    try { await navigator.share({ title: 'Devis ' + d.ref, text: texte }); return; }
    catch(e) { if (e.name === 'AbortError') return; }
  }
  navigator.clipboard?.writeText(texte).then(() => showToast('✅ Lien copié !', 'success'));
}

// ============================================================
// ACCEPTER / REFUSER — DEVIS ET FACTURES (via lien public)
// ============================================================

// Fonction générique : gère à la fois les devis (champ `statut`) et les
// factures (champ `reponse_client`, car les factures n'avaient pas de
// champ de réponse client dédié avant).
async function traiterActionDocument(docId, type, action) {
  const isFacture = type === 'facture';
  const table = isFacture ? 'factures' : 'devis';
  const champ = isFacture ? 'reponse_client' : 'statut';
  const valeurAcceptee = isFacture ? 'acceptee' : 'accepte';
  const valeurRefusee = isFacture ? 'refusee' : 'refuse';
  const libelleDoc = isFacture ? 'facture' : 'devis';

  // Afficher une page de confirmation propre
  document.body.innerHTML = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">${action === 'accepter' ? '✅' : '❌'}</div>
      <h2 style="color:#0F172A;margin-bottom:8px">${action === 'accepter' ? 'Acceptation' : 'Refus'} de ${isFacture ? 'la facture' : 'devis'}</h2>
      <p style="color:#64748B;margin-bottom:24px">Chargement...</p>
    </div>
  `;

  try {
    // Charger le document
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const d = data && data[0];
    if (!d) { document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial">' + (isFacture ? 'Facture' : 'Devis') + ' introuvable</div>'; return; }

    // Mettre à jour le statut / la réponse client
    const nouvelleValeur = action === 'accepter' ? valeurAcceptee : valeurRefusee;
    const patchBody = { notif_lue: false };
    patchBody[champ] = nouvelleValeur;

    await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(patchBody)
    });

    // Page de confirmation
    document.body.innerHTML = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
        <div style="font-size:64px;margin-bottom:16px">${action === 'accepter' ? '✅' : '❌'}</div>
        <h2 style="color:#0F172A;margin-bottom:8px">${isFacture ? 'Facture' : 'Devis'} ${action === 'accepter' ? 'acceptée' : 'refusée'} !</h2>
        <div style="background:${action === 'accepter' ? '#ECFDF5' : '#FEF2F2'};border-radius:12px;padding:16px;margin:16px 0;text-align:left">
          <div style="font-size:13px;color:#64748B">Référence : <strong>${d.ref}</strong></div>
          <div style="font-size:13px;color:#64748B;margin-top:4px">Client : <strong>${d.client}</strong></div>
          <div style="font-size:13px;color:#64748B;margin-top:4px">Montant : <strong>${(d.ttc||0).toLocaleString('fr-FR', {minimumFractionDigits:2})} MAD TTC</strong></div>
        </div>
        <p style="color:#64748B;font-size:13px">${action === 'accepter' ? 'L\u2019entreprise a \u00e9t\u00e9 notifi\u00e9e. Elle vous contactera prochainement.' : 'Votre r\u00e9ponse a \u00e9t\u00e9 transmise \u00e0 l\u2019entreprise.'}</p>
        <div style="margin-top:24px;font-size:11px;color:#94A3B8">Propulsé par <strong style="color:#2563EB">BaniPay</strong></div>
      </div>
    `;
  } catch(e) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#EF4444">Erreur: ' + e.message + '</div>';
  }
}

// Alias de compatibilité pour les anciens liens ?devis=ID&action=...
async function traiterActionDevis(devisId, action) {
  return traiterActionDocument(devisId, 'devis', action);
}
