/**
 * public/js/app.js
 * Main SPA controller. Vanilla ES modules; no bundler.
 * Uses textContent for all user data to prevent XSS.
 */

import { initViewer, disposeViewer } from './viewer.js';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  currentView: 'discover',
  currentUser: null,
  searchTimer: null,
  searchPage: 1,
  searchTotal: 0,
  searchTotalPages: 1,
  lastQuery: {},
  items: [],
  projects: [],
  bookings: [],
  selectedSlot: null,
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) { throw new Error(data.error || 'Request failed'); }
  return data;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(viewName) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.hidden = true;
  });
  const view = document.getElementById(`view-${viewName}`);
  if (!view) { return; }
  view.hidden = false;
  view.classList.add('active');
  state.currentView = viewName;

  document.querySelectorAll('.nav-link').forEach(a => {
    const isActive = a.dataset.view === viewName;
    a.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  if (viewName === 'bookings') { loadBookings(); }
  if (viewName === 'projects') { loadProjects(); }
  if (viewName === 'approvals') { loadApprovals(); }
  if (viewName === 'analytics') { loadAnalytics(); }
  if (viewName === 'discover') { doSearch(); }
}

// ── Role switcher ─────────────────────────────────────────────────────────────
async function switchRole(value) {
  const [role, userId] = value.split(':');
  try {
    state.currentUser = await api('/api/auth/switch', {
      method: 'POST',
      body: { role, userId },
    });
    updateUIForRole();
    navigateTo('discover');
    loadNotifications();
  } catch (err) {
    showError('Role switch failed: ' + err.message);
  }
}

function updateUIForRole() {
  const role = state.currentUser?.role;
  const approvalsNav = document.getElementById('nav-approvals');
  const analyticsNav = document.getElementById('nav-analytics');
  if (approvalsNav) { approvalsNav.hidden = !(role === 'faculty' || role === 'admin'); }
  if (analyticsNav) { analyticsNav.hidden = !(role === 'faculty' || role === 'admin' || role === 'technician'); }
}

// ── Search ────────────────────────────────────────────────────────────────────
function doSearch(page = 1) {
  const q         = document.getElementById('search-input')?.value ?? '';
  const department= document.getElementById('filter-dept')?.value ?? '';
  const category  = document.getElementById('filter-category')?.value ?? '';
  const status    = document.getElementById('filter-status')?.value ?? '';
  const tier      = document.getElementById('filter-tier')?.value ?? '';

  state.lastQuery = { q, department, category, status, tier };
  state.searchPage = page;

  const params = new URLSearchParams();
  if (q)          { params.set('q', q); }
  if (department) { params.set('department', department); }
  if (category)   { params.set('category', category); }
  if (status)     { params.set('status', status); }
  if (tier)       { params.set('tier', tier); }
  params.set('page', String(page));
  params.set('pageSize', '12');

  const resultsEl = document.getElementById('search-results');
  if (resultsEl) {
    resultsEl.setAttribute('aria-busy', 'true');
    resultsEl.innerHTML = '<p class="loading" aria-live="polite">Searching…</p>';
  }

  api('/api/items?' + params.toString())
    .then(data => {
      state.searchTotal = data.total;
      state.searchTotalPages = data.totalPages;
      state.items = data.results.map(r => r.item);
      renderSearchResults(data.results);
      renderPagination(data.page, data.totalPages, data.total);
      announce(`Found ${data.total} item${data.total !== 1 ? 's' : ''}`);
    })
    .catch(err => {
      if (resultsEl) { resultsEl.innerHTML = `<p class="empty-state">Search failed: ${escText(err.message)}</p>`; }
    })
    .finally(() => {
      if (resultsEl) { resultsEl.setAttribute('aria-busy', 'false'); }
    });
}

function renderSearchResults(results) {
  const el = document.getElementById('search-results');
  if (!el) { return; }
  if (!results.length) {
    el.innerHTML = '<p class="empty-state">No items found matching your criteria.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'results-grid';

  for (const r of results) {
    const card = buildItemCard(r);
    grid.appendChild(card);
  }
  el.innerHTML = '';
  el.appendChild(grid);
}

function buildItemCard(result) {
  const { item, score, whyMatched, statusBadge } = result;
  const card = document.createElement('article');
  card.className = 'item-card';
  card.setAttribute('aria-label', item.name);

  // Equipment photo thumbnail
  const img = document.createElement('img');
  img.src = item.image?.src || `/img/equipment/${item.id}.svg`;
  img.alt = item.image?.alt || `${item.name} representative illustration`;
  img.className = 'eq-img-card';
  img.width = 360;
  img.height = 140;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    img.src = '/img/placeholder.svg';
    img.alt = 'Equipment photo not available';
  });
  card.appendChild(img);

  const header = document.createElement('div');
  header.className = 'item-card-header';

  const title = document.createElement('h2');
  title.textContent = item.name;
  header.appendChild(title);

  const statusEl = document.createElement('span');
  const statusClass = `badge badge--${item.status}`;
  statusEl.className = statusClass;
  statusEl.textContent = `${statusBadge.icon} ${statusBadge.text}`;
  header.appendChild(statusEl);
  card.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'item-card-meta';
  const deptSpan = document.createElement('span');
  deptSpan.textContent = item.department;
  const labSpan = document.createElement('span');
  labSpan.textContent = '• ' + (item.lab ?? '');
  const tierBadge = document.createElement('span');
  tierBadge.className = `badge badge--tier${item.tier}`;
  tierBadge.textContent = `Tier ${item.tier}`;
  meta.appendChild(deptSpan);
  meta.appendChild(labSpan);
  meta.appendChild(tierBadge);
  card.appendChild(meta);

  const desc = document.createElement('p');
  desc.className = 'item-description';
  desc.textContent = item.description;
  card.appendChild(desc);

  const why = document.createElement('p');
  why.className = 'item-why';
  why.textContent = whyMatched;
  card.appendChild(why);

  // Score bar
  const scoreBar = document.createElement('div');
  scoreBar.className = 'score-bar';
  scoreBar.setAttribute('aria-label', `Relevance: ${Math.round(score * 100)}%`);
  const fill = document.createElement('div');
  fill.className = 'score-bar-fill';
  fill.style.width = Math.round(score * 100) + '%';
  scoreBar.appendChild(fill);
  card.appendChild(scoreBar);

  // Footer buttons
  const footer = document.createElement('div');
  footer.className = 'item-card-footer';

  const detailBtn = document.createElement('button');
  detailBtn.className = 'btn btn-secondary btn-sm';
  detailBtn.textContent = 'View Details';
  detailBtn.addEventListener('click', () => openItemModal(item.id));
  footer.appendChild(detailBtn);

  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-primary btn-sm';
  viewBtn.textContent = '📦 Book';
  viewBtn.addEventListener('click', () => openBookingModal(item.id));
  footer.appendChild(viewBtn);

  if (item.model3d?.parts?.length) {
    const btn3d = document.createElement('button');
    btn3d.className = 'btn btn-secondary btn-sm';
    btn3d.textContent = '3D View';
    btn3d.addEventListener('click', () => open3DViewer(item));
    footer.appendChild(btn3d);
  }

  card.appendChild(footer);
  return card;
}

