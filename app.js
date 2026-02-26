// ── State ──
const STATUSES = [
  { key: 'RECRUITING',           label: 'Recruiting',              default: true },
  { key: 'NOT_YET_RECRUITING',   label: 'Not Yet Recruiting',      default: true },
  { key: 'ACTIVE_NOT_RECRUITING',label: 'Active, Not Recruiting',  default: false },
  { key: 'COMPLETED',            label: 'Completed',               default: false },
  { key: 'TERMINATED',           label: 'Terminated',              default: false },
  { key: 'WITHDRAWN',            label: 'Withdrawn',               default: false },
  { key: 'SUSPENDED',            label: 'Suspended',               default: false },
];
const PHASES = [
  { key: 'EARLY_PHASE1', label: 'Early Ph 1' },
  { key: 'PHASE1',       label: 'Phase 1' },
  { key: 'PHASE2',       label: 'Phase 2' },
  { key: 'PHASE3',       label: 'Phase 3' },
  { key: 'PHASE4',       label: 'Phase 4' },
  { key: 'NA',           label: 'N/A' },
];

let selectedPhases = new Set();
let usOnly = true;
let results = [];
let nextPageToken = null;
let totalCount = 0;
let activeNCT = null;
let lastQuery = {};

// ── Build sidebar ──
function buildSidebar() {
  // Status checkboxes
  const sf = document.getElementById('statusFilters');
  sf.innerHTML = STATUSES.map(s => `
    <label class="status-item">
      <input type="checkbox" data-status="${s.key}" ${s.default ? 'checked' : ''}>
      <div class="check-box"></div>
      <span class="status-dot dot-${s.key}"></span>
      <span class="status-label">${s.label}</span>
    </label>`).join('');

  // Phase buttons
  const pg = document.getElementById('phaseGrid');
  pg.innerHTML = PHASES.map(p => `
    <div class="phase-btn" data-phase="${p.key}" onclick="togglePhase('${p.key}',this)">${p.label}</div>`).join('');
}

function togglePhase(key, el) {
  if (selectedPhases.has(key)) { selectedPhases.delete(key); el.classList.remove('active'); }
  else { selectedPhases.add(key); el.classList.add('active'); }
}

function toggleUS() {
  usOnly = !usOnly;
  document.getElementById('usToggle').classList.toggle('on', usOnly);
}

function quickKw(kw) {
  document.getElementById('kwInput').value = kw;
  document.getElementById('condInput').value = '';
  doSearch();
}

function getCheckedStatuses() {
  return [...document.querySelectorAll('#statusFilters input:checked')].map(i => i.dataset.status);
}

// ── Search ──
async function doSearch(append = false) {
  const kw   = document.getElementById('kwInput').value.trim();
  const cond = document.getElementById('condInput').value.trim();
  if (!kw && !cond) { alert('Please enter a keyword or condition.'); return; }

  const statuses = getCheckedStatuses();

  if (!append) {
    results = [];
    nextPageToken = null;
    activeNCT = null;
    document.getElementById('detailPanel').innerHTML = `<div class="detail-empty"><div class="detail-empty-icon">◱</div><div class="detail-empty-text">Select a trial to view details</div></div>`;
    document.getElementById('resultsList').innerHTML = `<div class="detail-loading"><div class="spinner"></div> Searching…</div>`;
  }

  setSearching(true);

  const params = new URLSearchParams();
  if (kw)   params.set('query.term', kw);
  if (cond) params.set('query.cond', cond);
  if (statuses.length) params.set('filter.overallStatus', statuses.join(','));
  if (selectedPhases.size) {
    params.set('filter.advanced', [...selectedPhases].map(p => `AREA[Phase]${p}`).join(' OR '));
  }
  if (usOnly) params.set('filter.geo', 'distance(39.5,-98.35,1500mi)');
  if (nextPageToken && append) params.set('pageToken', nextPageToken);
  params.set('pageSize', '20');
  params.set('countTotal', 'true');
  params.set('format', 'json');

  // Request fields needed for list view
  params.set('fields', [
    'NCTId','BriefTitle','OverallStatus','Phase','Condition',
    'LeadSponsorName','LeadSponsorClass',
    'CentralContactName','CentralContactPhone','CentralContactEMail',
    'OverallOfficialName','OverallOfficialAffiliation',
    'EnrollmentCount','StartDate','PrimaryCompletionDate',
    'StudyType','LocationCity','LocationState','LocationCountry','LocationFacility',
    'LocationContactName','LocationContactPhone','LocationContactEMail'
  ].join(','));

  lastQuery = { kw, cond, statuses };

  try {
    const res = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    nextPageToken = data.nextPageToken || null;
    totalCount = data.totalCount || 0;
    results = append ? [...results, ...(data.studies || [])] : (data.studies || []);

    renderList(kw);
  } catch(e) {
    document.getElementById('resultsList').innerHTML =
      `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">Request failed</div><div class="state-sub">${e.message}</div></div>`;
  }
  setSearching(false);
}

