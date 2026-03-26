// ── Storage Keys ──
const KEYS = {
  books: 'readx_books',
  pages: (id) => `readx_book_${id}_pages`,
  phrases: 'readx_phrases',
  currentBook: 'readx_current_book'
};

// ── Storage Helpers (IndexedDB-backed) ──
async function loadBooks() {
  try { return (await dbGet(KEYS.books)) || []; }
  catch { return []; }
}

async function saveBooks(books) {
  await dbPut(KEYS.books, books);
}

async function loadPages(bookId) {
  try { return (await dbGet(KEYS.pages(bookId))) || []; }
  catch { return []; }
}

async function savePages(bookId, pages) {
  await dbPut(KEYS.pages(bookId), pages);
}

async function loadPhrases() {
  try { return (await dbGet(KEYS.phrases)) || []; }
  catch { return []; }
}

async function savePhrases(phrases) {
  await dbPut(KEYS.phrases, phrases);
}

async function deleteBook(bookId) {
  const books = (await loadBooks()).filter(b => b.id !== bookId);
  await saveBooks(books);
  await dbDelete(KEYS.pages(bookId));
  const phrases = (await loadPhrases()).filter(p => p.bookId !== bookId);
  await savePhrases(phrases);
}

function generateId() {
  return Math.random().toString(16).slice(2, 8);
}

// ── Day / Page Calculation ──
function getTodayDayIndex(book) {
  const start = new Date(book.startDate);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

function getChunk(book, dayIndex) {
  const ppd = book.pagesPerDay || 5;
  const startPage = dayIndex * ppd;
  const endPage = Math.min(startPage + ppd, book.totalPages);
  const isFinished = startPage >= book.totalPages;
  return { startPage, endPage, dayIndex, isFinished, pagesPerDay: ppd };
}

function getProgress(book) {
  const chunk = getChunk(book, getTodayDayIndex(book));
  const currentPage = chunk.isFinished ? book.totalPages : chunk.endPage;
  const percent = Math.round((currentPage / book.totalPages) * 100);
  return { currentPage, totalPages: book.totalPages, percent };
}

// ── PDF Parsing ──
async function parsePDF(file, onProgress) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let title = file.name.replace(/\.pdf$/i, '');
  try {
    const meta = await pdf.getMetadata();
    if (meta.info && meta.info.Title && meta.info.Title.trim()) {
      title = meta.info.Title.trim();
    }
  } catch {}

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    let lastY = null;
    for (const item of content.items) {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
        text += '\n';
      }
      text += item.str;
      lastY = item.transform[5];
    }
    text = text.replace(/^\s*\d+\s*$/gm, '').trim();
    if (text.length < 50 && i > 1 && i < pdf.numPages) {
      if (pages.length > 0) {
        pages[pages.length - 1] += '\n\n' + text;
      }
    } else {
      pages.push(text);
    }
    if (onProgress) onProgress(i, pdf.numPages);
  }
  return { title, pages, totalPages: pages.length };
}

// ── DOM Refs ──
const $ = (sel) => document.querySelector(sel);
const uploadScreen = $('#upload-screen');
const loadingScreen = $('#loading-screen');
const libraryView = $('#library-view');
const readingView = $('#reading-view');
const uploadModal = $('#upload-modal');
const toast = $('#toast');

// ── View Switching ──
function showView(view) {
  [uploadScreen, loadingScreen, libraryView, readingView].forEach(v => v.style.display = 'none');
  view.style.display = '';
}

// ── Toast ──
let toastTimeout;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2000);
}

// ── Phrase Count Badge ──
async function updatePhraseCounts() {
  const count = (await loadPhrases()).length;
  const text = count > 0 ? `Сөз тіркестері → ${count}` : 'Сөз тіркестері →';
  const libBadge = $('#lib-phrase-count');
  const readBadge = $('#reading-phrase-count');
  if (libBadge) libBadge.textContent = text;
  if (readBadge) readBadge.textContent = text;
}