// ── Pagination ─────────────────────────────────────────────────────────────────
function renderPagination(page, totalPages, total) {
  const el = document.getElementById('pagination-controls');
  if (!el) { return; }
  el.hidden = totalPages <= 1;

  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  const info    = document.getElementById('page-info');
  if (prevBtn) { prevBtn.disabled = page <= 1; }
  if (nextBtn) { nextBtn.disabled = page >= totalPages; }
  if (info)    { info.textContent = `Page ${page} of ${totalPages} (${total} items)`; }
}

// ── Item detail modal ─────────────────────────────────────────────────────────
async function openItemModal(itemId) {
  const modal = document.getElementById('item-modal');
  const content = document.getElementById('item-modal-content');
  if (!modal || !content) { return; }

  modal.hidden = false;
  content.innerHTML = '<p class="loading">Loading…</p>';
  const firstFocusable = modal.querySelector('.modal-close');
  firstFocusable?.focus();

  try {
    const [itemData, bundleData] = await Promise.all([
      api(`/api/items/${itemId}`),
      api(`/api/items/${itemId}/bundle`),
    ]);
    renderItemDetail(content, itemData.item, bundleData.bundle);
  } catch (err) {
    content.innerHTML = `<p class="empty-state">Failed to load: ${escText(err.message)}</p>`;
  }
}

