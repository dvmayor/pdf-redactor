/* PDF Redactor — frontend logic */

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const SCALE = 1.5;

// ── State ──────────────────────────────────────────────────────────────────
let _currentPdfBytes = null;   // Uint8Array — current PDF held client-side
let pdfDoc           = null;
let rendering        = false;
let undoStack        = [];     // array of Uint8Array (previous states)

// ── DOM refs ───────────────────────────────────────────────────────────────
const fileInput      = document.getElementById('file-input');
const btnRedact      = document.getElementById('btn-redact');
const btnDownload    = document.getElementById('btn-download');
const btnUndo        = document.getElementById('btn-undo');
const btnTheme       = document.getElementById('btn-theme');
const pageInfo       = document.getElementById('page-info');
const statusBar      = document.getElementById('status-bar');
const emptyState     = document.getElementById('empty-state');
const pagesContainer = document.getElementById('pages-container');
const loadingOverlay = document.getElementById('loading-overlay');
const viewerScroll   = document.getElementById('viewer-scroll');

// ── Theme toggle ───────────────────────────────────────────────────────────
const SUN_SVG  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function applyTheme(isLight) {
  document.documentElement.classList.toggle('light', isLight);
  btnTheme.innerHTML = isLight ? MOON_SVG : SUN_SVG;
  btnTheme.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
}

applyTheme(localStorage.getItem('theme') !== 'dark');

btnTheme.addEventListener('click', () => {
  const isLight = !document.documentElement.classList.contains('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  applyTheme(isLight);
});

// ── Status helpers ─────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  statusBar.textContent = msg;
  statusBar.className = type;
}

function showLoading(on) {
  loadingOverlay.classList.toggle('visible', on);
}

// ── PDF rendering ──────────────────────────────────────────────────────────
async function renderAllPages() {
  if (rendering) return;
  rendering = true;
  pagesContainer.innerHTML = '';

  try {
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page     = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: SCALE });

      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.style.width  = viewport.width  + 'px';
      wrapper.style.height = viewport.height + 'px';

      const canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const tl = document.createElement('div');
      tl.className = 'textLayer';
      tl.style.width  = viewport.width  + 'px';
      tl.style.height = viewport.height + 'px';

      const textContent = await page.getTextContent();
      pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: tl,
        viewport,
        textDivs: [],
      });

      wrapper.appendChild(canvas);
      wrapper.appendChild(tl);
      pagesContainer.appendChild(wrapper);
    }

    pageInfo.textContent = `${pdfDoc.numPages} page${pdfDoc.numPages !== 1 ? 's' : ''}`;
  } finally {
    rendering = false;
  }
}

// Active blob URL — kept alive until replaced (PDF.js worker reads it lazily)
let _activeBlobUrl = null;

async function loadPdfFromBytes(bytes) {
  const prevUrl = _activeBlobUrl;
  const blob = new Blob([bytes], { type: 'application/pdf' });
  _activeBlobUrl = URL.createObjectURL(blob);

  pdfDoc = await pdfjsLib.getDocument(_activeBlobUrl).promise;

  if (prevUrl) URL.revokeObjectURL(prevUrl);

  emptyState.style.display = 'none';
  await renderAllPages();
}

// ── Open file ─────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Please select a PDF file.', 'error');
    return;
  }

  showLoading(true);
  setStatus('Opening…', 'loading');

  try {
    const buf = await file.arrayBuffer();
    _currentPdfBytes = new Uint8Array(buf);
    undoStack = [];
    btnUndo.disabled     = true;
    btnRedact.disabled   = false;
    btnDownload.disabled = false;

    await loadPdfFromBytes(_currentPdfBytes);
    setStatus(`Loaded "${file.name}". Select text and click Redact Selected.`, 'success');
  } catch (err) {
    setStatus('Error opening file: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

emptyState.addEventListener('click', () => fileInput.click());

// ── Drag-and-drop ──────────────────────────────────────────────────────────
viewerScroll.addEventListener('dragover', e => {
  e.preventDefault();
  emptyState.classList.add('drag-over');
});
viewerScroll.addEventListener('dragleave', () => {
  emptyState.classList.remove('drag-over');
});
viewerScroll.addEventListener('drop', e => {
  e.preventDefault();
  emptyState.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// ── Redact ─────────────────────────────────────────────────────────────────
btnRedact.addEventListener('click', async () => {
  if (!_currentPdfBytes) return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    setStatus('Nothing selected — drag to highlight text first.', 'error');
    return;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    setStatus('Selection appears empty — try again.', 'error');
    return;
  }

  selection.removeAllRanges();
  showLoading(true);
  setStatus('Applying redaction across all pages…', 'loading');

  // Save current bytes for undo before modifying
  undoStack.push(_currentPdfBytes);
  btnUndo.disabled = false;

  try {
    const formData = new FormData();
    formData.append('file', new Blob([_currentPdfBytes], { type: 'application/pdf' }), 'doc.pdf');
    formData.append('selected_text', selectedText);

    const res = await fetch('/redact', { method: 'POST', body: formData });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      undoStack.pop();
      btnUndo.disabled = undoStack.length === 0;
      setStatus('Redaction failed: ' + (err.detail || res.statusText), 'error');
      return;
    }

    const count = res.headers.get('X-Redaction-Count') || '?';
    _currentPdfBytes = new Uint8Array(await res.arrayBuffer());
    await loadPdfFromBytes(_currentPdfBytes);
    setStatus(
      `Redacted ${count} occurrence${count === '1' ? '' : 's'} across all pages. ` +
      'Select more text or click Download.',
      'success'
    );
  } catch (err) {
    undoStack.pop();
    btnUndo.disabled = undoStack.length === 0;
    setStatus('Error: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
});

// ── Undo ───────────────────────────────────────────────────────────────────
btnUndo.addEventListener('click', async () => {
  if (!undoStack.length) return;

  showLoading(true);
  setStatus('Undoing…', 'loading');

  try {
    _currentPdfBytes = undoStack.pop();
    btnUndo.disabled = undoStack.length === 0;
    await loadPdfFromBytes(_currentPdfBytes);
    setStatus('Undo successful.', 'success');
  } catch (err) {
    setStatus('Undo error: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
});

// ── Download ───────────────────────────────────────────────────────────────
btnDownload.addEventListener('click', () => {
  if (!_currentPdfBytes) return;
  const blob = new Blob([_currentPdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'redacted.pdf';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Download started.', 'success');
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'r' && !btnRedact.disabled) btnRedact.click();
  if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) && !btnUndo.disabled) {
    e.preventDefault();
    btnUndo.click();
  }
});
