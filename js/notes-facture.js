// ZELTO — notes-facture.js — Notes bidirectionnelles entreprise <-> comptable
// ============================================================
// Un fil de discussion attaché à une facture précise. Les deux parties
// (l'entreprise et son comptable) peuvent écrire et se répondre — avant,
// seul le comptable pouvait écrire, et l'entreprise ne voyait rien.
STATE._notesFactureId = STATE._notesFactureId || null;
STATE._notesFactureListe = STATE._notesFactureListe || [];
async function ouvrirNotesFacture(factureId) {
  STATE._notesFactureId = factureId;
  const zone = document.getElementById('notes-facture-zone');
  if (!zone) return;
  zone.style.display = 'block';
  zone.innerHTML = '<div style="text-align:center;padding:16px;color:#9C9186;font-size:12px">⏳ Chargement...</div>';
  await chargerNotesFacture();
}
async function chargerNotesFacture() {
  if (!STATE._notesFactureId) return;
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_notes_facture', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_facture_id: STATE._notesFactureId })
    });
    STATE._notesFactureListe = resp.ok ? ((await resp.json()) || []) : [];
  } catch(e) { STATE._notesFactureListe = []; }
  renderNotesFacture();
}
function renderNotesFacture() {
  const zone = document.getElementById('notes-facture-zone');
  if (!zone) return;
  const notes = STATE._notesFactureListe || [];
  // FIX (retour utilisateur) : comparait avant par ROLE ('entreprise' vs
  // 'comptable'), pas par identité individuelle — dès qu'un 2e membre de
  // l'équipe entreprise écrit une note, chacun voyait les notes de
  // l'autre affichées comme les siennes propres, sans distinction de qui
  // avait vraiment écrit quoi. Comparé maintenant sur l'identité réelle
  // (auteur_id), le même principe que la correction déjà faite pour les
  // devis (client_id) plus tôt ce soir.
  const monId = sb.user?.id;
  zone.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF;margin-top:14px">' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:10px">💬 Notes' + (notes.length ? ' (' + notes.length + ')' : '') + '</div>' +
      '<div style="max-height:240px;overflow-y:auto;margin-bottom:10px">' +
        (!notes.length
          ? '<div style="text-align:center;padding:16px;color:#9C9186;font-size:12px">Aucune note pour l\'instant</div>'
          : notes.map(function(n) {
              const estMoi = n.auteur_id === monId;
              const nomAffiche = estMoi ? 'Vous' : (n.auteur_nom || (n.auteur_role === 'comptable' ? 'Comptable' : 'Entreprise'));
              return '<div style="display:flex;justify-content:' + (estMoi ? 'flex-end' : 'flex-start') + ';margin-bottom:8px">' +
                '<div style="max-width:80%;background:' + (estMoi ? '#1F6F72' : '#F1EEE8') + ';color:' + (estMoi ? '#fff' : '#2A2420') + ';padding:8px 12px;border-radius:12px;font-size:12px">' +
                  '<div style="font-size:9px;opacity:0.7;margin-bottom:2px">' + escapeHTML(nomAffiche) + '</div>' +
                  escapeHTML(n.contenu||'') +
                '</div></div>';
            }).join('')
        ) +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<input id="nouvelle-note-facture" class="f-inp" placeholder="Écrire une note..." style="flex:1;font-size:12px" onkeypress="if(event.key===\'Enter\')envoyerNoteFacture()">' +
        '<button onclick="envoyerNoteFacture()" style="padding:0 14px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit">➤</button>' +
      '</div>' +
    '</div>';
}
async function envoyerNoteFacture() {
  const input = document.getElementById('nouvelle-note-facture');
  const contenu = (input?.value || '').trim();
  if (!contenu || !STATE._notesFactureId) return;
  input.value = '';
  try {
    // FIX (audit workflow) : sans vérifier r.ok, un échec silencieux
    // (fetch ne lève pas d'exception sur une erreur HTTP) effaçait quand
    // même le texte tapé, sans aucun message — la note était perdue sans
    // que la personne s'en rende compte.
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/ajouter_note_facture', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_facture_id: STATE._notesFactureId, p_contenu: contenu })
    });
    if (!r.ok) {
      if (input) input.value = contenu; // restaure le texte tapé
      showToast('❌ Échec de l\'envoi — réessayez', 'error');
      return;
    }
    await chargerNotesFacture();
  } catch(e) {
    if (input) input.value = contenu;
    showToast('Erreur envoi: ' + e.message, 'error');
  }
}
