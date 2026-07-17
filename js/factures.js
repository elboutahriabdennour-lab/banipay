// BANIPAY — factures.js

function renderObjectifMensuel() {
  const objectif = Number(STATE.profil?.objectif_mensuel || 0);
  const mois = new Date().getMonth();
  const annee = new Date().getFullYear();
  const caM = STATE.factures
    .filter(f => f.statut === 'payee' && new Date(f.date_emission).getMonth() === mois && new Date(f.date_emission).getFullYear() === annee)
    .reduce((s,f) => s + Number(f.ttc), 0);
  const objEl = el('objectif-bar');
  const objTxt = el('objectif-txt');
  if (!objEl || !objectif) return;
  const pct = Math.min(100, Math.round(caM / objectif * 100));
  objEl.style.width = pct + '%';
  if (objTxt) objTxt.textContent = `${fmtInt(caM)} / ${fmtInt(objectif)} MAD (${pct}%)`;
}

function renderFactureList() {
  const list = el('facture-list');
  if (!list) return;
  let data = STATE.filterF === 'toutes' ? STATE.factures : STATE.factures.filter(f => {
    if (STATE.filterF === 'attente') return ['attente','envoyee'].includes(f.statut);
    return f.statut === STATE.filterF;
  });
  if (!data.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucune facture</div><div>Créez votre première facture</div></div>`;
    return;
  }
  const icons = { attente:'🧱', retard:'⚠️', payee:'✅', envoyee:'📤' };
  const bgs   = { attente:'#FFFBEB', retard:'#FEF2F2', payee:'#ECFDF5', envoyee:'#EFF6FF' };
  list.innerHTML = data.map(f => {
    const recu = Number(f.montant_recu || 0);
    const pct = f.ttc > 0 ? Math.round(recu / f.ttc * 100) : 0;
    return `
    <div class="card" onclick="openDetail(${f.id})">
      <div class="card-ico" style="background:${bgs[f.statut]||'#F1F5F9'}">${icons[f.statut]||'📄'}</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(f.client)}</div>
        <div class="card-ref">${f.ref} · ${f.date_emission||''}</div>
        ${recu > 0 && f.statut !== 'payee' ? `<div style="margin-top:4px;height:3px;background:#E2E8F0;border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#059669;border-radius:2px"></div></div>` : ''}
      </div>
      <div class="card-end">
        <div class="card-amt">${fmt(f.ttc)} ${f.devise||'MAD'}</div>
        <div class="badge b-${f.statut}">${badgeF(f.statut)}</div>
        <button onclick="event.stopPropagation();creerAvoirDepuisFacture(${f.id})" style="font-size:10px;background:#F3E8FF;color:#9333EA;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;margin-top:3px;font-family:inherit">↩️ Avoir</button>
      </div>
    </div>`;
  }).join('');
}

function setFilter(f, btn) {
  STATE.filterF = f;
  document.querySelectorAll('#screen-dashboard .ftab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderFactureList();
}

// ============================================================
// STATS
// ============================================================

function initNouvelle(prefill) {
  STATE.lignesF = prefill?.lignes ? [...prefill.lignes] : [];
  STATE.deviseF = prefill?.devise || 'MAD';
  el('f-client') && (el('f-client').value = prefill?.client || '');
  el('f-chantier') && (el('f-chantier').value = prefill?.chantier || '');
  el('f-date') && (el('f-date').value = prefill?.date_emission || today());
  el('f-ref') && (el('f-ref').value = prefill?.ref || getRef('FAC', STATE.factures));
  el('f-paiement') && (el('f-paiement').value = prefill?.paiement || 'virement');
  el('f-statut') && (el('f-statut').value = prefill?.statut || 'envoyee');
  el('f-echeance') && (el('f-echeance').value = prefill?.echeance || '');
  el('f-note') && (el('f-note').value = prefill?.note || '');
  // Devise buttons
  document.querySelectorAll('.devise-btn-f').forEach(b => b.classList.toggle('active', b.dataset.devise === STATE.deviseF));
  // Client autocomplete
  updateClientDatalist();
  renderLignesF();
}

function setDeviseF(devise, btn) {
  STATE.deviseF = devise;
  document.querySelectorAll('.devise-btn-f').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateTotauxF();
}

function renderLignesF() {
  const c = el('lignes-container');
  if (!c) return;
  c.innerHTML = STATE.lignesF.map((l, i) => `
    <div class="ligne-item">
      <div class="ligne-body">
        <div class="ligne-desc">${l.desc}</div>
        <div class="ligne-meta">${l.qte} ${l.unite||'u'} × ${fmt(l.pu)} ${STATE.deviseF}</div>
      </div>
      <div class="ligne-amt">${fmt(l.qte * l.pu)} ${STATE.deviseF}</div>
      <button class="ligne-del" onclick="supprimerLigneF(${i})">×</button>
    </div>`).join('');
  updateTotauxF();
}

function supprimerLigneF(i) { STATE.lignesF.splice(i, 1); renderLignesF(); }

function updateTotauxF() {
  const tvaRate = 0.20;
  const ht = STATE.lignesF.reduce((s, l) => s + l.qte * l.pu, 0);
  const tva = ht * tvaRate;
  const ttc = ht + tva;
  setEl('total-ht', fmt(ht) + ' ' + STATE.deviseF);
  setEl('total-tva', fmt(tva) + ' ' + STATE.deviseF);
  setEl('total-ttc', fmt(ttc) + ' ' + STATE.deviseF);
}

function openAddLigne() {
  el('ml-desc') && (el('ml-desc').value = '');
  el('ml-qte') && (el('ml-qte').value = '1');
  el('ml-pu') && (el('ml-pu').value = '');
  el('ml-unite') && (el('ml-unite').value = 'u');
  el('modal-ligne')?.classList.add('active');
  setTimeout(() => el('ml-desc')?.focus(), 100);
}

function confirmerLigne() {
  const desc = el('ml-desc')?.value.trim();
  const qte = parseFloat(el('ml-qte')?.value.replace(',','.')) || 1;
  const pu = parseFloat(el('ml-pu')?.value.replace(',','.')) || 0;
  const unite = el('ml-unite')?.value || 'u';
  if (!desc) { showToast('Entrez une description', 'error'); return; }
  if (pu <= 0) { showToast('Entrez un prix', 'error'); return; }
  STATE.lignesF.push({ desc, qte, pu, unite });
  closeAllModals();
  renderLignesF();
}

function openCatalogue() {
  el('search-produit') && (el('search-produit').value = '');
  filtrerProduits();
  el('modal-produits')?.classList.add('active');
}

function filtrerProduits() {
  const q = (el('search-produit')?.value || '').toLowerCase();
  const filtered = STATE.produits.filter(p => p.nom.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
  const picker = el('produits-picker');
  if (!picker) return;
  picker.innerHTML = filtered.length ? filtered.map(p => `
    <div class="produit-picker-item" onclick="ajouterDepuisCatalogue(${p.id})">
      <div>
        <div style="font-size:13px;font-weight:600;color:#0F172A">${p.nom}</div>
        <div style="font-size:11px;color:#94A3B8">${p.unite||'u'} · ${fmt(p.prix_ht)} MAD HT</div>
      </div>
      <div style="color:#2563EB;font-size:22px;font-weight:300">＋</div>
    </div>`).join('') : '<div style="text-align:center;padding:20px;color:#94A3B8">Aucun article</div>';
}

function ajouterDepuisCatalogue(id) {
  const p = STATE.produits.find(x => x.id === id);
  if (!p) return;
  STATE.lignesF.push({ desc: p.nom, qte: 1, pu: p.prix_ht, unite: p.unite || 'u' });
  closeAllModals();
  renderLignesF();
  showToast('✅ ' + p.nom + ' ajouté');
}

async function sauvegarderFacture(isDraft = false) {
  const client = el('f-client')?.value.trim();
  if (!client) { showToast('Entrez le nom du client', 'error'); return; }
  if (!STATE.lignesF.length) { showToast('Ajoutez au moins une ligne', 'error'); return; }
  const ht = STATE.lignesF.reduce((s,l) => s + l.qte*l.pu, 0);
  const statut = isDraft ? 'brouillon' : (el('f-statut')?.value || 'envoyee');
  showToast('⏳ Sauvegarde...');
  try {
    const body = {
      user_id: sb.user.id,
      ref: el('f-ref')?.value,
      client, chantier: el('f-chantier')?.value.trim(),
      date_emission: el('f-date')?.value,
      echeance: el('f-echeance')?.value || null,
      paiement: el('f-paiement')?.value,
      note: el('f-note')?.value.trim(),
      statut, ht, tva: ht * 0.2, ttc: ht * 1.2,
      lignes: STATE.lignesF,
      devise: STATE.deviseF,
      montant_recu: 0,
    };
    const r = await sb.post('factures', body);
    if (r && r.length > 0) { STATE.factures.unshift(r[0]); } else { throw new Error("Erreur serveur"); }
    // Auto-add client if new
    autoAddClient(client);
    showToast(isDraft ? '📋 Brouillon sauvegardé' : '✅ Facture enregistrée !', 'success');
    setTimeout(() => goScreen('dashboard'), 800);
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function dupliquerFacture(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  initNouvelle({ ...f, ref: getRef('FAC', STATE.factures), statut: 'envoyee', date_emission: today(), montant_recu: 0 });
  goScreen('nouvelle');
  showToast('📋 Facture dupliquée');
}

// ============================================================
// DETAIL FACTURE
// ============================================================

function openDetail(id) {
  STATE.currentFacture = STATE.factures.find(f => f.id === id);
  if (!STATE.currentFacture) return;
  renderDetail();
  goScreen('detail');
}

function renderDetail() {
  const f = STATE.currentFacture;
  if (!f) return;
  const dv = f.devise || 'MAD';
  const recu = Number(f.montant_recu || 0);
  const restant = Math.max(0, Number(f.ttc) - recu);
  const pct = f.ttc > 0 ? Math.min(100, Math.round(recu / f.ttc * 100)) : 0;

  setEl('detail-client', f.client);
  setEl('detail-amount', fmt(f.ttc) + ' ' + dv + ' TTC');
  const metaParts = [f.ref, f.date_emission||'', f.echeance ? 'Éch: '+f.echeance : '', f.paiement||''].filter(Boolean);
  setEl('detail-ref', metaParts.join(' · '));

  // Paiement progress
  const prog = el('detail-paiement-prog');
  if (prog && recu > 0) {
    prog.style.display = 'block';
    setEl('detail-recu', fmt(recu) + ' ' + dv);
    setEl('detail-restant', fmt(restant) + ' ' + dv);
    const bar = el('detail-prog-bar');
    if (bar) bar.style.width = pct + '%';
  } else if (prog) prog.style.display = 'none';

  // Lignes
  const lignesEl = el('detail-lignes');
  if (lignesEl) lignesEl.innerHTML = (f.lignes||[]).map(l => `
    <div class="d-ligne">
      <div>
        <div style="font-size:13px;font-weight:500">${l.desc}</div>
        <div style="font-size:11px;color:#94A3B8">${l.qte} ${l.unite||'u'} × ${fmt(l.pu)} ${dv}</div>
      </div>
      <div style="font-size:13px;font-weight:600">${fmt(l.qte*l.pu)} ${dv}</div>
    </div>`).join('');

  // Totaux
  const totEl = el('detail-totals');
  if (totEl) totEl.innerHTML = `
    <div class="d-tot-row"><span>Sous-total HT</span><span>${fmt(f.ht)} ${dv}</span></div>
    <div class="d-tot-row"><span>TVA 20%</span><span>${fmt(f.tva)} ${dv}</span></div>
    ${recu > 0 ? `<div class="d-tot-row"><span>Déjà reçu</span><span style="color:#059669">-${fmt(recu)} ${dv}</span></div>` : ''}
    <div class="d-tot-row main"><span>Total TTC</span><span>${fmt(f.ttc)} ${dv}</span></div>
    ${restant > 0 && recu > 0 ? `<div class="d-tot-row" style="color:#EF4444"><span>Solde restant</span><span>${fmt(restant)} ${dv}</span></div>` : ''}`;

  // Actions
  // Note
  const noteEl = el('detail-note');
  if (noteEl) {
    if (f.note) { noteEl.textContent = f.note; noteEl.parentElement.style.display = 'block'; }
    else { noteEl.parentElement.style.display = 'none'; }
  }
  // Chantier
  const chantEl = el('detail-chantier');
  if (chantEl) {
    if (f.chantier) { chantEl.textContent = f.chantier; chantEl.parentElement.style.display = 'block'; }
    else { chantEl.parentElement.style.display = 'none'; }
  }
  const actEl = el('detail-actions');
  if (!actEl) return;
  const actions = [];
  if (f.statut !== 'payee') {
    actions.push(`<button class="action-item success" onclick="marquerPayee(${f.id})"><div class="action-ico" style="background:#ECFDF5">✅</div>Marquer payée</button>`);
    actions.push(`<button class="action-item" onclick="ouvrirPaiementPartiel(${f.id})"><div class="action-ico" style="background:#EFF6FF">💰</div>Enregistrer un paiement</button>`);
    if (['attente','envoyee'].includes(f.statut))
      actions.push(`<button class="action-item" style="color:#D97706;border-left-color:#D97706" onclick="marquerRetard(${f.id})"><div class="action-ico" style="background:#FFFBEB">⚠️</div>Marquer en retard</button>`);
  }
  // PDF actions
  actions.push(`<button class="action-item" onclick="exportPDF(${f.id})"><div class="action-ico" style="background:#EFF6FF">👁️</div>Aperçu PDF</button>`);
  actions.push(`<button class="action-item" onclick="enregistrerPDFFacture(${f.id})"><div class="action-ico" style="background:#EFF6FF">💾</div>Enregistrer PDF</button>`);
  actions.push(`<button class="action-item" onclick="partagerFacturePDF(${f.id})"><div class="action-ico" style="background:#ECFDF5">📤</div>Partager la facture</button>`);
  // WhatsApp avec facture + lien
  actions.push(`<button class="action-item whatsapp" onclick="relancerWhatsApp(${f.id})"><div class="action-ico" style="background:#DCFCE7">📱</div>Relance WhatsApp</button>`);
  // Avoir depuis cette facture
  actions.push(`<button class="action-item" style="color:#9333EA;border-left-color:#9333EA" onclick="creerAvoirDepuisFacture(${f.id})"><div class="action-ico" style="background:#F3E8FF">↩️</div>Créer un avoir</button>`);
  // Paiements
  actions.push(`<button class="action-item" onclick="ouvrirAcomptes(${f.id})"><div class="action-ico" style="background:#ECFDF5">💰</div>Versements & acomptes</button>`);
  actions.push(`<button class="action-item" onclick="genRecuPaiement(${f.id})"><div class="action-ico" style="background:#ECFDF5">🧾</div>Reçu de paiement</button>`);
  // Autres
  actions.push(`<button class="action-item" onclick="dupliquerFacture(${f.id})"><div class="action-ico" style="background:#F3E8FF">📋</div>Dupliquer</button>`);
  actions.push(`<button class="action-item danger" onclick="supprimerFacture(${f.id})"><div class="action-ico" style="background:#FEF2F2">🗑️</div>Supprimer</button>`);
  actEl.innerHTML = actions.join('');
}

async function marquerPayee(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  await sb.patch('factures', `id=eq.${id}&user_id=eq.${sb.user.id}`, { statut: 'payee', montant_recu: f.ttc });
  f.statut = 'payee'; f.montant_recu = f.ttc;
  STATE.currentFacture = f;
  renderDetail();
  showToast('✅ Facture payée !', 'success');
}

async function marquerRetard(id) {
  await sb.patch('factures', `id=eq.${id}&user_id=eq.${sb.user.id}`, { statut: 'retard' });
  const f = STATE.factures.find(x => x.id === id);
  if (f) { f.statut = 'retard'; STATE.currentFacture = f; renderDetail(); }
  showToast('Statut mis à jour');
}

async function supprimerFacture(id) {
  if (!confirm('Supprimer cette facture ?')) return;
  await sb.del('factures', `id=eq.${id}&user_id=eq.${sb.user.id}`);
  STATE.factures = STATE.factures.filter(x => x.id !== id);
  showToast('Facture supprimée');
  goScreen('dashboard');
}

// ============================================================
// PAIEMENTS PARTIELS
// ============================================================

function ouvrirPaiementPartiel(id) {
  STATE.currentFacture = STATE.factures.find(f => f.id === id);
  if (!STATE.currentFacture) return;
  const f = STATE.currentFacture;
  const dv = f.devise || 'MAD';
  setEl('pp-total', fmt(f.ttc) + ' ' + dv);
  setEl('pp-recu', fmt(f.montant_recu || 0) + ' ' + dv);
  setEl('pp-restant', fmt(Math.max(0, f.ttc - (f.montant_recu||0))) + ' ' + dv);
  el('pp-montant') && (el('pp-montant').value = '');
  el('pp-date') && (el('pp-date').value = today());
  el('modal-paiement')?.classList.add('active');
}

async function confirmerPaiement() {
  const f = STATE.currentFacture;
  if (!f) return;
  const montant = parseFloat(el('pp-montant')?.value) || 0;
  if (montant <= 0) { showToast('Entrez un montant', 'error'); return; }
  const newRecu = Math.min(Number(f.ttc), (Number(f.montant_recu||0) + montant));
  const newStatut = newRecu >= Number(f.ttc) ? 'payee' : f.statut;
  await sb.patch('factures', `id=eq.${f.id}&user_id=eq.${sb.user.id}`, { montant_recu: newRecu, statut: newStatut });
  f.montant_recu = newRecu; f.statut = newStatut;
  // Save paiement record
  try {
    await sb.post('paiements', { user_id: sb.user.id, facture_id: f.id, montant, date: el('pp-date')?.value, mode: el('pp-mode')?.value || 'virement' });
  } catch(e) {}
  closeAllModals();
  renderDetail();
  showToast(`✅ ${fmt(montant)} MAD enregistré !`, 'success');
}

// ============================================================
// RECU DE PAIEMENT
// ============================================================

function genRecuPaiement(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  const p = STATE.profil;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Reçu ${f.ref}<\/title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;max-width:420px;margin:40px auto;padding:20px}
.card{border:1px solid #E2E8F0;border-radius:16px;overflow:hidden}
.header{background:#059669;color:#fff;padding:24px;text-align:center}
.body{padding:20px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:14px}
.total{display:flex;justify-content:space-between;padding:14px 0;font-size:20px;font-weight:700;color:#059669}
.btn{display:block;width:100%;background:#059669;color:#fff;border:none;border-radius:10px;padding:14px;font-size:14px;font-weight:600;cursor:pointer;margin-top:16px}
@media print{.btn{display:none}}<\/style><\/head><body>
<div class="card">
  <div class="header"><div style="font-size:40px;margin-bottom:8px">✅</div><h2>Reçu de paiement</h2><div style="opacity:0.8;margin-top:4px">${f.ref}</div></div>
  <div class="body">
    <div class="row"><span style="color:#64748B">Client</span><strong>${f.client}</strong></div>
    <div class="row"><span style="color:#64748B">Date</span><span>${new Date().toLocaleDateString('fr-MA')}</span></div>
    <div class="row"><span style="color:#64748B">Mode</span><span>${f.paiement||'Virement'}</span></div>
    <div class="row"><span style="color:#64748B">Référence</span><span>${f.ref}</span></div>
    ${f.chantier ? `<div class="row"><span style="color:#64748B">Projet</span><span>${f.chantier}</span></div>` : ''}
    <div class="total"><span>Montant reçu</span><span>${fmt(f.ttc)} ${f.devise||'MAD'}</span></div>
    <div style="font-size:11px;color:#94A3B8;text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid #F1F5F9">
      ${p.raison||''} · ${p.tel||''} · ${p.email||''}
    </div>
  </div>
</div>
<button class="btn" onclick="window.print()">🖨️ Imprimer</button>


<\/html>`;
  ouvrirPDFViewer(html, f.ref);
}

