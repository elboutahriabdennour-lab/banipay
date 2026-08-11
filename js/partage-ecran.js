// ZELTO — partage-ecran.js — Partage d'écran en direct (support <-> utilisateur)
// ============================================================
// PÉRIMÈTRE HONNÊTE : ceci est du PARTAGE D'ÉCRAN (voir uniquement) — pas
// de prise de contrôle à distance. La personne qui partage garde
// entièrement la main sur son écran ; l'agent peut seulement regarder.
// Le partage s'arrête à tout moment via le bouton natif du navigateur
// ("Arrêter le partage") ou en fermant cet écran.
//
// Fonctionne via WebRTC direct entre les deux navigateurs (aucune vidéo
// ne transite par nos serveurs) — seuls de petits messages techniques de
// connexion (offre/réponse/candidats ICE) passent par Supabase, le temps
// d'établir la connexion directe.

const _RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

STATE._partageEcran = STATE._partageEcran || { pc: null, ticketId: null, dernierIdSignal: 0, pollTimer: null, role: null };

// ============================================================
// CÔTÉ QUI PARTAGE (peut être l'utilisateur OU l'agent)
// ============================================================
async function demarrerPartageEcran(ticketId) {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const pc = new RTCPeerConnection(_RTC_CONFIG);
    const monLabel = STATE.monRoleSupport ? 'agent' : 'user';
    STATE._partageEcran = { pc, ticketId, dernierIdSignal: 0, pollTimer: null, monLabel };

    stream.getTracks().forEach(function(track) { pc.addTrack(track, stream); });
    stream.getVideoTracks()[0].onended = function() { arreterPartageEcran(); };

    pc.onicecandidate = function(e) {
      if (e.candidate) _envoyerSignalPartage(ticketId, 'ice_candidate', e.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await _envoyerSignalPartage(ticketId, 'offer', { sdp: offer.sdp, type: offer.type });

    _demarrerSondagePartage(ticketId, monLabel, async function(msg) {
      if (msg.type_message === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.contenu));
      } else if (msg.type_message === 'ice_candidate') {
        try { await pc.addIceCandidate(msg.contenu); } catch(e) {}
      } else if (msg.type_message === 'fin') {
        arreterPartageEcran();
      }
    });

    showToast('🖥️ Partage d\'écran démarré — visible par le support', 'success');
    const statutEl = el('partage-ecran-statut');
    if (statutEl) statutEl.textContent = '🟢 Partage en cours — cliquez "Arrêter le partage" (barre du navigateur) pour arrêter';
  } catch(e) {
    if (e.name === 'NotAllowedError') { showToast('Partage annulé', 'error'); return; }
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// CÔTÉ QUI REGARDE (l'agent, qui reçoit le flux)
// ============================================================
async function rejoindrePartageEcran(ticketId, videoElementId) {
  const pc = new RTCPeerConnection(_RTC_CONFIG);
  const monLabel = STATE.monRoleSupport ? 'agent' : 'user';
  STATE._partageEcran = { pc, ticketId, dernierIdSignal: 0, pollTimer: null, monLabel };

  pc.ontrack = function(e) {
    const videoEl = el(videoElementId);
    if (videoEl) videoEl.srcObject = e.streams[0];
  };
  pc.onicecandidate = function(e) {
    if (e.candidate) _envoyerSignalPartage(ticketId, 'ice_candidate', e.candidate.toJSON());
  };

  _demarrerSondagePartage(ticketId, monLabel, async function(msg) {
    if (msg.type_message === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.contenu));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await _envoyerSignalPartage(ticketId, 'answer', { sdp: answer.sdp, type: answer.type });
    } else if (msg.type_message === 'ice_candidate') {
      try { await pc.addIceCandidate(msg.contenu); } catch(e) {}
    } else if (msg.type_message === 'fin') {
      arreterPartageEcran();
    }
  });
  showToast('⏳ En attente que la personne partage son écran...', 'success');
}

function arreterPartageEcran() {
  const p = STATE._partageEcran;
  if (p.pc) { p.pc.getSenders().forEach(function(s) { if (s.track) s.track.stop(); }); p.pc.close(); }
  if (p.pollTimer) clearInterval(p.pollTimer);
  if (p.ticketId) _envoyerSignalPartage(p.ticketId, 'fin', {});
  STATE._partageEcran = { pc: null, ticketId: null, dernierIdSignal: 0, pollTimer: null, monLabel: null };
  const statutEl = el('partage-ecran-statut');
  if (statutEl) statutEl.textContent = '⚪ Partage terminé';
  showToast('Partage d\'écran terminé', 'success');
}

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

function _demarrerSondagePartage(ticketId, monLabel, onMessage) {
  const p = STATE._partageEcran;
  p.pollTimer = setInterval(async function() {
    try {
      const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_signalisation_partage', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ticket_id: ticketId, p_depuis_id: p.dernierIdSignal })
      });
      const messages = resp.ok ? ((await resp.json()) || []) : [];
      for (const msg of messages) {
        p.dernierIdSignal = Math.max(p.dernierIdSignal, msg.id);
        // Ignore ses propres messages — on ne réagit qu'à ceux envoyés
        // par l'autre partie.
        if (msg.auteur === monLabel) continue;
        await onMessage(msg);
      }
    } catch(e) {}
  }, 2000);
}