function renderItemDetail(el, item, bundle) {
  el.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'item-detail-header';

  const titleDiv = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.className = 'item-detail-title';
  h2.textContent = item.name;
  titleDiv.appendChild(h2);

  const badges = document.createElement('div');
  badges.style.display = 'flex';
  badges.style.gap = '0.4rem';
  badges.style.flexWrap = 'wrap';
  badges.style.marginTop = '0.4rem';

  const statusBadge = document.createElement('span');
  statusBadge.className = `badge badge--${item.status}`;
  statusBadge.textContent = item.status.replace('_', ' ');

  const tierBadge = document.createElement('span');
  tierBadge.className = `badge badge--tier${item.tier}`;
  tierBadge.textContent = `Tier ${item.tier}`;

  const deptBadge = document.createElement('span');
  deptBadge.className = 'badge badge--info';
  deptBadge.textContent = item.department;

  badges.appendChild(statusBadge);
  badges.appendChild(tierBadge);
  badges.appendChild(deptBadge);
  titleDiv.appendChild(badges);
  header.appendChild(titleDiv);

  const bookBtn = document.createElement('button');
  bookBtn.className = 'btn btn-primary';
  bookBtn.textContent = '📅 Book Now';
  bookBtn.addEventListener('click', () => {
    closeModal('item-modal');
    openBookingModal(item.id);
  });
  header.appendChild(bookBtn);
  el.appendChild(header);

  // Metadata bar
  const metaBar = document.createElement('div');
  metaBar.className = 'item-meta-bar';
  const idSpan = document.createElement('span');
  idSpan.textContent = `ID: ${item.id} • Lab: ${item.lab.replace(/_/g, ' ')} • Loc: ${item.location}`;
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-secondary btn-sm';
  copyBtn.textContent = '🔗 Copy Link';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(`${window.location.origin}/#/${item.id}`).then(() => {
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = '🔗 Copy Link'; }, 2000);
    }).catch(() => {});
  });
  metaBar.appendChild(idSpan);
  metaBar.appendChild(copyBtn);
  el.appendChild(metaBar);

  // Representative illustration figure with caption
  const figure = document.createElement('figure');
  figure.className = 'eq-figure';
  const detailImg = document.createElement('img');
  detailImg.src = item.image?.src || `/img/equipment/${item.id}.svg`;
  detailImg.alt = item.image?.alt || `${item.name} representation`;
  detailImg.className = 'eq-img-large';
  detailImg.width = 600;
  detailImg.height = 280;
  detailImg.loading = 'eager';
  detailImg.decoding = 'sync';
  detailImg.addEventListener('error', () => {
    detailImg.src = '/img/placeholder.svg';
    detailImg.alt = 'Equipment photo not available';
  });
  figure.appendChild(detailImg);

  const figcaption = document.createElement('figcaption');
  figcaption.className = 'eq-figcaption';
  const creditSpan = document.createElement('span');
  creditSpan.textContent = `${item.image?.credit || 'Representative illustration'} • ${item.image?.licence || 'CC0'}`;
  figcaption.appendChild(creditSpan);
  figure.appendChild(figcaption);
  el.appendChild(figure);

  // Description
  addSection(el, 'Description', item.description);

  // Datasheet
  if (item.datasheetSummary) {
    addSection(el, 'Specifications', item.datasheetSummary);
  }

  // Spec tags
  if (item.specTags?.length) {
    const section = document.createElement('div');
    section.className = 'item-detail-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Tags';
    section.appendChild(h3);
    const tags = document.createElement('div');
    tags.className = 'spec-tags';
    for (const tag of item.specTags) {
      const span = document.createElement('span');
      span.className = 'spec-tag';
      span.textContent = tag;
      tags.appendChild(span);
    }
    section.appendChild(tags);
    el.appendChild(section);
  }

  // Prerequisites warning
  if (item.prerequisiteModules?.length) {
    const section = document.createElement('div');
    section.className = 'item-detail-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Prerequisites';
    section.appendChild(h3);
    const warn = document.createElement('div');
    warn.className = 'prereq-warning';
    warn.setAttribute('role', 'note');
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠';
    const text = document.createElement('span');
    text.textContent = `Required modules: ${item.prerequisiteModules.join(', ')}`;
    warn.appendChild(icon);
    warn.appendChild(text);
    section.appendChild(warn);
    el.appendChild(section);
  }

  // Usage steps
  if (item.usageSteps?.length) {
    const section = document.createElement('div');
    section.className = 'item-detail-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'How to Use';
    section.appendChild(h3);
    const ol = document.createElement('ol');
    ol.className = 'usage-steps';
    for (const step of item.usageSteps) {
      const li = document.createElement('li');
      li.textContent = step;
      ol.appendChild(li);
    }
    section.appendChild(ol);
    el.appendChild(section);
  }

  // Safety notes
  if (item.safetyNotes?.length) {
    const section = document.createElement('div');
    section.className = 'item-detail-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Safety Notes';
    section.appendChild(h3);
    const ul = document.createElement('ul');
    ul.className = 'safety-notes';
    ul.setAttribute('aria-label', 'Safety notes');
    for (const note of item.safetyNotes) {
      const li = document.createElement('li');
      li.textContent = note;
      ul.appendChild(li);
    }
    section.appendChild(ul);
    el.appendChild(section);
  }

  // Compatible bundle
  if (bundle?.length) {
    const section = document.createElement('div');
    section.className = 'item-detail-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Smart Kit Bundle (Compatible Equipment)';
    section.appendChild(h3);
    const list = document.createElement('div');
    list.className = 'bundle-list';
    for (const b of bundle) {
      const row = document.createElement('div');
      row.className = 'bundle-item';

      const bImg = document.createElement('img');
      bImg.src = b.item.image?.src || `/img/equipment/${b.item.id}.svg`;
      bImg.alt = b.item.image?.alt || `${b.item.name} thumbnail`;
      bImg.className = 'eq-img-thumb';
      bImg.width = 56;
      bImg.height = 42;
      bImg.loading = 'lazy';
      bImg.addEventListener('error', () => {
        bImg.src = '/img/placeholder.svg';
        bImg.alt = 'Equipment photo not available';
      });
      row.appendChild(bImg);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = b.item.name;
      const infoSpan = document.createElement('span');
      infoSpan.textContent = `${b.item.lab} · ${b.distance === 0 ? 'Same lab' : `Distance: ${b.distance}`}`;
      infoSpan.style.color = 'var(--color-text-muted)';
      infoSpan.style.fontSize = '0.8rem';
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-secondary btn-sm';
      addBtn.textContent = '+ Add to Request';
      addBtn.addEventListener('click', () => openBookingModal(b.item.id));
      row.appendChild(nameSpan);
      row.appendChild(infoSpan);
      row.appendChild(addBtn);
      list.appendChild(row);
    }
    section.appendChild(list);
    el.appendChild(section);
  }
}

