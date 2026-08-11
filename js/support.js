// ZELTO — support.js — Support (email, WhatsApp, formulaire, chatbot FAQ)
// ============================================================
// PÉRIMÈTRE HONNÊTE : le "chatbot" ci-dessous n'est PAS une IA — c'est un
// simple assistant à mots-clés qui répond aux questions fréquentes déjà
// prévues ci-dessous, avec un renvoi vers le vrai support humain si aucune
// correspondance n'est trouvée. À ajuster : email/téléphone de support
// (placeholders ci-dessous, à remplacer par les vraies coordonnées).

const SUPPORT_EMAIL = 'support@zelto.ma'; // ⚠️ À remplacer par la vraie adresse
const SUPPORT_TEL = '+212600000000'; // ⚠️ À remplacer par le vrai numéro

function contacterSupportEmail() {
  const sujet = encodeURIComponent('Support Zelto');
  const corps = encodeURIComponent('Bonjour,\n\nDécrivez votre problème ici...\n\nCompte : ' + (sb.user?.email || ''));
  window.location.href = 'mailto:' + SUPPORT_EMAIL + '?subject=' + sujet + '&body=' + corps;
}

function contacterSupportWhatsApp() {
  const msg = encodeURIComponent('Bonjour, j\'ai besoin d\'aide sur Zelto (compte: ' + (sb.user?.email || '') + ')');
  window.open('https://wa.me/' + SUPPORT_TEL.replace(/[^0-9]/g,'') + '?text=' + msg, '_blank');
}

