// BANIPAY — messages.js — Messagerie temps réel

STATE.conversations = STATE.conversations || [];
STATE.messagesConv = STATE.messagesConv || [];
STATE.currentConvId = null;
STATE._realtimeChannel = null;

// ============================================================
// UTILITAIRES CONVERSATION ID
// ============================================================

function getConvId(entrepriseId, comptableEmail) {
  // ID unique déterministe pour une paire entreprise/comptable
  return 'conv_' + entrepriseId + '_' + btoa(comptableEmail).replace(/=/g,'').substr(0, 12);
}

// ============================================================
// CHARGER CONVERSATIONS
// ============================================================

async function loadConversations() {
  const uid = sb.user?.id;
  const email = sb.user?.email;
  const role = sb.user?.user_metadata?.role || 'entreprise';

  try {
    let query = '';
    if (role === 'comptable') {
      query = 'comptable_email=eq.' + encodeURIComponent(email);
    } else {
      query = 'entreprise_id=eq.' + uid;
    }

    const r = await fetch(
      SUPABASE_URL + '/rest/v1/conversations?' + query + '&order=derniere_activite.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    STATE.conversations = await r.json() || [];
    badgeMessages();
  } catch(e) {
    STATE.conversations = [];
  }
}

function badgeMessages() {
  const badge = document.getElementById('msg-badge');
  if (!badge) return;
  // Count conversations with unread messages (simplified - count all convs for now)
  const count = STATE.conversations.length;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ============================================================
// ÉCRAN MESSAGERIE (liste conversations)
// ============================================================

async function ouvrirMessagerie() {
  await loadConversations();
  renderConversations();
  goScreen('messages');
}

function renderConversations() {
  const list = document.getElementById('conv-list');
  if (!list) return;
  const role = sb.user?.user_metadata?.role || 'entreprise';
  const convs = STATE.conversations || [];

  if (!convs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">💬</div><div class="empty-title">Aucune conversation</div><div>Démarrez une conversation depuis la fiche d\'un client ou de votre comptable</div></div>';
    return;
  }

  list.innerHTML = convs.map(function(c) {
    const name = role === 'comptable'
      ? (c.entreprise_email || '').split('@')[0]
      : (c.comptable_email || '').split('@')[0];
    const lastMsg = c.dernier_message || 'Nouvelle conversation';
    const time = c.derniere_activite ? new Date(c.derniere_activite).toLocaleDateString('fr-FR', {day:'2-digit',month:'short'}) : '';
    const initiale = (name[0] || '?').toUpperCase();
    const bgColors = ['#EEF2FF','#ECFDF5','#FEF3C7','#FEE2E2'];
    const fgColors = ['#4F46E5','#059669','#D97706','#EF4444'];
    const idx = name.charCodeAt(0) % 4;

    return '<div class="conv-item" data-id="' + c.id + '" style="display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid #F8FAFC;cursor:pointer;align-items:center">' +
      '<div style="width:46px;height:46px;border-radius:50%;background:' + bgColors[idx] + ';color:' + fgColors[idx] + ';display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0">' + initiale + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-size:14px;font-weight:700;color:#0F172A">' + escapeHTML(name) + '</div>' +
          '<div style="font-size:11px;color:#94A3B8">' + time + '</div>' +
        '</div>' +
        '<div style="font-size:12px;color:#64748B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHTML(lastMsg) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Event delegation
  list.addEventListener('click', function(e) {
    const item = e.target.closest('.conv-item');
    if (item) ouvrirConversation(item.dataset.id);
  });
}

// ============================================================
// OUVRIR UNE CONVERSATION
// ============================================================

async function ouvrirConversation(convId) {
  STATE.currentConvId = convId;
  const conv = (STATE.conversations || []).find(function(c) { return c.id === convId; });
  if (!conv) return;

  const role = sb.user?.user_metadata?.role || 'entreprise';
  const nomContact = role === 'comptable'
    ? (conv.entreprise_email || '').split('@')[0]
    : (conv.comptable_email || '').split('@')[0];

  // Set header
  const header = document.getElementById('chat-nom');
  if (header) header.textContent = nomContact;

  // Load messages
  await chargerMessages(convId);
  goScreen('chat');

  // Subscribe to realtime
  abonnerRealtime(convId);

  // Scroll to bottom
  setTimeout(scrollToBottom, 100);
}

async function chargerMessages(convId) {
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/messages?conversation_id=eq.' + convId + '&order=created_at.asc&limit=100',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    STATE.messagesConv = await r.json() || [];
    renderMessages();
  } catch(e) {
    STATE.messagesConv = [];
  }
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!container) return;
  const uid = sb.user?.id;
  const msgs = STATE.messagesConv || [];

  if (!msgs.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#94A3B8"><div style="font-size:32px;margin-bottom:8px">👋</div><div style="font-size:13px">Commencez la conversation</div></div>';
    return;
  }

  // Group messages by date
  let lastDate = '';
  container.innerHTML = msgs.map(function(m) {
    const isMine = m.expediteur_id === uid;
    const date = new Date(m.created_at);
    const dateStr = date.toLocaleDateString('fr-FR', {weekday:'long',day:'2-digit',month:'long'});
    const timeStr = date.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});

    let dateSep = '';
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      dateSep = '<div style="text-align:center;margin:12px 0"><span style="background:#F1F5F9;color:#64748B;font-size:11px;padding:4px 12px;border-radius:12px">' + dateStr + '</span></div>';
    }

    const pjHtml = m.pj_data && m.pj_nom
      ? '<div style="margin-top:6px;background:rgba(255,255,255,0.2);border-radius:8px;padding:8px 10px;font-size:12px;cursor:pointer" onclick="voirPJMessage(\'' + m.id + '\')">' +
          '📎 ' + escapeHTML(m.pj_nom) +
        '</div>'
      : '';

    return dateSep +
      '<div style="display:flex;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';margin-bottom:8px;padding:0 16px">' +
        '<div style="max-width:75%">' +
          (isMine ? '' : '<div style="font-size:10px;color:#94A3B8;margin-bottom:3px">' + escapeHTML(m.expediteur_nom || '') + '</div>') +
          '<div style="background:' + (isMine ? 'linear-gradient(135deg,#4F46E5,#3730A3)' : '#F1F5F9') + ';color:' + (isMine ? '#fff' : '#0F172A') + ';padding:10px 14px;border-radius:' + (isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px') + ';font-size:13px;line-height:1.5">' +
            escapeHTML(m.contenu || '') +
            pjHtml +
          '</div>' +
          '<div style="font-size:10px;color:#94A3B8;margin-top:2px;text-align:' + (isMine ? 'right' : 'left') + '">' + timeStr + '</div>' +
        '</div>' +
      '</div>';
  }).join('');

  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  if (container) container.scrollTop = container.scrollHeight;
}