function addSection(parent, title, text) {
  const section = document.createElement('div');
  section.className = 'item-detail-section';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  section.appendChild(h3);
  const p = document.createElement('p');
  p.style.fontSize = '0.875rem';
  p.textContent = text;
  section.appendChild(p);
  parent.appendChild(section);
}

// ── Booking modal ─────────────────────────────────────────────────────────────
async function openBookingModal(itemId) {
  const modal = document.getElementById('booking-modal');
  if (!modal) { return; }

  // Load projects into select
  const projSelect = document.getElementById('book-project');
  if (projSelect && state.projects.length === 0) {
    const data = await api('/api/projects');
    state.projects = data.projects;
  }
  if (projSelect) {
    projSelect.innerHTML = '<option value="">Select a project…</option>';
    for (const p of state.projects) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      projSelect.appendChild(opt);
    }
  }

  // Set item
  const itemSelect = document.getElementById('book-item');
  if (itemSelect) {
    itemSelect.innerHTML = '';
    // Load all items or use cached
    const allItems = state.items.length ? state.items : (await api('/api/items?pageSize=100')).results.map(r => r.item);
    for (const item of allItems) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      opt.selected = item.id === itemId;
      itemSelect.appendChild(opt);
    }
  }

  // Set min date to tomorrow
  const dateInput = document.getElementById('book-date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = tomorrow.toISOString().slice(0, 10);
    dateInput.value = tomorrow.toISOString().slice(0, 10);
  }

  modal.hidden = false;
  modal.querySelector('.modal-close')?.focus();
}

async function submitBooking(e) {
  e.preventDefault();
  const errorEl = document.getElementById('booking-form-error');
  if (errorEl) { errorEl.hidden = true; }

  const projectId = document.getElementById('book-project')?.value;
  const itemId    = document.getElementById('book-item')?.value;
  const date      = document.getElementById('book-date')?.value;
  const hour      = parseInt(document.getElementById('book-hour')?.value ?? '', 10);

  if (!projectId || !itemId || !date || isNaN(hour)) {
    showFormError('booking-form-error', 'Please fill in all fields.');
    return;
  }

  const start = new Date(`${date}T${String(hour).padStart(2,'0')}:00:00`).toISOString();
  const end   = new Date(`${date}T${String(hour + 1).padStart(2,'0')}:00:00`).toISOString();

  try {
    const result = await api('/api/bookings', {
      method: 'POST',
      body: { projectId, itemId, start, end },
    });
    closeModal('booking-modal');
    announce(`Booking ${result.booking.status === 'approved' ? 'approved' : result.booking.status === 'waitlisted' ? 'waitlisted' : 'submitted'}!`);
    if (result.mediationResult) {
      showConflictResult(result);
    }
    loadBookings();
    loadNotifications();
  } catch (err) {
    showFormError('booking-form-error', err.message);
  }
}