// ── Library Rendering ──
async function renderLibrary() {
  const books = await loadBooks();
  const list = $('#book-list');
  await updatePhraseCounts();

  if (books.length === 0) {
    showView(uploadScreen);
    return;
  }

  showView(libraryView);
  list.innerHTML = '';

  books.forEach(book => {
    const progress = getProgress(book);
    const dayIndex = getTodayDayIndex(book);
    const isFinished = getChunk(book, dayIndex).isFinished;

    const li = document.createElement('li');
    li.className = 'book-item';
    li.innerHTML = `
      <div class="book-item-header">
        <span class="book-title">${escapeHtml(book.title)}</span>
        <div class="book-actions">
          ${isFinished
            ? '<span class="book-status book-status-finished">Аяқталды</span>'
            : `<button class="btn" data-read="${book.id}">Оқу</button>`}
          <button class="btn-ghost" data-delete="${book.id}">Жою</button>
        </div>
      </div>
      <div class="book-progress">
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width:${progress.percent}%"></div>
        </div>
      </div>
      <span class="book-status">${progress.currentPage} / ${progress.totalPages} бет</span>
    `;
    list.appendChild(li);
  });

  list.onclick = (e) => {
    const readBtn = e.target.closest('[data-read]');
    const delBtn = e.target.closest('[data-delete]');
    if (readBtn) openBook(readBtn.dataset.read);
    if (delBtn) {
      const book = books.find(b => b.id === delBtn.dataset.delete);
      if (book && confirm(`"${book.title}" кітабын жою керек пе?`)) {
        deleteBook(delBtn.dataset.delete).then(renderLibrary);
      }
    }
  };
}

// ── Reading View ──
let currentBookId = null;
let viewingDayIndex = null;

async function openBook(bookId) {
  currentBookId = bookId;
  await dbPut(KEYS.currentBook, bookId);

  const books = await loadBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) return renderLibrary();

  viewingDayIndex = getTodayDayIndex(book);
  renderReadingView(book, viewingDayIndex);
}

async function renderReadingView(book, dayIndex) {
  showView(readingView);
  await updatePhraseCounts();
  removeSavePopup();

  const chunk = getChunk(book, dayIndex);
  const pages = await loadPages(book.id);
  const todayDayIndex = getTodayDayIndex(book);
  const progress = getProgress(book);

  $('#reading-book-title').textContent = book.title;

  if (chunk.isFinished) {
    $('#completion-screen').style.display = '';
    $('#pages-container').style.display = 'none';
    $('#day-nav').style.display = 'none';
    $('#reading-page-range').textContent = '';
    $('#reading-progress-fill').style.width = '100%';
    $('#reading-progress-info').textContent = `${book.totalPages} бет аяқталды`;
    return;
  }

  $('#completion-screen').style.display = 'none';
  $('#pages-container').style.display = '';
  $('#day-nav').style.display = '';

  $('#reading-page-range').textContent = `Бет ${chunk.startPage + 1}–${chunk.endPage}`;
  $('#reading-progress-fill').style.width = `${progress.percent}%`;
  $('#reading-progress-info').textContent = `${book.totalPages} беттің ${chunk.endPage}-і`;

  const container = $('#pages-container');
  container.innerHTML = '';

  for (let i = chunk.startPage; i < chunk.endPage && i < pages.length; i++) {
    if (i > chunk.startPage) {
      const hr = document.createElement('hr');
      hr.className = 'page-break';
      container.appendChild(hr);
    }

    const label = document.createElement('span');
    label.className = 'page-label';
    label.textContent = `${i + 1}-бет`;
    container.appendChild(label);

    const pageText = pages[i] || '';
    const paragraphs = pageText.split(/\n{2,}/);

    paragraphs.forEach(para => {
      if (!para.trim()) return;
      const div = document.createElement('div');
      div.className = 'paragraph';
      div.dataset.page = i + 1;
      div.textContent = para.trim();
      container.appendChild(div);
    });
  }

  await highlightSavedPhrases(book.id, chunk.startPage + 1, chunk.endPage);

  const prevBtn = $('#prev-day');
  const nextBtn = $('#next-day');
  const dayLabel = $('#day-label');

  prevBtn.disabled = dayIndex <= 0;
  nextBtn.disabled = dayIndex >= todayDayIndex;

  if (dayIndex === todayDayIndex) {
    dayLabel.textContent = 'Бүгін';
  } else {
    const diff = todayDayIndex - dayIndex;
    dayLabel.textContent = `${diff} күн бұрын`;
  }

  window.scrollTo(0, 0);
}

