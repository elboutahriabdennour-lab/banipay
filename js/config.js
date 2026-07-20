// BANIPAY — config.js

const SUPABASE_URL = 'https://samojsvlfcrhdpspngsp.supabase.co';

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhbW9qc3ZsZmNyaGRwc3BuZ3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODEwNTgsImV4cCI6MjA5Nzg1NzA1OH0.ulmUmEysD4BYZDFAtWADteuw6UUKwFCkD9ebLxoZS9w';


const sb = {
  token: null, user: null, refreshTimer: null,

  async req(method, path, body, token) {
    let t = token || sb.token || SUPABASE_KEY;
    let h = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${t}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined
    };
    Object.keys(h).forEach(k => h[k] === undefined && delete h[k]);
    let r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method, headers: h,
      body: body ? JSON.stringify(body) : undefined
    });
    // 401 - token expiré, on rafraîchit et on rejoue
    if (r.status === 401 && !token) {
      await sb.refreshSession();
      if (!sb.token) { sb.logout(); return null; }
      h['Authorization'] = `Bearer ${sb.token}`;
      r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method, headers: h,
        body: body ? JSON.stringify(body) : undefined
      });
    }
    if (r.status === 204) return null;
    const d = await r.json();
    if (d && d.code && d.message) throw new Error(d.message);
    return d;
  },

  get: (t, q) => sb.req('GET', `${t}?${q || ''}`),
  post: (t, d) => sb.req('POST', t, d),
  patch: (t, q, d) => sb.req('PATCH', `${t}?${q}`, d),
  del: (t, q) => sb.req('DELETE', `${t}?${q}`),
  upsert: async (t, d) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sb.token}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(d)
    });
    return r.json().catch(() => null);
  },

  async login(email, pwd) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error_description || d.error);
    sb._setSession(d);
  },

  async signup(email, pwd, nom) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd, data: { nom } })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || d.error);
    return d;
  },

  async refreshSession() {
    const rt = localStorage.getItem('bp_r');
    if (!rt) return;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt })
      });
      const d = await r.json();
      if (d.access_token) sb._setSession(d);
    } catch(e) { console.warn('Refresh failed:', e); }
  },

  _setSession(d) {
    sb.token = d.access_token;
    sb.user = d.user;
    localStorage.setItem('bp_t', d.access_token);
    localStorage.setItem('bp_u', JSON.stringify(d.user));
    if (d.refresh_token) localStorage.setItem('bp_r', d.refresh_token);
    clearInterval(sb.refreshTimer);
    sb.refreshTimer = setInterval(() => sb.refreshSession(), 45 * 60 * 1000);
  },

  restoreSession() {
    // Seulement si "remember me v2" est activé
    const remembered = localStorage.getItem('bp_remember_v2') === '1';
    if (!remembered) {
      // Pas de remember me → nettoyer les tokens et forcer la connexion
      ['bp_t','bp_u','bp_r'].forEach(k => localStorage.removeItem(k));
      return false;
    }
    const t = localStorage.getItem('bp_t');
    const u = localStorage.getItem('bp_u');
    if (t && u) {
      try {
        const user = JSON.parse(u);
        if (!user || !user.id || !user.email) { sb.logout(); return false; }
        sb.token = t;
        sb.user = user;
        sb.refreshSession().catch(() => {});
        return true;
      } catch(e) { sb.logout(); return false; }
    }
    return false;
  },

  async verifySession() {
    if (!sb.token) return false;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${sb.token}` }
      });
      if (r.status === 401) {
        await sb.refreshSession();
        return !!sb.token;
      }
      if (r.ok) { const d = await r.json(); sb.user = d; return true; }
      sb.logout(); return false;
    } catch(e) { return !!sb.token; }
  },

  logout() {
    clearInterval(sb.refreshTimer);
    sb.token = null; sb.user = null;
    ['bp_t','bp_u','bp_r','bp_remember_v2','bp_remember'].forEach(function(k) { localStorage.removeItem(k); });
    // Vider STATE et CPT pour éviter le cache entre comptes
    Object.keys(STATE).forEach(function(k) { delete STATE[k]; });
    Object.keys(CPT).forEach(function(k) { delete CPT[k]; });
    // Réinitialiser les valeurs par défaut
    STATE.factures = []; STATE.devis = []; STATE.clients = [];
    STATE.produits = []; STATE.avoirs = []; STATE.achats = [];
    CPT.entreprises = []; CPT.allFactures = []; CPT.allControles = [];
    CPT.role = null; CPT.currentEntrepriseId = null;
  }
};


const STATE = {
  factures: [], devis: [], clients: [], produits: [],
  avoirs: [], paiements: [], profil: {}, notifications: [],
  lignesF: [], lignesD: [], lignesBC: [], lignesBL: [],
  currentFacture: null, currentDevis: null, currentClient: null,
  filterF: 'toutes', filterD: 'tous',
  deviseF: 'MAD', deviseD: 'MAD',
  darkMode: localStorage.getItem('bp_dark') === '1',
};


const CPT = {
  role: null,          // 'entreprise' | 'comptable'
  entreprises: [],     // liste des entreprises accessibles
  currentEntId: null,  // entreprise en cours de visualisation
  currentFactures: [],
  currentProfil: {},
  filterF: 'toutes',
};

let _toastTimer;