// ── Projects ──────────────────────────────────────────────────────────────────
async function loadProjects() {
  const el = document.getElementById('projects-list');
  if (!el) { return; }
  el.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const data = await api('/api/projects');
    state.projects = data.projects;
    renderProjects(el, data.projects);
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escText(err.message)}</p>`;
  }
}

function renderProjects(el, projects) {
  el.innerHTML = '';
  if (!projects.length) {
    el.innerHTML = '<p class="empty-state">No projects yet. Create one to start booking equipment.</p>';
    return;
  }
  for (const p of projects) {
    const card = document.createElement('div');
    card.className = 'project-card';
    const h3 = document.createElement('h3');
    h3.textContent = p.title;
    card.appendChild(h3);
    const meta = document.createElement('div');
    meta.className = 'project-card-meta';
    meta.textContent = `${p.courseCode} · Deadline: ${new Date(p.hardDeadline).toLocaleDateString()} · ${p.hoursNeeded}h needed`;
    card.appendChild(meta);
    const abs = document.createElement('p');
    abs.style.fontSize = '0.875rem';
    abs.textContent = p.abstract;
    card.appendChild(abs);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const bookBtn = document.createElement('button');
    bookBtn.className = 'btn btn-primary btn-sm';
    bookBtn.textContent = 'Book Equipment';
    bookBtn.addEventListener('click', () => openBookingModal(null));
    actions.appendChild(bookBtn);
    card.appendChild(actions);
    el.appendChild(card);
  }
}

async function submitProject(e) {
  e.preventDefault();
  const title    = document.getElementById('proj-title')?.value;
  const abstract = document.getElementById('proj-abstract')?.value;
  const courseCode = document.getElementById('proj-course')?.value;
  const hardDeadline = new Date(document.getElementById('proj-deadline')?.value).toISOString();
  const hoursNeeded = parseInt(document.getElementById('proj-hours')?.value ?? '8', 10);

  if (!title || !abstract || !courseCode || !hardDeadline || isNaN(hoursNeeded)) {
    showFormError('project-form-error', 'Please fill in all fields.');
    return;
  }

  try {
    const result = await api('/api/projects', {
      method: 'POST',
      body: { title, abstract, courseCode, hardDeadline, hoursNeeded, teamMembers: [state.currentUser.userId] },
    });
    state.projects.push(result.project);
    closeModal('project-modal');
    announce('Project created!');
    loadProjects();
  } catch (err) {
    showFormError('project-form-error', err.message);
  }
}

// ── Bookings ──────────────────────────────────────────────────────────────────
async function loadBookings() {
  const el = document.getElementById('bookings-list');
  if (!el) { return; }
  el.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const data = await api('/api/bookings');
    renderBookings(el, data.bookings);
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escText(err.message)}</p>`;
  }
}

function renderBookings(el, bookings) {
  el.innerHTML = '';
  if (!bookings.length) {
    el.innerHTML = '<p class="empty-state">No bookings yet.</p>';
    return;
  }
  for (const b of bookings) {
    const card = document.createElement('div');
    card.className = 'booking-card';

    const h3 = document.createElement('h3');
    h3.textContent = b.itemId;
    card.appendChild(h3);

    const meta = document.createElement('div');
    meta.className = 'booking-card-meta';
    meta.textContent = `${new Date(b.start).toLocaleString()} · Status: `;
    const badge = document.createElement('span');
    badge.className = `badge badge--${b.status === 'approved' ? 'success' : b.status === 'rejected' ? 'error' : b.status === 'waitlisted' ? 'warning' : 'pending'}`;
    badge.textContent = b.status.replace('_', ' ');
    meta.appendChild(badge);
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (b.status === 'approved') {
      const qrBtn = document.createElement('button');
      qrBtn.className = 'btn btn-secondary btn-sm';
      qrBtn.textContent = '📱 QR Check-in';
      qrBtn.addEventListener('click', () => openQR(b.id));
      actions.appendChild(qrBtn);
    }
    card.appendChild(actions);
    el.appendChild(card);
  }
}

async function openQR(bookingId) {
  const svgText = await fetch(`/api/bookings/${bookingId}/qr`).then(r => r.text());
  const win = window.open('', '_blank', 'width=400,height=400');
  if (win) {
    win.document.title = 'QR Check-in';
    win.document.body.innerHTML = `<h2 style="font-family:sans-serif;text-align:center">Scan to check in</h2>${svgText}`;
  }
}

