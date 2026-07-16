// ============================================================
// BANIPAY — comptable.js — Module accès comptable
// ============================================================

function renderDashboardComptable() {
  const f = window._comptableFactures||[];
  const p = window._comptableProfil||{};
  const total = f.reduce((s,x)=>s+Number(x.ttc),0);
  const tva = f.filter(x=>x.statut==='payee').reduce((s,x)=>s+Number(x.tva),0);
  const payees = f.filter(x=>x.statut==='payee').length;
  const attente = f.filter(x=>['attente','envoyee'].includes(x.statut)).length;
  setEl('c-total-ht',fmtInt(total)+' MAD TTC');
  setEl('c-total-factures',f.length+' factures');
  setEl('c-total-tva',fmtInt(tva)+' MAD');
  setEl('ds-envoye',String(attente));
  setEl('ds-accepte',String(payees));
  const infos = el('comptable-infos-content');
  if(infos) infos.innerHTML=[['Raison',p.raison],['RC',p.rc],['IF',p.identifiant_fiscal],['ICE',p.ice],['Patente',p.patente],['CNSS',p.cnss],['Banque',p.banque],['RIB',p.rib]]
    .filter(([,v])=>v).map(([k,v])=>`<div class="p-row"><span class="p-lbl">${k}</span><span class="p-val">${v}</span></div>`).join('');
  const list = el('comptable-factures-list');
  if(list) list.innerHTML=f.slice(0,20).map(x=>`
    <div class="card">
      <div class="card-ico" style="background:#EFF6FF">📄</div>
      <div class="card-body"><div class="card-name">${x.client}</div><div class="card-ref">${x.ref} · ${x.date_emission||''}</div></div>
      <div class="card-end"><div class="card-amt">${fmt(x.ttc)} MAD</div><div class="badge b-${x.statut}">${badgeF(x.statut)}</div></div>
    </div>`).join('');
}

function quitterComptable() {
  window._comptableFactures=null;window._comptableProfil=null;window._comptableUserId=null;
  goScreen('auth');
}

// ============================================================
// PORTAIL CLIENT PUBLIC
// ============================================================

async function loadComptableApp() {
  const uid = sb.user?.id;
  if (!uid) return;
  try {
    // Load all accesses granted to this comptable
    const acces = await sb.get('acces_comptable_v2', `comptable_id=eq.${uid}&statut=eq.actif`);
    CPT.entreprises = acces || [];
    // Load profil for each entreprise
    if (CPT.entreprises.length > 0) {
      const ids = CPT.entreprises.map(a => a.entreprise_id);
      const profils = await Promise.all(ids.map(id =>
        sb.get('profils_entreprise', `id=eq.${id}`).then(r => r?.[0] || null)
      ));
      CPT.entreprises = CPT.entreprises.map((a, i) => ({
        ...a,
        profil: profils[i] || {},
      }));
    }
    renderComptableDashboard();
  } catch(e) { console.error('loadComptableApp:', e); showToast('Erreur de chargement', 'error'); }
}

// ============================================================
// RENDER DASHBOARD COMPTABLE
// ============================================================

