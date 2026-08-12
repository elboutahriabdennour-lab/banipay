// ZELTO — partage-ecran.js — Partage d'écran + appel vocal (support <-> utilisateur)
// ============================================================
// PÉRIMÈTRE HONNÊTE : partage d'écran EN VISUALISATION SEULE (pas de
// prise de contrôle), plus un appel vocal simple. La personne qui
// partage garde entièrement la main ; elle peut arrêter à tout moment.
//
// CORRECTIF IMPORTANT (retour terrain) : la version précédente demandait
// aux DEUX côtés de cliquer sur le même bouton "Partager l'écran", sans
// que l'ordre soit clair — si l'agent ne cliquait pas EN PREMIER (pour se
// mettre en écoute), rien ne se passait visiblement côté entreprise,
// donnant l'impression que "ça ne marche pas". Refait en vraie demande/
// acceptation : celui qui clique en premier envoie une DEMANDE claire,
// affichée à l'autre avec un bouton "Accepter" — plus d'ambiguïté sur qui
// doit cliquer quoi en premier.
//
// Fonctionne en pair-à-pair direct (WebRTC) — aucune vidéo/audio ne
// transite par nos serveurs, seuls de petits messages de connexion
// passent par Supabase le temps d'établir la connexion directe.

const _RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

STATE._appelEnCours = STATE._appelEnCours || null; // { pc, ticketId, monLabel, pollTimer, dernierIdSignal, type }
STATE._pollDemandesTimer = STATE._pollDemandesTimer || null;
STATE._dernierIdDemandes = STATE._dernierIdDemandes || 0;

// ============================================================
// ÉCOUTE PASSIVE DES DEMANDES — démarrée dès l'ouverture du chat (des
// DEUX côtés), pour que "Le support demande votre écran" apparaisse
// automatiquement, sans que la personne ait besoin d'avoir déjà cliqué
// quoi que ce soit elle-même.
// ============================================================
function demarrerEcouteDemandesAppel(ticketId) {
  arreterEcouteDemandesAppel();
  STATE._dernierIdDemandes = 0;
  const monLabel = STATE.monRoleSupport ? 'agent' : 'user';
  STATE._pollDemandesTimer = setInterval(async function() {
    if (STATE._appelEnCours) return; // déjà en communication, pas besoin d'écouter de nouvelles demandes
    try {
      const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_signalisation_partage', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ticket_id: ticketId, p_depuis_id: STATE._dernierIdDemandes })
      });
      const messages = resp.ok ? ((await resp.json()) || []) : [];
      for (const msg of messages) {
        STATE._dernierIdDemandes = Math.max(STATE._dernierIdDemandes, msg.id);
        if (msg.auteur === monLabel) continue;
        if (msg.type_message === 'demande_partage') {
          afficherPropositionAppel(ticketId, 'ecran', msg.auteur);
        } else if (msg.type_message === 'demande_appel_vocal') {
          afficherPropositionAppel(ticketId, 'voix', msg.auteur);
        }
      }
    } catch(e) {}
  }, 2500);
}

function arreterEcouteDemandesAppel() {
  clearInterval(STATE._pollDemandesTimer);
  STATE._pollDemandesTimer = null;
}

function afficherPropositionAppel(ticketId, type, deQui) {
  const zone = el('proposition-appel');
  if (!zone) return;
  const libelle = type === 'ecran' ? '🖥️ demande à voir votre écran' : '🎙️ vous propose un appel vocal';
  zone.style.display = 'flex';
  zone.innerHTML =
    '<span style="flex:1;font-size:12px;color:#6A4E85">' + (deQui === 'agent' ? 'Le support' : 'Le client') + ' ' + libelle + '</span>' +
    '<button onclick="accepterProposition(\'' + type + '\')" style="padding:6px 14px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Accepter</button>' +
    '<span onclick="el(\'proposition-appel\').style.display=\'none\'" style="padding:6px 10px;color:#9C9186;font-size:11px;cursor:pointer">Ignorer</span>';
}

function accepterProposition(type) {
  el('proposition-appel') && (el('proposition-appel').style.display = 'none');
  if (type === 'ecran') demarrerPartageEcran(STATE._chatTicketId);
  else demarrerAppelVocal(STATE._chatTicketId);
}

