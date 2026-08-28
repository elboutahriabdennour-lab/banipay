// ZELTO — profil.js
function renderProfil() {
  const p = STATE.profil;
  const id = p.id_unique || 'BP-' + (sb.user?.id||'').substr(0,6).toUpperCase();
  const initiales = (p.raison||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
  setEl('pv-initiales', initiales);
  setEl('pv-nom', p.raison||'Mon Entreprise');
  setEl('pv-id', '#'+id);
  setEl('pv-rc-label', `RC ${p.rc||'—'} · IF ${p.identifiant_fiscal||'—'} · ICE ${p.ice||'—'}`);
  const required = ['raison','adresse','tel','rc','identifiant_fiscal','ice'];
  const filled = required.filter(k=>p[k]).length;
  const pct = Math.round(filled/required.length*100);
  const badge = el('pv-badge');
  if (badge) {
    badge.textContent = pct===100 ? '✅ Profil complet' : `${pct}% complété — ${required.length-filled} champ(s) manquant(s)`;
  }
  const barre = el('pv-completude-barre');
  if (barre) {
    barre.style.width = pct + '%';
    barre.style.background = pct === 100 ? '#8FBF6B' : pct >= 50 ? '#E4C77A' : '#D98066';
  }
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
    `<div class="p-row"><span class="p-lbl">🎨 Couleur PDF</span><span class="p-val"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${p.couleur_accent||'#C9971F'};vertical-align:middle;margin-right:6px;border:1px solid #E3DCCF"></span>${p.couleur_accent||'#C9971F'}</span></div>`;
  const publicUrl = window.location.origin+window.location.pathname+'?profil='+id;
  setEl('pv-lien', publicUrl);
  const qrContainer = el('qr-canvas-container');
  if (qrContainer) {
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(publicUrl);
    qrContainer.innerHTML = '<img src="' + qrUrl + '" width="120" height="120" style="border-radius:8px;background:#F1EEE8">';
  }
  if(el('pv-objectif')) el('pv-objectif').textContent = p.objectif_mensuel ? fmtInt(p.objectif_mensuel)+' MAD/mois' : 'Non défini';
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
  Object.entries(map).forEach(([id,key])=>{const e=el(id);if(e)e.value=p[key]||(key==='couleur_accent'?'#C9971F':'');});
  if (typeof initSignatureEntrepriseCanvas === 'function') {
    setTimeout(initSignatureEntrepriseCanvas, 50);
  }
}
async function saveProfil() {
  const data = { id: (STATE.entrepriseId || sb.user.id) };
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
  if (typeof getSignatureEntrepriseDataUrl === 'function') {
    const sigDataUrl = getSignatureEntrepriseDataUrl();
    if (sigDataUrl !== null) {
      data.signature_entreprise = sigDataUrl;
      STATE.profil.signature_entreprise = sigDataUrl;
    }
  }
  if(!STATE.profil.id_unique) {
    data.id_unique = 'BP-'+uid6();
    STATE.profil.id_unique = data.id_unique;
  }
  if (typeof validerIdentifiantsLegaux === 'function' && !validerIdentifiantsLegaux(el('pe-ice')?.value.trim(), el('pe-rc')?.value.trim(), el('pe-if')?.value.trim())) return;
  showToast('⏳ Sauvegarde...');
  try {
    await sb.upsert('profils_entreprise', data);
    showToast('✅ Profil enregistré !','success');
    goProfilEdit(false);
    renderProfil();
  } catch(e){showToast('❌ '+e.message,'error');}
}
function copierLienProfil() {
  const id = STATE.profil.id_unique||'BP-000000';
  const lien = `${window.location.origin}${window.location.pathname}?profil=${id}`;
  navigator.clipboard?.writeText(lien).then(()=>showToast('✅ Lien copié !','success'));
}
async function partagerProfil() {
  const id = STATE.profil.id_unique||'BP-000000';
  const lien = `${window.location.origin}${window.location.pathname}?profil=${id}`;
  if(navigator.share){try{await navigator.share({title:STATE.profil.raison||'Zelto',url:lien});return;}catch(e){}}
  navigator.clipboard?.writeText(lien).then(()=>showToast('✅ Lien copié !','success'));
}

// ============================================================
// PARRAINAGE ENTRE ENTREPRISES (chantier ajouté)
// ============================================================
// PÉRIMÈTRE HONNÊTE : ceci compte les inscriptions réalisées via un lien
// de parrainage — il n'y a pour l'instant AUCUNE récompense automatique
// associée (les forfaits n'ont pas encore de prix fixé). Un système de
// récompense pourra être ajouté plus tard une fois cette décision prise,
// sans avoir à retoucher ce mécanisme de suivi.
STATE.mesParrainages = STATE.mesParrainages || [];
function lienParrainage() {
  const id = STATE.profil.id_unique || 'BP-000000';
  return `${window.location.origin}${window.location.pathname.replace('app.html','index.html')}?parrain=${id}`;
}
function copierLienParrainage() {
  navigator.clipboard?.writeText(lienParrainage()).then(() => showToast('✅ Lien de parrainage copié !', 'success'));
}
async function partagerLienParrainage() {
  const lien = lienParrainage();
  if (navigator.share) { try { await navigator.share({ title: 'Rejoignez Zelto', url: lien }); return; } catch(e) {} }
  navigator.clipboard?.writeText(lien).then(() => showToast('✅ Lien copié !', 'success'));
}
async function chargerMesParrainages() {
  try {
    STATE.mesParrainages = (await sb.get('parrainages', 'parrain_id=eq.' + (STATE.entrepriseId || sb.user.id) + '&order=created_at.desc')) || [];
  } catch(e) { STATE.mesParrainages = []; }
  renderParrainage();
}
function renderParrainage() {
  const zone = el('parrainage-content');
  if (!zone) return;
  const n = (STATE.mesParrainages || []).length;
  zone.innerHTML =
    '<div style="font-size:12px;color:#6B5F54;margin-bottom:12px">Partagez ce lien — chaque entreprise qui s\'inscrit grâce à vous apparaît ici.</div>' +
    '<div style="background:#F1EEE8;border-radius:10px;padding:10px 12px;font-size:11px;color:#6B5F54;word-break:break-all;margin-bottom:10px">' + lienParrainage() + '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:16px">' +
      '<button onclick="copierLienParrainage()" style="flex:1;padding:9px;background:#F1EEE8;color:#241F1B;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">📋 Copier</button>' +
      '<button onclick="partagerLienParrainage()" style="flex:1;padding:9px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">📤 Partager</button>' +
    '</div>' +
    '<div style="font-size:13px;font-weight:700;color:#2A2420;margin-bottom:8px">' + n + ' entreprise' + (n>1?'s':'') + ' parrainée' + (n>1?'s':'') + '</div>' +
    (STATE.mesParrainages || []).map(function(p) {
      return '<div style="font-size:12px;color:#6B5F54;padding:6px 0;border-bottom:1px solid #EAE4DA">' + escapeHTML(p.filleul_email || 'Entreprise') + ' · ' + formatDate(p.created_at) + '</div>';
    }).join('');
}
async function uploadLogo(event) {
  const file = event.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const b64 = e.target.result;
    const ancienLogo = STATE.profil.logo;
    STATE.profil.logo = b64;
    // FIX (audit workflow) : sb.upsert() lève maintenant une vraie erreur
    // en cas d'échec (voir config.js) — sans ce try/catch, une erreur ici
    // aurait fait planter silencieusement la fonction, sans aucun message
    // pour l'utilisateur.
    try {
      await sb.upsert('profils_entreprise',{id:(STATE.entrepriseId || sb.user.id),logo:b64});
      const preview = el('logo-preview-container');
      if(preview) preview.innerHTML = `<img src="${b64}" style="max-width:120px;max-height:60px;border-radius:8px;object-fit:contain">`;
      const delBtn = el('del-logo-btn');
      if(delBtn) delBtn.style.display='block';
      showToast('✅ Logo enregistré','success');
    } catch(err) {
      STATE.profil.logo = ancienLogo;
      showToast('❌ ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}
async function supprimerLogo() {
  const ancienLogo = STATE.profil.logo;
  STATE.profil.logo = null;
  try {
    await sb.upsert('profils_entreprise',{id:(STATE.entrepriseId || sb.user.id),logo:null});
    const preview = el('logo-preview-container');
    if(preview) preview.innerHTML='';
    const delBtn = el('del-logo-btn');
    if(delBtn) delBtn.style.display='none';
    showToast('Logo supprimé');
  } catch(err) {
    STATE.profil.logo = ancienLogo;
    showToast('❌ ' + err.message, 'error');
  }
}
// FIX (audit) : genQRCanvas() retirée — c'était l'ancienne version du QR
// code (dessiné à la main, décoratif, jamais scannable), remplacée
// partout par un vrai QR via l'API qrserver.com. Plus aucun appel dans
// le code, sans quoi cette suppression aurait cassé quelque chose.
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
      <div class="card-ico" style="background:#EAE4DA">📋</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(d.client || 'Sans client')}</div>
        <div class="card-ref">${d.lignes?.length || 0} ligne(s) · Sauvegardé ${formatDate(d.savedAt)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button onclick="restoreDraft('${d.id}')" style="background:#E9F4F3;color:#C9971F;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">Restaurer</button>
        <button onclick="deleteDraft('${d.id}')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">Supprimer</button>
      </div>
    </div>`).join('');
}
function renderParametres() {
  const p = STATE.profil;
  el('param-prefix-fac') && (el('param-prefix-fac').value = p.prefix_fac || 'FAC');
  el('param-prefix-dev') && (el('param-prefix-dev').value = p.prefix_dev || 'DEV');
  el('param-num-start') && (el('param-num-start').value = p.num_start || '1');
  el('param-delai') && (el('param-delai').value = p.delai_paiement || '30');
  el('param-mode-paiement') && (el('param-mode-paiement').value = p.mode_paiement_defaut || 'virement');
  el('param-tva-defaut') && (el('param-tva-defaut').value = p.tva_defaut || '20');
  el('param-methode-stock') && (el('param-methode-stock').value = p.methode_stock || 'CMUP');
  // NOUVEAU (audit) : l'entreprise choisit si son téléphone/email
  // apparaissent dans l'annuaire public Zelto. Par défaut activé (aucun
  // changement de comportement pour les comptes existants), mais
  // désormais désactivable en un clic.
  el('param-annuaire-contact-visible') && (el('param-annuaire-contact-visible').checked = p.annuaire_contact_visible !== false);
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
    id: (STATE.entrepriseId || sb.user.id),
    prefix_fac: el('param-prefix-fac')?.value.trim() || 'FAC',
    prefix_dev: el('param-prefix-dev')?.value.trim() || 'DEV',
    num_start: parseInt(el('param-num-start')?.value) || 1,
    delai_paiement: parseInt(el('param-delai')?.value) || 30,
    mode_paiement_defaut: el('param-mode-paiement')?.value || 'virement',
    tva_defaut: parseInt(el('param-tva-defaut')?.value) || 20,
    methode_stock: el('param-methode-stock')?.value || 'CMUP',
    annuaire_contact_visible: el('param-annuaire-contact-visible') ? !!el('param-annuaire-contact-visible').checked : true,
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
function exporterToutesMesDonnees() {
  showToast('⏳ Préparation de l\'export...');
  try {
    const donnees = {
      export_date: new Date().toISOString(),
      profil: STATE.profil || {},
      factures: STATE.factures || [],
      devis: STATE.devis || [],
      achats: STATE.achats || [],
      clients: STATE.clients || [],
      produits: STATE.produits || [],
      avoirs: STATE.avoirs || [],
      paiements: STATE.paiements || [],
      bonsCommande: STATE.bonsCommande || [],
      bonsLivraison: STATE.bonsLivraison || [],
    };
    const json = JSON.stringify(donnees, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'banipay_mes_donnees_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
    showToast('✅ Export téléchargé', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
function confirmerSuppressionCompte() {
  if (!confirm('⚠️ Cette action est IRRÉVERSIBLE.\nToutes vos données seront supprimées.\n\nÊtes-vous sûr ?')) return;
  if (!confirm('Dernière confirmation : supprimer définitivement votre compte Zelto ?')) return;
  deleteAccount();
}
async function deleteAccount() {
  showToast('⏳ Suppression en cours...');
  try {
    const uid = sb.user.id;
    // FIX (grand audit) : cette fonction ne nettoyait que 7 tables sur
    // les 22+ qui existent réellement dans l'app aujourd'hui — tout ce
    // qui a été construit au fil des sessions (achats, abonnements,
    // équipe, chantiers, parrainage, relevés...) restait derrière,
    // orphelin, après une "suppression de compte".
    //
    // Étape 1 : tables dépendant des produits (doivent être nettoyées
    // AVANT les produits eux-mêmes).
    const mesProduits = await sb.get('produits', 'user_id=eq.' + uid).catch(function() { return []; });
    const idsProduits = (mesProduits || []).map(function(p) { return p.id; });
    if (idsProduits.length) {
      const filtreIds = 'in.(' + idsProduits.join(',') + ')';
      await Promise.all([
        sb.del('lots_stock', 'produit_id=' + filtreIds).catch(function() {}),
        sb.del('mouvements_stock', 'produit_id=' + filtreIds).catch(function() {}),
      ]);
    }

    // Étape 2 : tout ce qui est directement rattaché à user_id
    const tablesUserID = [
      'factures', 'devis', 'clients', 'produits', 'avoirs', 'paiements',
      'abonnements', 'archive_documents', 'audit_log', 'bons_commande',
      'bons_livraison', 'employes', 'factures_achat', 'photos_chantier',
      'relances_achats_vues', 'relances_envoyees', 'releves_bancaires',
    ];
    await Promise.all(tablesUserID.map(function(t) {
      return sb.del(t, 'user_id=eq.' + uid).catch(function(e) { console.warn('Suppression ' + t + ':', e); });
    }));

    // Étape 3 : tables avec une colonne clé différente
    await Promise.all([
      sb.del('demandes_devis', 'entreprise_id=eq.' + uid).catch(function() {}),
      sb.del('membres_entreprise', 'entreprise_id=eq.' + uid).catch(function() {}),
      sb.del('membres_cabinet', 'cabinet_id=eq.' + uid).catch(function() {}),
      sb.del('parrainages', 'parrain_id=eq.' + uid).catch(function() {}),
      sb.del('invitations_comptable', 'entreprise_id=eq.' + uid).catch(function() {}),
    ]);

    // Étape 4 : le profil lui-même
    await sb.del('profils_entreprise', 'id=eq.' + uid);

    // Étape 5 : le compte d'authentification (email/mot de passe) —
    // NOUVEAU (grand audit) : ceci n'était JAMAIS fait auparavant. Sans
    // cette étape, l'email et le mot de passe restaient valides même
    // après "suppression du compte" — la personne pouvait toujours se
    // reconnecter, juste avec un profil vide. Passe par une fonction
    // serveur dédiée (voir supprimer-compte-edge-function.ts) car cette
    // opération nécessite des droits que le client n'a jamais.
    try {
      await fetch(SUPABASE_URL + '/functions/v1/supprimer-compte', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      });
    } catch(eAuth) {
      console.warn('Suppression du compte d\'authentification échouée (à traiter manuellement) :', eAuth);
    }

    sb.logout();
    goScreen('auth');
    showToast('Compte supprimé', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}
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
      '<div style="width:40px;height:40px;border-radius:10px;background:#E9F4F3;display:flex;align-items:center;justify-content:center;font-size:20px">' + (d.icon||'\u{1F4C4}') + '</div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + escapeHTML(d.nom) + '</div>' +
      '<div style="font-size:11px;color:#9C9186">' + d.type + ' · ' + (d.date||'') + '</div></div>' +
      '<button data-id="' + d.id + '" class="del-archive-btn" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px">\u{1F5D1}\uFE0F</button>' +
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
      const uid = STATE.entrepriseId || sb.user?.id;
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
    await sb.del('archive_documents', 'id=eq.' + id);
    STATE.archive = (STATE.archive||[]).filter(function(d) { return d.id !== id; });
    renderArchive();
    showToast('Document supprimé', 'success');
  } catch(e) { showToast('Erreur', 'error'); }
}
async function loadArchive() {
  try {
    const uid = STATE.entrepriseId || sb.user?.id;
    if (!uid) return;
    const docs = await sb.get('archive_documents', 'user_id=eq.' + uid + '&order=created_at.desc');
    STATE.archive = docs || [];
    renderArchive();
  } catch(e) { STATE.archive = []; }
}
async function renderAccesComptable() { inviterComptable(); }
async function loadReleves() {
  const uid = STATE.entrepriseId || sb.user?.id;
  if (!uid) { STATE.releves = []; return; }
  try {
    STATE.releves = (await sb.get('releves_bancaires', 'user_id=eq.' + uid + '&order=annee.desc,mois.desc')) || [];
  } catch(e) {
    STATE.releves = [];
  }
  renderReleves();
}
function renderReleves() {
  const list = el('releves-list');
  if (!list) return;
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
        '<div style="width:44px;height:44px;border-radius:12px;background:#EEF3E4;display:flex;align-items:center;justify-content:center;font-size:22px">🏦</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:700">' + (moisLabels[parseInt(r.mois)] || r.mois) + ' ' + r.annee + '</div>' +
          '<div style="font-size:11px;color:#6B5F54">' + escapeHTML(r.banque || '') + '</div>' +
          '<div style="font-size:10px;color:#9C9186;margin-top:2px">' + (r.nom_fichier || '') + ' · ' + (r.taille || '') + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">' +
          '<span style="font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600;background:' + (r.vu_par_comptable ? '#EEF3E4' : '#F7EFDC') + ';color:' + (r.vu_par_comptable ? '#6E8F4E' : '#B8860B') + '">' + (r.vu_par_comptable ? '✓ Vu' : '⏳ En attente') + '</span>' +
          '<button onclick="telechargerReleveEntreprise(\'' + r.id + '\')" style="background:#F1EEE8;color:#6B5F54;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">📥</button>' +
          '<button onclick="supprimerReleve(\'' + r.id + '\')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit">🗑️</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}
function telechargerReleveEntreprise(releveId) {
  const r = (STATE.releves || []).find(function(x) { return String(x.id) === String(releveId); });
  if (!r || !r.data) { showToast('Fichier introuvable', 'error'); return; }
  if (typeof telechargerFichierBase64 === 'function') telechargerFichierBase64(r.data, r.nom_fichier || 'releve');
}
async function uploadReleve(event) {
  const file = event.target.files[0];
  if (!file) return;
  const mois = el('releve-mois')?.value || '01';
  const annee = el('releve-annee')?.value || '2026';
  const banque = (el('releve-banque')?.value || '').trim() || 'Banque';
  const uid = STATE.entrepriseId || sb.user?.id;
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
    await sb.del('releves_bancaires', 'id=eq.' + id);
    STATE.releves = STATE.releves.filter(function(r) { return r.id !== id; });
    renderReleves();
    showToast('Relevé supprimé', 'success');
  } catch(e) { showToast('Erreur', 'error'); }
}
async function inviterComptable() {
  if (typeof verifierAccesFeature === 'function' && !verifierAccesFeature('comptable_lie', 'Accès comptable')) return;
  const overlay = document.createElement('div');
  overlay.id = 'modal-inv-cpt';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;box-sizing:border-box';
  box.innerHTML =
    '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 20px"></div>' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:6px">🤝 Inviter mon comptable</div>' +
    '<div style="font-size:13px;color:#6B5F54;margin-bottom:16px">Saisissez l\'email de votre comptable. Il recevra une notification dans Zelto.</div>' +
    '<input id="inv-cpt-email-input" class="f-inp" type="email" placeholder="comptable@cabinet.ma" style="margin-bottom:12px">' +
    '<button id="btn-send-inv-cpt" style="width:100%;padding:13px;background:#1F6F72;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">✉️ Envoyer l\'invitation</button>' +
    '<button id="btn-close-inv-cpt-modal" style="width:100%;padding:11px;background:#EAE4DA;color:#6B5F54;border:none;border-radius:12px;font-size:13px;cursor:pointer;font-family:inherit">Annuler</button>' +
    '<div id="inv-cpt-feedback" style="font-size:12px;text-align:center;margin-top:10px;min-height:16px"></div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
  document.getElementById('btn-close-inv-cpt-modal').onclick = function() { overlay.remove(); };
  document.getElementById('btn-send-inv-cpt').onclick = async function() {
    const emailCpt = (document.getElementById('inv-cpt-email-input')?.value || '').trim().toLowerCase();
    const feedback = document.getElementById('inv-cpt-feedback');
    if (!emailCpt || !emailCpt.includes('@')) {
      feedback.style.color = '#B23A2E';
      feedback.textContent = 'Email invalide';
      return;
    }
    const uid = STATE.entrepriseId || sb.user?.id;
    const emailEnt = sb.user?.email;
    const profil = STATE.profil || {};
    feedback.style.color = '#1F6F72';
    feedback.textContent = '⏳ Envoi en cours...';
    try {
      // FIX (bug root cause #2, trouvé via diagnostic) : une contrainte
      // d'unicité existe sur (entreprise_id, comptable_email) — si une
      // invitation avait déjà été envoyée par le passé à ce même email
      // (même refusée, même très ancienne), toute nouvelle tentative
      // échouait avec "duplicate key value violates unique constraint".
      // Passage en upsert : si la ligne existe déjà, son statut est
      // remis à "en_attente" (réinvitation), sinon une nouvelle ligne
      // est créée normalement.
      // FIX (le précédent essai n'a pas suffi) : Prefer:
      // resolution=merge-duplicates seul ne fonctionne QUE sur la clé
      // primaire — sans le paramètre ?on_conflict=..., PostgREST ne sait
      // pas que c'est CETTE contrainte nommée qu'il faut utiliser pour
      // l'upsert, et l'insertion échoue exactement comme une insertion
      // normale. Confirmé en capture d'écran : même erreur, à l'identique.
      const resp = await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?on_conflict=entreprise_id,comptable_email', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + sb.token,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          comptable_email: emailCpt,
          entreprise_email: emailEnt,
          entreprise_id: uid,
          statut: 'en_attente',
          sens: 'entreprise_vers_comptable'
        })
      });
      // FIX (bug root cause trouvé via diagnostic) : cette réponse n'était
      // JAMAIS vérifiée — l'insertion pouvait échouer silencieusement
      // (politique de sécurité, colonne manquante...) tout en affichant
      // "Invitation envoyée !" comme si tout s'était bien passé. C'est
      // exactement ce qui s'est produit : la ligne n'existait jamais
      // réellement dans invitations_comptable.
      if (!resp.ok) {
        const erreurBrute = await resp.json().catch(function() { return {}; });
        feedback.style.color = '#B23A2E';
        feedback.textContent = '❌ Échec de l\'envoi : ' + (erreurBrute.message || 'erreur inconnue — vérifiez les droits d\'accès sur la table invitations_comptable dans Supabase');
        console.warn('inviterComptable: échec insertion', resp.status, erreurBrute);
        return;
      }
      const userResp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_user_by_email', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: emailCpt })
      }).catch(function() { return { ok: false }; });
      await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_notification', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_user_id: uid,
          p_destinataire_email: emailCpt,
          p_type: 'invitation_comptable',
          p_titre: 'Invitation de ' + (profil.raison || emailEnt),
          p_corps: (profil.raison || emailEnt) + ' vous invite à accéder à ses documents Zelto.',
          p_meta: JSON.stringify({ entreprise_id: uid, entreprise_email: emailEnt, comptable_email: emailCpt })
        })
      });
      feedback.style.color = '#6E8F4E';
      feedback.textContent = '✅ Invitation envoyée ! Le comptable sera notifié à sa prochaine connexion.';
      setTimeout(function() { overlay.remove(); }, 2000);
    } catch(e) {
      feedback.style.color = '#B23A2E';
      feedback.textContent = 'Erreur: ' + e.message;
    }
  };
}
async function renderMonComptable() {
  const container = document.getElementById('mon-comptable-section');
  if (!container) return;
  // NOUVEAU (audit) : deux identifiants distincts ici. "uid" reste la
  // personne connectée elle-même (pour vérifier si ELLE est comptable),
  // "entId" est l'entreprise dont on veut voir les invitations comptable
  // — les deux ne sont pas forcément la même chose sous le multi-utilisateur.
  const uid = sb.user?.id;
  const entId = STATE.entrepriseId || sb.user?.id;
  const emailEnt = sb.user?.email;
  try {
    const rProfilCpt = await fetch(SUPABASE_URL + '/rest/v1/profils_comptable?id=eq.' + uid + '&select=id', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    const estComptable = rProfilCpt.ok && ((await rProfilCpt.json()) || []).length > 0;
    if (estComptable) {
      container.innerHTML =
        '<div style="text-align:center;padding:20px;background:#F1EEE8;border-radius:14px">' +
          '<div style="font-size:32px;margin-bottom:10px">🧑‍💼</div>' +
          '<div style="font-size:13px;color:#6B5F54">Vous êtes vous-même comptable — cette section ne s\'applique pas à votre propre profil.</div>' +
        '</div>';
      return;
    }
  } catch(eCheck) {}
  try {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + entId + '&statut=eq.acceptee&order=created_at.desc&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const invs = await resp.json() || [];
    if (!invs.length) {
      container.innerHTML =
        '<div style="text-align:center;padding:20px;background:#F1EEE8;border-radius:14px">' +
          '<div style="font-size:32px;margin-bottom:10px">👤</div>' +
          '<div style="font-size:14px;font-weight:600;color:#6B5F54;margin-bottom:12px">Aucun comptable lié</div>' +
          '<button onclick="inviterComptable()" style="padding:11px 24px;background:#1F6F72;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">🤝 Inviter mon comptable' + (typeof htmlBadgeVerrou === 'function' ? htmlBadgeVerrou('comptable_lie') : '') + '</button>' +
        '</div>';
      return;
    }
    const inv = invs[0];
    const emailCpt = inv.comptable_email;
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
      '<div style="background:linear-gradient(135deg,#241F1B,#1F6F72);border-radius:14px;padding:16px;color:#fff;margin-bottom:12px">' +
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
        '<button onclick="inviterComptable()" style="flex:1;padding:10px;background:#FBF0DA;color:#1F6F72;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">➕ Changer' + (typeof htmlBadgeVerrou === 'function' ? htmlBadgeVerrou('comptable_lie') : '') + '</button>' +
        '<button onclick="revoquerComptable(\'' + inv.id + '\')" style="flex:1;padding:10px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">🚫 Révoquer</button>' +
      '</div>';
  } catch(e) {
    container.innerHTML = '<div style="color:#B23A2E;font-size:12px">Erreur chargement</div>';
  }
}
async function revoquerComptable(invId) {
  if (!confirm('Révoquer l\'accès de votre comptable ?')) return;
  try {
    // FIX (audit sécurité/workflow — important) : sans cette vérification,
    // un échec silencieux affichait "Accès révoqué" alors que le
    // comptable gardait un accès complet aux données financières — un
    // vrai risque de confidentialité, pas juste un désagrément d'affichage.
    const r = await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'revoquee' })
    });
    if (!r.ok) { showToast('❌ Échec de la révocation — réessayez, l\'accès n\'a PAS été retiré', 'error'); return; }
    showToast('Accès révoqué', 'success');
    renderMonComptable();
  } catch(e) { showToast('❌ Échec de la révocation — réessayez, l\'accès n\'a PAS été retiré', 'error'); }
}
