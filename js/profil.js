// BANIPAY — profil.js

function renderProfil() {
  const p = STATE.profil;
  const id = p.id_unique || 'BP-' + (sb.user?.id||'').substr(0,6).toUpperCase();
  const initiales = (p.raison||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
  setEl('pv-initiales', initiales);
  setEl('pv-nom', p.raison||'Mon Entreprise');
  setEl('pv-id', '#'+id);
  setEl('pv-rc-label', `RC ${p.rc||'—'} · IF ${p.identifiant_fiscal||'—'} · ICE ${p.ice||'—'}`);
  // Profil completeness
  const required = ['raison','adresse','tel','rc','identifiant_fiscal','ice'];
  const filled = required.filter(k=>p[k]).length;
  const pct = Math.round(filled/required.length*100);
  const badge = el('pv-badge');
  if (badge) {
    badge.textContent = pct===100 ? '✅ Profil complet' : `${pct}% complété — ${required.length-filled} champ(s) manquant(s)`;
    badge.style.background = pct===100 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
    badge.style.color = pct===100 ? '#10B981' : '#EF4444';
  }
  // Info rows
  const fields = [
    ['🏢 Raison',p.raison],['🏭 Secteur',p.secteur],['⚖️ Forme',p.forme],
    ['📍 Adresse',p.adresse?p.adresse+(p.ville?', '+p.ville:''):null],
    ['📞 Tél',p.tel],['✉️ Email',p.email],['🌐 Web',p.web],
    ['RC',p.rc],['IF',p.identifiant_fiscal],['ICE',p.ice],
    ['Patente',p.patente],['CNSS',p.cnss],['🏦 Banque',p.banque],['RIB',p.rib],
    ['📅 Conditions',p.conditions],
  ].filter(([,v])=>v);
  const infosCard = el('pv-infos-card');
  if (infosCard) infosCard.innerHTML =
    `<div class="p-card-title">Informations entreprise</div>` +
    fields.map(([k,v])=>`<div class="p-row"><span class="p-lbl">${k}</span><span class="p-val">${v}</span></div>`).join('') +
    `<div class="p-row"><span class="p-lbl">🎨 Couleur PDF</span><span class="p-val"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${p.couleur_accent||'#2563EB'};vertical-align:middle;margin-right:6px;border:1px solid #E2E8F0"></span>${p.couleur_accent||'#2563EB'}</span></div>`;
  // QR
  const publicUrl = window.location.origin+window.location.pathname+'?profil='+id;
  setEl('pv-lien', publicUrl);
  // FIX: genQRCanvas() dessinait un faux QR décoratif (carrés aléatoires),
  // qui ne pouvait évidemment jamais être scanné — remplacé par un vrai QR
  // code généré via l'API déjà utilisée ailleurs dans l'app (comptable, etc.)
  const qrContainer = el('qr-canvas-container');
  if (qrContainer) {
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(publicUrl);
    qrContainer.innerHTML = '<img src="' + qrUrl + '" width="120" height="120" style="border-radius:8px;background:#F8FAFC">';
  }
  // Objectif
  if(el('pv-objectif')) el('pv-objectif').textContent = p.objectif_mensuel ? fmtInt(p.objectif_mensuel)+' MAD/mois' : 'Non défini';
  // Comptable link
  updateComptableLinkDisplay();
}

function goProfilEdit(show=true) {
  const view = el('profil-view');
  const edit = el('profil-edit');
  if (view) view.style.display = show ? 'none' : 'block';
  if (edit) edit.style.display = show ? 'block' : 'none';
  if (!show) return;
  const p = STATE.profil;
  const map = {
    'pe-raison':'raison','pe-secteur':'secteur','pe-forme':'forme',
    'pe-adresse':'adresse','pe-ville':'ville','pe-cp':'cp',
    'pe-tel':'tel','pe-email':'email','pe-web':'web',
    'pe-rc':'rc','pe-if':'identifiant_fiscal','pe-ice':'ice',
    'pe-patente':'patente','pe-cnss':'cnss','pe-banque':'banque',
    'pe-rib':'rib','pe-conditions':'conditions',
    'pe-numerotation':'numerotation','pe-objectif':'objectif_mensuel',
    'pe-couleur':'couleur_accent',
  };
  Object.entries(map).forEach(([id,key])=>{const e=el(id);if(e)e.value=p[key]||(key==='couleur_accent'?'#2563EB':'');});
  const codeEl = el('pf-code-comptable');
  if(codeEl) codeEl.value = '';
  // Initialiser le canvas de signature entreprise (si le module signature.js est présent)
  if (typeof initSignatureEntrepriseCanvas === 'function') {
    setTimeout(initSignatureEntrepriseCanvas, 50);
  }
}

async function saveProfil() {
  const data = { id: sb.user.id };
  const map = {
    'pe-raison':'raison','pe-secteur':'secteur','pe-forme':'forme',
    'pe-adresse':'adresse','pe-ville':'ville','pe-cp':'cp',
    'pe-tel':'tel','pe-email':'email','pe-web':'web',
    'pe-rc':'rc','pe-if':'identifiant_fiscal','pe-ice':'ice',
    'pe-patente':'patente','pe-cnss':'cnss','pe-banque':'banque',
    'pe-rib':'rib','pe-conditions':'conditions',
    'pe-numerotation':'numerotation','pe-objectif':'objectif_mensuel',
    'pe-couleur':'couleur_accent',
  };
  Object.entries(map).forEach(([id,key])=>{
    const e=el(id);
    if(e){ data[key]=e.value.trim(); STATE.profil[key]=e.value.trim(); }
  });
  // Signature d'entreprise : uniquement si (re)dessinée pendant cette édition,
  // pour ne jamais écraser une signature déjà enregistrée sans raison.
  if (typeof getSignatureEntrepriseDataUrl === 'function') {
    const sigDataUrl = getSignatureEntrepriseDataUrl();
    if (sigDataUrl !== null) {
      data.signature_entreprise = sigDataUrl;
      STATE.profil.signature_entreprise = sigDataUrl;
    }
  }
  // Generate id_unique if not exists
  if(!STATE.profil.id_unique) {
    data.id_unique = 'BP-'+uid6();
    STATE.profil.id_unique = data.id_unique;
  }
  showToast('⏳ Sauvegarde...');
  try {
    await sb.upsert('profils_entreprise', data);
    const code = el('pf-code-comptable')?.value.trim();
    if(code&&code.length>=4) {
      await sb.upsert('acces_comptable',{user_id:sb.user.id,email:sb.user.email,code});
    }
    showToast('✅ Profil enregistré !','success');
    goProfilEdit(false);
    renderProfil();
  } catch(e){showToast('❌ '+e.message,'error');}
}

function updateComptableLinkDisplay() {
  const email = sb.user?.email;
  if (!email) return;
  const lien = `${window.location.origin}${window.location.pathname}?comptable=${encodeURIComponent(email)}`;
  const el_lien = el('pv-comptable-link');
  if(el_lien) el_lien.textContent = lien;
}

function copierLienProfil() {
  const id = STATE.profil.id_unique||'BP-000000';
  const lien = `${window.location.origin}${window.location.pathname}?profil=${id}`;
  navigator.clipboard?.writeText(lien).then(()=>showToast('✅ Lien copié !','success'));
}

async function partagerProfil() {
  const id = STATE.profil.id_unique||'BP-000000';
  const lien = `${window.location.origin}${window.location.pathname}?profil=${id}`;
  if(navigator.share){try{await navigator.share({title:STATE.profil.raison||'BaniPay',url:lien});return;}catch(e){}}
  navigator.clipboard?.writeText(lien).then(()=>showToast('✅ Lien copié !','success'));
}

async function uploadLogo(event) {
  const file = event.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const b64 = e.target.result;
    STATE.profil.logo = b64;
    await sb.upsert('profils_entreprise',{id:sb.user.id,logo:b64});
    const preview = el('logo-preview-container');
    if(preview) preview.innerHTML = `<img src="${b64}" style="max-width:120px;max-height:60px;border-radius:8px;object-fit:contain">`;
    const delBtn = el('del-logo-btn');
    if(delBtn) delBtn.style.display='block';
    showToast('✅ Logo enregistré','success');
  };
  reader.readAsDataURL(file);
}

