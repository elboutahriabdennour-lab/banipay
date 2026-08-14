// ZELTO — rh.js — Registre du personnel
// ============================================================
// PÉRIMÈTRE : un registre simple (fiche employé, poste, date d'entrée,
// salaire mensuel, jours de travail). Ce n'est PAS un système de paie —
// pas de bulletin de paie légal, pas de calcul de cotisations CNSS/AMO ni
// de retenue à la source IR. Juste un carnet d'informations pour
// l'entreprise, pas un outil de déclaration officielle.

STATE.employes = STATE.employes || [];

async function loadEmployes() {
  try {
    STATE.employes = (await sb.get('employes', 'user_id=eq.' + (STATE.entrepriseId || sb.user.id) + '&order=date_entree.desc')) || [];
  } catch(e) { STATE.employes = []; }
  renderEmployes();
}

function renderEmployes() {
  const container = el('employes-liste');
  if (!container) return;
  const employes = STATE.employes || [];

  const actifs = employes.filter(function(e) { return e.statut === 'actif'; });
  const masseSalariale = actifs.reduce(function(s, e) { return s + (Number(e.salaire_mensuel) || 0); }, 0);

  const resume = el('employes-resume');
  if (resume) {
    resume.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
        '<div style="background:#E9F4F3;border-radius:12px;padding:12px"><div style="font-size:11px;color:#1F6F72;font-weight:600">👥 Effectif actif</div><div style="font-size:18px;font-weight:800;color:#1F6F72">' + actifs.length + '</div></div>' +
        '<div style="background:#FBF0DA;border-radius:12px;padding:12px"><div style="font-size:11px;color:#A67A16;font-weight:600">💰 Masse salariale/mois</div><div style="font-size:18px;font-weight:800;color:#A67A16">' + fmt(masseSalariale) + ' MAD</div></div>' +
      '</div>';
  }

  container.innerHTML = !employes.length
    ? '<div class="empty"><div class="empty-ico">👥</div><div class="empty-title">Aucun employé enregistré</div></div>'
    : employes.map(function(e) {
        const statutColor = e.statut === 'actif' ? '#6E8F4E' : '#9C9186';
        const statutLabel = e.statut === 'actif' ? 'Actif' : 'Inactif';
        return '<div class="card" onclick="ouvrirFicheEmploye(' + e.id + ')">' +
          '<div class="card-ico" style="background:#E9F4F3">🧑‍💼</div>' +
          '<div class="card-body"><div class="card-name">' + escapeHTML(e.nom||'') + '</div>' +
          '<div class="card-ref">' + escapeHTML(e.poste||'') + (e.date_entree ? ' · depuis ' + e.date_entree : '') + '</div>' +
          '<span style="font-size:9px;font-weight:600;color:' + statutColor + '">' + statutLabel + '</span></div>' +
          '<div class="card-end"><div class="card-amount">' + fmt(e.salaire_mensuel||0) + ' MAD</div></div>' +
        '</div>';
      }).join('');
}

function initNouvelEmploye() {
  STATE._employeEnEdition = null;
  el('emp-nom') && (el('emp-nom').value = '');
  el('emp-poste') && (el('emp-poste').value = '');
  el('emp-tel') && (el('emp-tel').value = '');
  el('emp-date-entree') && (el('emp-date-entree').value = today());
  el('emp-salaire') && (el('emp-salaire').value = '');
  el('emp-notes') && (el('emp-notes').value = '');
  document.querySelectorAll('.emp-jour').forEach(function(cb) { cb.checked = false; });
  const titre = el('emp-form-titre');
  if (titre) titre.textContent = 'Nouvel employé';
}

function ouvrirFicheEmploye(id) {
  const e = (STATE.employes || []).find(function(x) { return x.id === id; });
  if (!e) return;
  STATE._employeEnEdition = id;
  el('emp-nom') && (el('emp-nom').value = e.nom || '');
  el('emp-poste') && (el('emp-poste').value = e.poste || '');
  el('emp-tel') && (el('emp-tel').value = e.telephone || '');
  el('emp-date-entree') && (el('emp-date-entree').value = e.date_entree || '');
  el('emp-salaire') && (el('emp-salaire').value = e.salaire_mensuel || '');
  el('emp-notes') && (el('emp-notes').value = e.notes || '');
  el('emp-statut') && (el('emp-statut').value = e.statut || 'actif');
  const joursActifs = (e.jours_travail || '').split(',');
  document.querySelectorAll('.emp-jour').forEach(function(cb) { cb.checked = joursActifs.includes(cb.value); });
  const titre = el('emp-form-titre');
  if (titre) titre.textContent = 'Fiche employé';
  goScreen('nouvel-employe', null);
}

async function sauvegarderEmploye() {
  const nom = (el('emp-nom')?.value || '').trim();
  if (!nom) { showToast('Le nom est obligatoire', 'error'); return; }

  const joursCoches = Array.from(document.querySelectorAll('.emp-jour:checked')).map(function(cb) { return cb.value; });

  const data = {
    user_id: (STATE.entrepriseId || sb.user.id),
    nom: nom,
    poste: el('emp-poste')?.value.trim() || '',
    telephone: el('emp-tel')?.value.trim() || '',
    date_entree: el('emp-date-entree')?.value || null,
    salaire_mensuel: parseFloat(el('emp-salaire')?.value) || 0,
    jours_travail: joursCoches.join(','),
    statut: el('emp-statut')?.value || 'actif',
    notes: el('emp-notes')?.value.trim() || '',
  };

  try {
    if (STATE._employeEnEdition) {
      await sb.patch('employes', 'id=eq.' + STATE._employeEnEdition + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), data);
      const idx = STATE.employes.findIndex(function(x) { return x.id === STATE._employeEnEdition; });
      if (idx > -1) Object.assign(STATE.employes[idx], data);
      showToast('✅ Fiche mise à jour', 'success');
    } else {
      const r = await sb.post('employes', data);
      STATE.employes.unshift((r && r[0]) || data);
      showToast('✅ Employé ajouté', 'success');
    }
    goScreen('employes', null);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function supprimerEmploye() {
  if (!STATE._employeEnEdition) return;
  if (!confirm('Retirer cet employé du registre ?')) return;
  try {
    await sb.del('employes', 'id=eq.' + STATE._employeEnEdition + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id));
    STATE.employes = STATE.employes.filter(function(x) { return x.id !== STATE._employeEnEdition; });
    showToast('Employé retiré', 'success');
    goScreen('employes', null);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
