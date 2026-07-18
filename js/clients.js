// BANIPAY — clients.js

function ouvrirScannerQR() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;width:100%;max-width:360px';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:6px">📷 Ajouter un client</div>
    <div style="font-size:12px;color:#64748B;margin-bottom:16px">Scannez le QR code du client ou collez son lien BaniPay</div>
    <input id="qr-link-input" class="a-inp" placeholder="Collez le lien profil ou doc BaniPay..." style="margin-bottom:12px">
    <button onclick="chargerClientDepuisLien(document.getElementById('qr-link-input').value)" class="a-btn a-btn-blue" style="margin-bottom:8px">🔗 Importer depuis le lien</button>
    <div style="text-align:center;margin:8px 0;font-size:11px;color:#94A3B8">— ou —</div>
    <label style="display:block;background:#F1F5F9;border-radius:10px;padding:12px;text-align:center;cursor:pointer;font-size:13px;color:#2563EB;font-weight:600">
      📷 Scanner QR code
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="scannerQRDepuisImage(event)">
    </label>
    <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;margin-top:10px;padding:10px;background:#F1F5F9;border:none;border-radius:10px;font-size:13px;cursor:pointer">Annuler</button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function scannerQRDepuisImage(event) {
  showToast('Fonctionnalité QR scan — collez le lien directement', 'success');
  event.target.value = '';
}


function rechercherClientOuLien() {
  const val = el('search-client-inp')?.value || '';
  // If user pasted a BaniPay link, trigger the profile loader
  if (val.includes('?profil=') || val.match(/BP-[A-Z0-9]+/)) {
    // Auto-fill the QR input and trigger load
    setTimeout(async () => {
      const input = el('search-client-inp');
      if (!input) return;
      const lien = input.value.trim();
      input.value = '';
      // Create a virtual scanner session
      window._qrLinkToLoad = lien;
      const fakeInput = document.createElement('input');
      fakeInput.id = 'qr-link-input';
      fakeInput.value = lien;
      fakeInput.style.display = 'none';
      document.body.appendChild(fakeInput);
      await chargerClientDepuisLien();
      document.body.removeChild(fakeInput);
    }, 100);
    return;
  }
  renderClients();
}

function renderClients() {
  const el_count = el('clients-count');
  if (el_count) el_count.textContent = STATE.clients.length;
  const list = el('clients-list');
  if (!list) return;
  const q = (el('search-client-inp')?.value||'').toLowerCase();
  const filtered = q ? STATE.clients.filter(c =>
    c.nom.toLowerCase().includes(q) || (c.tel||'').includes(q) || (c.email||'').toLowerCase().includes(q)
  ) : STATE.clients;
  if (!filtered.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">👥</div><div class="empty-title">Aucun client</div></div>`;
    return;
  }
  list.innerHTML = filtered.map(c => {
    const caTotal = STATE.factures.filter(f=>f.client===c.nom&&f.statut==='payee').reduce((s,f)=>s+Number(f.ttc),0);
    return `
    <div class="card" onclick="openDetailClient(${c.id})">
      <div class="card-ico" style="background:#EFF6FF;font-weight:700;color:#2563EB;font-size:18px">${escapeHTML(c.nom).charAt(0).toUpperCase()}</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(c.nom)}</div>
        <div class="card-ref">${c.tel||''} ${c.email?'· '+c.email:''}</div>
      </div>
      <div class="card-end">
        <div style="font-size:12px;color:#059669;font-weight:600">${fmtInt(caTotal)} MAD</div>
        <div style="font-size:10px;color:#94A3B8">${STATE.factures.filter(f=>f.client===c.nom).length} fact.</div>
      </div>
    </div>`;
  }).join('');
}

function initNouveauClient() {
  ['cl-nom','cl-tel','cl-email','cl-adresse','cl-ice','cl-if','cl-notes','cl-conditions','cl-limite'].forEach(id => {
    const e = el(id); if(e) e.value = '';
  });
}

async function sauvegarderClient() {
  const nom = el('cl-nom')?.value.trim();
  if (!nom) { showToast('Entrez le nom du client', 'error'); return; }
  showToast('⏳ Sauvegarde...');
  try {
    const body = {
      user_id: sb.user.id, nom,
      tel: el('cl-tel')?.value.trim(),
      email: el('cl-email')?.value.trim(),
      adresse: el('cl-adresse')?.value.trim(),
      ice: el('cl-ice')?.value.trim(),
      identifiant_fiscal: el('cl-if')?.value.trim(),
      notes: el('cl-notes')?.value.trim(),
      conditions_paiement: el('cl-conditions')?.value.trim(),
      limite_credit: parseFloat(el('cl-limite')?.value)||null,
    };
    const r = await sb.post('clients', body);
    if (r && r.length > 0) { STATE.clients.push(r[0]); } else { throw new Error("Erreur serveur"); }
    STATE.clients.sort((a,b)=>a.nom.localeCompare(b.nom));
    updateClientDatalist();
    showToast('✅ Client ajouté !', 'success');
    setTimeout(()=>goScreen('clients'), 700);
  } catch(e) { showToast('❌ '+e.message, 'error'); }
}