async function supprimerLogo() {
  STATE.profil.logo = null;
  await sb.upsert('profils_entreprise',{id:sb.user.id,logo:null});
  const preview = el('logo-preview-container');
  if(preview) preview.innerHTML='';
  const delBtn = el('del-logo-btn');
  if(delBtn) delBtn.style.display='none';
  showToast('Logo supprimé');
}

// ============================================================
// QR CODE INLINE
// ============================================================

function genQRCanvas(canvasId, text, size) {
  const canvas = el(canvasId); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,size,size);
  ctx.strokeStyle='#0F172A'; ctx.lineWidth=6; ctx.strokeRect(3,3,size-6,size-6);
  const drawCorner=(x,y)=>{
    ctx.fillStyle='#0F172A';ctx.fillRect(x,y,28,28);
    ctx.fillStyle='#fff';ctx.fillRect(x+5,y+5,18,18);
    ctx.fillStyle='#0F172A';ctx.fillRect(x+9,y+9,10,10);
  };
  drawCorner(12,12);drawCorner(size-40,12);drawCorner(12,size-40);
  // Random modules for visual
  ctx.fillStyle='#0F172A';
  const seed=text.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  for(let i=0;i<40;i++){
    const rx=(seed*i*7)%size, ry=(seed*i*13)%size;
    if(rx>40&&rx<size-40&&ry>40&&ry<size-40) ctx.fillRect(rx,ry,4,4);
  }
  ctx.fillStyle='#2563EB';ctx.font='bold 10px Arial';ctx.textAlign='center';
  ctx.fillText('BaniPay',size/2,size/2+4);
}