// ── Highlight saved phrases in the rendered text ──
async function highlightSavedPhrases(bookId, startPage, endPage) {
  const allPhrases = await loadPhrases();
  const phrases = allPhrases.filter(p =>
    p.bookId === bookId && p.page >= startPage && p.page <= endPage
  );
  if (phrases.length === 0) return;

  const paragraphs = document.querySelectorAll('#pages-container .paragraph');
  paragraphs.forEach(div => {
    const page = parseInt(div.dataset.page);
    const relevantPhrases = phrases.filter(p => p.page === page);
    if (relevantPhrases.length === 0) return;

    let html = escapeHtml(div.textContent);
    relevantPhrases.sort((a, b) => b.phrase.length - a.phrase.length);
    for (const p of relevantPhrases) {
      const escaped = escapeHtml(p.phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      html = html.replace(regex, `<mark class="saved-phrase" title="${escapeHtml(p.note || '')}">$&</mark>`);
    }
    div.innerHTML = html;
  });
}

// ── Save Popup (phrase + note) ──
let savePopup = null;

function removeSavePopup() {
  if (savePopup) {
    savePopup.remove();
    savePopup = null;
  }
}

document.addEventListener('mouseup', (e) => {
  setTimeout(() => handleSelection(e), 10);
});

document.addEventListener('mousedown', (e) => {
  if (savePopup && !savePopup.contains(e.target)) {
    removeSavePopup();
  }
});

function handleSelection(e) {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';

  if (!text || text.length < 2) return;

  const container = $('#pages-container');
  if (!container) return;

  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if (!container.contains(anchor) || !container.contains(focus)) return;

  const paragraph = anchor.nodeType === 3
    ? anchor.parentElement.closest('.paragraph')
    : anchor.closest('.paragraph');
  const page = paragraph ? parseInt(paragraph.dataset.page) : null;

  removeSavePopup();
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  savePopup = document.createElement('div');
  savePopup.className = 'save-popup';
  savePopup.innerHTML = `
    <input class="save-popup-note" type="text" placeholder="Түсіндірме" autocomplete="off">
    <button class="save-popup-btn">✓ Сақтау</button>
  `;

  const popupWidth = 260;
  let left = rect.left + window.scrollX + rect.width / 2 - popupWidth / 2;
  left = Math.max(8, Math.min(left, document.body.clientWidth - popupWidth - 8));
  const top = rect.top + window.scrollY - 62;

  savePopup.style.left = `${left}px`;
  savePopup.style.top = `${top}px`;
  document.body.appendChild(savePopup);

  // Focus the note input
  const noteInput = savePopup.querySelector('.save-popup-note');
  const btn = savePopup.querySelector('.save-popup-btn');
  noteInput.focus();

  const doSave = async () => {
    const note = noteInput.value.trim();
    const books = await loadBooks();
    const book = books.find(b => b.id === currentBookId);
    if (!book) return;

    const phrases = await loadPhrases();
    phrases.push({
      phrase: text,
      bookId: currentBookId,
      bookTitle: book.title,
      page: page,
      savedAt: new Date().toISOString(),
      note: note
    });
    await savePhrases(phrases);
    await updatePhraseCounts();

    if (paragraph) {
      let html = paragraph.innerHTML;
      const escaped = escapeHtml(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      html = html.replace(regex, `<mark class="saved-phrase" title="${escapeHtml(note)}">$&</mark>`);
      paragraph.innerHTML = html;
    }

    sel.removeAllRanges();
    removeSavePopup();
    showToast(`✓ сақталды`);
  };

  btn.addEventListener('click', doSave);
  noteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') removeSavePopup();
  });
}

// ── Navigation Handlers ──
$('#back-to-library').addEventListener('click', renderLibrary);
$('#completion-back').addEventListener('click', renderLibrary);

$('#prev-day').addEventListener('click', async () => {
  if (viewingDayIndex > 0) {
    viewingDayIndex--;
    const book = (await loadBooks()).find(b => b.id === currentBookId);
    if (book) renderReadingView(book, viewingDayIndex);
  }
});

$('#next-day').addEventListener('click', async () => {
  const book = (await loadBooks()).find(b => b.id === currentBookId);
  if (!book) return;
  const todayDayIndex = getTodayDayIndex(book);
  if (viewingDayIndex < todayDayIndex) {
    viewingDayIndex++;
    renderReadingView(book, viewingDayIndex);
  }
});

// ── Upload: Initial Screen ──
const dropZone = $('#drop-zone');
const fileInputInitial = $('#file-input-initial');

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') handleInitialUpload(file);
});
fileInputInitial.addEventListener('change', (e) => {
  if (e.target.files[0]) handleInitialUpload(e.target.files[0]);
});