function openDetailClient(id) {
  STATE.currentClient = STATE.clients.find(x=>x.id===id);
  if (!STATE.currentClient) return;
  const c = STATE.currentClient;
  window._clientNom = c.nom;
  setEl('dc-nom', c.nom);
  setEl('dc-meta', [c.tel,c.email,c.adresse].filter(Boolean).join(' · '));
  const caTotal = STATE.factures.filter(f=>f.client===c.nom&&f.statut==='payee').reduce((s,f)=>s+Number(f.ttc),0);
  const nbFact = STATE.factures.filter(f=>f.client===c.nom).length;
  const fields = [
    ['📞 Téléphone',c.tel],['✉️ Email',c.email],['📍 Adresse',c.adresse],
    ['🆔 ICE',c.ice],['📄 IF',c.identifiant_fiscal],
    ['💳 Conditions',c.conditions_paiement],['🏦 Limite crédit',c.limite_credit?fmtInt(c.limite_credit)+' MAD':null],
    ['📝 Notes',c.notes],
  ].filter(([,v])=>v);
  const infosEl = el('dc-infos');
  if (infosEl) infosEl.innerHTML =
    `<div class="p-card-title">Informations</div>` +
    fields.map(([k,v])=>`<div class="p-row"><span class="p-lbl">${k}</span><span class="p-val">${v}</span></div>`).join('') +
    `<div class="p-row"><span class="p-lbl">CA payé</span><span class="p-val" style="color:#059669;font-weight:700">${fmtInt(caTotal)} MAD</span></div>` +
    `<div class="p-row"><span class="p-lbl">Factures</span><span class="p-val">${nbFact}</span></div>`;
  const factEl = el('dc-factures');
  if (factEl) {
    const cFact = STATE.factures.filter(f=>f.client===c.nom);
    factEl.innerHTML = cFact.slice(0,5).map(f=>`
      <div class="card" onclick="openDetail(${f.id})" style="margin-bottom:8px">
        <div class="card-ico" style="background:#EFF6FF">📄</div>
        <div class="card-body"><div class="card-name">${f.ref}</div><div class="card-ref">${f.date_emission||''}</div></div>
        <div class="card-end"><div class="card-amt">${fmt(f.ttc)} MAD</div><div class="badge b-${f.statut}">${badgeF(f.statut)}</div></div>
      </div>`).join('') || '<div style="color:#94A3B8;font-size:13px;padding:8px 0">Aucune facture</div>';
  }
  goScreen('detail-client');
}

async function supprimerClient(id) {
  if (!id || !confirm('Supprimer ce client ?')) return;
  await sb.del('clients',`id=eq.${id}&user_id=eq.${sb.user.id}`);
  STATE.clients = STATE.clients.filter(c=>c.id!==id);
  updateClientDatalist();
  showToast('Client supprimé');
  goScreen('clients');
}

// ============================================================
// PRODUITS
// ============================================================

function ouvrirModifClient(id) {
  const c = STATE.clients.find(x => x.id === id) || STATE.currentClient;
  if (!c) return;
  STATE.currentClient = c;
  el('mc-nom') && (el('mc-nom').value = c.nom || '');
  el('mc-tel') && (el('mc-tel').value = c.tel || '');
  el('mc-email') && (el('mc-email').value = c.email || '');
  el('mc-adresse') && (el('mc-adresse').value = c.adresse || '');
  el('mc-ice') && (el('mc-ice').value = c.ice || '');
  el('mc-if') && (el('mc-if').value = c.identifiant_fiscal || '');
  el('mc-conditions') && (el('mc-conditions').value = c.conditions_paiement || '');
  el('mc-limite') && (el('mc-limite').value = c.limite_credit || '');
  el('mc-notes') && (el('mc-notes').value = c.notes || '');
  goScreen('modifier-client');
}

async function sauvegarderModifClient() {
  const c = STATE.currentClient;
  if (!c) return;
  const nom = el('mc-nom')?.value.trim();
  if (!nom) { showToast('Le nom est obligatoire', 'error'); return; }
  const data = {
    nom, tel: el('mc-tel')?.value.trim(),
    email: el('mc-email')?.value.trim(),
    adresse: el('mc-adresse')?.value.trim(),
    ice: el('mc-ice')?.value.trim(),
    identifiant_fiscal: el('mc-if')?.value.trim(),
    conditions_paiement: el('mc-conditions')?.value.trim(),
    limite_credit: parseFloat(el('mc-limite')?.value) || null,
    notes: el('mc-notes')?.value.trim(),
  };
  showToast('⏳ Mise à jour...');
  try {
    await sb.patch('clients', `id=eq.${c.id}&user_id=eq.${sb.user.id}`, data);
    Object.assign(c, data);
    updateClientDatalist();
    showToast('✅ Client mis à jour !', 'success');
    goScreen('detail-client');
    openDetailClient(c.id);
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function modifierClient(id) { ouvrirModifClient(id); }

// ============================================================
// MODIFIER PRODUIT
// ============================================================
