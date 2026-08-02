// ZELTO — devis-recus.js — Devis reçus d'autres entreprises, retrouver
// ceux acceptés pour les convertir manuellement en BC si l'automatique ne
// s'est pas déclenché (accepté via un lien partagé sans être connecté au
// moment de l'acceptation, par exemple).
// ============================================================
// Source des données : les notifications de type "devis_recu" déjà
// stockées (notifications_app) — on relit chaque devis référencé pour
// connaître son statut actuel, et on vérifie si un BC existe déjà pour lui
// (STATE.bonsCommande[].devis_source_id).

STATE.devisRecusAcceptes = STATE.devisRecusAcceptes || [];

async function chargerDevisRecusAcceptes() {
  const email = sb.user?.email;
  if (!email) return;

  const zone = el('devis-recus-liste');
  if (zone) zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';

  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_notifications', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    });
    const notifs = resp.ok ? ((await resp.json()) || []) : [];
    const notifsDevis = notifs.filter(function(n) { return n.type === 'devis_recu'; });

    const resultats = [];
    for (const n of notifsDevis) {
      let meta = {};
      try { meta = JSON.parse(n.meta || '{}'); } catch(e) {}
      if (!meta.doc_id) continue;

      try {
        const r = await fetch(SUPABASE_URL + '/rest/v1/devis?id=eq.' + meta.doc_id + '&select=*', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const data = await r.json();
        const d = data && data[0];
        if (!d || d.statut !== 'accepte') continue;

        const dejaConverti = (STATE.bonsCommande || []).some(function(bc) { return bc.devis_source_id === d.id; });
        resultats.push({ devis: d, dejaConverti, emetteurRaison: meta.emetteur_raison || '' });
      } catch(e2) {}
    }
    STATE.devisRecusAcceptes = resultats;
  } catch(e) {
    STATE.devisRecusAcceptes = [];
  }
  renderDevisRecusAcceptes();
}

function renderDevisRecusAcceptes() {
  const zone = el('devis-recus-liste');
  if (!zone) return;
  const liste = STATE.devisRecusAcceptes || [];
  const aConvertir = liste.filter(function(x) { return !x.dejaConverti; }).length;

  const resume = el('devis-recus-resume');
  if (resume) resume.innerHTML = aConvertir
    ? '<div style="background:#FBF0DA;border-radius:12px;padding:12px;margin-bottom:14px"><span style="font-size:12px;font-weight:700;color:#A67A16">📝 ' + aConvertir + ' devis accepté(s) pas encore converti(s) en BC</span></div>'
    : '';

  zone.innerHTML = !liste.length
    ? '<div class="empty"><div class="empty-ico">📝</div><div class="empty-title">Aucun devis reçu accepté</div><div>Les devis que vous acceptez depuis d\'autres entreprises Zelto apparaîtront ici</div></div>'
    : liste.map(function(x) {
        const d = x.devis;
        return '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
            '<div><div style="font-size:13px;font-weight:700">' + escapeHTML(d.ref||'') + '</div>' +
            '<div style="font-size:11px;color:#9C9186">' + escapeHTML(x.emetteurRaison || d.client || '') + ' · ' + (d.date_emission||'') + '</div></div>' +
            '<div style="font-size:13px;font-weight:800">' + fmt(d.ttc||0) + ' MAD</div>' +
          '</div>' +
          (x.dejaConverti
            ? '<div style="font-size:11px;color:#6E8F4E;font-weight:600">✅ Déjà converti en bon de commande</div>'
            : '<button onclick="convertirDevisRecuEnBC(' + d.id + ')" style="width:100%;padding:9px;background:#7C5CA6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">📋 Convertir en bon de commande</button>') +
        '</div>';
      }).join('');
}

async function convertirDevisRecuEnBC(devisId) {
  if (typeof enregistrerBCDepuisDevisAccepte !== 'function') return;
  showToast('⏳ Conversion...');
  await enregistrerBCDepuisDevisAccepte(devisId);
  await chargerDevisRecusAcceptes();
}
