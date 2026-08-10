// ZELTO — equipe.js — Gestion d'équipe (FONDATION multi-utilisateurs)
// ============================================================
// PÉRIMÈTRE IMPORTANT : cet écran permet d'inviter des membres avec un
// rôle (admin/édition/lecture) et de gérer la liste. C'est la fondation
// technique du multi-utilisateurs. Ce qui n'est PAS encore fait : aucun
// écran de l'application (factures, achats, clients, stock...) ne vérifie
// encore ce rôle ni ne montre les données de l'entreprise à un membre
// connecté avec son propre compte — chaque écran devra être adapté
// séparément pour lire par entreprise_id plutôt que par auth.uid(). Le
// considérer comme une brique de base, pas une fonctionnalité complète.

STATE.membresEquipe = STATE.membresEquipe || [];

// NOUVEAU : les invitations reçues (à accepter) — RPC déjà construite mais
// jamais appelée jusqu'ici, rendant toute la fonctionnalité inaccessible
// à la personne invitée.
STATE.mesInvitationsEquipe = STATE.mesInvitationsEquipe || [];

async function chargerMesInvitationsEquipe() {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_invitations_membre', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.mesInvitationsEquipe = resp.ok ? ((await resp.json()) || []) : [];
  } catch(e) { STATE.mesInvitationsEquipe = []; }
  renderMesInvitationsEquipe();
}

function renderMesInvitationsEquipe() {
  const zone = el('mes-invitations-equipe');
  if (!zone) return;
  const invitations = STATE.mesInvitationsEquipe || [];
  if (!invitations.length) { zone.innerHTML = ''; return; }
  zone.innerHTML = invitations.map(function(inv) {
    return '<div style="background:#FBF0DA;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E8D9AE">' +
      '<div style="font-size:12px;font-weight:700;color:#A67A16;margin-bottom:8px">🤝 Invitation en attente — rôle : ' + escapeHTML(inv.role||'') + '</div>' +
      '<button onclick="accepterMonInvitationEquipe(' + inv.id + ')" style="width:100%;padding:9px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter et rejoindre l\'équipe</button>' +
    '</div>';
  }).join('');
}

async function accepterMonInvitationEquipe(membreId) {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/accepter_invitation_membre', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_membre_id: membreId })
    });
    if (!resp.ok) { showToast('Erreur — invitation introuvable ou déjà traitée', 'error'); return; }
    showToast('✅ Vous avez rejoint l\'équipe !', 'success');
    chargerMesInvitationsEquipe();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function chargerEquipe() {
  try {
    STATE.membresEquipe = (await sb.get('membres_entreprise', 'entreprise_id=eq.' + sb.user.id + '&order=created_at.desc')) || [];
  } catch(e) { STATE.membresEquipe = []; }
  renderEquipe();
}

function renderEquipe() {
  const container = el('equipe-liste');
  if (!container) return;
  const membres = STATE.membresEquipe || [];
  const labelsRole = { admin: 'Administrateur', edition: 'Édition', lecture: 'Lecture seule' };
  const labelsStatut = { invite: '⏳ Invité', actif: '✅ Actif', revoque: '🚫 Révoqué' };

  container.innerHTML = !membres.length
    ? '<div style="text-align:center;padding:20px;color:#9C9186;font-size:12px">Aucun membre invité pour le moment</div>'
    : membres.map(function(m) {
        return '<div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #E3DCCF;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-size:12px;font-weight:700">' + escapeHTML(m.email) + '</div>' +
          '<div style="font-size:10px;color:#9C9186">' + (labelsRole[m.role]||m.role) + ' · ' + (labelsStatut[m.statut]||m.statut) + '</div></div>' +
          '<button onclick="revoquerMembreEquipe(' + m.id + ')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Retirer</button>' +
        '</div>';
      }).join('');
}

async function inviterMembreEquipe() {
  if (typeof verifierAccesFeature === 'function' && !verifierAccesFeature('multi_utilisateurs', 'Équipe multi-utilisateurs')) return;
  const email = (el('equipe-email')?.value || '').trim();
  const role = el('equipe-role')?.value || 'lecture';
  if (!email || !email.includes('@')) { showToast('Entrez un email valide', 'error'); return; }

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/inviter_membre_entreprise', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_role: role })
    });
    if (!r.ok) { const t = await r.text(); showToast('Erreur: ' + t, 'error'); return; }
    el('equipe-email') && (el('equipe-email').value = '');
    showToast('✅ Invitation envoyée à ' + email, 'success');
    await chargerEquipe();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function revoquerMembreEquipe(id) {
  if (!confirm('Retirer ce membre de l\'équipe ?')) return;
  try {
    await sb.patch('membres_entreprise', 'id=eq.' + id + '&entreprise_id=eq.' + sb.user.id, { statut: 'revoque' });
    showToast('Membre retiré', 'success');
    await chargerEquipe();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
