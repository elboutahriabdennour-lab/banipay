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
  window._diagDevisRecus = ['Email utilisé : ' + (email || '(aucun)')];
  if (!email) { window._diagDevisRecus.push('❌ Arrêt : pas d\'email sur le compte connecté'); return; }

  const zone = el('devis-recus-liste');
  if (zone) zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';

  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_notifications', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(function(){return '';});
      window._diagDevisRecus.push('❌ get_mes_notifications a échoué : HTTP ' + resp.status + ' — ' + (errText || '(pas de détail)'));
    }
    const notifs = resp.ok ? ((await resp.json()) || []) : [];
    window._diagDevisRecus.push('Notifications reçues (toutes) : ' + notifs.length);
    const notifsDevis = notifs.filter(function(n) { return n.type === 'devis_recu'; });
    window._diagDevisRecus.push('Dont type "devis_recu" : ' + notifsDevis.length);

    const resultats = [];
    for (const n of notifsDevis) {
      let meta = {};
      try { meta = typeof n.meta === 'string' ? JSON.parse(n.meta || '{}') : (n.meta || {}); } catch(e) { window._diagDevisRecus.push('⚠️ meta illisible pour notif #' + n.id + ' : ' + n.meta); }
      if (!meta.doc_id) { window._diagDevisRecus.push('⚠️ Notif #' + n.id + ' sans doc_id dans meta — ignorée'); continue; }

      try {
        const r = await fetch(SUPABASE_URL + '/rest/v1/devis?id=eq.' + meta.doc_id + '&select=*', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const data = await r.json();
        const d = data && data[0];
        if (!d) { window._diagDevisRecus.push('⚠️ Devis #' + meta.doc_id + ' introuvable (HTTP ' + r.status + ') — RLS bloque probablement la lecture publique par id'); continue; }
        window._diagDevisRecus.push('Devis #' + meta.doc_id + ' trouvé, statut = "' + d.statut + '"');
        if (d.statut !== 'accepte') continue;

        const dejaConverti = (STATE.bonsCommande || []).some(function(bc) { return bc.devis_source_id === d.id; });
        resultats.push({ devis: d, dejaConverti, emetteurRaison: meta.emetteur_raison || '', notifId: n.id });
      } catch(e2) { window._diagDevisRecus.push('❌ Erreur réseau en lisant le devis #' + meta.doc_id + ' : ' + e2.message); }
    }
    STATE.devisRecusAcceptes = resultats;
    window._diagDevisRecus.push('✅ Résultat final : ' + resultats.length + ' devis accepté(s) affiché(s)');
  } catch(e) {
    STATE.devisRecusAcceptes = [];
    window._diagDevisRecus.push('❌ Exception : ' + e.message);
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
            : '<button onclick="convertirDevisRecuEnBC(' + d.id + ')" style="width:100%;padding:9px;background:#7C5CA6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:6px">📋 Convertir en bon de commande</button>') +
          '<button onclick="supprimerDevisRecu(\'' + x.notifId + '\')" style="width:100%;padding:7px;background:none;color:#B23A2E;border:1px solid #F5E4E1;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">✕ Retirer de la liste</button>' +
        '</div>';
      }).join('');
}

// Point 8 : un devis reçu peut être retiré de cette liste — supprime
// juste la notification source, pas le devis lui-même (qui appartient à
// l'autre entreprise).
async function supprimerDevisRecu(notifId) {
  if (!confirm('Retirer ce devis de la liste ?')) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_notification_lue', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: notifId })
    });
    STATE.devisRecusAcceptes = (STATE.devisRecusAcceptes || []).filter(function(x) { return x.notifId !== notifId; });
    renderDevisRecusAcceptes();
    showToast('Retiré de la liste', 'success');
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function convertirDevisRecuEnBC(devisId) {
  if (typeof enregistrerBCDepuisDevisAccepte !== 'function') return;
  showToast('⏳ Conversion...');
  await enregistrerBCDepuisDevisAccepte(devisId);
  await chargerDevisRecusAcceptes();
}