// ============================================================
// COMPTABLE
// ============================================================

function autoSaveDraft() {
  if (!STATE.lignesF.length && !el('f-client')?.value) return;
  const draft = {
    id: 'draft_' + Date.now(),
    client: el('f-client')?.value || '',
    chantier: el('f-chantier')?.value || '',
    lignes: STATE.lignesF,
    devise: STATE.deviseF,
    date: today(),
    savedAt: new Date().toISOString()
  };
  const drafts = listDrafts();
  // Keep max 5 drafts
  const existing = drafts.findIndex(d => d.client === draft.client && d.chantier === draft.chantier);
  if (existing > -1) drafts[existing] = draft;
  else drafts.unshift(draft);
  localStorage.setItem('bp_drafts_' + sb.user?.id, JSON.stringify(drafts.slice(0, 5)));
  showToast('📋 Brouillon sauvegardé', 'default');
}

function listDrafts() {
  try { return JSON.parse(localStorage.getItem('bp_drafts_' + sb.user?.id) || '[]'); }
  catch(e) { return []; }
}

function deleteDraft(id) {
  const drafts = listDrafts().filter(d => d.id !== id);
  localStorage.setItem('bp_drafts_' + sb.user?.id, JSON.stringify(drafts));
  renderBrouillons();
}

function restoreDraft(id) {
  const draft = listDrafts().find(d => d.id === id);
  if (!draft) return;
  initNouvelle(draft);
  goScreen('nouvelle');
  showToast('📋 Brouillon restauré', 'success');
}

function renderBrouillons() {
  const drafts = listDrafts();
  const cnt = el('brouillons-count');
  if (cnt) cnt.textContent = drafts.length;
  const list = el('brouillons-list');
  if (!list) return;
  if (!drafts.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucun brouillon</div></div>';
    return;
  }
  list.innerHTML = drafts.map(d => `
    <div class="card">
      <div class="card-ico" style="background:#F1F5F9">📋</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(d.client || 'Sans client')}</div>
        <div class="card-ref">${d.lignes?.length || 0} ligne(s) · Sauvegardé ${formatDate(d.savedAt)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button onclick="restoreDraft('${d.id}')" style="background:#EFF6FF;color:#2563EB;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">Restaurer</button>
        <button onclick="deleteDraft('${d.id}')" style="background:#FEF2F2;color:#EF4444;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">Supprimer</button>
      </div>
    </div>`).join('');
}

// ============================================================
// MODIFIER CLIENT
// ============================================================

function renderParametres() {
  const p = STATE.profil;
  el('param-prefix-fac') && (el('param-prefix-fac').value = p.prefix_fac || 'FAC');
  el('param-prefix-dev') && (el('param-prefix-dev').value = p.prefix_dev || 'DEV');
  el('param-num-start') && (el('param-num-start').value = p.num_start || '1');
  el('param-delai') && (el('param-delai').value = p.delai_paiement || '30');
  el('param-mode-paiement') && (el('param-mode-paiement').value = p.mode_paiement_defaut || 'virement');
  el('param-tva-defaut') && (el('param-tva-defaut').value = p.tva_defaut || '20');
  updateParamPreview();
}