// ============================================================
// DEMANDER (bouton cliqué en premier par l'une ou l'autre partie) —
// envoie juste le signal de demande, n'ouvre PAS encore la caméra/écran :
// on attend que l'autre partie accepte explicitement, des deux côtés.
// ============================================================
function demanderPartageEcranDepuisChat() {
  if (!STATE._chatTicketId) return;
  _envoyerSignalPartage(STATE._chatTicketId, 'demande_partage', {});
  showToast('🖥️ Demande de partage d\'écran envoyée', 'success');
  // On se met aussi en écoute active immédiate, au cas où l'autre partie
  // accepte très vite (avant même que le sondage passif ne l'attrape).
  rejoindrePartageEcran(STATE._chatTicketId);
}

function demanderAppelVocalDepuisChat() {
  if (!STATE._chatTicketId) return;
  _envoyerSignalPartage(STATE._chatTicketId, 'demande_appel_vocal', {});
  showToast('🎙️ Proposition d\'appel vocal envoyée', 'success');
  rejoindreAppelVocal(STATE._chatTicketId);
}

// ============================================================
// PARTAGE D'ÉCRAN — celui qui ACCEPTE ouvre son écran et envoie l'offre
// ============================================================
async function demarrerPartageEcran(ticketId) {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    await _etablirConnexion(ticketId, stream, 'ecran');
    const statutEl = el('partage-ecran-statut');
    if (statutEl) statutEl.textContent = '🟢 Partage d\'écran en cours';
    stream.getVideoTracks()[0].onended = function() { terminerAppel(); };
    el('zone-video-partage') && (el('zone-video-partage').style.display = 'block');
  } catch(e) {
    if (e.name === 'NotAllowedError') { showToast('Partage annulé', 'error'); return; }
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function rejoindrePartageEcran(ticketId) {
  await _ecouterOffre(ticketId, 'ecran');
  el('zone-video-partage') && (el('zone-video-partage').style.display = 'block');
}

// ============================================================
// APPEL VOCAL
// ============================================================
async function demarrerAppelVocal(ticketId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await _etablirConnexion(ticketId, stream, 'voix');
    const statutEl = el('partage-ecran-statut');
    if (statutEl) statutEl.textContent = '🟢 Appel vocal en cours';
    showToast('🎙️ Micro activé — appel en cours', 'success');
  } catch(e) {
    if (e.name === 'NotAllowedError') { showToast('Micro refusé', 'error'); return; }
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function rejoindreAppelVocal(ticketId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    STATE._flusMicEnAttente = stream;
  } catch(e) {}
  await _ecouterOffre(ticketId, 'voix');
}

// ============================================================
// CŒUR COMMUN — établissement de connexion (côté qui ENVOIE l'offre)
// ============================================================
async function _etablirConnexion(ticketId, stream, type) {
  const pc = new RTCPeerConnection(_RTC_CONFIG);
  const monLabel = STATE.monRoleSupport ? 'agent' : 'user';
  STATE._appelEnCours = { pc, ticketId, monLabel, pollTimer: null, dernierIdSignal: 0, type, streamLocal: stream };

  stream.getTracks().forEach(function(track) { pc.addTrack(track, stream); });

  // Si un micro était déjà ouvert en attente (appel vocal démarré des
  // deux côtés en même temps), on l'ajoute aussi.
  if (STATE._flusMicEnAttente && type !== 'voix') {
    STATE._flusMicEnAttente.getTracks().forEach(function(t) { pc.addTrack(t, STATE._flusMicEnAttente); });
  }

  pc.ontrack = function(e) {
    if (e.track.kind === 'video') {
      const videoEl = el('video-partage-ecran');
      if (videoEl) videoEl.srcObject = e.streams[0];
    } else {
      _jouerAudioDistant(e.streams[0]);
    }
  };
  pc.onicecandidate = function(e) {
    if (e.candidate) _envoyerSignalPartage(ticketId, 'ice_candidate', e.candidate.toJSON());
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await _envoyerSignalPartage(ticketId, 'offer', { sdp: offer.sdp, type: offer.type });

  _demarrerSondageConnexion(ticketId, monLabel, async function(msg) {
    if (msg.type_message === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.contenu));
    } else if (msg.type_message === 'ice_candidate') {
      try { await pc.addIceCandidate(msg.contenu); } catch(e) {}
    } else if (msg.type_message === 'fin') {
      terminerAppel();
    }
  });
}

