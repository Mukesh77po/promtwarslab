// @ts-check
/**
 * public/js/render-items.js
 * Rendering equipment search cards, detail modals, and bundle lists.
 */

import { createEquipmentImage, createFigureWithCaption, showImageZoomDialog } from './dom.js';

/**
 * Builds an equipment card for the discovery search grid.
 * @param {object} result
 * @param {boolean} isFirst
 * @param {Function} onDetailsClick
 * @param {Function} on3DClick
 * @returns {HTMLElement}
 */
export function buildItemCard(result, isFirst, onDetailsClick, on3DClick) {
  const { item, score, whyMatched } = result;
  const card = document.createElement('article');
  card.className = 'item-card';

  // Photo thumbnail
  const img = createEquipmentImage(item, { size: 'card', isFirst });
  card.appendChild(img);

  // Header & Title
  const header = document.createElement('div');
  header.className = 'card-header';
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = item.name;
  header.appendChild(title);

  // Status badge
  const badge = document.createElement('span');
  badge.className = `badge badge-${item.status}`;
  badge.textContent = `✓ ${item.status.replace('_', ' ')}`;
  header.appendChild(badge);
  card.appendChild(header);

  // Metadata
  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = `${item.department} · ${item.lab.replace(/_/g, ' ')} · Tier ${item.tier}`;
  card.appendChild(meta);

  // Description
  const desc = document.createElement('p');
  desc.className = 'card-desc';
  desc.textContent = item.description;
  card.appendChild(desc);

  // Why matched
  if (whyMatched) {
    const why = document.createElement('p');
    why.className = 'why-matched';
    why.textContent = score > 0 ? `Matched: ${whyMatched}` : 'Showing all items';
    card.appendChild(why);
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'btn btn-secondary btn-sm';
  viewBtn.textContent = 'View Details';
  viewBtn.addEventListener('click', () => onDetailsClick(item.id));
  actions.appendChild(viewBtn);

  const view3dBtn = document.createElement('button');
  view3dBtn.type = 'button';
  view3dBtn.className = 'btn btn-secondary btn-sm';
  view3dBtn.textContent = '3D / Photo';
  view3dBtn.addEventListener('click', () => on3DClick(item));
  actions.appendChild(view3dBtn);

  card.appendChild(actions);
  return card;
}

/**
 * Builds the Photo / 3D Schematic toggle tab container in the detail view.
 * @param {object} item
 * @param {Function} on3DActivate
 * @returns {HTMLElement}
 */
export function buildMediaContainer(item, on3DActivate) {
  const container = document.createElement('div');
  container.className = 'media-container';

  // Toggle button bar
  const toggle = document.createElement('div');
  toggle.className = 'view-toggle';
  toggle.setAttribute('role', 'tablist');

  const photoBtn = document.createElement('button');
  photoBtn.type = 'button';
  photoBtn.className = 'btn btn-secondary btn-sm';
  photoBtn.textContent = '📷 Photo';
  photoBtn.setAttribute('role', 'tab');
  photoBtn.setAttribute('aria-pressed', 'true');
  photoBtn.setAttribute('aria-selected', 'true');

  const schematicBtn = document.createElement('button');
  schematicBtn.type = 'button';
  schematicBtn.className = 'btn btn-secondary btn-sm';
  schematicBtn.textContent = '🧊 3D Schematic';
  schematicBtn.setAttribute('role', 'tab');
  schematicBtn.setAttribute('aria-pressed', 'false');
  schematicBtn.setAttribute('aria-selected', 'false');

  toggle.appendChild(photoBtn);
  toggle.appendChild(schematicBtn);
  container.appendChild(toggle);

  // Photo view
  const photoView = createFigureWithCaption(item, showImageZoomDialog);
  container.appendChild(photoView);

  // 3D Canvas container (hidden by default)
  const viewer3D = document.createElement('div');
  viewer3D.className = 'viewer-container';
  viewer3D.hidden = true;
  container.appendChild(viewer3D);

  photoBtn.addEventListener('click', () => {
    photoBtn.setAttribute('aria-pressed', 'true');
    schematicBtn.setAttribute('aria-pressed', 'false');
    photoView.hidden = false;
    viewer3D.hidden = true;
  });

  schematicBtn.addEventListener('click', () => {
    schematicBtn.setAttribute('aria-pressed', 'true');
    photoBtn.setAttribute('aria-pressed', 'false');
    photoView.hidden = true;
    viewer3D.hidden = false;
    on3DActivate(viewer3D);
  });

  return container;
}

/**
 * Builds metadata bar with item ID and copy-link button.
 * @param {object} item
 * @returns {HTMLElement}
 */
export function buildMetaBar(item) {
  const bar = document.createElement('div');
  bar.className = 'item-meta-bar';

  const idSpan = document.createElement('span');
  idSpan.textContent = `ID: ${item.id} · Dept: ${item.department} · Updated: Today`;
  bar.appendChild(idSpan);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-secondary btn-sm';
  copyBtn.textContent = '🔗 Copy Link';
  copyBtn.addEventListener('click', () => {
    const url = `${window.location.origin}/#/${item.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = '🔗 Copy Link'; }, 2000);
    }).catch(() => {});
  });
  bar.appendChild(copyBtn);
  return bar;
}

/**
 * Builds a compatible kit bundle list with thumbnails.
 * @param {object[]} bundle
 * @param {Function} onSelect
 * @returns {HTMLElement}
 */
export function buildBundleList(bundle, onSelect) {
  const container = document.createElement('div');
  container.className = 'bundle-list';

  for (const b of bundle) {
    const row = document.createElement('div');
    row.className = 'bundle-item eq-thumb-row';

    const thumb = createEquipmentImage(b, { size: 'thumb' });
    row.appendChild(thumb);

    const info = document.createElement('div');
    info.style.flex = '1';
    const name = document.createElement('strong');
    name.textContent = b.name;
    const desc = document.createElement('div');
    desc.style.fontSize = '0.75rem';
    desc.style.color = 'var(--color-text-muted)';
    desc.textContent = `${b.lab} (${b.distance === 0 ? 'Same lab' : `Distance ${b.distance}`})`;
    info.appendChild(name);
    info.appendChild(desc);
    row.appendChild(info);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => onSelect(b.id));
    row.appendChild(addBtn);

    container.appendChild(row);
  }
  return container;
}