// ============================================================
// EXPORT CSV
// ============================================================

function exporterTout() {
  if (!STATE.factures.length) { showToast('Aucune facture', 'error'); return; }
  const rows = [['Ref','Client','Date','Échéance','Statut','HT','TVA','TTC','Devise','Mode','Reçu','Restant']];
  STATE.factures.forEach(f => rows.push([
    f.ref, f.client, f.date_emission||'', f.echeance||'', f.statut,
    Number(f.ht).toFixed(2), Number(f.tva).toFixed(2), Number(f.ttc).toFixed(2),
    f.devise||'MAD', f.paiement||'', Number(f.montant_recu||0).toFixed(2),
    Math.max(0, Number(f.ttc) - Number(f.montant_recu||0)).toFixed(2)
  ]));
  const csv = rows.map(r => r.map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const b = new Blob(['\uFEFF'+csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = `banipay_${today()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  showToast('📊 CSV téléchargé !', 'success');
}

// ============================================================
// WHATSAPP RELANCE
// ============================================================

function relancerWhatsApp(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  const p = STATE.profil;
  const restant = Math.max(0, Number(f.ttc) - Number(f.montant_recu||0));
  const lienProfil = window.location.origin + window.location.pathname + '?profil=' + (STATE.profil.id_unique||'');
  const msg = encodeURIComponent(
    'Bonjour,\n\n' +
    'Nous vous contactons au sujet de votre facture *' + f.ref + '*.\n\n' +
    '\u{1F4CB} *D\u00e9tails :*\n' +
    '\u2022 Client : ' + (f.client||'') + '\n' +
    '\u2022 Montant total : *' + fmt(f.ttc) + ' ' + (f.devise||'MAD') + ' TTC*\n' +
    (restant < Number(f.ttc) ? '\u2022 D\u00e9j\u00e0 r\u00e9gl\u00e9 : ' + fmt(Number(f.ttc)-restant) + ' ' + (f.devise||'MAD') + '\n' : '') +
    '\u2022 *Solde restant : ' + fmt(restant) + ' ' + (f.devise||'MAD') + '*\n' +
    '\u2022 Date : ' + (f.date_emission||'') + '\n' +
    (f.echeance ? '\u2022 \u00c9ch\u00e9ance : ' + f.echeance + '\n' : '') +
    (f.chantier ? '\u2022 Projet : ' + f.chantier + '\n' : '') +
    '\n\u{1F517} *Notre profil :*\n' + lienProfil + '\n\n' +
    'Merci de r\u00e9gulariser dans les meilleurs d\u00e9lais.\n\n' +
    'Cordialement,\n' + (p.raison||'') + '\n\u{1F4DE} ' + (p.tel||'') + (p.email ? '\n\u2709\ufe0f ' + p.email : '')
  );
  window.open('https://wa.me/?text=' + msg, '_blank');
}

// ============================================================
// PARTAGE NATIF
// ============================================================

async function partagerDoc(type, id) {
  const p = STATE.profil;
  let doc, titre, texte;
  if (type === 'facture') {
    doc = STATE.factures.find(f => f.id === id);
    titre = `Facture ${doc?.ref}`;
    texte = `*Facture ${doc?.ref}*\nClient: ${doc?.client}\nMontant: ${fmt(doc?.ttc)} ${doc?.devise||'MAD'} TTC\nDate: ${doc?.date_emission||''}\n\n${p.raison||''}\n${p.tel||''} · ${p.email||''}`;
  } else {
    doc = STATE.devis.find(d => d.id === id);
    titre = `Devis ${doc?.ref}`;
    texte = `*Devis ${doc?.ref}*\nClient: ${doc?.client}\nMontant: ${fmt(doc?.ttc)} ${doc?.devise||'MAD'} TTC\nValidité: ${doc?.validite||30} jours\n\n${p.raison||''}\n${p.tel||''} · ${p.email||''}`;
  }
  if (!doc) return;
  if (navigator.share) {
    try { await navigator.share({ title: titre, text: texte }); showToast('✅ Partagé !', 'success'); return; }
    catch(e) { if (e.name === 'AbortError') return; }
  }
  navigator.clipboard?.writeText(texte).then(() => showToast('✅ Copié !', 'success'));
}

// ============================================================
// AUTO-ADD CLIENT
// ============================================================

function autoAddClient(nom) {
  if (!nom || STATE.clients.find(c => c.nom.toLowerCase() === nom.toLowerCase())) return;
  sb.post('clients', { user_id: sb.user.id, nom }).then(r => {
    if (r && r.length > 0) { STATE.clients.push(r[0]); }
  }).catch(() => {});
}

function updateClientDatalist() {
  const dl = el('client-datalist');
  if (dl) dl.innerHTML = STATE.clients.map(c => `<option value="${c.nom}">`).join('');
}


// ===== DEVIS.JS =====
// ============================================================
// BANIPAY — Devis, Avoir, BC, BL
// ============================================================

// ============================================================
// DEVIS
// ============================================================

function creerAvoirDepuisFacture(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  // Navigate to avoir screen and prefill
  goScreen('avoir');
  setTimeout(() => {
    el('av-client') && (el('av-client').value = f.client);
    el('av-date') && (el('av-date').value = today());
    el('av-ref') && (el('av-ref').value = getRef('AV', STATE.avoirs));
    el('av-montant') && (el('av-montant').value = Number(f.ht).toFixed(2));
    // Select the facture in dropdown
    const sel = el('av-facture-origine');
    if (sel) {
      // Rebuild options and select this facture
      sel.innerHTML = '<option value="">Sélectionner...</option>' +
        STATE.factures.map(fx => '<option value="' + fx.id + '"' + (fx.id===f.id?' selected':'') + '>' + fx.ref + ' — ' + escapeHTML(fx.client) + ' — ' + fmt(fx.ttc) + ' MAD</option>').join('');
    }
    updateAvoirTotal();
  }, 100);
  showToast('↩️ Avoir pré-rempli depuis ' + f.ref);
}

function enregistrerPDFFacture(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  // Generate HTML content
  const html = buildPDFHTML(f);
  // Download as HTML file (user can print to PDF)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.ref + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast('💾 Facture téléchargée — ouvrez et imprimez en PDF', 'success');
}

async function partagerFacturePDF(id) {
  const f = STATE.factures.find(x => x.id === id);
  if (!f) return;
  const html = buildPDFHTML(f);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const file = new File([blob], f.ref + '.html', { type: 'text/html' });
  // Try native share with file
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Facture ' + f.ref,
        text: f.ref + ' — ' + escapeHTML(f.client) + ' — ' + fmt(f.ttc) + ' ' + (f.devise||'MAD') + ' TTC',
        files: [file]
      });
      showToast('✅ Partagé !', 'success');
      return;
    } catch(e) { if (e.name === 'AbortError') return; }
  }
  // Fallback: share text link + info
  const p = STATE.profil;
  const texte = [
    'Facture ' + f.ref,
    'Client: ' + escapeHTML(f.client),
    'Montant: ' + fmt(f.ttc) + ' ' + (f.devise||'MAD') + ' TTC',
    'Date: ' + (f.date_emission||''),
    f.echeance ? 'Échéance: ' + f.echeance : '',
    '',
    p.raison||'', p.tel||'', p.email||''
  ].filter(Boolean).join('\n');
  if (navigator.share) {
    try { await navigator.share({ title: 'Facture ' + f.ref, text: texte }); return; } catch(e) {}
  }
  navigator.clipboard?.writeText(texte).then(() => showToast('✅ Infos copiées !', 'success'));
}

function buildPDFHTML(f) {
  // Calls genDocPDF logic and returns the HTML string
  const p = STATE.profil;
  const dv = f.devise||'MAD';
  const legalParts = [p.rc?'RC: '+p.rc:null,p.identifiant_fiscal?'IF: '+p.identifiant_fiscal:null,p.ice?'ICE: '+p.ice:null].filter(Boolean).join(' · ');
  const lignesHTML = (f.lignes||[]).map((l,i) =>
    '<tr style="background:' + (i%2===0?'#F8FAFC':'#fff') + '"><td style="padding:8px 12px;font-size:12px">' + escapeHTML(l.desc||'') + '<\/td><td style="padding:8px 12px;text-align:center;font-size:12px">' + l.qte + ' ' + (l.unite||'') + '<\/td><td style="padding:8px 12px;text-align:right;font-size:12px">' + fmt(l.pu) + '<\/td><td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">' + fmt(l.qte*l.pu) + '<\/td><\/tr>'
  ).join('');
  return exportPDFString(f);
}

function exportPDFString(factureOrId) {
  const f = typeof factureOrId === 'object' ? factureOrId : STATE.factures.find(x => x.id === factureOrId);
  if (!f) return '';
  // Use genDocPDF but capture the HTML instead of opening viewer
  const p = STATE.profil;
  const dv = f.devise||'MAD';
  const recu = Number(f.montant_recu||0);
  const restant = Math.max(0, Number(f.ttc)-recu);
  const legalParts=[p.rc?'RC: '+p.rc:null,p.identifiant_fiscal?'IF: '+p.identifiant_fiscal:null,p.ice?'ICE: '+p.ice:null,p.patente?'Patente: '+p.patente:null].filter(Boolean).join(' · ');
  const lignesHTML=(f.lignes||[]).map((l,i)=>`<tr style="background:${i%2===0?'#F8FAFC':'#fff'}"><td style="padding:8px 12px;font-size:12px">${escapeHTML(l.desc||'')}<\/td><td style="padding:8px 12px;text-align:center;font-size:12px">${l.qte} ${l.unite||''}<\/td><td style="padding:8px 12px;text-align:right;font-size:12px">${fmt(l.pu)} ${dv}<\/td><td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">${fmt(l.qte*l.pu)} ${dv}<\/td><\/tr>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Facture ${f.ref}<\/title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#0F172A;font-size:12px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}<\/style><\/head><body><div style="background:#0F172A;padding:20px 28px;display:flex;justify-content:space-between"><div><div style="font-size:16px;font-weight:700;color:#fff">${escapeHTML(p.raison||'Mon Entreprise')}<\/div><div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">${p.tel||''} · ${p.email||''}<\/div><\/div><div style="text-align:right"><div style="background:#2563EB;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:700">FACTURE<\/div><div style="color:#fff;font-size:12px;margin-top:6px">${f.ref}<\/div><div style="color:rgba(255,255,255,0.5);font-size:10px;margin-top:2px">Date: ${f.date_emission||''}<\/div><\/div><\/div><div style="background:#F8FAFC;padding:6px 28px;text-align:center;font-size:9px;color:#64748B;border-bottom:1px solid #E2E8F0">${legalParts}<\/div><div style="display:flex;gap:10px;padding:12px 28px"><div style="flex:1;border:1px solid #E2E8F0;border-radius:8px;padding:10px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;background:#2563EB;color:#fff;padding:4px 8px;margin:-10px -10px 8px;border-radius:6px 6px 0 0">Facturé à<\/div><div style="font-size:13px;font-weight:700">${escapeHTML(f.client)}<\/div>${f.chantier?`<div style="font-size:11px;color:#64748B;margin-top:3px">Projet: ${escapeHTML(f.chantier)}<\/div>`:''}<\/div><div style="flex:1;border:1px solid #E2E8F0;border-radius:8px;padding:10px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;background:#2563EB;color:#fff;padding:4px 8px;margin:-10px -10px 8px;border-radius:6px 6px 0 0">Émetteur<\/div><div style="font-size:13px;font-weight:700">${escapeHTML(p.raison||'')}<\/div>${p.rc?`<div style="font-size:11px;color:#64748B;margin-top:3px">RC: ${p.rc}<\/div>`:''}<\/div><\/div><div style="padding:0 28px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#0F172A"><th style="padding:8px 12px;font-size:10px;color:#fff;text-align:left">Désignation<\/th><th style="padding:8px 12px;font-size:10px;color:#fff;text-align:center">Qté<\/th><th style="padding:8px 12px;font-size:10px;color:#fff;text-align:right">P.U. HT<\/th><th style="padding:8px 12px;font-size:10px;color:#fff;text-align:right">Total HT<\/th><\/tr><\/thead><tbody>${lignesHTML}<\/tbody><\/table><\/div><div style="padding:10px 28px;display:flex;justify-content:flex-end"><div style="width:250px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden"><div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:11px;border-bottom:1px solid #F1F5F9;color:#64748B"><span>HT<\/span><span>${fmt(f.ht)} ${dv}<\/span><\/div><div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:11px;border-bottom:1px solid #F1F5F9;color:#64748B"><span>TVA 20%<\/span><span>${fmt(f.tva)} ${dv}<\/span><\/div>${recu>0?`<div style="display:flex;justify-content:space-between;padding:7px 12px;font-size:11px;color:#059669"><span>Déjà reçu<\/span><span>-${fmt(recu)} ${dv}<\/span><\/div>`:''}<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#0F172A"><span style="font-size:12px;font-weight:700;color:#fff">TOTAL TTC<\/span><span style="font-size:14px;font-weight:700;color:#60A5FA">${fmt(f.ttc)} ${dv}<\/span><\/div>${restant>0&&recu>0?`<div style="display:flex;justify-content:space-between;padding:7px 12px;color:#EF4444;font-size:11px"><span>Solde restant<\/span><span>${fmt(restant)} ${dv}<\/span><\/div>`:''}<\/div><\/div><div style="padding:3px 28px 10px;font-size:10px;color:#64748B;font-style:italic">Arrêté à la somme de ${fmt(f.ttc)} ${dv==='MAD'?'dirhams':dv} TTC.<\/div>${f.note?`<div style="margin:0 28px 10px;background:#FFFBEB;border-left:3px solid #D97706;padding:10px;font-size:11px;color:#92400E">📌 ${escapeHTML(f.note)}<\/div>`:''}<div style="background:#0F172A;padding:12px 28px;margin-top:16px;text-align:center"><div style="font-size:11px;font-weight:700;color:#fff">Bani<span style="color:#60A5FA">Pay<\/span><\/div><div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:3px">${legalParts}<\/div><\/div><\/body><\/html>`;
}

function calculerSoldeFacture(factureId) {
  const f = STATE.factures.find(x => x.id === factureId);
  if (!f) return { total: 0, paye: 0, restant: 0 };
  const total = Number(f.ttc);
  const paye = Number(f.montant_recu || 0);
  return { total, paye, restant: Math.max(0, total - paye) };
}

// ============================================================
// VALIDATION FORMULAIRES
// ============================================================

function ouvrirNouvelAcompte() {
  el('ac-montant') && (el('ac-montant').value = '');
  el('ac-date') && (el('ac-date').value = today());
  el('ac-ref') && (el('ac-ref').value = '');
  el('modal-acompte')?.classList.add('active');
}

async function confirmerAcompte() {
  const f = STATE.currentFacture;
  if (!f) return;
  const montant = parseFloat(el('ac-montant')?.value.replace(',','.')) || 0;
  if (montant <= 0) { showToast('Entrez un montant valide', 'error'); return; }
  const solde = calculerSoldeFacture(f.id);
  if (montant > solde.restant + 0.01) {
    showToast('Montant supérieur au solde restant (' + fmt(solde.restant) + ' MAD)', 'error');
    return;
  }
  const newRecu = Math.min(Number(f.ttc), (Number(f.montant_recu || 0) + montant));
  const newStatut = newRecu >= Number(f.ttc) - 0.01 ? 'payee' : f.statut;
  showToast('⏳ Enregistrement...');
  try {
    await sb.patch('factures', `id=eq.${f.id}&user_id=eq.${sb.user.id}`, {
      montant_recu: newRecu, statut: newStatut
    });
    await sb.post('paiements', {
      user_id: sb.user.id,
      facture_id: f.id,
      montant,
      date: el('ac-date')?.value,
      mode: el('ac-mode')?.value || 'virement',
      type: el('ac-type')?.value || 'acompte',
      reference: el('ac-ref')?.value.trim() || null,
    });
    f.montant_recu = newRecu;
    f.statut = newStatut;
    closeAllModals();
    renderAcomptes(f.id);
    renderDetail();
    showToast('✅ ' + fmt(montant) + ' MAD enregistré !', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function renderAcomptes(factureId) {
  const f = STATE.factures.find(x => x.id === factureId);
  if (!f) return;
  STATE.currentFacture = f;
  const solde = calculerSoldeFacture(f.id);
  setEl('ac-facture-ref', escapeHTML(f.ref) + ' — ' + escapeHTML(f.client));
  setEl('ac-total', fmt(solde.total) + ' MAD');
  setEl('ac-paye', fmt(solde.paye) + ' MAD');
  setEl('ac-restant', fmt(solde.restant) + ' MAD');
  const liste = el('ac-liste');
  if (!liste) return;
  try {
    const pays = await sb.get('paiements', `facture_id=eq.${factureId}&order=created_at.desc`);
    if (!pays || !pays.length) {
      liste.innerHTML = '<div class="empty"><div>Aucun versement enregistré</div></div>';
      return;
    }
    const icons = { acompte:'💰', paiement:'💳', solde:'✅' };
    liste.innerHTML = pays.map(p => `
      <div class="card">
        <div class="card-ico" style="background:#ECFDF5">${icons[p.type] || '💰'}</div>
        <div class="card-body">
          <div class="card-name">${fmt(p.montant)} MAD</div>
          <div class="card-ref">${p.mode || ''} · ${formatDate(p.date)} ${p.reference ? '· Réf: '+escapeHTML(p.reference) : ''}</div>
        </div>
        <div class="badge" style="background:#ECFDF5;color:#059669">${p.type || 'paiement'}</div>
      </div>`).join('');
  } catch(e) { liste.innerHTML = '<div class="empty"><div>Erreur de chargement</div></div>'; }
}

function ouvrirAcomptes(id) {
  STATE.currentFacture = STATE.factures.find(x => x.id === id);
  renderAcomptes(id);
  goScreen('acomptes');
}

// ============================================================
// HISTORIQUE PAIEMENTS
// ============================================================

async function renderHistoriquePaiements(factureId) {
  const f = STATE.factures.find(x => x.id === factureId);
  if (!f) return;
  setEl('hp-facture-info', escapeHTML(f.ref) + ' — ' + escapeHTML(f.client) + ' — ' + fmt(f.ttc) + ' MAD');
  const liste = el('hp-liste');
  if (!liste) return;
  try {
    const pays = await sb.get('paiements', `facture_id=eq.${factureId}&order=date.desc`);
    if (!pays?.length) {
      liste.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucun paiement</div></div>';
      return;
    }
    liste.innerHTML = pays.map(p => `
      <div class="card">
        <div class="card-ico" style="background:#ECFDF5">💰</div>
        <div class="card-body">
          <div class="card-name">${fmt(p.montant)} MAD</div>
          <div class="card-ref">${formatDate(p.date)} · ${p.mode || 'virement'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="badge" style="background:#ECFDF5;color:#059669">${p.type || 'paiement'}</div>
          <button onclick="supprimerPaiement(${p.id},'${factureId}')" style="font-size:11px;color:#EF4444;background:none;border:none;cursor:pointer">🗑️</button>
        </div>
      </div>`).join('');
  } catch(e) { liste.innerHTML = '<div class="empty"><div>Erreur de chargement</div></div>'; }
}

function ouvrirHistoriquePaiements(factureId) {
  STATE.currentFacture = STATE.factures.find(x => x.id === factureId);
  renderHistoriquePaiements(factureId);
  goScreen('historique-paiements');
}

async function supprimerPaiement(paiementId, factureId) {
  if (!confirm('Supprimer ce paiement ?')) return;
  const f = STATE.factures.find(x => x.id === parseInt(factureId));
  if (!f) return;
  try {
    const p = await sb.get('paiements', `id=eq.${paiementId}`);
    if (p?.[0]) {
      const newRecu = Math.max(0, Number(f.montant_recu) - Number(p[0].montant));
      await sb.del('paiements', `id=eq.${paiementId}`);
      await sb.patch('factures', `id=eq.${f.id}&user_id=eq.${sb.user.id}`, {
        montant_recu: newRecu,
        statut: newRecu >= Number(f.ttc) - 0.01 ? 'payee' : 'envoyee'
      });
      f.montant_recu = newRecu;
      f.statut = newRecu >= Number(f.ttc) - 0.01 ? 'payee' : 'envoyee';
    }
    renderHistoriquePaiements(parseInt(factureId));
    showToast('Paiement supprimé', 'success');
  } catch(e) { showToast('❌ Erreur', 'error'); }
}

// ============================================================
// RELANCES
// ============================================================

function renderRelances() {
  const retard = STATE.factures.filter(f => f.statut === 'retard');
  const attente = STATE.factures.filter(f => ['attente','envoyee'].includes(f.statut));
  const all = [...retard, ...attente];
  const totalImpaye = all.reduce((s,f) => s + Math.max(0, Number(f.ttc) - Number(f.montant_recu||0)), 0);
  setEl('relances-total', fmt(totalImpaye) + ' MAD');
  setEl('relances-count', retard.length + ' facture(s) en retard');
  filterRelances('toutes', null);
}

function filterRelances(filter, btn) {
  document.querySelectorAll('#screen-relances .ftab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const list = el('relances-list');
  if (!list) return;
  let data = filter === 'retard' ? STATE.factures.filter(f => f.statut==='retard') :
             filter === 'attente' ? STATE.factures.filter(f => ['attente','envoyee'].includes(f.statut)) :
             STATE.factures.filter(f => !['payee','brouillon'].includes(f.statut));
  if (!data.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🎉</div><div class="empty-title">Aucune relance nécessaire !</div></div>';
    return;
  }
  list.innerHTML = data.map(f => {
    const restant = Math.max(0, Number(f.ttc) - Number(f.montant_recu||0));
    const jours = getDaysLate(f);
    return `
    <div class="card">
      <div class="card-ico" style="background:${f.statut==='retard'?'#FEF2F2':'#FFFBEB'}">${f.statut==='retard'?'⚠️':'🧱'}</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(f.client)}</div>
        <div class="card-ref">${f.ref} ${jours > 0 ? '· <span style="color:#EF4444">'+jours+' jours de retard</span>' : '· '+formatDate(f.echeance)}</div>
      </div>
      <div class="card-end">
        <div style="font-size:13px;font-weight:700;color:#EF4444">${fmt(restant)} MAD</div>
        <button onclick="relancerWhatsApp(${f.id})" style="font-size:11px;background:#DCFCE7;color:#16A34A;border:none;border-radius:6px;padding:3px 8px;cursor:pointer;margin-top:3px;font-family:inherit">📱 WhatsApp</button>
      </div>
    </div>`;
  }).join('');
}

function relancerTousWhatsApp() {
  const factures = STATE.factures.filter(f => !['payee','brouillon'].includes(f.statut));
  if (!factures.length) { showToast('Aucune facture à relancer', 'error'); return; }
  const p = STATE.profil;
  const lignes = factures.map(f => {
    const restant = Math.max(0, Number(f.ttc) - Number(f.montant_recu||0));
    return `• ${f.ref} — ${f.client} : ${fmt(restant)} MAD`;
  }).join('\n');
  const msg = encodeURIComponent(
    `Bonjour,

Voici le récapitulatif de nos factures impayées :

${lignes}

Merci de régulariser dans les meilleurs délais.

Cordialement,
${p.raison||''}
${p.tel||''}`
  );
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

// ============================================================
// PARAMÈTRES
// ============================================================
