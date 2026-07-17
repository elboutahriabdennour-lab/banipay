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
  if (d.statut === 'envoye') {
    actions.push(`<button class="action-item success" onclick="changerStatutDevis(${d.id},'accepte')"><div class="action-ico" style="background:#ECFDF5">✅</div>Marquer accepté</button>`);
    actions.push(`<button class="action-item danger" onclick="changerStatutDevis(${d.id},'refuse')"><div class="action-ico" style="background:#FEF2F2">❌</div>Marquer refusé</button>`);
  }
  if (d.statut === 'accepte')
    actions.push(`<button class="action-item" style="color:#2563EB;border-left-color:#2563EB" onclick="convertirEnFacture(${d.id})"><div class="action-ico" style="background:#EFF6FF">🧾</div>Convertir en facture</button>`);
  actions.push(`<button class="action-item" onclick="exportDevisPDF(${d.id})"><div class="action-ico" style="background:#EFF6FF">📄</div>Exporter PDF</button>`);
  actions.push(`<button class="action-item" onclick="partagerDoc('devis',${d.id})"><div class="action-ico" style="background:#ECFDF5">📤</div>Partager</button>`);
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
    // Mise à jour de la facture d'origine si annulation
    const factureId = el('av-facture-origine')?.value;
    if (factureId && el('av-motif')?.value === 'annulation') {
      const f = STATE.factures.find(x => String(x.id) === factureId);
      if (f) {
        await sb.patch('factures', 'id=eq.' + f.id + '&user_id=eq.' + sb.user.id, { statut: 'payee' });
        f.statut = 'payee';
      }
    }
    showToast('✅ Avoir émis !','success');
    setTimeout(()=>goScreen('dashboard'),800);
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
  const fournisseur=el('bc-fournisseur')?.value.trim();
  if(!fournisseur||!STATE.lignesBC.length){showToast('Remplissez le formulaire','error');return;}
  genDocPDF({
    type:'BON DE COMMANDE',ref:el('bc-ref')?.value,
    color:'#2563EB',
    emetteur:STATE.profil,
    destinataire:{nom:fournisseur},
    date:el('bc-date')?.value,
    extra:`Livraison prévue : ${el('bc-livraison')?.value||'—'}`,
    lignes:STATE.lignesBC, note:el('bc-note')?.value,
    devise:'MAD', signature:true
  });
}

// ============================================================
// BON DE LIVRAISON
// ============================================================

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
  const client=el('bl-client')?.value.trim();
  if(!client||!STATE.lignesBL.length){showToast('Remplissez le formulaire','error');return;}
  genDocPDF({
    type:'BON DE LIVRAISON',ref:el('bl-ref')?.value,
    color:'#059669',
    emetteur:STATE.profil,
    destinataire:{nom:client},
    date:el('bl-date')?.value,
    extra:el('bl-facture-ref')?.value?`Facture réf: ${el('bl-facture-ref').value}`:'',
    lignes:STATE.lignesBL.map(l=>({...l,pu:0})),
    devise:'MAD', showPrices:false, signature:true
  });
}


// ===== CLIENTS.JS =====
// ============================================================
// BANIPAY — Clients
// ============================================================
// ============================================================
// QR SCANNER & LIEN CLIENT
// ============================================================

function exportDevisPDF(id) {
  const d = STATE.devis.find(x=>x.id===id); if(!d) return;
  genDocPDF({
    type:'DEVIS', ref:d.ref, color:'#059669',
    emetteur:STATE.profil,
    destinataire:{nom:d.client,chantier:d.chantier},
    date:d.date_emission, validite:d.validite,
    lignes:d.lignes, note:d.note,
    ht:d.ht, tva:d.tva, ttc:d.ttc,
    devise:d.devise||'MAD',
  });
}

function previewDevisPDF() {
  const client=el('d-client')?.value.trim();
  if(!client){showToast('Remplissez le formulaire','error');return;}
  const ht=STATE.lignesD.reduce((s,l)=>s+l.qte*l.pu,0);
  genDocPDF({
    type:'DEVIS', ref:el('d-ref')?.value, color:'#059669',
    emetteur:STATE.profil,
    destinataire:{nom:client,chantier:el('d-chantier')?.value},
    date:el('d-date')?.value, validite:el('d-validite')?.value,
    lignes:STATE.lignesD,
    ht, tva:ht*0.2, ttc:ht*1.2,
    devise:STATE.deviseD,
  });
}

function previewAvoirPDF() {
  const client=el('av-client')?.value.trim();
  const ht=parseFloat(el('av-montant')?.value)||0;
  if(!client){showToast('Remplissez le formulaire','error');return;}
  genDocPDF({
    type:'AVOIR', ref:el('av-ref')?.value, color:'#EF4444',
    emetteur:STATE.profil,
    destinataire:{nom:client},
    date:el('av-date')?.value,
    motif:el('av-motif')?.value,
    lignes:[], ht, tva:ht*0.2, ttc:ht*1.2, devise:'MAD',
  });
}