// ============================================================
// ENVOYER UN MESSAGE
// ============================================================

async function envoyerMessage() {
  const input = document.getElementById('msg-input');
  const contenu = (input?.value || '').trim();
  if (!contenu && !window._pendingMsgPJ) return;

  const convId = STATE.currentConvId;
  if (!convId) return;

  const uid = sb.user?.id;
  const email = sb.user?.email;
  const nom = sb.user?.user_metadata?.nom || email?.split('@')[0] || '';

  const msg = {
    conversation_id: convId,
    expediteur_id: uid,
    expediteur_email: email,
    expediteur_nom: nom,
    contenu: contenu,
    type: window._pendingMsgPJ ? 'fichier' : 'texte',
    pj_data: window._pendingMsgPJ || null,
    pj_nom: window._pendingMsgPJNom || null,
    lu: false
  };

  // Clear input immediately
  if (input) input.value = '';
  window._pendingMsgPJ = null;
  window._pendingMsgPJNom = null;
  document.getElementById('msg-pj-preview')?.remove();

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/messages', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(msg)
    });

    const created = await r.json();
    const newMsg = (created && created[0]) ? created[0] : msg;

    // Add to local state and render
    STATE.messagesConv.push(newMsg);
    renderMessages();

    // Update conversation last message
    await fetch(SUPABASE_URL + '/rest/v1/conversations?id=eq.' + convId, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dernier_message: contenu || '📎 Fichier',
        derniere_activite: new Date().toISOString()
      })
    });

  } catch(e) {
    showToast('Erreur envoi: ' + e.message, 'error');
  }
}

// ============================================================
// PIÈCE JOINTE
// ============================================================