// ── Approvals ─────────────────────────────────────────────────────────────────
async function loadApprovals() {
  const el = document.getElementById('approvals-list');
  if (!el) { return; }
  el.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const data = await api('/api/bookings');
    const pending = data.bookings.filter(b => b.status === 'pending' || b.status === 'changes_requested');
    renderApprovals(el, pending);
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escText(err.message)}</p>`;
  }
}

async function renderApprovals(el, bookings) {
  el.innerHTML = '';
  if (!bookings.length) {
    el.innerHTML = '<p class="empty-state">No pending approvals.</p>';
    return;
  }
  for (const b of bookings) {
    const card = document.createElement('div');
    card.className = 'approval-card';

    const h3 = document.createElement('h3');
    h3.textContent = `Booking: ${b.itemId}`;
    card.appendChild(h3);

    const meta = document.createElement('div');
    meta.className = 'booking-card-meta';
    meta.textContent = `Slot: ${new Date(b.start).toLocaleString()} · User: ${b.userId} · Project: ${b.projectId}`;
    card.appendChild(meta);

    // Load readiness summary
    const summaryBox = document.createElement('div');
    summaryBox.className = 'readiness-box';
    summaryBox.setAttribute('aria-label', 'Risk and readiness summary');
    summaryBox.textContent = 'Loading risk summary…';
    card.appendChild(summaryBox);

    api(`/api/bookings/${b.id}/readiness`)
      .then(data => {
        summaryBox.innerHTML = '';
        const aiLabel = document.createElement('div');
        aiLabel.className = 'ai-label';
        aiLabel.textContent = `AI-assisted summary (source: ${data.source})`;
        summaryBox.appendChild(aiLabel);
        const text = document.createElement('p');
        text.textContent = data.summary;
        summaryBox.appendChild(text);
        if (data.missingPrereqs?.length) {
          const warn = document.createElement('div');
          warn.className = 'prereq-warning';
          warn.setAttribute('role', 'alert');
          const icon = document.createElement('span');
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = '⚠';
          const warnText = document.createElement('span');
          warnText.textContent = `Missing prerequisites: ${data.missingPrereqs.join(', ')}`;
          warn.appendChild(icon);
          warn.appendChild(warnText);
          summaryBox.appendChild(warn);
        }
      })
      .catch(() => { summaryBox.textContent = 'Summary unavailable.'; });

    // Actions
    const commentInput = document.createElement('textarea');
    commentInput.className = 'comment-input';
    commentInput.placeholder = 'Comment (optional)…';
    commentInput.setAttribute('aria-label', 'Approval comment');
    commentInput.rows = 2;
    card.appendChild(commentInput);

    const actions = document.createElement('div');
    actions.className = 'approval-actions';

    for (const [action, label, cls] of [
      ['approve', '✓ Approve', 'btn-success'],
      ['request_changes', '✏ Request Changes', 'btn-secondary'],
      ['reject', '✗ Reject', 'btn-danger'],
    ]) {
      const btn = document.createElement('button');
      btn.className = `btn ${cls} btn-sm`;
      btn.textContent = label;
      btn.addEventListener('click', async () => {
        const comment = commentInput.value.trim();
        try {
          await api(`/api/bookings/${b.id}/approve`, { method: 'POST', body: { action, comment } });
          announce(`Booking ${action}d.`);
          loadApprovals();
          loadNotifications();
        } catch (err) {
          showError(err.message);
        }
      });
      actions.appendChild(btn);
    }
    card.appendChild(actions);
    el.appendChild(card);
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  const el = document.getElementById('analytics-content');
  if (!el) { return; }
  el.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const data = await api('/api/analytics');
    renderAnalytics(el, data);
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escText(err.message)}</p>`;
  }
}