async function handleInitialUpload(file) {
  showView(loadingScreen);
  try {
    const { title, pages, totalPages } = await parsePDF(file, (done, total) => {
      $('#loading-text').textContent = `${done} / ${total} бет жүктелді`;
      $('#loading-progress').style.width = `${Math.round((done / total) * 100)}%`;
    });

    const id = generateId();
    const book = {
      id,
      title,
      totalPages,
      startDate: new Date().toISOString().slice(0, 10),
      pagesPerDay: 5
    };
    const books = await loadBooks();
    books.push(book);
    await saveBooks(books);
    await savePages(id, pages);
    renderLibrary();
  } catch (err) {
    console.error('PDF parsing failed:', err);
    alert('PDF файлын оқу барысында қате шықты.');
    showView(uploadScreen);
  }
}

// ── Upload: Modal (add another book) ──
let pendingParsedData = null;

$('#add-book-btn').addEventListener('click', () => {
  pendingParsedData = null;
  $('#modal-fields').style.display = 'none';
  $('#modal-save').style.display = 'none';
  $('#file-input-modal').value = '';
  $('#modal-drop-zone').querySelector('.drop-zone-text').textContent = 'PDF файлды таңдаңыз';
  uploadModal.style.display = '';
});

$('#modal-cancel').addEventListener('click', () => {
  uploadModal.style.display = 'none';
  pendingParsedData = null;
});

uploadModal.addEventListener('click', (e) => {
  if (e.target === uploadModal) {
    uploadModal.style.display = 'none';
    pendingParsedData = null;
  }
});

$('#file-input-modal').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const dropText = $('#modal-drop-zone').querySelector('.drop-zone-text');
  dropText.textContent = 'Жүктеліде...';

  try {
    const result = await parsePDF(file, (done, total) => {
      dropText.textContent = `${done} / ${total} бет жүктелді`;
    });
    pendingParsedData = result;
    dropText.textContent = `${result.totalPages} бет оқыдыңыз`;
    $('#modal-title').value = result.title;
    $('#modal-pages-per-day').value = 5;
    $('#modal-fields').style.display = '';
    $('#modal-save').style.display = '';
  } catch (err) {
    console.error('PDF parsing failed:', err);
    dropText.textContent = 'Қате. Қайтадан таңдап көріңіз.';
  }
});

$('#modal-save').addEventListener('click', async () => {
  if (!pendingParsedData) return;

  const title = $('#modal-title').value.trim() || pendingParsedData.title;
  const ppd = parseInt($('#modal-pages-per-day').value) || 5;

  const id = generateId();
  const book = {
    id,
    title,
    totalPages: pendingParsedData.totalPages,
    startDate: new Date().toISOString().slice(0, 10),
    pagesPerDay: Math.max(1, Math.min(50, ppd))
  };

  const books = await loadBooks();
  books.push(book);
  await saveBooks(books);
  await savePages(id, pendingParsedData.pages);

  pendingParsedData = null;
  uploadModal.style.display = 'none';
  renderLibrary();
});

// ── Drag and drop on modal ──
const modalDropZone = $('#modal-drop-zone');
modalDropZone.addEventListener('dragover', (e) => { e.preventDefault(); modalDropZone.classList.add('dragover'); });
modalDropZone.addEventListener('dragleave', () => modalDropZone.classList.remove('dragover'));
modalDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  modalDropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    const dt = new DataTransfer();
    dt.items.add(file);
    $('#file-input-modal').files = dt.files;
    $('#file-input-modal').dispatchEvent(new Event('change'));
  }
});

// ── Export / Import ──
$('#export-btn').addEventListener('click', async () => {
  const books = await loadBooks();
  const phrases = await loadPhrases();
  const pagesData = {};
  for (const book of books) {
    pagesData[book.id] = await loadPages(book.id);
  }

  const data = { books, phrases, pages: pagesData, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `readx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Экспортталды');
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.books || !data.phrases) throw new Error('Invalid format');

    if (!confirm('Бар деректерді ауыстыру керек пе? Бар кітаптар жойылады.')) {
      e.target.value = '';
      return;
    }

    // Clear existing pages
    const existingBooks = await loadBooks();
    for (const book of existingBooks) {
      await dbDelete(KEYS.pages(book.id));
    }

    await saveBooks(data.books);
    await savePhrases(data.phrases);
    if (data.pages) {
      for (const [bookId, pages] of Object.entries(data.pages)) {
        await savePages(bookId, pages);
      }
    }

    e.target.value = '';
    showToast('✓ Сөздік қосылды');
    renderLibrary();
  } catch (err) {
    console.error('Import failed:', err);
    alert('Файлды оқу барысында қате шықты.');
    e.target.value = '';
  }
});

// ── Utility ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ──
async function init() {
  await migrateFromLocalStorage();
  const books = await loadBooks();
  if (books.length === 0) {
    showView(uploadScreen);
  } else {
    renderLibrary();
  }
}

init();
