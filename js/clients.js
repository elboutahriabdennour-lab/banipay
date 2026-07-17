// BANIPAY — clients.js

function ouvrirScannerQR() {
  // On iOS/Android, we can use the camera via input[capture]
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Collez le lien profil BaniPay du client...';

  // Create a modal to paste link or scan
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-end;justify-content:center';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px';
  modal.innerHTML = `
    <div style="width:40px;height:4px;background:#E2E8F0;border-radius:2px;margin:0 auto 20px"></div>
    <div style="font-size:17px;font-weight:600;margin-bottom:6px">&#128247; Ajouter un client via QR</div>
    <div style="font-size:13px;color:#64748B;margin-bottom:16px">Scannez le QR code du profil BaniPay de votre client, ou collez son lien.</div>
    <input id="qr-link-input" class="f-inp" placeholder="https://banipay-three.vercel.app/?profil=BP-..." style="margin-bottom:12px">
    <button onclick="chargerClientDepuisLien()" class="m-btn">&#128279; Charger le profil</button>
    <button onclick="this.closest('[style*=fixed]').remove()" class="m-btn-sec" style="margin-top:8px">Annuler</button>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
  setTimeout(() => document.getElementById('qr-link-input')?.focus(), 100);
}

async function chargerClientDepuisLien() {
  const lien = document.getElementById('qr-link-input')?.value.trim();
  if (!lien) { showToast('Collez un lien BaniPay', 'error'); return; }

  // Extract profil ID from URL
  let profilId = null;
  try {
    const url = new URL(lien);
    profilId = url.searchParams.get('profil');
  } catch(e) {
    // Try direct ID
    const match = lien.match(/BP-[A-Z0-9]+/);
    if (match) profilId = match[0];
  }

  if (!profilId) { showToast('Lien invalide — format attendu: ?profil=BP-XXXXXX', 'error'); return; }

  showToast('⏳ Chargement du profil...');
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + profilId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const d = await r.json();
    const p = d && d[0];
    if (!p) { showToast('Profil introuvable', 'error'); return; }

    // Remove the scanner modal
    document.querySelector('[style*="position:fixed"][style*="9999"]')?.remove();

    // Show confirm modal to add this client
    const overlay2 = document.createElement('div');
    overlay2.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
    overlay2.innerHTML = `
      <div style="background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px">
        <div style="width:40px;height:4px;background:#E2E8F0;border-radius:2px;margin:0 auto 20px"></div>
        <div style="font-size:17px;font-weight:600;margin-bottom:4px">&#10003; Profil trouvé</div>
        <div style="background:#ECFDF5;border-radius:12px;padding:14px;margin:14px 0">
          <div style="font-size:16px;font-weight:700">${escapeHTML(p.raison||'—')}</div>
          <div style="font-size:12px;color:#64748B;margin-top:4px">${[p.tel,p.email,p.adresse].filter(Boolean).join(' · ')}</div>
          ${p.ice?'<div style="font-size:11px;color:#059669;margin-top:4px">ICE: '+p.ice+'</div>':''}
          ${p.rc?'<div style="font-size:11px;color:#64748B">RC: '+p.rc+'</div>':''}
        </div>
        <button onclick="ajouterClientDepuisProfil(${JSON.stringify(p).replace(/"/g,'&quot;')})" class="m-btn green">&#10133; Ajouter comme client</button>
        <button onclick="this.closest('[style*=fixed]').remove()" class="m-btn-sec" style="margin-top:8px">Annuler</button>
      </div>`;
    document.body.appendChild(overlay2);
    overlay2.addEventListener('click', e => { if(e.target===overlay2) overlay2.remove(); });
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function ajouterClientDepuisProfil(profil) {
  // Remove modal
  document.querySelector('[style*="position:fixed"][style*="9999"]')?.remove();
  const p = typeof profil === 'string' ? JSON.parse(profil) : profil;
  // Check if already exists
  const exists = STATE.clients.find(c => c.nom?.toLowerCase() === (p.raison||'').toLowerCase());
  if (exists) { showToast('Ce client existe déjà', 'error'); return; }
  showToast('⏳ Ajout en cours...');
  try {
    const body = {
      user_id: sb.user.id,
      nom: p.raison||'—',
      tel: p.tel||'',
      email: p.email||'',
      adresse: (p.adresse||'') + (p.ville?', '+p.ville:''),
      ice: p.ice||'',
      identifiant_fiscal: p.identifiant_fiscal||'',
      notes: 'Ajouté via profil BaniPay #' + (p.id_unique||''),
    };
    const r = await sb.post('clients', body);
    if (r && r.length > 0) {
      STATE.clients.push(r[0]);
      STATE.clients.sort((a,b) => a.nom.localeCompare(b.nom));
      updateClientDatalist();
      renderClients();
      showToast('✅ ' + escapeHTML(p.raison) + ' ajouté !', 'success');
    }
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
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
