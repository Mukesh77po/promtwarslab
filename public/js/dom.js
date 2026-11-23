// @ts-check
/**
 * public/js/dom.js
 * Safe DOM creation, accessibility helpers, image fallback, focus trapping.
 */

/**
 * Creates an image element for equipment with dimensions, lazy loading, and fallback.
 * @param {object} item
 * @param {object} [options]
 * @param {'card'|'thumb'|'large'} [options.size='card']
 * @param {boolean} [options.isFirst=false]
 * @param {string} [options.altText]
 * @returns {HTMLImageElement}
 */
export function createEquipmentImage(item, options = {}) {
  const { size = 'card', isFirst = false, altText } = options;
  const img = document.createElement('img');
  const src = item?.image?.src || `/img/equipment/${item?.id}.svg`;
  const alt = altText ?? item?.image?.alt ?? `${item?.name || 'Equipment'} illustration`;

  img.src = src;
  img.alt = alt;
  img.decoding = isFirst ? 'sync' : 'async';
  img.loading = isFirst ? 'eager' : 'lazy';

  if (size === 'thumb') {
    img.width = 56;
    img.height = 42;
    img.className = 'eq-img-thumb';
  } else if (size === 'large') {
    img.width = 600;
    img.height = 300;
    img.className = 'eq-img-large';
  } else {
    img.width = 360;
    img.height = 140;
    img.className = 'eq-img-card';
  }

  img.addEventListener('error', () => {
    img.src = '/img/placeholder.svg';
    img.alt = 'Equipment photo not available';
  });

  return img;
}

/**
 * Creates a figure with image and honest credit caption.
 * @param {object} item
 * @param {Function} [onZoom]
 * @returns {HTMLElement}
 */
export function createFigureWithCaption(item, onZoom) {
  const figure = document.createElement('figure');
  figure.className = 'eq-figure';

  const img = createEquipmentImage(item, { size: 'large', isFirst: true });
  if (onZoom) {
    img.title = 'Click to zoom';
    img.addEventListener('click', () => onZoom(item));
  }
  figure.appendChild(img);

  const caption = document.createElement('figcaption');
  caption.className = 'eq-figcaption';

  const creditSpan = document.createElement('span');
  creditSpan.textContent = `${item.image?.credit || 'Representative illustration'} · ${item.image?.licence || 'CC0'}`;
  caption.appendChild(creditSpan);

  if (onZoom) {
    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'btn btn-secondary btn-sm';
    zoomBtn.textContent = '🔍 Zoom';
    zoomBtn.setAttribute('aria-label', `Zoom photo of ${item.name}`);
    zoomBtn.addEventListener('click', () => onZoom(item));
    caption.appendChild(zoomBtn);
  }

  figure.appendChild(caption);
  return figure;
}

/**
 * Traps keyboard focus within a modal dialog.
 * @param {HTMLElement} modal
 * @returns {() => void} cleanup function
 */
export function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) { return () => {}; }
  const first = /** @type {HTMLElement} */ (focusable[0]);
  const last  = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);

  function onKeyDown(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }

  modal.addEventListener('keydown', onKeyDown);
  first.focus();
  return () => modal.removeEventListener('keydown', onKeyDown);
}

/**
 * Announces a message to screen readers via aria-live region.
 * @param {string} msg
 */
export function announce(msg) {
  const live = document.getElementById('live-region');
  if (live) {
    live.textContent = '';
    setTimeout(() => { live.textContent = msg; }, 50);
  }
}

/**
 * Shows an accessible image zoom modal.
 * @param {object} item
 */
export function showImageZoomDialog(item) {
  const overlay = document.createElement('div');
  overlay.className = 'zoom-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Enlarged view: ${item.name}`);

  const dialog = document.createElement('div');
  dialog.className = 'zoom-dialog';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-secondary btn-sm';
  closeBtn.textContent = '✕ Close (Esc)';
  closeBtn.setAttribute('aria-label', 'Close zoom view');
  closeBtn.style.marginBottom = '0.5rem';

  const img = createEquipmentImage(item, { size: 'large' });
  img.style.maxHeight = '75vh';

  dialog.appendChild(closeBtn);
  dialog.appendChild(img);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const cleanupTrap = trapFocus(dialog);

  function closeZoom() {
    cleanupTrap();
    window.removeEventListener('keydown', onKey);
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') { closeZoom(); }
  }

  closeBtn.addEventListener('click', closeZoom);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { closeZoom(); }
  });
  window.addEventListener('keydown', onKey);
}