function setSearching(on) {
  const btn = document.getElementById('searchBtn');
  btn.disabled = on;
  btn.textContent = on ? 'Searching…' : 'Search';
}

// ── Render results list ──
function renderList(kw) {
  const list = document.getElementById('resultsList');

  if (!results.length) {
    list.innerHTML = `<div class="state-box"><div class="state-icon">🔍</div><div class="state-title">No trials found</div><div class="state-sub">Try different keywords or adjust your status filters.</div></div>`;
    return;
  }

  const header = `
    <div style="padding:12px 18px 10px;border-bottom:1px solid var(--border);background:var(--surface);position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink3);">
        <strong style="color:var(--ink)">${totalCount.toLocaleString()}</strong> trials &mdash; showing ${results.length}
      </span>
      <span class="live-badge"><span class="live-dot"></span>LIVE</span>
    </div>`;

  const cards = results.map((s, i) => buildCard(s, i)).join('');

  const loadMore = nextPageToken
    ? `<div class="load-more-wrap"><button class="btn-load-more" onclick="doSearch(true)">Load more results →</button></div>`
    : '';

  list.innerHTML = header + `<div>${cards}</div>` + loadMore;
}

function buildCard(s, idx) {
  const p   = s.protocolSection || {};
  const id  = p.identificationModule || {};
  const st  = p.statusModule || {};
  const sp  = p.sponsorCollaboratorsModule || {};
  const des = p.designModule || {};
  const cl  = p.contactsLocationsModule || {};

  const nct    = id.nctId || '—';
  const title  = id.briefTitle || 'Untitled';
  const status = st.overallStatus || 'UNKNOWN';
  const phases = (des.phases || []).map(ph => ph.replace('_',' ')).join(', ') || null;
  const sponsor     = (sp.leadSponsor || {}).name || '—';
  const sponsorType = (sp.leadSponsor || {}).class || 'OTHER'; // INDUSTRY | NIH | OTHER

  const sponsorChip = sponsorType === 'INDUSTRY' ? 'chip-industry'
                    : (sponsorType === 'NIH' || sponsorType === 'FED' || sponsorType === 'NETWORK') ? 'chip-academic'
                    : 'chip-other';
  const sponsorLabel = sponsorType === 'INDUSTRY' ? 'Industry'
                     : (sponsorType === 'NIH' || sponsorType === 'FED') ? 'NIH/Gov'
                     : sponsorType === 'NETWORK' ? 'Network'
                     : 'Academic/Other';

  // Contacts
  const central = (cl.centralContacts || [])[0] || {};
  const official = (cl.overallOfficials || [])[0] || {};

  // Locations — dedupe cities
  const locs = cl.locations || [];
  const cities = [...new Set(locs.map(l => [l.city, l.state || l.country].filter(Boolean).join(', ')))].slice(0, 3);
  const siteCount = locs.length;

  const statusChipClass = {
    'RECRUITING':'chip-RECRUITING','NOT_YET_RECRUITING':'chip-NOT_YET_RECRUITING',
    'ACTIVE_NOT_RECRUITING':'chip-ACTIVE_NOT_RECRUITING','COMPLETED':'chip-COMPLETED',
    'TERMINATED':'chip-TERMINATED','WITHDRAWN':'chip-WITHDRAWN','SUSPENDED':'chip-SUSPENDED'
  }[status] || 'chip-DEFAULT';
  const statusLabel = status.replace(/_/g,' ');

  const animDelay = `animation-delay:${Math.min(idx*25,400)}ms`;

  const contactSnippet = central.name
    ? `<span>${central.name}${central.email ? ` &middot; ${central.email}` : ''}</span>`
    : official.name
    ? `<span>PI: ${official.name}</span>`
    : `<span style="color:var(--ink4);font-style:italic">No contact listed</span>`;

  const locSnippet = cities.length
    ? cities.join(' &middot; ') + (siteCount > 3 ? ` +${siteCount-3} more` : '')
    : '—';

  return `
  <div class="trial-card ${activeNCT===nct?'active':''}" style="${animDelay}" onclick="selectTrial('${nct}',this)">
    <div class="card-top">
      <span class="card-nct">${nct}</span>
    </div>
    <div class="card-title">${esc(title)}</div>
    <div class="card-chips">
      <span class="chip ${statusChipClass}">${statusLabel}</span>
      ${phases ? `<span class="chip chip-phase">${phases}</span>` : ''}
      <span class="chip ${sponsorChip}">${sponsorLabel}</span>
    </div>
    <div class="card-sponsor">${esc(sponsor)}</div>
    <div class="card-meta-row">
      <span class="card-meta-item">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${contactSnippet}
      </span>
    </div>
    <div class="card-meta-row" style="margin-top:4px">
      <span class="card-meta-item">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${locSnippet}
      </span>
    </div>
  </div>`;
}

