// BANIPAY — clients.js

function ouvrirScannerQR() {
  const overlay = document.createElement('div');
  overlay.id = 'scanner-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.8);display:flex;align-items:flex-end;padding:0';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-height:80vh;overflow-y:auto';
  box.innerHTML = `
    <div style="width:40px;height:4px;background:#E2E8F0;border-radius:2px;margin:0 auto 20px"></div>
    <div style="font-size:16px;font-weight:700;color:#0F172A;margin-bottom:6px">➕ Ajouter un client</div>
    <div style="font-size:12px;color:#64748B;margin-bottom:20px">Importez un client via son lien BaniPay, un QR code ou manuellement</div>

    <div style="background:#F8FAFC;border-radius:14px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8;margin-bottom:10px">🔗 Via lien BaniPay</div>
      <input id="qr-link-input" style="width:100%;padding:12px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" placeholder="Collez le lien profil BaniPay...">
      <button onclick="importerClientDepuisLien()" style="width:100%;margin-top:10px;padding:12px;background:#2563EB;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">🔗 Importer</button>
    </div>

    <div style="background:#F8FAFC;border-radius:14px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8;margin-bottom:10px">📷 Scanner un QR code</div>
      <label style="display:block;text-align:center;padding:20px;border:2px dashed #E2E8F0;border-radius:10px;cursor:pointer;color:#2563EB;font-size:13px;font-weight:600">
        📷 Ouvrir la caméra
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="importerClientDepuisQRImage(event)">
      </label>
      <div style="font-size:10px;color:#94A3B8;text-align:center;margin-top:6px">Prend une photo du QR code profil BaniPay</div>
    </div>

    <div style="background:#F8FAFC;border-radius:14px;padding:16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8;margin-bottom:10px">📥 Import en masse (CSV)</div>
      <label style="display:block;text-align:center;padding:14px;border:2px dashed #C7D2FE;border-radius:10px;cursor:pointer;color:#4338CA;font-size:13px;font-weight:600;background:#EEF2FF">
        📄 Choisir un fichier CSV
        <input type="file" accept=".csv" style="display:none" onchange="importerClientsCSV(event)">
      </label>
      <button onclick="telechargerTemplateClientsCSV()" style="width:100%;margin-top:8px;padding:8px;background:none;color:#64748B;border:none;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Télécharger un modèle vide</button>
    </div>

    <div style="background:#F8FAFC;border-radius:14px;padding:16px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8;margin-bottom:10px">✏️ Saisie manuelle</div>
      <button onclick="document.getElementById('scanner-overlay').remove();goScreen('nouveau-client',null)" style="width:100%;padding:12px;background:#F1F5F9;color:#0F172A;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">➕ Nouveau client manuellement</button>
    </div>

    <button onclick="document.getElementById('scanner-overlay').remove()" style="width:100%;padding:12px;background:#F1F5F9;color:#64748B;border:none;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit">Annuler</button>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function importerClientDepuisLien() {
  const input = el('qr-link-input');
  const lien = input?.value.trim();
  if (!lien) { showToast('Collez un lien BaniPay', 'error'); return; }

  let profilId = null;
  try {
    const url = new URL(lien);
    profilId = url.searchParams.get('profil') || url.searchParams.get('portail');
  } catch(e) {
    profilId = lien.trim();
  }

  if (!profilId) { showToast('Lien invalide', 'error'); return; }

  showToast('⏳ Chargement du profil...');

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + profilId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const p = data && data[0];

    if (!p) { showToast('Profil introuvable', 'error'); return; }

    const exists = STATE.clients.find(c =>
      c.nom === p.raison || (p.ice && c.ice === p.ice)
    );
    if (exists) { showToast('Ce client existe déjà : ' + p.raison, 'error'); return; }

    const newClient = {
      user_id: sb.user.id,
      nom: p.raison || '',
      tel: p.tel || '',
      email: p.email || '',
      adresse: p.adresse ? (p.adresse + (p.ville ? ', ' + p.ville : '')) : '',
      ice: p.ice || '',
      notes: 'Importé via profil BaniPay',
      reference_id: p.id || null,
      created_at: new Date().toISOString(),
    };

    const result = await sb.post('clients', newClient);
    if (result) {
      STATE.clients.unshift(result[0] || newClient);
      renderClients();
      document.getElementById('scanner-overlay')?.remove();
      showToast('✅ Client ' + p.raison + ' ajouté !', 'success');
      logAudit('client', (result[0] || newClient).id, 'creation', p.raison + ' (import lien BaniPay)');
    }
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function importerClientDepuisQRImage(event) {
  showToast('📷 Prenez une photo du QR, puis copiez le lien affiché', 'success');
  event.target.value = '';
}

async function chargerClientDepuisLien(lien) {
  if (!lien) return;
  el('qr-link-input') && (el('qr-link-input').value = lien);
  await importerClientDepuisLien();
}


function rechercherClientOuLien() {
  const val = el('search-client-inp')?.value || '';
  if (val.includes('?profil=') || val.match(/BP-[A-Z0-9]+/)) {
    setTimeout(async () => {
      const input = el('search-client-inp');
      if (!input) return;
      const lien = input.value.trim();
      input.value = '';
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
    logAudit('client', r[0].id, 'creation', nom);
    setTimeout(()=>goScreen('clients'), 700);
  } catch(e) { showToast('❌ '+e.message, 'error'); }
}

function openDetailClient(id) {
  STATE.currentClient = STATE.clients.find(x=>x.id===id);
  if (!STATE.currentClient) return;
  window._currentClientId = id; // FIX: variable manquante — bouton Supprimer était cassé
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
  const lienSection = document.getElementById('dc-lien-section');
  const lienEl = document.getElementById('dc-lien-banipay');
  const btnCopier = document.getElementById('dc-btn-copier-lien');
  const btnPartager = document.getElementById('dc-btn-partager-lien');
  const clientData = STATE.currentClient;

  if (lienSection && clientData && clientData.lien_banipay) {
    lienSection.style.display = 'block';
    if (lienEl) lienEl.textContent = clientData.lien_banipay;
    if (btnCopier) btnCopier.onclick = function() {
      navigator.clipboard?.writeText(clientData.lien_banipay);
      showToast('Lien copié !', 'success');
    };
    if (btnPartager) btnPartager.onclick = function() {
      if (navigator.share) {
        navigator.share({ title: clientData.nom, url: clientData.lien_banipay })
          .catch(function() { navigator.clipboard?.writeText(clientData.lien_banipay); });
      } else {
        navigator.clipboard?.writeText(clientData.lien_banipay);
        showToast('Lien copié !', 'success');
      }
    };
  } else if (lienSection) {
    lienSection.style.display = 'none';
  }

  goScreen('detail-client');
}

async function supprimerClient(id) {
  if (!id || !confirm('Supprimer ce client ?')) return;
  const c = STATE.clients.find(x => x.id === id);
  try {
    await sb.del('clients',`id=eq.${id}&user_id=eq.${sb.user.id}`);
    STATE.clients = STATE.clients.filter(c=>c.id!==id);
    updateClientDatalist();
    showToast('Client supprimé', 'success');
    logAudit('client', id, 'suppression', c?.nom || '');
    goScreen('clients');
  } catch(e) {
    showToast('❌ ' + e.message, 'error');
  }
}

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
    logAudit('client', c.id, 'modification', nom);
    goScreen('detail-client');
    openDetailClient(c.id);
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function modifierClient(id) { ouvrirModifClient(id); }

async function importerDepuisLienForm() {
  const lien = (el('import-client-lien')?.value || '').trim();
  if (!lien) { showToast('Collez un lien BaniPay', 'error'); return; }

  let profilId = null;
  try {
    const url = new URL(lien);
    profilId = url.searchParams.get('profil') || url.searchParams.get('portail') || url.searchParams.get('doc');
    if (!profilId) {
      profilId = lien.split('profil=')[1]?.split('&')[0] || lien.split('portail=')[1]?.split('&')[0];
    }
  } catch(e) {
    profilId = lien.includes('=') ? lien.split('=').pop() : lien;
  }

  if (!profilId) { showToast('Lien invalide — copie le lien complet', 'error'); return; }

  showToast('⏳ Chargement du profil...');

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + encodeURIComponent(profilId) + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    let p = data && data[0];

    if (!p) {
      const r2 = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + profilId + '&select=*', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      const data2 = await r2.json();
      p = data2 && data2[0];
    }

    if (!p) { showToast('Profil introuvable', 'error'); return; }

    remplirFormulaireClient(p);
    showToast('✅ Profil importé : ' + (p.raison || ''), 'success');

    if (el('import-client-lien')) el('import-client-lien').value = '';

  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function remplirFormulaireClient(p) {
  const fields = {
    'cl-nom': p.raison || '',
    'cl-tel': p.tel || '',
    'cl-email': p.email || '',
    'cl-adresse': (p.adresse || '') + (p.ville ? ', ' + p.ville : ''),
    'cl-ice': p.ice || '',
    'cl-rc': p.rc || '',
    'cl-if': p.identifiant_fiscal || '',
    'cl-notes': p.secteur ? 'Secteur: ' + p.secteur : '',
  };

  Object.keys(fields).forEach(function(id) {
    const inp = el(id);
    if (inp && fields[id]) {
      inp.value = fields[id];
      inp.style.background = '#ECFDF5';
      inp.style.borderColor = '#059669';
      setTimeout(function() {
        inp.style.background = '';
        inp.style.borderColor = '';
      }, 2000);
    }
  });

  const firstField = el('cl-nom');
  if (firstField) firstField.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function importerDepuisQRCodeForm(event) {
  showToast('Prenez la photo, puis copiez le lien manuellement si besoin', 'success');
  event.target.value = '';
}


async function importerClientVieLien() {
  const lien = (document.getElementById('cl-lien-import')?.value || '').trim();
  if (!lien) { showToast('Collez un lien BaniPay', 'error'); return; }

  showToast('⏳ Chargement...', 'success');

  try {
    let profilId = null;
    try {
      const url = new URL(lien.startsWith('http') ? lien : 'https://x.com?' + lien);
      profilId = url.searchParams.get('profil') || url.searchParams.get('portail');
    } catch(e2) {
      profilId = lien.split('profil=')[1]?.split('&')[0];
    }
    if (!profilId) { showToast('Lien invalide', 'error'); return; }

    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + profilId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    const data = await r.json();
    const p = data && data[0];
    if (!p) { showToast('Profil introuvable', 'error'); return; }

    const set = function(id, val) { const el2 = document.getElementById(id); if (el2 && val) el2.value = val; };
    set('cl-nom', p.raison || p.nom);
    set('cl-tel', p.tel);
    set('cl-email', p.email);
    set('cl-adresse', (p.adresse || '') + (p.ville ? ', ' + p.ville : ''));
    set('cl-ice', p.ice);
    set('cl-identif', p.identifiant_fiscal);
    set('cl-note', 'Client BaniPay · ' + (p.secteur || ''));

    window._clientLienBaniPay = lien.startsWith('http') ? lien : window.location.origin + window.location.pathname + '?profil=' + profilId;
    window._clientRefId = p.id;

    if (document.getElementById('cl-lien-import')) {
      document.getElementById('cl-lien-import').value = '';
      document.getElementById('cl-lien-import').style.background = '#ECFDF5';
    }
    showToast('✅ Profil importé : ' + (p.raison || p.nom), 'success');

  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function ouvrirMsgClient() {
  const c = STATE.currentClient;
  if (!c) return;
  if (c.reference_id) {
    demarrerConversation(c.reference_id, c.email, sb.user?.email);
  } else {
    showToast('Ce client n a pas de compte BaniPay', 'error');
  }
}

// ============================================================
// IMPORT / EXPORT CSV — CLIENTS
// ============================================================

function telechargerTemplateClientsCSV() {
  telechargerCSV(
    'modele_clients.csv',
    ['nom', 'tel', 'email', 'adresse', 'ice', 'identifiant_fiscal', 'conditions_paiement', 'limite_credit', 'notes'],
    [['SARL Exemple BTP', '+212600000000', 'contact@exemple.ma', 'Casablanca', '001234567000012', '', '30 jours', '', '']]
  );
}

function exporterClientsCSV() {
  if (!STATE.clients.length) { showToast('Aucun client à exporter', 'error'); return; }
  const headers = ['nom', 'tel', 'email', 'adresse', 'ice', 'identifiant_fiscal', 'conditions_paiement', 'limite_credit', 'notes'];
  const rows = STATE.clients.map(function(c) {
    return [c.nom || '', c.tel || '', c.email || '', c.adresse || '', c.ice || '', c.identifiant_fiscal || '', c.conditions_paiement || '', c.limite_credit || '', c.notes || ''];
  });
  telechargerCSV('banipay_clients_' + today() + '.csv', headers, rows);
  showToast('✅ Export clients téléchargé !', 'success');
}

async function importerClientsCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  showToast('⏳ Lecture du fichier...');
  try {
    const text = await lireFichierTexte(file);
    const rows = parseCSV(text);
    if (!rows.length) { showToast('Fichier CSV vide ou illisible', 'error'); return; }

    // Colonnes acceptées (souples sur les noms de colonnes)
    const getVal = function(r, keys) {
      for (const k of keys) { if (r[k] !== undefined && r[k] !== '') return r[k]; }
      return '';
    };

    let importes = 0, ignores = 0;
    showToast('⏳ Import de ' + rows.length + ' ligne(s)...');

    for (const r of rows) {
      const nom = getVal(r, ['nom', 'name', 'raison', 'client']);
      if (!nom) { ignores++; continue; }

      const existe = STATE.clients.find(function(c) { return c.nom.toLowerCase() === nom.toLowerCase(); });
      if (existe) { ignores++; continue; }

      const body = {
        user_id: sb.user.id,
        nom: nom,
        tel: getVal(r, ['tel', 'telephone', 'téléphone', 'phone']),
        email: getVal(r, ['email', 'mail']),
        adresse: getVal(r, ['adresse', 'address']),
        ice: getVal(r, ['ice']),
        identifiant_fiscal: getVal(r, ['identifiant_fiscal', 'if']),
        conditions_paiement: getVal(r, ['conditions_paiement', 'conditions']),
        limite_credit: parseFloat(getVal(r, ['limite_credit', 'limite'])) || null,
        notes: getVal(r, ['notes', 'note']),
      };

      try {
        const result = await sb.post('clients', body);
        if (result && result.length) { STATE.clients.push(result[0]); importes++; }
      } catch(e2) { ignores++; }
    }

    STATE.clients.sort(function(a, b) { return a.nom.localeCompare(b.nom); });
    updateClientDatalist();
    renderClients();
    document.getElementById('scanner-overlay')?.remove();
    showToast('✅ ' + importes + ' client(s) importé(s)' + (ignores ? ', ' + ignores + ' ignoré(s)' : ''), 'success');
    logAudit('client', null, 'creation', importes + ' clients importés via CSV');
  } catch(e) {
    showToast('Erreur import: ' + e.message, 'error');
  }
}