// Côté qui ÉCOUTE une offre entrante et y répond
async function _ecouterOffre(ticketId, type) {
  const pc = new RTCPeerConnection(_RTC_CONFIG);
  const monLabel = STATE.monRoleSupport ? 'agent' : 'user';
  STATE._appelEnCours = { pc, ticketId, monLabel, pollTimer: null, dernierIdSignal: 0, type, streamLocal: null };

  pc.ontrack = function(e) {
    if (e.track.kind === 'video') {
      const videoEl = el('video-partage-ecran');
      if (videoEl) videoEl.srcObject = e.streams[0];
    } else {
      _jouerAudioDistant(e.streams[0]);
    }
  };
  pc.onicecandidate = function(e) {
    if (e.candidate) _envoyerSignalPartage(ticketId, 'ice_candidate', e.candidate.toJSON());
  };

  _demarrerSondageConnexion(ticketId, monLabel, async function(msg) {
    if (msg.type_message === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.contenu));
      if (STATE._flusMicEnAttente) {
        STATE._flusMicEnAttente.getTracks().forEach(function(t) { pc.addTrack(t, STATE._flusMicEnAttente); });
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await _envoyerSignalPartage(ticketId, 'answer', { sdp: answer.sdp, type: answer.type });
    } else if (msg.type_message === 'ice_candidate') {
      try { await pc.addIceCandidate(msg.contenu); } catch(e) {}
    } else if (msg.type_message === 'fin') {
      terminerAppel();
    }
  });
  showToast('⏳ En attente de connexion...', 'success');
}

function _jouerAudioDistant(stream) {
  let audioEl = document.getElementById('audio-appel-distant');
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = 'audio-appel-distant';
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
}

function terminerAppel() {
  const a = STATE._appelEnCours;
  if (!a) return;
  if (a.pc) { a.pc.getSenders().forEach(function(s) { if (s.track) s.track.stop(); }); a.pc.close(); }
  if (a.pollTimer) clearInterval(a.pollTimer);
  if (a.streamLocal) a.streamLocal.getTracks().forEach(function(t) { t.stop(); });
  if (STATE._flusMicEnAttente) { STATE._flusMicEnAttente.getTracks().forEach(function(t) { t.stop(); }); STATE._flusMicEnAttente = null; }
  if (a.ticketId) _envoyerSignalPartage(a.ticketId, 'fin', {});
  STATE._appelEnCours = null;
  const videoEl = el('video-partage-ecran');
  if (videoEl) videoEl.srcObject = null;
  el('zone-video-partage') && (el('zone-video-partage').style.display = 'none');
  const audioEl = document.getElementById('audio-appel-distant');
  if (audioEl) audioEl.srcObject = null;
  const statutEl = el('partage-ecran-statut');
  if (statutEl) statutEl.textContent = '⚪ Communication terminée';
  showToast('Communication terminée', 'success');
}

// Alias conservé pour compatibilité avec l'ancien nom utilisé ailleurs
function arreterPartageEcran() { terminerAppel(); }

// ============================================================
// SIGNALISATION (sondage — pas de temps réel disponible dans cette app)
// ============================================================
async function _envoyerSignalPartage(ticketId, type, contenu) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_signalisation_partage', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ticket_id: ticketId, p_type: type, p_contenu: contenu })
    });
  } catch(e) {}
}

function _demarrerSondageConnexion(ticketId, monLabel, onMessage) {
  const a = STATE._appelEnCours;
  a.pollTimer = setInterval(async function() {
    try {
      const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_signalisation_partage', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ticket_id: ticketId, p_depuis_id: a.dernierIdSignal })
      });
      const messages = resp.ok ? ((await resp.json()) || []) : [];
      for (const msg of messages) {
        a.dernierIdSignal = Math.max(a.dernierIdSignal, msg.id);
        if (msg.auteur === monLabel) continue;
        if (msg.type_message === 'demande_partage' || msg.type_message === 'demande_appel_vocal') continue;
        await onMessage(msg);
      }
    } catch(e) {}
  }, 1500);
}