function renderAnalytics(el, data) {
  el.innerHTML = '';

  // Admin demo clock panel
  if (state.currentUser?.role === 'admin') {
    const clockPanel = document.createElement('div');
    clockPanel.className = 'demo-clock-panel';
    clockPanel.setAttribute('role', 'group');
    clockPanel.setAttribute('aria-label', 'Demo time simulation');

    const label = document.createElement('label');
    label.htmlFor = 'demo-clock-input';
    label.textContent = '🕐 Simulate Time (Admin Demo):';

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.id = 'demo-clock-input';
    input.setAttribute('aria-label', 'Simulated date and time');

    const setBtn = document.createElement('button');
    setBtn.className = 'btn btn-sm btn-secondary';
    setBtn.textContent = 'Set';
    setBtn.addEventListener('click', async () => {
      if (!input.value) { return; }
      await api('/api/admin/clock', { method: 'POST', body: { isoDate: new Date(input.value).toISOString() } });
      announce('Clock updated');
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-sm btn-secondary';
    resetBtn.textContent = 'Reset to Real Time';
    resetBtn.addEventListener('click', async () => {
      await api('/api/admin/clock', { method: 'DELETE' });
      announce('Clock reset to real time');
    });

    clockPanel.appendChild(label);
    clockPanel.appendChild(input);
    clockPanel.appendChild(setBtn);
    clockPanel.appendChild(resetBtn);
    el.appendChild(clockPanel);
  }

  // Summary stats
  const grid = document.createElement('div');
  grid.className = 'analytics-grid';

  const statItems = [
    { label: 'Students Without Slots', value: data.studentsWithoutSlots },
    { label: 'Hours Reclaimed', value: data.totalReclaimedHours },
    { label: 'Most Contested Items', value: data.mostContested?.length ?? 0 },
  ];
  for (const s of statItems) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = String(s.value);
    const lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = s.label;
    card.appendChild(val);
    card.appendChild(lbl);
    grid.appendChild(card);
  }
  el.appendChild(grid);

  // Heatmap
  if (data.heatmap) {
    const h2 = document.createElement('h2');
    h2.textContent = 'Booking Heatmap (Day × Hour)';
    h2.style.marginBottom = '0.75rem';
    el.appendChild(h2);

    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-wrapper';
    const table = document.createElement('table');
    table.className = 'heatmap-table';
    table.setAttribute('aria-label', 'Booking frequency by day and hour');
    table.setAttribute('role', 'grid');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const emptyTh = document.createElement('th');
    emptyTh.scope = 'col';
    emptyTh.textContent = 'Hour';
    headerRow.appendChild(emptyTh);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    for (const d of days) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = d;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let h = 8; h < 20; h++) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = `${String(h).padStart(2,'0')}:00`;
      row.appendChild(th);
      for (let d = 0; d < 5; d++) {
        const count = data.heatmap[d]?.[h] ?? 0;
        const td = document.createElement('td');
        td.className = `heatmap-cell heat-${Math.min(4, count)}`;
        td.textContent = String(count);
        td.setAttribute('aria-label', `${days[d]} ${h}:00 – ${count} booking${count !== 1 ? 's' : ''}`);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    el.appendChild(wrapper);
  }

  // Most contested items
  if (data.mostContested?.length) {
    const h2 = document.createElement('h2');
    h2.textContent = 'Most Contested Equipment';
    h2.style.margin = '1.5rem 0 0.75rem';
    el.appendChild(h2);
    for (const item of data.mostContested) {
      const card = document.createElement('div');
      card.className = 'booking-card';
      const name = document.createElement('strong');
      name.textContent = item.name;
      card.appendChild(name);
      const info = document.createElement('p');
      info.style.fontSize = '0.85rem';
      info.style.color = 'var(--color-text-muted)';
      info.textContent = `${item.department} · Utilisation: ${item.utilisation}% · Contested: ${item.contestedCount} conflicts`;
      card.appendChild(info);
      el.appendChild(card);
    }
  }
}

// ── 3D Viewer ─────────────────────────────────────────────────────────────────
async function open3DViewer(item) {
  const modal = document.getElementById('viewer-modal');
  const container = document.getElementById('viewer-container');
  if (!modal || !container) { return; }
  modal.hidden = false;
  modal.querySelector('.modal-close')?.focus();

  try {
    await initViewer(container, item);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">3D viewer unavailable: ${escText(err.message)}</p>`;
  }
}

function closeViewerModal() {
  const modal = document.getElementById('viewer-modal');
  const container = document.getElementById('viewer-container');
  if (modal) { modal.hidden = true; }
  if (container) {
    disposeViewer(container);
    container.innerHTML = '<p class="loading">Loading 3D viewer…</p>';
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const data = await api('/api/notifications');
    const unread = data.notifications.filter(n => !n.read);
    const badge = document.getElementById('notif-count');
    if (badge) {
      badge.textContent = String(unread.length);
      badge.hidden = unread.length === 0;
    }
    renderNotificationList(data.notifications);
  } catch (_e) { /* non-fatal */ }
}

function renderNotificationList(notifs) {
  const list = document.getElementById('notif-list');
  if (!list) { return; }
  list.innerHTML = '';
  if (!notifs.length) {
    const li = document.createElement('li');
    li.className = 'notif-item notif-item--info';
    li.textContent = 'No notifications.';
    list.appendChild(li);
    return;
  }
  for (const n of notifs) {
    const li = document.createElement('li');
    li.className = `notif-item notif-item--${n.type}${n.read ? '' : ' unread'}`;
    li.textContent = n.message;
    list.appendChild(li);
  }
}

// ── Conflict demo ─────────────────────────────────────────────────────────────
function showConflictResult(result) {
  const modal = document.getElementById('demo-modal');
  const content = document.getElementById('demo-content');
  if (!modal || !content) { return; }

  content.innerHTML = '';

  if (result.mediationResult) {
    const mr = result.mediationResult;
    const title = document.createElement('h3');
    title.textContent = 'Conflict Resolution Result';
    content.appendChild(title);

    if (result.negotiationText) {
      const box = document.createElement('div');
      box.className = 'negotiation-box';
      const aiLabel = document.createElement('div');
      aiLabel.className = 'ai-label';
      aiLabel.textContent = 'AI-assisted';
      box.appendChild(aiLabel);
      const p = document.createElement('p');
      p.textContent = result.negotiationText;
      box.appendChild(p);
      content.appendChild(box);
    }

    // Winner
    const winnerDiv = document.createElement('div');
    winnerDiv.className = 'demo-request-card winner';
    const ws = document.createElement('strong');
    ws.textContent = `🏆 Winner: Request ${mr.winner} (score: ${mr.scores[mr.winner]?.total ?? '?'})`;
    winnerDiv.appendChild(ws);
    content.appendChild(winnerDiv);

    // Alternatives
    if (mr.alternatives?.length) {
      const altTitle = document.createElement('h4');
      altTitle.textContent = 'Alternatives for other requestors:';
      altTitle.style.margin = '0.75rem 0 0.4rem';
      content.appendChild(altTitle);
      for (const alt of mr.alternatives) {
        const altDiv = document.createElement('div');
        altDiv.className = 'alternative-item';
        altDiv.textContent = alt.description;
        content.appendChild(altDiv);
      }
    }
  }

  modal.hidden = false;
  modal.querySelector('.modal-close')?.focus();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escText(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function announce(msg) {
  const el = document.getElementById('live-region');
  if (el) { el.textContent = msg; }
}

function showError(msg) {
  announce('Error: ' + msg);
  console.error(msg);
}

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (!el) { return; }
  el.textContent = msg;
  el.hidden = false;
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.hidden = true; }
}

// Focus trap for modals
function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') { return; }
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Check current auth
  try {
    const me = await api('/api/auth/me');
    if (!me.authenticated) {
      // Auto-login as student for demo
      state.currentUser = await api('/api/auth/switch', { method: 'POST', body: { role: 'student', userId: 'u-stu-alice' } });
    } else {
      state.currentUser = me;
    }
  } catch (_e) {
    state.currentUser = { role: 'student', userId: 'u-stu-alice' };
  }

  updateUIForRole();

  // Nav click handlers
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.view);
    });
  });

  // Role switcher
  const roleSelect = document.getElementById('role-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => switchRole(roleSelect.value));
  }

  // Search input debounce
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => doSearch(1), 300);
    });
  }

  // Search button
  document.getElementById('btn-search')?.addEventListener('click', () => doSearch(1));

  // Filter changes
  ['filter-dept','filter-category','filter-status','filter-tier'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => doSearch(1));
  });

  // Pagination
  document.getElementById('btn-prev')?.addEventListener('click', () => doSearch(state.searchPage - 1));
  document.getElementById('btn-next')?.addEventListener('click', () => doSearch(state.searchPage + 1));

  // Booking form
  document.getElementById('booking-form')?.addEventListener('submit', submitBooking);
  document.getElementById('btn-cancel-booking')?.addEventListener('click', () => closeModal('booking-modal'));
  document.getElementById('btn-close-booking-modal')?.addEventListener('click', () => closeModal('booking-modal'));
  document.getElementById('booking-modal-backdrop')?.addEventListener('click', () => closeModal('booking-modal'));
  document.getElementById('btn-new-booking')?.addEventListener('click', () => openBookingModal(null));

  // Project form
  document.getElementById('project-form')?.addEventListener('submit', submitProject);
  document.getElementById('btn-cancel-project')?.addEventListener('click', () => closeModal('project-modal'));
  document.getElementById('btn-close-project-modal')?.addEventListener('click', () => closeModal('project-modal'));
  document.getElementById('btn-new-project')?.addEventListener('click', () => {
    document.getElementById('project-modal').hidden = false;
    document.getElementById('project-modal').querySelector('.modal-close')?.focus();
  });

  // Item modal close
  document.getElementById('btn-close-item-modal')?.addEventListener('click', () => closeModal('item-modal'));
  document.getElementById('item-modal-backdrop')?.addEventListener('click', () => closeModal('item-modal'));

  // Viewer modal close
  document.getElementById('btn-close-viewer-modal')?.addEventListener('click', closeViewerModal);
  document.getElementById('viewer-modal-backdrop')?.addEventListener('click', closeViewerModal);

  // Demo modal close
  document.getElementById('btn-close-demo-modal')?.addEventListener('click', () => closeModal('demo-modal'));
  document.getElementById('demo-modal-backdrop')?.addEventListener('click', () => closeModal('demo-modal'));

  // Notifications
  document.getElementById('btn-notifications')?.addEventListener('click', () => {
    const panel = document.getElementById('notif-panel');
    const backdrop = document.getElementById('notif-backdrop');
    const btn = document.getElementById('btn-notifications');
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    backdrop.hidden = isOpen;
    btn.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) { panel.querySelector('h2')?.focus(); }
  });
  document.getElementById('btn-close-notif')?.addEventListener('click', () => {
    document.getElementById('notif-panel').hidden = true;
    document.getElementById('notif-backdrop').hidden = true;
    document.getElementById('btn-notifications')?.setAttribute('aria-expanded', 'false');
  });
  document.getElementById('notif-backdrop')?.addEventListener('click', () => {
    document.getElementById('notif-panel').hidden = true;
    document.getElementById('notif-backdrop').hidden = true;
  });

  // Escape key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['item-modal','booking-modal','project-modal','demo-modal','viewer-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m && !m.hidden) {
          if (id === 'viewer-modal') { closeViewerModal(); }
          else { m.hidden = true; }
        }
      });
      const panel = document.getElementById('notif-panel');
      if (panel && !panel.hidden) {
        panel.hidden = true;
        document.getElementById('notif-backdrop').hidden = true;
      }
    }
  });

  // Set up focus traps for modals
  ['item-modal','booking-modal','project-modal','demo-modal','viewer-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) { trapFocus(m); }
  });

  // Hero action buttons
  document.getElementById('btn-hero-explore')?.addEventListener('click', (e) => {
    e.preventDefault();
    const searchInput = document.getElementById('search-input');
    searchInput?.focus();
    searchInput?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btn-hero-demo')?.addEventListener('click', async () => {
    try {
      const res = await api('/api/scheduler/demo', {
        method: 'POST',
        body: JSON.stringify({ itemId: 'jetson-orin-agx' }),
      });
      showConflictResult(res);
    } catch (err) {
      showError(err.message);
    }
  });

  // Initial render
  doSearch();
  loadNotifications();

  // Poll notifications every 30s
  setInterval(loadNotifications, 30_000);
}

init();