function updateParamPreview() {
  const prefix = el('param-prefix-fac')?.value || 'FAC';
  const start = el('param-num-start')?.value || '1';
  const year = new Date().getFullYear();
  const num = String(start).padStart(4, '0');
  setEl('param-preview', `${prefix}-${year}-${num}`);
}

async function sauvegarderParametres() {
  const data = {
    id: sb.user.id,
    prefix_fac: el('param-prefix-fac')?.value.trim() || 'FAC',
    prefix_dev: el('param-prefix-dev')?.value.trim() || 'DEV',
    num_start: parseInt(el('param-num-start')?.value) || 1,
    delai_paiement: parseInt(el('param-delai')?.value) || 30,
    mode_paiement_defaut: el('param-mode-paiement')?.value || 'virement',
    tva_defaut: parseInt(el('param-tva-defaut')?.value) || 20,
  };
  showToast('⏳ Sauvegarde...');
  try {
    await sb.upsert('profils_entreprise', data);
    Object.assign(STATE.profil, data);
    showToast('✅ Paramètres sauvegardés !', 'success');
    goScreen('profil');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function ouvrirModifMotDePasse() {
  el('mdp-new') && (el('mdp-new').value = '');
  el('mdp-confirm') && (el('mdp-confirm').value = '');
  el('mdp-err') && (el('mdp-err').textContent = '');
  el('modal-mdp')?.classList.add('active');
}

async function doUpdatePassword() {
  const pwd = el('mdp-new')?.value;
  const confirm2 = el('mdp-confirm')?.value;
  const errEl = el('mdp-err');
  if (errEl) errEl.textContent = '';
  if (!pwd || pwd.length < 8) { if(errEl) errEl.textContent = '8 caractères minimum'; return; }
  if (!/[A-Z]/.test(pwd)) { if(errEl) errEl.textContent = 'Au moins une majuscule'; return; }
  if (!/[0-9]/.test(pwd)) { if(errEl) errEl.textContent = 'Au moins un chiffre'; return; }
  if (pwd !== confirm2) { if(errEl) errEl.textContent = 'Mots de passe différents'; return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sb.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    if (!r.ok) throw new Error('Erreur de mise à jour');
    closeAllModals();
    showToast('✅ Mot de passe mis à jour !', 'success');
  } catch(e) { if(errEl) errEl.textContent = '❌ ' + e.message; }
}

async function updatePassword(newPwd) { return doUpdatePassword(); }

function confirmerSuppressionCompte() {
  if (!confirm('⚠️ Cette action est IRRÉVERSIBLE.\nToutes vos données seront supprimées.\n\nÊtes-vous sûr ?')) return;
  if (!confirm('Dernière confirmation : supprimer définitivement votre compte BaniPay ?')) return;
  deleteAccount();
}

async function deleteAccount() {
  showToast('⏳ Suppression en cours...');
  try {
    // Delete all user data
    const uid = sb.user.id;
    await Promise.all([
      sb.del('factures', `user_id=eq.${uid}`),
      sb.del('devis', `user_id=eq.${uid}`),
      sb.del('clients', `user_id=eq.${uid}`),
      sb.del('produits', `user_id=eq.${uid}`),
      sb.del('avoirs', `user_id=eq.${uid}`),
      sb.del('paiements', `user_id=eq.${uid}`),
      sb.del('profils_entreprise', `id=eq.${uid}`),
    ]);
    sb.logout();
    goScreen('auth');
    showToast('Compte supprimé', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ============================================================
// PORTAIL CLIENT (base)
// ============================================================



// ============================================================
// ARCHIVE DOCUMENTS
// ============================================================

let _archiveType = '';

function renderArchive() {
  const list = el('archive-list');
  const count = el('archive-count');
  const docs = STATE.archive || [];
  if (count) count.textContent = docs.length + ' document(s)';
  if (!list) return;
  if (!docs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">\u{1F4C1}</div><div class="empty-title">Aucun document</div><div>Ajoutez vos documents officiels</div></div>';
    return;
  }
  list.innerHTML = docs.map(function(d) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.margin = '0 20px 10px';
    card.innerHTML = '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="width:40px;height:40px;border-radius:10px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:20px">' + (d.icon||'\u{1F4C4}') + '</div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + escapeHTML(d.nom) + '</div>' +
      '<div style="font-size:11px;color:#94A3B8">' + d.type + ' · ' + (d.date||'') + '</div></div>' +
      '<button data-id="' + d.id + '" class="del-archive-btn" style="background:#FEF2F2;color:#EF4444;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px">\u{1F5D1}\uFE0F</button>' +
    '</div>';
    card.querySelector('.del-archive-btn').onclick = function() { supprimerDocArchive(this.dataset.id); };
    return card.outerHTML;
  }).join('');
}

function ajouterDocumentArchive(type) {
  _archiveType = type;
  const labels = {statuts:'Statuts', rib:'RIB bancaire', cnss:'Attestation CNSS', patente:'Patente', ice:'Certificat ICE', autre:'Autre'};
  showToast('Selectionnez un fichier: ' + (labels[type]||type));
  const inp = el('archive-file-input');
  if (inp) { inp.setAttribute('data-type', type); inp.click(); }
}

async function uploadDocumentArchive(event) {
  const file = event.target.files[0];
  if (!file) return;
  const type = event.target.getAttribute('data-type') || 'autre';
  const icons = {statuts:'\u{1F4CB}', rib:'\u{1F3E6}', cnss:'\u{1F6E1}\uFE0F', patente:'\u{1F4C4}', ice:'\u{1F522}', autre:'\u{1F4C1}'};
  const labels = {statuts:'Statuts', rib:'RIB', cnss:'CNSS', patente:'Patente', ice:'ICE', autre:file.name};
  showToast('\u23F3 Upload...');
  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      const uid = sb.user?.id;
      if (!uid) return;
      const doc = { id: Date.now().toString(), type: labels[type]||type, nom: file.name, icon: icons[type]||'\u{1F4C4}', date: new Date().toLocaleDateString('fr-FR'), data: e.target.result, size: (file.size/1024).toFixed(0)+' KB', user_id: uid };
      await sb.post('archive_documents', doc);
      if (!STATE.archive) STATE.archive = [];
      STATE.archive.unshift(doc);
      renderArchive();
      showToast('\u2705 Document ajouté !', 'success');
    };
    reader.readAsDataURL(file);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
  event.target.value = '';
}

async function supprimerDocArchive(id) {
  if (!confirm('Supprimer ce document ?')) return;
  try {
    await sb.delete('archive_documents', 'id=eq.' + id);
    STATE.archive = (STATE.archive||[]).filter(function(d) { return d.id !== id; });
    renderArchive();
    showToast('Document supprimé', 'success');
  } catch(e) { showToast('Erreur', 'error'); }
}

async function loadArchive() {
  try {
    const uid = sb.user?.id;
    if (!uid) return;
    const docs = await sb.get('archive_documents', 'user_id=eq.' + uid + '&order=created_at.desc');
    STATE.archive = docs || [];
    renderArchive();
  } catch(e) { STATE.archive = []; }
}

// ============================================================
// GESTION ACCÈS COMPTABLE PAR EMAIL
// ============================================================

async function renderAccesComptable() { inviterComptable(); }


function renderReleves() {
  const list = el('releves-list');
  if (!list) return;

  // Set current month/year defaults
  const now = new Date();
  const moisEl = el('releve-mois');
  const anneeEl = el('releve-annee');
  if (moisEl && !moisEl.dataset.set) {
    moisEl.value = String(now.getMonth() + 1).padStart(2, '0');
    anneeEl.value = String(now.getFullYear());
    moisEl.dataset.set = '1';
  }

  const releves = STATE.releves || [];
  if (!releves.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🏦</div><div class="empty-title">Aucun relevé</div><div>Uploadez vos relevés pour les partager avec votre comptable</div></div>';
    return;
  }

  const moisLabels = ['', 'Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  list.innerHTML = releves.map(function(r) {
    return '<div class="card" style="margin:0 20px 10px">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="width:44px;height:44px;border-radius:12px;background:#ECFDF5;display:flex;align-items:center;justify-content:center;font-size:22px">🏦</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:700">' + (moisLabels[parseInt(r.mois)] || r.mois) + ' ' + r.annee + '</div>' +
          '<div style="font-size:11px;color:#64748B">' + escapeHTML(r.banque || '') + '</div>' +
          '<div style="font-size:10px;color:#94A3B8;margin-top:2px">' + (r.nom_fichier || '') + ' · ' + (r.taille || '') + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">' +
          '<span style="font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600;background:' + (r.vu_par_comptable ? '#ECFDF5' : '#FFFBEB') + ';color:' + (r.vu_par_comptable ? '#059669' : '#D97706') + '">' + (r.vu_par_comptable ? '✓ Vu' : '⏳ En attente') + '</span>' +
          '<button onclick="supprimerReleve(\'' + r.id + '\')" style="background:#FEF2F2;color:#EF4444;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">🗑️</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function uploadReleve(event) {
  const file = event.target.files[0];
  if (!file) return;
  const mois = el('releve-mois')?.value || '01';
  const annee = el('releve-annee')?.value || '2026';
  const banque = (el('releve-banque')?.value || '').trim() || 'Banque';
  const uid = sb.user?.id;
  if (!uid) return;

  showToast('\u23f3 Upload en cours...');

  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      const releve = {
        id: Date.now().toString(),
        user_id: uid,
        mois: mois,
        annee: annee,
        banque: banque,
        nom_fichier: file.name,
        taille: (file.size / 1024).toFixed(0) + ' KB',
        data: e.target.result,
        vu_par_comptable: false,
        created_at: new Date().toISOString()
      };

      await sb.post('releves_bancaires', releve);
      STATE.releves.unshift(releve);
      renderReleves();
      if (el('releve-banque')) el('releve-banque').value = '';
      showToast('\u2705 Relevé ajouté !', 'success');
    };
    reader.readAsDataURL(file);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
  event.target.value = '';
}

async function supprimerReleve(id) {
  if (!confirm('Supprimer ce relevé ?')) return;
  try {
    await sb.delete('releves_bancaires', 'id=eq.' + id);
    STATE.releves = STATE.releves.filter(function(r) { return r.id !== id; });
    renderReleves();
    showToast('Relevé supprimé', 'success');
  } catch(e) { showToast('Erreur', 'error'); }
}


async function inviterComptable() {
  // Ouvrir modal invitation
  const overlay = document.createElement('div');
  overlay.id = 'modal-inv-cpt';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;box-sizing:border-box';
  box.innerHTML =
    '<div style="width:40px;height:4px;background:#E2E8F0;border-radius:2px;margin:0 auto 20px"></div>' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:6px">🤝 Inviter mon comptable</div>' +
    '<div style="font-size:13px;color:#64748B;margin-bottom:16px">Saisissez l\'email de votre comptable. Il recevra une notification dans BaniPay.</div>' +
    '<input id="inv-cpt-email-input" class="f-inp" type="email" placeholder="comptable@cabinet.ma" style="margin-bottom:12px">' +
    '<button id="btn-send-inv-cpt" style="width:100%;padding:13px;background:#4338CA;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">✉️ Envoyer l\'invitation</button>' +
    '<button id="btn-close-inv-cpt-modal" style="width:100%;padding:11px;background:#F1F5F9;color:#64748B;border:none;border-radius:12px;font-size:13px;cursor:pointer;font-family:inherit">Annuler</button>' +
    '<div id="inv-cpt-feedback" style="font-size:12px;text-align:center;margin-top:10px;min-height:16px"></div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
  document.getElementById('btn-close-inv-cpt-modal').onclick = function() { overlay.remove(); };

  document.getElementById('btn-send-inv-cpt').onclick = async function() {
    const emailCpt = (document.getElementById('inv-cpt-email-input')?.value || '').trim().toLowerCase();
    const feedback = document.getElementById('inv-cpt-feedback');
    if (!emailCpt || !emailCpt.includes('@')) {
      feedback.style.color = '#EF4444';
      feedback.textContent = 'Email invalide';
      return;
    }

    const uid = sb.user?.id;
    const emailEnt = sb.user?.email;
    const profil = STATE.profil || {};
    feedback.style.color = '#4338CA';
    feedback.textContent = '⏳ Envoi en cours...';

    try {
      // 1. Créer invitation en DB
      const resp = await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + sb.token,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          comptable_email: emailCpt,
          entreprise_email: emailEnt,
          entreprise_id: uid,
          statut: 'en_attente',
          sens: 'entreprise_vers_comptable'
        })
      });

      // 2. Chercher si le comptable a un compte BaniPay
      const userResp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_user_by_email', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: emailCpt })
      }).catch(function() { return { ok: false }; });

      // 3. Notifier via notifications_app si comptable a un compte
      // On utilise une approche différente: stocker la notification avec l'email cible
      await fetch(SUPABASE_URL + '/rest/v1/notifications_app', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + sb.token,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: uid, // sera lu par le comptable via son email
          destinataire_email: emailCpt,
          type: 'invitation_comptable',
          titre: 'Invitation de ' + (profil.raison || emailEnt),
          corps: (profil.raison || emailEnt) + ' vous invite à accéder à ses documents BaniPay.',
          meta: JSON.stringify({ entreprise_id: uid, entreprise_email: emailEnt, comptable_email: emailCpt }),
          lue: false
        })
      });

      feedback.style.color = '#059669';
      feedback.textContent = '✅ Invitation envoyée ! Le comptable sera notifié à sa prochaine connexion.';

      setTimeout(function() { overlay.remove(); }, 2000);

    } catch(e) {
      feedback.style.color = '#EF4444';
      feedback.textContent = 'Erreur: ' + e.message;
    }
  };
}