function renderComptableDashboard() {
  const meta = sb.user?.user_metadata || {};
  const nom = meta.nom || sb.user?.email || 'Comptable';

  // Avatar
  const av = el('comptable-avatar');
  if (av) av.textContent = nom.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'C';

  setEl('cpt-nb-entreprises', CPT.entreprises.length + ' entreprise(s) cliente(s)');
  setEl('cpt-sub', 'Connecté en tant que ' + nom);

  // Stats globales
  const list = el('cpt-entreprises-list');
  if (!list) return;

  if (!CPT.entreprises.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-ico">🏢</div>
        <div class="empty-title">Aucune entreprise cliente</div>
        <div style="font-size:13px;margin-top:6px">Partagez votre lien d'invitation à vos clients</div>
        <button onclick="ouvrirInvitation()" style="margin-top:14px;background:#9333EA;color:#fff;border:none;border-radius:10px;padding:12px 20px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📋 Mon lien d'invitation</button>
      </div>`;
    return;
  }

  list.innerHTML = CPT.entreprises.map(a => {
    const p = a.profil || {};
    return `
    <div class="card" onclick="ouvrirEntreprise('${a.entreprise_id}')">
      <div class="card-ico" style="background:#F3E8FF;font-weight:700;color:#9333EA;font-size:18px">
        ${(p.raison||'E').charAt(0).toUpperCase()}
      </div>
      <div class="card-body">
        <div class="card-name">${p.raison || 'Entreprise'}</div>
        <div class="card-ref">${p.secteur||''} ${p.ville?'· '+p.ville:''}</div>
      </div>
      <div class="card-end">
        <div style="font-size:11px;color:#94A3B8">${a.date_acces ? new Date(a.date_acces).toLocaleDateString('fr-MA') : ''}</div>
        <div class="badge" style="background:#F3E8FF;color:#9333EA;margin-top:4px">Actif</div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// OUVRIR UNE ENTREPRISE (vue comptable)
// ============================================================

async function ouvrirEntreprise(entrepriseId) {
  CPT.currentEntId = entrepriseId;
  const ent = CPT.entreprises.find(a => a.entreprise_id === entrepriseId);
  const p = ent?.profil || {};

  setEl('cpt-ent-nom', p.raison || 'Entreprise');

  // Load factures de cette entreprise
  try {
    const f = await sb.get('factures', `user_id=eq.${entrepriseId}&order=created_at.desc`, null, true);
    CPT.currentFactures = f || [];
    CPT.currentProfil = p;
    renderCptEntreprise();
    goScreen('cpt-entreprise');
  } catch(e) { showToast('Erreur de chargement', 'error'); }
}

function renderCptEntreprise() {
  const f = CPT.currentFactures;
  const total = f.reduce((s,x)=>s+Number(x.ttc),0);
  const payees = f.filter(x=>x.statut==='payee');
  const attente = f.filter(x=>['attente','envoyee'].includes(x.statut));
  const retards = f.filter(x=>x.statut==='retard');

  setEl('cpt-ent-ca', fmt(total) + ' MAD TTC');
  setEl('cpt-ent-sub', f.length + ' facture(s)');
  setEl('cpt-ent-payee', fmt(payees.reduce((s,x)=>s+Number(x.ttc),0)));
  setEl('cpt-ent-att', fmt(attente.reduce((s,x)=>s+Number(x.ttc),0)));
  setEl('cpt-ent-ret', fmt(retards.reduce((s,x)=>s+Number(x.ttc),0)));

  cptFilterF('toutes', null);
  renderCptTVA();
  renderCptInfos();
}

function cptEntTab(tab, btn) {
  ['factures','tva','infos'].forEach(t => {
    const el_tab = el('cpt-tab-'+t);
    if (el_tab) el_tab.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#screen-cpt-entreprise .filter-tabs:first-of-type .ftab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function cptFilterF(filter, btn) {
  CPT.filterF = filter;
  document.querySelectorAll('#cpt-tab-factures .filter-tabs .ftab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const list = el('cpt-factures-list');
  if (!list) return;
  let data = filter === 'toutes' ? CPT.currentFactures :
    CPT.currentFactures.filter(f => filter === 'attente' ? ['attente','envoyee'].includes(f.statut) : f.statut === filter);

  if (!data.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucune facture</div></div>';
    return;
  }
  const icons = {attente:'🧱',retard:'⚠️',payee:'✅',envoyee:'📤'};
  const bgs = {attente:'#FFFBEB',retard:'#FEF2F2',payee:'#ECFDF5',envoyee:'#EFF6FF'};
  list.innerHTML = data.map(f => `
    <div class="card">
      <div class="card-ico" style="background:${bgs[f.statut]||'#F1F5F9'}">${icons[f.statut]||'📄'}</div>
      <div class="card-body">
        <div class="card-name">${escapeHTML(f.client)}</div>
        <div class="card-ref">${f.ref} · ${f.date_emission||''}</div>
      </div>
      <div class="card-end">
        <div class="card-amt">${fmt(f.ttc)} ${f.devise||'MAD'}</div>
        <div class="badge b-${f.statut}">${badgeF(f.statut)}</div>
      </div>
    </div>`).join('');
}

function renderCptTVA() {
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const year = new Date().getFullYear();
  const data = Array(12).fill(null).map((_,i) => ({mois:months[i],ht:0,tva:0,ttc:0}));
  CPT.currentFactures.forEach(f => {
    const d = new Date(f.date_emission||f.created_at);
    if (d.getFullYear()===year) {
      data[d.getMonth()].ht += Number(f.ht);
      data[d.getMonth()].tva += Number(f.tva);
      data[d.getMonth()].ttc += Number(f.ttc);
    }
  });
  const total = data.reduce((a,d)=>({ht:a.ht+d.ht,tva:a.tva+d.tva,ttc:a.ttc+d.ttc}),{ht:0,tva:0,ttc:0});
  const body = el('cpt-tva-body');
  if (!body) return;
  body.innerHTML = data.filter(d=>d.ttc>0).map(d=>`
    <tr style="border-bottom:1px solid #F1F5F9">
      <td style="padding:10px 12px">${d.mois}</td>
      <td style="padding:10px 12px;text-align:right">${fmt(d.ht)}</td>
      <td style="padding:10px 12px;text-align:right;color:#059669;font-weight:600">${fmt(d.tva)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600">${fmt(d.ttc)}</td>
    </tr>`).join('') + `
    <tr style="background:#F8FAFC;font-weight:700">
      <td style="padding:12px">Total ${year}</td>
      <td style="padding:12px;text-align:right">${fmt(total.ht)}</td>
      <td style="padding:12px;text-align:right;color:#059669">${fmt(total.tva)}</td>
      <td style="padding:12px;text-align:right">${fmt(total.ttc)}</td>
    </tr>`;
}

function renderCptInfos() {
  const p = CPT.currentProfil;
  const infos = el('cpt-infos-legales');
  if (infos) infos.innerHTML = `
    <div class="p-card-title">Informations légales</div>
    ${[['🏢 Raison',p.raison],['🏭 Secteur',p.secteur],['⚖️ Forme',p.forme],['📍 Adresse',p.adresse],['📞 Tél',p.tel],['✉️ Email',p.email],['RC',p.rc],['IF',p.identifiant_fiscal],['ICE',p.ice],['Patente',p.patente],['CNSS',p.cnss]].filter(([,v])=>v).map(([k,v])=>`<div class="p-row"><span class="p-lbl">${k}</span><span class="p-val">${v}</span></div>`).join('')}`;
  const banque = el('cpt-infos-banque');
  if (banque && (p.banque||p.rib)) banque.innerHTML = `
    <div class="p-card-title">🏦 Coordonnées bancaires</div>
    ${p.banque?`<div class="p-row"><span class="p-lbl">Banque</span><span class="p-val">${p.banque}</span></div>`:''}
    ${p.rib?`<div class="p-row"><span class="p-lbl">RIB</span><span class="p-val" style="font-family:monospace;font-size:11px">${p.rib}</span></div>`:''}`;
  else if (banque) banque.style.display = 'none';
}

function exportCptTVA() {
  const p = CPT.currentProfil;
  const rows = [['Mois','HT','TVA 20%','TTC']];
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const year = new Date().getFullYear();
  const data = Array(12).fill(null).map((_,i)=>({mois:months[i],ht:0,tva:0,ttc:0}));
  CPT.currentFactures.forEach(f=>{const d=new Date(f.date_emission||f.created_at);if(d.getFullYear()===year){data[d.getMonth()].ht+=Number(f.ht);data[d.getMonth()].tva+=Number(f.tva);data[d.getMonth()].ttc+=Number(f.ttc);}});
  data.filter(d=>d.ttc>0).forEach(d=>rows.push([d.mois,d.ht.toFixed(2),d.tva.toFixed(2),d.ttc.toFixed(2)]));
  const csv=rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const b=new Blob(['\uFEFF'+csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);
  a.download=`TVA_${p.raison||'entreprise'}_${year}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  showToast('📊 TVA exportée !','success');
}

// ============================================================
// INVITATION COMPTABLE
// ============================================================

function genTokenInvitation() {
  // Token unique basé sur user_id + timestamp
  const uid = sb.user?.id || '';
  const ts = Date.now().toString(36);
  return uid.substr(0,8) + '-' + ts;
}

function getLienInvitation() {
  const token = STATE.profil?.token_invitation || genTokenInvitation();
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

function ouvrirInvitation() {
  const lien = getLienInvitation();
  const display = el('invitation-link-display');
  if (display) display.textContent = lien;
  el('modal-invitation')?.classList.add('active');
}

function copierLienInvitation() {
  const lien = getLienInvitation();
  navigator.clipboard?.writeText(lien).then(()=>showToast('✅ Lien copié !','success'));
}

function partagerInvitationWhatsApp() {
  const lien = getLienInvitation();
  const meta = sb.user?.user_metadata || {};
  const msg = encodeURIComponent(
    `Bonjour,\n\nJe vous invite à me donner accès à votre espace BaniPay pour le suivi comptable.\n\nCliquez sur ce lien :\n${lien}\n\nCordialement,\n${meta.nom||''} ${meta.cabinet?'- '+meta.cabinet:''}`
  );
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

// ============================================================
// ACCEPTER INVITATION (côté entreprise)
// ============================================================

async function traiterInvitation(token) {
  if (!sb.user || CPT.role === 'comptable') return;
  try {
    // Find comptable by token
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profils_comptable?token_invitation=eq.${token}&select=user_id,nom,cabinet`,
      {headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}}
    );
    const d = await r.json();
    if (!d || !d.length) { showToast('Lien invalide ou expiré','error'); return; }
    const comptable = d[0];
    // Show confirmation modal
    el('invite-comptable-nom') && (el('invite-comptable-nom').textContent = comptable.nom || 'Comptable');
    el('invite-comptable-cabinet') && (el('invite-comptable-cabinet').textContent = comptable.cabinet || '—');
    window._pendingComptableId = comptable.user_id;
    el('modal-accept-invite')?.classList.add('active');
  } catch(e) { showToast('Erreur de traitement', 'error'); }
}

async function accepterInvitation() {
  const comptableId = window._pendingComptableId;
  if (!comptableId) return;
  try {
    await sb.post('acces_comptable_v2', {
      entreprise_id: sb.user.id,
      comptable_id: comptableId,
      statut: 'actif',
      date_acces: new Date().toISOString(),
    });
    closeAllModals();
    showToast('✅ Accès accordé à votre comptable !', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function refuserInvitation() {
  window._pendingComptableId = null;
  closeAllModals();
  showToast('Invitation refusée');
}

// ============================================================
// PROFIL COMPTABLE
// ============================================================

function renderComptableProfil() {
  const meta = sb.user?.user_metadata || {};
  const nom = meta.nom || sb.user?.email || 'Comptable';
  const av = el('cpt-profil-av');
  if (av) av.textContent = nom.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'C';
  setEl('cpt-profil-nom', nom);
  setEl('cpt-email', sb.user?.email || '—');
  setEl('cpt-cabinet', meta.cabinet || '—');
  setEl('cpt-nb-ent', CPT.entreprises.length);
}

// ============================================================
// INIT APP — UPDATE pour gérer les invitations + roles
// ============================================================


// ============================================================
// UTILS AVANCÉS
// ============================================================

async function renderClientPortal(clientId) {
  // Loads public client portal - client can view their documents
  if (!clientId) return;
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#64748B">⏳ Chargement...</div>';
  showToast('Portail client — disponible prochainement', 'default');
}

function acceptClientQuote(id) { changerStatutDevis(id, 'accepte'); }

function refuseClientQuote(id) { changerStatutDevis(id, 'refuse'); }

// ============================================================
// UPDATE goScreen for new screens
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  applyDarkMode();
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');
  const comptableEmail = params.get('comptable');
  const portailId = params.get('portail');
  const profilId = params.get('profil');

  if (portailId) { await loadPublicProfil(portailId); return; }
  if (profilId) { await loadPublicProfil(profilId); return; }

  // Handle invitation link
  if (inviteToken) {
    window._inviteToken = inviteToken;
    // Need to login first, then process invitation
    if (sb.restoreSession()) {
      await loadAll();
      await traiterInvitation(inviteToken);
      goScreen('dashboard');
    } else {
      goScreen('auth');
      showToast('Connectez-vous pour accepter l\'invitation');
    }
    return;
  }

  if (comptableEmail) {
    window._comptableEmail = decodeURIComponent(comptableEmail);
    switchTab('comptable');
    goScreen('auth');
    return;
  }

  // Restore + verify session
  if (sb.restoreSession()) {
    const valid = await sb.verifySession();
    if (!valid) {
      sb.logout();
      goScreen('auth');
    } else {
      const role = sb.user?.user_metadata?.role || 'entreprise';
      CPT.role = role;
      if (role === 'comptable') {
        await loadComptableApp();
        goScreen('comptable');
      } else {
        await loadAll();
        if (window._inviteToken) await traiterInvitation(window._inviteToken);
        goScreen('dashboard');
      }
    }
  } else {
    goScreen('auth');
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeAllModals(); });
  });
});

// goScreen — routing complet