// ── Select trial → fetch full detail ──
async function selectTrial(nct, el) {
  // Update active card styling
  document.querySelectorAll('.trial-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  activeNCT = nct;

  document.getElementById('detailPanel').innerHTML =
    `<div class="detail-loading"><div class="spinner"></div> Loading full record…</div>`;

  try {
    const res = await fetch(`https://clinicaltrials.gov/api/v2/studies/${nct}?format=json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderDetail(data, lastQuery.kw || '');
  } catch(e) {
    document.getElementById('detailPanel').innerHTML =
      `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">Failed to load</div><div class="state-sub">${e.message}</div></div>`;
  }
}

function renderDetail(data, kw) {
  const p   = data.protocolSection || {};
  const id  = p.identificationModule || {};
  const st  = p.statusModule || {};
  const sp  = p.sponsorCollaboratorsModule || {};
  const des = p.designModule || {};
  const cl  = p.contactsLocationsModule || {};
  const co  = p.conditionsModule || {};
  const desc = p.descriptionModule || {};
  const elig = p.eligibilityModule || {};
  const arms = p.armsInterventionsModule || {};
  const out  = p.outcomesModule || {};

  const nct    = id.nctId || '—';
  const title  = id.briefTitle || 'Untitled';
  const status = st.overallStatus || 'UNKNOWN';
  const phases = (des.phases || []).map(ph => ph.replace(/_/g,' ')).join(', ') || 'N/A';
  const sponsor     = (sp.leadSponsor || {}).name || '—';
  const sponsorType = (sp.leadSponsor || {}).class || 'OTHER';
  const enrollment  = (des.enrollmentInfo || {}).count;
  const studyType   = des.studyType || '—';
  const startDate   = st.startDateStruct ? st.startDateStruct.date : '—';
  const compDate    = st.primaryCompletionDateStruct ? st.primaryCompletionDateStruct.date : '—';

  const statusChipClass = {
    'RECRUITING':'chip-RECRUITING','NOT_YET_RECRUITING':'chip-NOT_YET_RECRUITING',
    'ACTIVE_NOT_RECRUITING':'chip-ACTIVE_NOT_RECRUITING','COMPLETED':'chip-COMPLETED',
    'TERMINATED':'chip-TERMINATED','WITHDRAWN':'chip-WITHDRAWN','SUSPENDED':'chip-SUSPENDED'
  }[status] || 'chip-DEFAULT';
  const statusLabel = status.replace(/_/g,' ');

  const sponsorChip  = sponsorType==='INDUSTRY'?'chip-industry':(sponsorType==='NIH'||sponsorType==='FED'||sponsorType==='NETWORK')?'chip-academic':'chip-other';
  const sponsorLabel = sponsorType==='INDUSTRY'?'Industry':(sponsorType==='NIH'||sponsorType==='FED')?'NIH/Gov':sponsorType==='NETWORK'?'Network':'Academic/Other';

  // Contacts
  const central  = cl.centralContacts || [];
  const officials = cl.overallOfficials || [];
  const locs     = cl.locations || [];
  const collabs  = sp.collaborators || [];

  // Highlight kw in text
  function highlight(text) {
    if (!text) return '—';
    if (!kw) return esc(text);
    const escaped = esc(text);
    const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  // Outcomes
  const primaryOut   = (out.primaryOutcomes || []);
  const secondaryOut = (out.secondaryOutcomes || []).slice(0, 6);

  // Interventions
  const interventions = (arms.interventions || []).slice(0, 6);

  // Locations — show up to 12, then "and N more"
  const locShow = locs.slice(0, 12);
  const locMore = locs.length > 12 ? locs.length - 12 : 0;

  const html = `
  <div class="detail-inner">

    <!-- Header -->
    <div class="detail-header">
      <div class="detail-nct">${nct} &middot; Last updated ${st.lastUpdatePostDateStruct ? st.lastUpdatePostDateStruct.date : '—'}</div>
      <div class="detail-title">${esc(title)}</div>
      <div class="detail-chips">
        <span class="chip ${statusChipClass}">${statusLabel}</span>
        <span class="chip chip-phase">${phases}</span>
        <span class="chip ${sponsorChip}">${sponsorLabel}</span>
      </div>
    </div>

    <!-- Data grid -->
    <div class="data-grid">
      <div class="data-cell">
        <div class="dc-label">Lead Sponsor</div>
        <div class="dc-value">${esc(sponsor)}</div>
      </div>
      <div class="data-cell">
        <div class="dc-label">Study Type</div>
        <div class="dc-value">${esc(studyType)}</div>
      </div>
      <div class="data-cell">
        <div class="dc-label">Enrollment</div>
        <div class="dc-value">${enrollment ? enrollment.toLocaleString()+' participants' : '—'}</div>
      </div>
      <div class="data-cell">
        <div class="dc-label">Start Date</div>
        <div class="dc-value">${esc(startDate)}</div>
      </div>
      <div class="data-cell">
        <div class="dc-label">Primary Completion</div>
        <div class="dc-value">${esc(compDate)}</div>
      </div>
      <div class="data-cell">
        <div class="dc-label">Sites</div>
        <div class="dc-value">${locs.length || '—'}</div>
      </div>
    </div>

    <!-- Contacts -->
    <div class="detail-section">
      <div class="section-heading">Contacts</div>
      <div class="contact-grid">
        ${central.map(c => `
          <div class="contact-card">
            <div class="contact-role">Central Contact</div>
            <div class="contact-name">${esc(c.name || '—')}</div>
            ${c.phone ? `<div class="contact-detail">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17z"/></svg>
              ${esc(c.phone)}</div>` : ''}
            ${c.email ? `<div class="contact-detail">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
          </div>`).join('')}
        ${officials.map(o => `
          <div class="contact-card">
            <div class="contact-role">Principal Investigator</div>
            <div class="contact-name">${esc(o.name || '—')}</div>
            <div class="contact-affil">${esc(o.affiliation || '')}</div>
            <div class="contact-detail" style="color:var(--ink4);font-style:italic">${esc(o.role || '')}</div>
          </div>`).join('')}
        ${!central.length && !officials.length ? '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--ink4);font-style:italic;padding:8px 0;">No contacts listed for this trial.</div>' : ''}
      </div>
      ${collabs.length ? `<div style="margin-top:12px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink4);">Collaborators: ${collabs.map(c=>esc(c.name)).join(' &middot; ')}</div>` : ''}
    </div>

    <!-- Brief summary -->
    ${desc.briefSummary ? `
    <div class="detail-section">
      <div class="section-heading">Summary</div>
      <div class="criteria-text" style="max-height:180px">${highlight(desc.briefSummary)}</div>
    </div>` : ''}

    <!-- Eligibility criteria — key for biomarker signals -->
    ${elig.eligibilityCriteria ? `
    <div class="detail-section">
      <div class="section-heading">Eligibility Criteria ${kw ? '<span style="margin-left:8px;background:#fef3a0;border-radius:3px;padding:2px 8px;font-size:9px;color:#7a6800;">keyword highlighted</span>' : ''}</div>
      <div class="criteria-text">${highlight(elig.eligibilityCriteria)}</div>
    </div>` : ''}

    <!-- Interventions -->
    ${interventions.length ? `
    <div class="detail-section">
      <div class="section-heading">Interventions</div>
      ${interventions.map(iv => `
        <div class="outcome-item">
          <div class="outcome-type">${esc(iv.type || '')}</div>
          <div class="outcome-measure">${esc(iv.name || '')}</div>
          ${iv.description ? `<div class="outcome-time" style="font-style:italic;margin-top:3px;font-size:11px;color:var(--ink3)">${esc(iv.description.substring(0,200))}${iv.description.length>200?'…':''}</div>` : ''}
        </div>`).join('')}
    </div>` : ''}

    <!-- Outcomes -->
    ${(primaryOut.length || secondaryOut.length) ? `
    <div class="detail-section">
      <div class="section-heading">Outcome Measures</div>
      ${primaryOut.map(o => `
        <div class="outcome-item primary">
          <div class="outcome-type">Primary</div>
          <div class="outcome-measure">${highlight(o.measure || '')}</div>
          ${o.timeFrame ? `<div class="outcome-time">${esc(o.timeFrame)}</div>` : ''}
        </div>`).join('')}
      ${secondaryOut.map(o => `
        <div class="outcome-item">
          <div class="outcome-type">Secondary</div>
          <div class="outcome-measure">${highlight(o.measure || '')}</div>
          ${o.timeFrame ? `<div class="outcome-time">${esc(o.timeFrame)}</div>` : ''}
        </div>`).join('')}
      ${(out.secondaryOutcomes||[]).length > 6 ? `<div class="more-locations">+${(out.secondaryOutcomes||[]).length-6} more secondary outcomes — view on ClinicalTrials.gov</div>` : ''}
    </div>` : ''}

    <!-- Locations -->
    ${locs.length ? `
    <div class="detail-section">
      <div class="section-heading">Trial Locations (${locs.length})</div>
      <div class="locations-grid">
        ${locShow.map(l => `
          <div class="location-item">
            <div class="loc-facility">${esc(l.facility || l.city || '—')}</div>
            <div class="loc-city">${[l.city, l.state, l.country].filter(Boolean).join(', ')}</div>
            ${l.contacts && l.contacts[0] ? `<div class="loc-contact">${esc(l.contacts[0].name||'')}${l.contacts[0].email?' &middot; '+esc(l.contacts[0].email):''}</div>` : ''}
          </div>`).join('')}
      </div>
      ${locMore ? `<div class="more-locations">+ ${locMore} additional sites — view all on ClinicalTrials.gov</div>` : ''}
    </div>` : ''}

    <!-- Conditions -->
    <div class="detail-section">
      <div class="section-heading">Conditions Studied</div>
      <div class="card-chips">
        ${(co.conditions || []).map(c => `<span class="chip chip-DEFAULT">${esc(c)}</span>`).join('')}
      </div>
    </div>

    <!-- External link -->
    <a class="ext-link" href="https://clinicaltrials.gov/study/${nct}" target="_blank">
      View full record on ClinicalTrials.gov →
    </a>

  </div>`;

  document.getElementById('detailPanel').innerHTML = html;
}

// ── Helpers ──
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function clearSearch() {
  document.getElementById('kwInput').value = '';
  document.getElementById('condInput').value = '';
  results = [];
  nextPageToken = null;
  totalCount = 0;
  activeNCT = null;
  lastQuery = {};
  document.getElementById('resultsList').innerHTML = `
    <div class="state-box">
      <div class="state-icon">🔬</div>
      <div class="state-title">Search for leads</div>
      <div class="state-sub">Enter a biomarker keyword above — EGFR, ESR1, proteomics — or pick a quick keyword from the sidebar.</div>
    </div>`;
  document.getElementById('detailPanel').innerHTML = `
    <div class="detail-empty">
      <div class="detail-empty-icon">◱</div>
      <div class="detail-empty-text">Select a trial to view details</div>
    </div>`;
}

// ── Init ──
buildSidebar();
document.getElementById('usToggle').classList.add('on');
