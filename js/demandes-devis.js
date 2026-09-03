// ZELTO — demandes-devis.js — Demandes de devis REÇUES d'un client
// ============================================================
// À ne pas confondre avec devis-recus.js (des devis qu'ON a reçus d'une
// autre entreprise, à convertir en bon de commande). Ici, c'est
// l'inverse : un client (avec ou sans compte Zelto, via
// demande-devis-fournisseur.js ou le profil public) NOUS demande un
// devis, et on doit pouvoir le transformer en vrai devis à lui envoyer.
STATE.demandesDevis = STATE.demandesDevis || [];

async function loadDemandesDevis() {
  const zone = el('demandes-devis-liste');
  if (zone) zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_demandes_devis_recues', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_entreprise_id: (STATE.entrepriseId || sb.user.id) })
    });
    STATE.demandesDevis = resp.ok ? ((await resp.json()) || []) : [];
    if (!resp.ok) console.warn('get_demandes_devis_recues a échoué', resp.status, await resp.text().catch(function(){return '';}));
  } catch(e) {
    STATE.demandesDevis = [];
  }
  renderDemandesDevis();
}

function renderDemandesDevis() {
  const zone = el('demandes-devis-liste');
  if (!zone) return;
  const liste = STATE.demandesDevis || [];
  const nouvelles = liste.filter(function(d) { return d.statut === 'nouvelle'; }).length;

  const resume = el('demandes-devis-resume');
  if (resume) resume.innerHTML = nouvelles
    ? '<div style="background:#FBF0DA;border-radius:12px;padding:12px;margin-bottom:14px"><span style="font-size:12px;font-weight:700;color:#A67A16">📥 ' + nouvelles + ' nouvelle(s) demande(s) de devis</span></div>'
    : '';

  zone.innerHTML = !liste.length
    ? '<div class="empty"><div class="empty-ico">📥</div><div class="empty-title">Aucune demande de devis</div><div>Les demandes envoyées par vos clients apparaîtront ici</div></div>'
    : liste.map(function(d) {
        const statutLabel = { nouvelle: '🆕 Nouvelle', traitee: '✅ Traitée', ignoree: '✕ Ignorée' };
        const statutColor = { nouvelle: '#B8860B', traitee: '#6E8F4E', ignoree: '#9C9186' };
        return '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
            '<div><div style="font-size:13px;font-weight:700">' + escapeHTML(d.client_nom || 'Client') + '</div>' +
            '<div style="font-size:11px;color:#9C9186">' + formatDateTime(d.created_at) + '</div></div>' +
            '<span style="font-size:10px;font-weight:700;color:' + (statutColor[d.statut]||'#9C9186') + '">' + (statutLabel[d.statut]||d.statut) + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#2A2420;margin-bottom:10px;white-space:pre-wrap">' + escapeHTML(d.description || '') + '</div>' +
          (d.client_tel ? '<div style="font-size:11px;color:#6B5F54;margin-bottom:2px">📞 ' + escapeHTML(d.client_tel) + '</div>' : '') +
          (d.client_email ? '<div style="font-size:11px;color:#6B5F54;margin-bottom:10px">✉️ ' + escapeHTML(d.client_email) + '</div>' : '<div style="margin-bottom:10px"></div>') +
          (d.statut === 'nouvelle'
            ? '<div style="display:flex;gap:6px">' +
                '<button onclick="convertirDemandeEnDevis(' + d.id + ')" style="flex:1;padding:9px;background:#C9971F;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">📝 Créer le devis</button>' +
                '<button onclick="marquerDemandeDevisIgnoree(' + d.id + ')" style="padding:9px 12px;background:#F1EEE8;color:#9C9186;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit">✕</button>' +
              '</div>'
            : '') +
        '</div>';
      }).join('');
}

// Ouvre l'écran "Nouveau devis" avec les coordonnées du client déjà
// pré-remplies — on ne devine jamais le contenu du devis lui-même
// (produits, prix), seulement qui est le destinataire.
function convertirDemandeEnDevis(demandeId) {
  const d = (STATE.demandesDevis || []).find(function(x) { return x.id === demandeId; });
  if (!d) return;
  if (typeof initNouveauDevis === 'function') initNouveauDevis();
  el('devis-client') && (el('devis-client').value = d.client_nom || '');
  el('devis-tel') && (el('devis-tel').value = d.client_tel || '');
  el('devis-email') && (el('devis-email').value = d.client_email || '');
  el('devis-note') && (el('devis-note').value = d.description ? 'Demande initiale : ' + d.description : '');
  STATE._demandeDevisEnCours = demandeId;
  goScreen('nouveau-devis', null);
}

// Appelée automatiquement une fois le devis réellement enregistré,
// depuis devis.js (sauvegarderDevis), si STATE._demandeDevisEnCours est
// renseigné — évite qu'une demande reste "nouvelle" alors qu'un devis a
// déjà été créé pour elle.
async function marquerDemandeDevisTraiteeSiEnCours() {
  if (!STATE._demandeDevisEnCours) return;
  const id = STATE._demandeDevisEnCours;
  STATE._demandeDevisEnCours = null;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_demande_devis_statut', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id, p_statut: 'traitee' })
    });
    const d = (STATE.demandesDevis || []).find(function(x) { return x.id === id; });
    if (d) d.statut = 'traitee';
  } catch(e) { console.warn('marquerDemandeDevisTraiteeSiEnCours:', e); }
}

async function marquerDemandeDevisIgnoree(demandeId) {
  if (!confirm('Ignorer cette demande de devis ?')) return;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_demande_devis_statut', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: demandeId, p_statut: 'ignoree' })
    });
    if (!r.ok) { showToast('❌ Erreur — réessayez', 'error'); return; }
    const d = (STATE.demandesDevis || []).find(function(x) { return x.id === demandeId; });
    if (d) d.statut = 'ignoree';
    renderDemandesDevis();
    showToast('Demande ignorée', 'success');
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}