async function envoyerTicketSupport() {
  const sujet = (el('sup-sujet')?.value || '').trim();
  const message = (el('sup-message')?.value || '').trim();
  if (!sujet || !message) { showToast('Sujet et message obligatoires', 'error'); return; }
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/creer_ticket_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_email: sb.user?.email || '',
        p_nom: sb.user?.user_metadata?.nom || '',
        p_sujet: sujet,
        p_message: message
      })
    });
    if (!resp.ok) { showToast('Erreur — réessayez ou utilisez l\'email/WhatsApp', 'error'); return; }
    el('sup-sujet') && (el('sup-sujet').value = '');
    el('sup-message') && (el('sup-message').value = '');
    showToast('✅ Message envoyé — nous vous répondrons par email', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// ESPACE AGENT SUPPORT — accès réservé, voir migration_phase31
// ============================================================
// PÉRIMÈTRE : la personne doit déjà avoir un compte Zelto (entreprise ou
// comptable). Son accès à ce tableau de bord se débloque uniquement si son
// email figure dans la table agents_support (ajout manuel via Supabase
// Table Editor pour le premier agent — pas d'auto-inscription possible,
// volontairement, pour éviter qu'un accès aussi sensible se donne tout
// seul).

async function ouvrirEspaceSupport() {
  if (!sb.user?.id) {
    showToast('Connectez-vous d\'abord avec votre compte Zelto', 'error');
    return;
  }
  showToast('⏳ Vérification des droits...');
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/suis_je_agent_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const estAgent = resp.ok ? await resp.json() : false;
    if (!estAgent) {
      showToast('⛔ Ce compte n\'a pas accès à l\'espace support', 'error');
      return;
    }
    const respRole = await fetch(SUPABASE_URL + '/rest/v1/rpc/mon_role_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.monRoleSupport = respRole.ok ? await respRole.json() : 'agent';
    goScreen('espace-support', null);
    switchOngletSupport('tickets');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

STATE.ticketsSupport = STATE.ticketsSupport || [];
STATE.statsSupport = STATE.statsSupport || null;
STATE.agentsSupport = STATE.agentsSupport || [];
STATE._ongletSupport = STATE._ongletSupport || 'tickets';

// ============================================================
// VUE À ONGLETS — Tickets / Statistiques / Agents (Agents visible par
// tous les agents, gestion réservée aux admins — voir migration_phase39)
// ============================================================
function switchOngletSupport(onglet) {
  STATE._ongletSupport = onglet;
  document.querySelectorAll('#screen-espace-support .support-tab').forEach(function(b) {
    b.style.background = b.dataset.onglet === onglet ? '#1F6F72' : '#EAE4DA';
    b.style.color = b.dataset.onglet === onglet ? '#fff' : '#6B5F54';
  });
  if (onglet === 'tickets') { chargerTicketsSupport(); }
  else if (onglet === 'stats') { chargerStatsSupport(); }
  else if (onglet === 'agents') { chargerAgentsSupport(); }
  ['tickets', 'stats', 'agents'].forEach(function(o) {
    const zone = el('support-vue-' + o);
    if (zone) zone.style.display = (o === onglet) ? 'block' : 'none';
  });
}

async function chargerTicketsSupport() {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_tous_tickets_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.ticketsSupport = resp.ok ? ((await resp.json()) || []) : [];
  } catch(e) { STATE.ticketsSupport = []; }
  renderTicketsSupport();
}

function renderTicketsSupport() {
  const container = el('tickets-support-liste');
  if (!container) return;
  const tickets = STATE.ticketsSupport || [];
  const filtre = STATE._filtreTicketsSupport || 'tous';
  const filtres = filtre === 'tous' ? tickets : tickets.filter(function(t) { return t.statut === filtre; });

  const statutLabel = { nouveau: '🆕 Nouveau', en_cours: '⏳ En cours', resolu: '✅ Résolu' };
  const statutColor = { nouveau: '#B8860B', en_cours: '#1F6F72', resolu: '#6E8F4E' };

  container.innerHTML = !filtres.length
    ? '<div class="empty"><div class="empty-ico">🎫</div><div class="empty-title">Aucun ticket</div></div>'
    : filtres.map(function(t) {
        return '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
            '<div><div style="font-size:13px;font-weight:700">' + escapeHTML(t.sujet||'') + '</div>' +
            '<div style="font-size:11px;color:#9C9186">' + escapeHTML(t.nom||t.email||'') + ' · ' + escapeHTML(t.email||'') + '</div></div>' +
            '<span style="font-size:10px;font-weight:600;color:' + (statutColor[t.statut]||'#9C9186') + '">' + (statutLabel[t.statut]||t.statut) + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#6B5F54;background:#F1EEE8;padding:8px;border-radius:8px;margin-bottom:8px">' + escapeHTML(t.message||'') + '</div>' +
          '<div style="font-size:10px;color:#9C9186;margin-bottom:8px">' + formatDateTime(t.created_at) + '</div>' +
          '<div style="display:flex;gap:6px">' +
            (t.statut !== 'en_cours' ? '<button onclick="changerStatutTicket(' + t.id + ',\'en_cours\')" style="flex:1;padding:7px;background:#E9F4F3;color:#1F6F72;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">⏳ En cours</button>' : '') +
            (t.statut !== 'resolu' ? '<button onclick="changerStatutTicket(' + t.id + ',\'resolu\')" style="flex:1;padding:7px;background:#EEF3E4;color:#6E8F4E;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">✅ Résolu</button>' : '') +
            '<button onclick="ouvrirChatTicket(' + t.id + ',\'' + escapeHTML(t.sujet||'').replace(/'/g,"\\'") + '\')" style="flex:1;padding:7px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">💬 Discuter</button>' +
          '</div>' +
        '</div>';
      }).join('');
}

function filtrerTicketsSupport(filtre, btn) {
  STATE._filtreTicketsSupport = filtre;
  document.querySelectorAll('#screen-espace-support .ftab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderTicketsSupport();
}

// ============================================================
// ONGLET STATISTIQUES
// ============================================================
async function chargerStatsSupport() {
  const zone = el('support-stats-content');
  if (zone) zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_stats_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.statsSupport = resp.ok ? await resp.json() : null;
  } catch(e) { STATE.statsSupport = null; }
  renderStatsSupport();
}

function renderStatsSupport() {
  const zone = el('support-stats-content');
  if (!zone) return;
  const s = STATE.statsSupport;
  if (!s) { zone.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><div class="empty-title">Statistiques indisponibles</div></div>'; return; }
  const cartes = [
    { label: 'Total', val: s.total, couleur: '#2A2420' },
    { label: 'Nouveaux', val: s.nouveau, couleur: '#B8860B' },
    { label: 'En cours', val: s.en_cours, couleur: '#1F6F72' },
    { label: 'Résolus', val: s.resolu, couleur: '#6E8F4E' },
  ];
  zone.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
    cartes.map(function(c) {
      return '<div style="background:#fff;border-radius:14px;padding:16px;text-align:center;border:1px solid #E3DCCF">' +
        '<div style="font-size:24px;font-weight:800;color:' + c.couleur + '">' + c.val + '</div>' +
        '<div style="font-size:11px;color:#9C9186;margin-top:4px">' + c.label + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

// ============================================================
// ONGLET AGENTS — visible par tous les agents, gestion (ajout/retrait)
// réservée aux admins.
// ============================================================
async function chargerAgentsSupport() {
  const zone = el('support-agents-content');
  if (zone) zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_agents_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.agentsSupport = resp.ok ? ((await resp.json()) || []) : [];
  } catch(e) { STATE.agentsSupport = []; }
  renderAgentsSupport();
}

function renderAgentsSupport() {
  const zone = el('support-agents-content');
  if (!zone) return;
  const estAdmin = STATE.monRoleSupport === 'admin';
  const agents = (STATE.agentsSupport || []).filter(function(a) { return a.actif; });

  let html = estAdmin
    ? '<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:14px;border:1px solid #E3DCCF">' +
        '<div style="font-size:12px;font-weight:700;margin-bottom:10px">📧 Inviter un agent par email</div>' +
        '<input id="nouvel-agent-email" class="f-inp" placeholder="Email" style="margin-bottom:8px">' +
        '<input id="nouvel-agent-nom" class="f-inp" placeholder="Nom (optionnel)" style="margin-bottom:8px">' +
        '<select id="nouvel-agent-role" class="f-inp" style="margin-bottom:10px"><option value="agent">Agent</option><option value="admin">Admin</option></select>' +
        '<button onclick="ajouterAgentSupport()" style="width:100%;padding:9px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">📤 Envoyer l\'invitation</button>' +
      '</div>'
    : '';

  html += agents.map(function(a) {
    return '<div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #E3DCCF;display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-size:12px;font-weight:700">' + escapeHTML(a.nom||a.email) + '</div>' +
      '<div style="font-size:10px;color:#9C9186">' + escapeHTML(a.email) + ' · ' + (a.role === 'admin' ? '👑 Admin' : 'Agent') + '</div></div>' +
      (estAdmin ? '<button onclick="retirerAgentSupport(' + a.id + ')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Retirer</button>' : '') +
    '</div>';
  }).join('');

  zone.innerHTML = html || '<div class="empty"><div class="empty-ico">👥</div><div class="empty-title">Aucun agent</div></div>';
}

async function ajouterAgentSupport() {
  const email = (el('nouvel-agent-email')?.value || '').trim();
  const nom = (el('nouvel-agent-nom')?.value || '').trim();
  const role = el('nouvel-agent-role')?.value || 'agent';
  if (!email || !email.includes('@')) { showToast('Entrez un email valide', 'error'); return; }
  showToast('⏳ Envoi de l\'invitation...');
  try {
    // Passe par la fonction Edge (invite-support-agent) plutôt que
    // d'ajouter directement en base — ça envoie une vraie invitation par
    // email, pas juste un ajout silencieux dans la liste blanche.
    const resp = await fetch(SUPABASE_URL + '/functions/v1/invite-support-agent', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, nom, role })
    });
    const data = await resp.json().catch(function(){ return {}; });
    if (!resp.ok) { showToast('❌ ' + (data.error || 'Erreur — droits insuffisants ?'), 'error'); return; }
    el('nouvel-agent-email') && (el('nouvel-agent-email').value = '');
    el('nouvel-agent-nom') && (el('nouvel-agent-nom').value = '');
    showToast('✅ Invitation envoyée par email à ' + email, 'success');
    chargerAgentsSupport();
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function retirerAgentSupport(agentId) {
  if (!confirm('Retirer cet agent ?')) return;
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/retirer_agent_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_agent_id: agentId })
    });
    if (!resp.ok) { showToast('Erreur — droits insuffisants ?', 'error'); return; }
    showToast('Agent retiré', 'success');
    chargerAgentsSupport();
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}
async function changerStatutTicket(ticketId, statut) {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/repondre_ticket_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ticket_id: ticketId, p_statut: statut })
    });
    if (!resp.ok) { showToast('Erreur', 'error'); return; }
    const t = STATE.ticketsSupport.find(function(x) { return x.id === ticketId; });
    if (t) t.statut = statut;
    renderTicketsSupport();
    showToast('✅ Statut mis à jour', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// CHATBOT FAQ — mots-clés, pas une IA (voir note en tête de fichier)
// ============================================================
const FAQ_ZELTO = [
  { mots: ['facture', 'créer une facture', 'nouvelle facture'], reponse: 'Pour créer une facture : Dashboard → "Facture" (action rapide), remplissez le client et les lignes, puis "Sauvegarder".' },
  { mots: ['devis'], reponse: 'Pour créer un devis : Dashboard → "Devis", remplissez le client et les lignes. Une fois accepté par le client, vous pouvez le convertir en facture d\'un clic.' },
  { mots: ['tva', 'déclarer'], reponse: 'L\'écran TVA (Dashboard → TVA) récapitule votre TVA collectée par mois. Si vous avez un comptable lié, il peut la vérifier et vous notifier.' },
  { mots: ['comptable', 'inviter'], reponse: 'Profil → section "Mon comptable" → "Inviter mon comptable", puis saisissez son email.' },
  { mots: ['gratuit', 'prix', 'abonnement', 'payant'], reponse: 'Contactez-nous par email ou WhatsApp pour connaître les conditions d\'utilisation actuelles.' },
  { mots: ['supprimer', 'compte', 'désinscrire'], reponse: 'Profil → Paramètres → Sécurité → "Supprimer mon compte". Cette action est irréversible.' },
  { mots: ['mot de passe', 'password'], reponse: 'Profil → Paramètres → Sécurité → "Changer le mot de passe". Si vous êtes déconnecté, utilisez "Mot de passe oublié" sur l\'écran de connexion.' },
  { mots: ['client', 'ajouter un client'], reponse: 'Écran Clients → "+ Ajouter" — manuellement, via un lien Zelto, ou en import CSV.' },
  { mots: ['stock'], reponse: 'Activez le suivi de stock sur un article (Catalogue → modifier l\'article) pour voir sa quantité et recevoir une alerte si elle est basse.' },
  { mots: ['bon de commande', 'bc'], reponse: 'Paramètres → "Bons de commande" ou directement depuis Achats. Vous pouvez aussi en recevoir automatiquement quand un client accepte un devis.' },
];

function envoyerMessageChatbot() {
  const input = el('chatbot-input');
  const question = (input?.value || '').trim();
  if (!question) return;
  ajouterMessageChatbot(question, true);
  if (input) input.value = '';

  const ql = question.toLowerCase();
  const match = FAQ_ZELTO.find(function(faq) {
    return faq.mots.some(function(m) { return ql.includes(m); });
  });

  setTimeout(function() {
    if (match) {
      ajouterMessageChatbot(match.reponse, false);
    } else {
      ajouterMessageChatbot('Je n\'ai pas de réponse toute prête pour ça 🙏 — contactez le support par email, WhatsApp ou le formulaire ci-dessus, une vraie personne vous répondra.', false);
    }
  }, 400);
}

function ajouterMessageChatbot(texte, estUtilisateur) {
  const zone = el('chatbot-messages');
  if (!zone) return;
  const bulle = document.createElement('div');
  bulle.style.cssText = 'display:flex;justify-content:' + (estUtilisateur ? 'flex-end' : 'flex-start') + ';margin-bottom:8px';
  bulle.innerHTML = '<div style="max-width:80%;padding:9px 13px;border-radius:' + (estUtilisateur ? '14px 14px 4px 14px' : '14px 14px 14px 4px') + ';background:' + (estUtilisateur ? '#1F6F72' : '#F1EEE8') + ';color:' + (estUtilisateur ? '#fff' : '#2A2420') + ';font-size:13px;line-height:1.4">' + escapeHTML(texte) + '</div>';
  zone.appendChild(bulle);
  zone.scrollTop = zone.scrollHeight;
}

function initChatbot() {
  const zone = el('chatbot-messages');
  if (zone && !zone.dataset.init) {
    zone.dataset.init = '1';
    ajouterMessageChatbot('👋 Bonjour ! Posez-moi une question sur Zelto (facture, devis, TVA, comptable...). Si je ne sais pas répondre, contactez le support directement au-dessus.', false);
  }
}