// ── SECTION "MON COMPTABLE" DANS PROFIL ENTREPRISE ─────────

async function renderMonComptable() {
  const container = document.getElementById('mon-comptable-section');
  if (!container) return;

  const uid = sb.user?.id;
  const emailEnt = sb.user?.email;

  try {
    // Chercher une invitation acceptée
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + uid + '&statut=eq.acceptee&order=created_at.desc&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const invs = await resp.json() || [];

    if (!invs.length) {
      container.innerHTML =
        '<div style="text-align:center;padding:20px;background:#F8FAFC;border-radius:14px">' +
          '<div style="font-size:32px;margin-bottom:10px">👤</div>' +
          '<div style="font-size:14px;font-weight:600;color:#64748B;margin-bottom:12px">Aucun comptable lié</div>' +
          '<button onclick="inviterComptable()" style="padding:11px 24px;background:#4338CA;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">🤝 Inviter mon comptable</button>' +
        '</div>';
      return;
    }

    const inv = invs[0];
    const emailCpt = inv.comptable_email;

    // FIX: afficher le nom/cabinet du comptable plutôt que son email brut
    let nomAffiche = emailCpt;
    try {
      const respCpt = await fetch(
        SUPABASE_URL + '/rest/v1/profils_comptable?email=eq.' + encodeURIComponent(emailCpt) + '&select=nom,cabinet&limit=1',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      );
      const profCpt = await respCpt.json();
      const p = profCpt && profCpt[0];
      if (p && p.nom) nomAffiche = p.nom + (p.cabinet ? ' · ' + p.cabinet : '');
    } catch(eCpt) {}

    container.innerHTML =
      '<div style="background:linear-gradient(135deg,#1E1B4B,#4338CA);border-radius:14px;padding:16px;color:#fff;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">' +
            (nomAffiche[0] || 'C').toUpperCase() +
          '</div>' +
          '<div style="flex:1">' +
            '<div style="font-size:14px;font-weight:700">' + escapeHTML(nomAffiche) + '</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.6)">Comptable lié</div>' +
          '</div>' +
          '<span style="background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">✅ Actif</span>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button onclick="inviterComptable()" style="flex:1;padding:10px;background:#EEF2FF;color:#4338CA;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">➕ Changer</button>' +
        '<button onclick="revoquerComptable(\'' + inv.id + '\')" style="flex:1;padding:10px;background:#FEF2F2;color:#EF4444;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">🚫 Révoquer</button>' +
      '</div>';

  } catch(e) {
    container.innerHTML = '<div style="color:#EF4444;font-size:12px">Erreur chargement</div>';
  }
}

async function revoquerComptable(invId) {
  if (!confirm('Révoquer l\'accès de votre comptable ?')) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'revoquee' })
    });
    showToast('Accès révoqué', 'success');
    renderMonComptable();
  } catch(e) { showToast('Erreur', 'error'); }
}

// ── CÔTÉ COMPTABLE ─────────────────────────────────────────
