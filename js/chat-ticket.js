// ZELTO — chat-ticket.js — Discussion en direct sur un ticket support
// ============================================================
// Utilisé des DEUX côtés : l'agent (depuis l'espace support) et
// l'utilisateur (depuis son écran "Mes tickets"). Même écran, mêmes
// fonctions — seul le style des bulles change selon qui a écrit quoi.

STATE._chatTicketId = STATE._chatTicketId || null;
STATE._chatMessages = STATE._chatMessages || [];
STATE._chatPollTimer = STATE._chatPollTimer || null;

function ouvrirChatTicket(ticketId, sujet) {
  STATE._chatTicketId = ticketId;
  setEl('chat-ticket-titre', sujet || 'Discussion');
  goScreen('chat-ticket', null);
  chargerMessagesTicket();
  clearInterval(STATE._chatPollTimer);
  STATE._chatPollTimer = setInterval(chargerMessagesTicket, 4000);
}

function fermerChatTicket() {
  clearInterval(STATE._chatPollTimer);
  if (STATE._partageEcran?.pc) arreterPartageEcran();
  goScreen(STATE.monRoleSupport ? 'espace-support' : 'mes-tickets-support', null);
  if (STATE.monRoleSupport) switchOngletSupport('tickets');
}

async function chargerMessagesTicket() {
  if (!STATE._chatTicketId) return;
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_messages_ticket', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ticket_id: STATE._chatTicketId })
    });
    STATE._chatMessages = resp.ok ? ((await resp.json()) || []) : [];
  } catch(e) { STATE._chatMessages = []; }
  renderMessagesTicket();
}

function renderMessagesTicket() {
  const zone = el('chat-ticket-messages');
  if (!zone) return;
  const msgs = STATE._chatMessages || [];
  const monLabel = STATE.monRoleSupport ? 'agent' : 'user';
  zone.innerHTML = !msgs.length
    ? '<div style="text-align:center;padding:30px;color:#9C9186;font-size:12px">Aucun message pour l\'instant</div>'
    : msgs.map(function(m) {
        const estMoi = m.auteur === monLabel;
        return '<div style="display:flex;justify-content:' + (estMoi ? 'flex-end' : 'flex-start') + ';margin-bottom:8px">' +
          '<div style="max-width:75%;background:' + (estMoi ? '#1F6F72' : '#F1EEE8') + ';color:' + (estMoi ? '#fff' : '#2A2420') + ';padding:8px 12px;border-radius:14px;font-size:13px">' +
            (!estMoi ? '<div style="font-size:10px;opacity:0.7;margin-bottom:2px">' + escapeHTML(m.auteur_nom || (m.auteur === 'agent' ? 'Support' : 'Client')) + '</div>' : '') +
            escapeHTML(m.contenu||'') +
          '</div></div>';
      }).join('');
  zone.scrollTop = zone.scrollHeight;
}

async function envoyerMessageTicket() {
  const input = el('chat-ticket-input');
  const contenu = (input?.value || '').trim();
  if (!contenu || !STATE._chatTicketId) return;
  input.value = '';
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_message_ticket', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ticket_id: STATE._chatTicketId, p_contenu: contenu })
    });
    chargerMessagesTicket();
  } catch(e) { showToast('Erreur envoi: ' + e.message, 'error'); }
}

// ============================================================
// PARTAGE D'ÉCRAN — boutons appelés depuis l'écran de chat
// ============================================================
function demanderPartageEcranDepuisChat() {
  if (!STATE._chatTicketId) return;
  if (STATE.monRoleSupport) {
    // L'agent se met en attente que l'utilisateur partage
    rejoindrePartageEcran(STATE._chatTicketId, 'video-partage-ecran');
    el('zone-video-partage') && (el('zone-video-partage').style.display = 'block');
  } else {
    // L'utilisateur démarre le partage de son propre écran
    demarrerPartageEcran(STATE._chatTicketId);
  }
}

// ============================================================
// "MES TICKETS" — écran utilisateur (pas agent)
// ============================================================
STATE.mesTicketsSupport = STATE.mesTicketsSupport || [];

async function chargerMesTicketsSupport() {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_tickets_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.mesTicketsSupport = resp.ok ? ((await resp.json()) || []) : [];
  } catch(e) { STATE.mesTicketsSupport = []; }
  renderMesTicketsSupport();
}

function renderMesTicketsSupport() {
  const zone = el('mes-tickets-liste');
  if (!zone) return;
  const tickets = STATE.mesTicketsSupport || [];
  const statutLabel = { nouveau: '🆕 Nouveau', en_cours: '⏳ En cours', resolu: '✅ Résolu' };
  zone.innerHTML = !tickets.length
    ? '<div class="empty"><div class="empty-ico">🎫</div><div class="empty-title">Aucun ticket envoyé</div></div>'
    : tickets.map(function(t) {
        return '<div onclick="ouvrirChatTicket(' + t.id + ',\'' + escapeHTML(t.sujet||'').replace(/'/g,"\\'") + '\')" style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF;cursor:pointer">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<div style="font-size:13px;font-weight:700">' + escapeHTML(t.sujet||'') + '</div>' +
            '<span style="font-size:10px;font-weight:600;color:#1F6F72">' + (statutLabel[t.statut]||t.statut) + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:#9C9186">' + formatDateTime(t.created_at) + ' · 👆 Toucher pour discuter</div>' +
        '</div>';
      }).join('');
}
