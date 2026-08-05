// ZELTO — equipe-cabinet.js — Équipe du cabinet comptable (FONDATION)
// ============================================================
// MÊME LIMITE que equipe.js côté entreprise : cet écran permet d'inviter
// des collaborateurs du cabinet avec un rôle. Ce qui n'est PAS encore fait
// : aucun écran de comptable.js (fiche entreprise, TVA, extraction...) ne
// montre encore le portefeuille d'entreprises à un collaborateur connecté
// avec son propre compte — tout y est encore filtré par auth.uid() du
// titulaire. À considérer comme une brique de base, pas une bascule
// complète vers un cabinet multi-personnes opérationnel.

STATE.membresCabinet = STATE.membresCabinet || [];

async function chargerEquipeCabinet() {
  try {
    STATE.membresCabinet = (await sb.get('membres_cabinet', 'cabinet_id=eq.' + sb.user.id + '&order=created_at.desc')) || [];
  } catch(e) { STATE.membresCabinet = []; }
  renderEquipeCabinet();
}

function renderEquipeCabinet() {
  const container = el('equipe-cabinet-liste');
  if (!container) return;
  const membres = STATE.membresCabinet || [];
  const labelsRole = { titulaire: 'Titulaire', collaborateur: 'Collaborateur', lecture: 'Lecture seule' };
  const labelsStatut = { invite: '⏳ Invité', actif: '✅ Actif', revoque: '🚫 Révoqué' };

  container.innerHTML = !membres.length
    ? '<div style="text-align:center;padding:20px;color:#9C9186;font-size:12px">Aucun collaborateur invité pour le moment</div>'
    : membres.map(function(m) {
        return '<div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #E3DCCF;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-size:12px;font-weight:700">' + escapeHTML(m.email) + '</div>' +
          '<div style="font-size:10px;color:#9C9186">' + (labelsRole[m.role]||m.role) + ' · ' + (labelsStatut[m.statut]||m.statut) + '</div></div>' +
          '<button onclick="revoquerMembreCabinet(' + m.id + ')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Retirer</button>' +
        '</div>';
      }).join('');
}

async function inviterMembreCabinet() {
  const email = (el('equipe-cabinet-email')?.value || '').trim();
  const role = el('equipe-cabinet-role')?.value || 'collaborateur';
  if (!email || !email.includes('@')) { showToast('Entrez un email valide', 'error'); return; }

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/inviter_membre_cabinet', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_role: role })
    });
    if (!r.ok) { const t = await r.text(); showToast('Erreur: ' + t, 'error'); return; }
    el('equipe-cabinet-email') && (el('equipe-cabinet-email').value = '');
    showToast('✅ Invitation envoyée à ' + email, 'success');
    await chargerEquipeCabinet();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function revoquerMembreCabinet(id) {
  if (!confirm('Retirer ce collaborateur du cabinet ?')) return;
  try {
    await sb.patch('membres_cabinet', 'id=eq.' + id + '&cabinet_id=eq.' + sb.user.id, { statut: 'revoque' });
    showToast('Collaborateur retiré', 'success');
    await chargerEquipeCabinet();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
