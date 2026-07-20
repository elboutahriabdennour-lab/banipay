// BANIPAY — achats.js — Factures d'achat

STATE.achats = STATE.achats || [];
STATE.achatFiltreActuel = 'tous';

// ============================================================
// CHARGEMENT
// ============================================================

async function loadAchats() {
  try {
    const uid = sb.user?.id;
    if (!uid) return;
    const r = await sb.get('factures_achat', 'user_id=eq.' + uid + '&order=date_achat.desc');
    STATE.achats = r || [];
  } catch(e) { STATE.achats = []; }
  renderAchats();
}

// ============================================================
// LISTE ACHATS
// ============================================================

function filtrerAchats(filtre, btn) {
  STATE.achatFiltreActuel = filtre;
  document.querySelectorAll('#screen-achats .ftab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderAchats();
}

function renderAchats() {
  const list = el('achats-list');
  if (!list) return;

  let achats = STATE.achats || [];
  const filtre = STATE.achatFiltreActuel || 'tous';

  if (filtre === 'attente') achats = achats.filter(function(a) { return a.statut === 'attente'; });
  else if (filtre === 'payee') achats = achats.filter(function(a) { return a.statut === 'payee'; });
  else if (filtre === 'banipay') achats = achats.filter(function(a) { return a.fournisseur_banipay; });

  // Total
  const total = achats.reduce(function(s, a) { return s + (Number(a.ttc) || 0); }, 0);
  setEl('achats-total', fmt(total) + ' MAD');

  if (!achats.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🛒</div><div class="empty-title">Aucune facture d\'achat</div><div>Ajoutez vos factures fournisseurs</div></div>';
    return;
  }

  const catIcons = { materiel:'🔧', services:'💼', fournitures:'📦', transport:'🚛', immobilier:'🏠', autre:'📄' };
  const statutBg = { payee:'#ECFDF5', attente:'#FFFBEB' };
  const statutColor = { payee:'#059669', attente:'#D97706' };
  const statutLabel = { payee:'Payée', attente:'En attente' };

  list.innerHTML = achats.map(function(a) {
    return '<div class="card" onclick="ouvrirDetailAchat(\'' + a.id + '\')">' +
      '<div class="card-ico" style="background:#FEF2F2;font-size:20px">' + (catIcons[a.categorie] || '📄') + '</div>' +
      '<div class="card-body">' +
        '<div class="card-name">' + escapeHTML(a.fournisseur || '—') + (a.fournisseur_banipay ? ' <span style="font-size:9px;background:#EFF6FF;color:#2563EB;padding:1px 5px;border-radius:4px;font-weight:600">BP</span>' : '') + '</div>' +
        '<div class="card-ref">' + (a.ref_fournisseur || '') + ' · ' + (a.date_achat || '') + '</div>' +
      '</div>' +
      '<div class="card-end">' +
        '<div class="card-amount" style="color:#EF4444">' + fmt(a.ttc || 0) + '</div>' +
        '<div style="font-size:10px;padding:2px 6px;border-radius:4px;background:' + (statutBg[a.statut] || '#F1F5F9') + ';color:' + (statutColor[a.statut] || '#64748B') + ';font-weight:600;margin-top:4px">' + (statutLabel[a.statut] || a.statut || '') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ============================================================
// IMPORT FOURNISSEUR BANIPAY
// ============================================================

async function importerFournisseurBaniPay() {
  const lien = (el('achat-fournisseur-lien')?.value || '').trim();
  if (!lien) { showToast('Collez un lien BaniPay', 'error'); return; }

  let profilId = null;
  try {
    const url = new URL(lien);
    profilId = url.searchParams.get('profil') || url.searchParams.get('portail');
  } catch(e) {
    profilId = lien.split('profil=')[1]?.split('&')[0];
  }
  if (!profilId) { showToast('Lien invalide', 'error'); return; }

  showToast('\u23f3 Chargement fournisseur...');

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + profilId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const p = data && data[0];
    if (!p) { showToast('Profil introuvable', 'error'); return; }

    // Remplir les champs
    if (el('achat-fournisseur')) { el('achat-fournisseur').value = p.raison || ''; el('achat-fournisseur').style.background = '#ECFDF5'; }
    if (el('achat-fournisseur-id')) el('achat-fournisseur-id').value = p.id || '';
    if (el('achat-fournisseur-banipay')) el('achat-fournisseur-banipay').value = '1';
    if (el('achat-fournisseur-lien')) el('achat-fournisseur-lien').value = '';

    showToast('\u2705 Fournisseur importé : ' + p.raison, 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// CALCUL TOTAUX
// ============================================================

function calcAchatTotaux() {
  const ht = parseFloat(el('achat-ht')?.value || 0) || 0;
  const taux = parseFloat(el('achat-tva-taux')?.value || 20) / 100;
  const tva = ht * taux;
  const ttc = ht + tva;
  setEl('achat-ht-display', fmt(ht) + ' MAD');
  setEl('achat-tva-display', fmt(tva) + ' MAD');
  setEl('achat-ttc-display', fmt(ttc) + ' MAD');
}

// ============================================================
// PIÈCE JOINTE
// ============================================================

function previewAchatPJ(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = el('achat-pj-preview');
  if (!preview) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const isImage = file.type.startsWith('image/');
    preview.innerHTML = isImage
      ? '<img src="' + e.target.result + '" style="max-width:100%;border-radius:10px;border:1px solid #E2E8F0">'
      : '<div style="background:#F8FAFC;border-radius:10px;padding:10px;font-size:12px;color:#64748B;border:1px solid #E2E8F0">📎 ' + file.name + ' (' + (file.size/1024).toFixed(0) + ' KB)</div>';
    STATE._achatPJData = e.target.result;
    STATE._achatPJNom = file.name;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// SAUVEGARDER ACHAT
// ============================================================

async function sauvegarderAchat() {
  const fournisseur = (el('achat-fournisseur')?.value || '').trim();
  if (!fournisseur) { showToast('Saisissez le fournisseur', 'error'); return; }

  const ht = parseFloat(el('achat-ht')?.value || 0) || 0;
  const taux = parseFloat(el('achat-tva-taux')?.value || 20) / 100;
  const tva = ht * taux;
  const ttc = ht + tva;

  const achat = {
    user_id: sb.user?.id,
    fournisseur: fournisseur,
    fournisseur_id: el('achat-fournisseur-id')?.value || null,
    fournisseur_banipay: el('achat-fournisseur-banipay')?.value === '1',
    ref_fournisseur: el('achat-ref')?.value || '',
    date_achat: el('achat-date')?.value || new Date().toISOString().split('T')[0],
    echeance: el('achat-echeance')?.value || null,
    ht: ht,
    tva: tva,
    tva_taux: parseFloat(el('achat-tva-taux')?.value || 20),
    ttc: ttc,
    categorie: el('achat-categorie')?.value || 'autre',
    statut: el('achat-statut')?.value || 'attente',
    note: el('achat-note')?.value || '',
    pj_data: STATE._achatPJData || null,
    pj_nom: STATE._achatPJNom || null,
    created_at: new Date().toISOString()
  };

  try {
    showToast('\u23f3 Enregistrement...');
    const result = await sb.post('factures_achat', achat);
    if (result) {
      STATE.achats.unshift(result[0] || achat);
      STATE._achatPJData = null;
      STATE._achatPJNom = null;
      showToast('\u2705 Facture d\'achat enregistrée !', 'success');
      goScreen('achats', null);
      renderAchats();
    }
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// DÉTAIL ACHAT
// ============================================================

function ouvrirDetailAchat(id) {
  const a = STATE.achats.find(function(x) { return x.id === id; });
  if (!a) return;

  const catLabels = { materiel:'Matériel & Équipement', services:'Services', fournitures:'Fournitures', transport:'Transport', immobilier:'Immobilier', autre:'Autre' };

  const overlay = document.createElement('div');
  overlay.id = 'achat-detail-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F8FAFC;overflow-y:auto;font-family:inherit';

  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg,#EF4444,#DC2626);padding:14px 20px;display:flex;align-items:center;gap:12px">' +
      '<button onclick="document.getElementById(\'achat-detail-overlay\').remove()" style="background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
      '<div><div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(a.fournisseur || '') + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.6)">' + (a.ref_fournisseur || '') + '</div></div>' +
      (a.fournisseur_banipay ? '<span style="margin-left:auto;background:rgba(255,255,255,0.2);color:#fff;font-size:11px;padding:4px 8px;border-radius:6px;font-weight:600">BaniPay</span>' : '') +
    '</div>' +

    '<div style="margin:16px;background:#fff;border-radius:16px;padding:16px;border:1px solid #E2E8F0">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:12px">' +
        '<div><div style="font-size:11px;color:#94A3B8">Date</div><div style="font-size:13px;font-weight:600">' + (a.date_achat || '—') + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:11px;color:#94A3B8">Total TTC</div><div style="font-size:18px;font-weight:800;color:#EF4444">' + fmt(a.ttc || 0) + ' MAD</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">' +
        '<div style="background:#F8FAFC;border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:#94A3B8">HT</div><div style="font-size:12px;font-weight:700">' + fmt(a.ht || 0) + '</div></div>' +
        '<div style="background:#F3E8FF;border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:#9333EA">TVA ' + (a.tva_taux || 20) + '%</div><div style="font-size:12px;font-weight:700;color:#9333EA">' + fmt(a.tva || 0) + '</div></div>' +
        '<div style="background:' + (a.statut === 'payee' ? '#ECFDF5' : '#FFFBEB') + ';border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:' + (a.statut === 'payee' ? '#059669' : '#D97706') + '">' + (a.statut === 'payee' ? 'Payée' : 'En attente') + '</div></div>' +
      '</div>' +
      '<div style="font-size:12px;color:#64748B">Catégorie: ' + (catLabels[a.categorie] || a.categorie || '—') + '</div>' +
      (a.note ? '<div style="margin-top:8px;font-size:12px;color:#64748B;background:#F8FAFC;padding:8px;border-radius:8px">📝 ' + escapeHTML(a.note) + '</div>' : '') +
    '</div>' +

    // Fiche fournisseur BaniPay
    (a.fournisseur_banipay && a.fournisseur_id ?
      '<div style="margin:0 16px 16px;background:#EFF6FF;border-radius:16px;padding:16px;border:1px solid #BFDBFE;cursor:pointer" onclick="voirFicheFournisseur(\'' + (a.fournisseur_id || '') + '\')">' +
        '<div style="font-size:12px;font-weight:700;color:#2563EB;margin-bottom:8px">🔗 Fournisseur sur BaniPay</div>' +
        '<div style="font-size:13px;font-weight:600">' + escapeHTML(a.fournisseur || '') + '</div>' +
        '<div style="font-size:11px;color:#64748B;margin-top:4px">Appuyez pour voir la fiche</div>' +
      '</div>' : '') +

    // Pièce jointe
    (a.pj_data ?
      '<div style="margin:0 16px 16px">' +
        '<div style="font-size:12px;font-weight:700;color:#0F172A;margin-bottom:8px">📎 Pièce jointe</div>' +
        (a.pj_data.startsWith('data:image') ?
          '<img src="' + a.pj_data + '" style="max-width:100%;border-radius:12px;border:1px solid #E2E8F0">' :
          '<div style="background:#F8FAFC;padding:12px;border-radius:10px;font-size:12px;color:#64748B">📄 ' + (a.pj_nom || 'Fichier') + '</div>') +
      '</div>' : '') +

    '<div style="padding:0 16px 20px;display:flex;gap:8px">' +
      '<button onclick="marquerAchatPaye(\'' + a.id + '\')" style="flex:1;padding:12px;background:' + (a.statut === 'payee' ? '#F1F5F9' : '#059669') + ';color:' + (a.statut === 'payee' ? '#64748B' : '#fff') + ';border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">' + (a.statut === 'payee' ? '✓ Payée' : '✅ Marquer payée') + '</button>' +
      '<button onclick="supprimerAchat(\'' + a.id + '\')" style="padding:12px 16px;background:#FEF2F2;color:#EF4444;border:none;border-radius:12px;font-size:13px;cursor:pointer;font-family:inherit">🗑️</button>' +
    '</div>';

  document.body.appendChild(overlay);
}

async function voirFicheFournisseur(fournisseurId) {
  // Charger le profil du fournisseur BaniPay
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + fournisseurId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const p = data && data[0];
    if (!p) { showToast('Profil introuvable', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;font-family:inherit';

    overlay.innerHTML =
      '<div style="background:#0F172A;padding:14px 20px;display:flex;align-items:center;gap:12px">' +
        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
        '<div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(p.raison || '') + '</div>' +
        '<span style="margin-left:auto;background:#2563EB;color:#fff;font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600">BaniPay</span>' +
      '</div>' +

      '<div style="padding:16px">' +
        // Logo
        (p.logo ? '<div style="text-align:center;margin-bottom:16px"><img src="' + p.logo + '" style="max-width:120px;max-height:60px;object-fit:contain"></div>' : '') +

        '<div style="background:#F8FAFC;border-radius:16px;padding:16px;margin-bottom:12px">' +
          [['🏢 Raison sociale', p.raison], ['⚙️ Secteur', p.secteur], ['📍 Adresse', p.adresse ? p.adresse + (p.ville ? ', ' + p.ville : '') : null],
           ['📞 Tél', p.tel], ['✉️ Email', p.email], ['🔢 ICE', p.ice], ['📋 RC', p.rc], ['💼 IF', p.identifiant_fiscal]]
          .filter(function(x) { return x[1]; })
          .map(function(x) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:12px">' +
              '<span style="color:#64748B">' + x[0] + '</span>' +
              '<span style="font-weight:600;text-align:right;max-width:60%">' + escapeHTML(String(x[1])) + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +

        '<button onclick="window.open(\'' + window.location.origin + window.location.pathname + '?profil=' + (p.id_unique || '') + '\',\'_blank\')" style="width:100%;padding:12px;background:#2563EB;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">🔗 Voir profil public</button>' +
      '</div>';

    document.body.appendChild(overlay);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function marquerAchatPaye(id) {
  const a = STATE.achats.find(function(x) { return x.id === id; });
  if (!a || a.statut === 'payee') return;
  try {
    await sb.patch('factures_achat', 'id=eq.' + id + '&user_id=eq.' + sb.user.id, { statut: 'payee' });
    a.statut = 'payee';
    showToast('\u2705 Facture marquée payée', 'success');
    document.getElementById('achat-detail-overlay')?.remove();
    renderAchats();
  } catch(e) { showToast('Erreur', 'error'); }
}

async function supprimerAchat(id) {
  if (!confirm('Supprimer cette facture ?')) return;
  try {
    await sb.delete('factures_achat', 'id=eq.' + id + '&user_id=eq.' + sb.user.id);
    STATE.achats = STATE.achats.filter(function(x) { return x.id !== id; });
    document.getElementById('achat-detail-overlay')?.remove();
    showToast('Supprimée', 'success');
    renderAchats();
  } catch(e) { showToast('Erreur', 'error'); }
}