function attacherFichierMsg(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    window._pendingMsgPJ = e.target.result;
    window._pendingMsgPJNom = file.name;

    // Show preview
    const old = document.getElementById('msg-pj-preview');
    if (old) old.remove();
    const preview = document.createElement('div');
    preview.id = 'msg-pj-preview';
    preview.style.cssText = 'position:absolute;bottom:70px;left:16px;right:16px;background:#EEF2FF;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#4F46E5;font-weight:600;border:1px solid #C7D2FE';
    preview.innerHTML = '📎 ' + escapeHTML(file.name) + '<button onclick="annulerPJMsg()" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:16px">×</button>';
    document.getElementById('chat-input-zone').appendChild(preview);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function annulerPJMsg() {
  window._pendingMsgPJ = null;
  window._pendingMsgPJNom = null;
  document.getElementById('msg-pj-preview')?.remove();
}

function voirPJMessage(msgId) {
  const msg = (STATE.messagesConv || []).find(function(m) { return m.id === msgId; });
  if (!msg || !msg.pj_data) return;
  if (msg.pj_data.startsWith('data:image')) {
    const win = window.open();
    win.document.write('<img src="' + msg.pj_data + '" style="max-width:100%">');
  } else {
    const a = document.createElement('a');
    a.href = msg.pj_data;
    a.download = msg.pj_nom || 'fichier';
    a.click();
  }
}

// ============================================================
// SUPABASE REALTIME
// ============================================================

function abonnerRealtime(convId) {
  // Unsubscribe previous channel
  if (STATE._realtimeChannel) {
    try { STATE._realtimeChannel.unsubscribe(); } catch(e2) {}
    STATE._realtimeChannel = null;
  }

  // Use polling as fallback (every 3 seconds)
  if (STATE._pollInterval) clearInterval(STATE._pollInterval);
  STATE._pollInterval = setInterval(async function() {
    if (STATE.currentConvId !== convId) {
      clearInterval(STATE._pollInterval);
      return;
    }
    try {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/messages?conversation_id=eq.' + convId + '&order=created_at.asc&limit=100',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      );
      const msgs = await r.json() || [];
      if (msgs.length !== STATE.messagesConv.length) {
        STATE.messagesConv = msgs;
        renderMessages();
      }
    } catch(e) {}
  }, 3000);
}

function desaronnerRealtime() {
  if (STATE._pollInterval) {
    clearInterval(STATE._pollInterval);
    STATE._pollInterval = null;
  }
  STATE.currentConvId = null;
}

// ============================================================
// DÉMARRER UNE CONVERSATION
// ============================================================

async function demarrerConversation(entrepriseId, entrepriseEmail, comptableEmail) {
  const uid = sb.user?.id;
  const role = sb.user?.user_metadata?.role || 'entreprise';

  // Déterminer les IDs selon le rôle
  let entId = entrepriseId || uid;
  let entEmail = entrepriseEmail || sb.user?.email;
  let cptEmail = comptableEmail;

  if (role === 'entreprise') {
    entId = uid;
    entEmail = sb.user?.email;
    // cptEmail doit être fourni
  } else {
    // role === 'comptable'
    cptEmail = sb.user?.email;
    // entId et entEmail doivent être fournis
  }

  if (!cptEmail || !entId) {
    showToast('Impossible d\'ouvrir la conversation', 'error');
    return;
  }

  const convId = getConvId(entId, cptEmail);

  // Créer la conversation si elle n'existe pas
  try {
    await fetch(SUPABASE_URL + '/rest/v1/conversations', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore,return=minimal'
      },
      body: JSON.stringify({
        id: convId,
        comptable_email: cptEmail,
        entreprise_id: entId,
        entreprise_email: entEmail,
        dernier_message: '',
        derniere_activite: new Date().toISOString()
      })
    });

    // Add to local state if not there
    if (!(STATE.conversations || []).find(function(c) { return c.id === convId; })) {
      STATE.conversations = STATE.conversations || [];
      STATE.conversations.unshift({
        id: convId,
        comptable_email: cptEmail,
        entreprise_id: entId,
        entreprise_email: entEmail,
        dernier_message: '',
        derniere_activite: new Date().toISOString()
      });
    }

    await ouvrirConversation(convId);

  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// Shortcut: démarrer conv avec comptable lié
async function messagerAvecComptable() {
  const uid = sb.user?.id;
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + uid + '&statut=eq.acceptee&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const invs = await r.json() || [];
    if (!invs.length) { showToast('Aucun comptable lié', 'error'); return; }
    await demarrerConversation(uid, sb.user?.email, invs[0].comptable_email);
  } catch(e) { showToast('Erreur', 'error'); }
}

// Shortcut: démarrer conv avec une entreprise (côté comptable)
async function messagerAvecEntreprise(entrepriseId, entrepriseEmail) {
  await demarrerConversation(entrepriseId, entrepriseEmail, sb.user?.email);
}
