// ── Storage Keys ──
const KEYS = {
  books: 'readx_books',
  pages: (id) => `readx_book_${id}_pages`,
  phrases: 'readx_phrases',
  currentBook: 'readx_current_book'
};

// ── Storage Helpers ──
function loadBooks() {
  try { return JSON.parse(localStorage.getItem(KEYS.books)) || []; }
  catch { return []; }
}

function saveBooks(books) {
  localStorage.setItem(KEYS.books, JSON.stringify(books));
}

function loadPages(bookId) {
  try { return JSON.parse(localStorage.getItem(KEYS.pages(bookId))) || []; }
  catch { return []; }
}

function savePages(bookId, pages) {
  try {
    localStorage.setItem(KEYS.pages(bookId), JSON.stringify(pages));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Бос орын қалмады. Орын босату үшін басқа кітаптарды алып тастаңыз.');
    }
    throw e;
  }
}

function loadPhrases() {
  try { return JSON.parse(localStorage.getItem(KEYS.phrases)) || []; }
  catch { return []; }
}

function savePhrases(phrases) {
  localStorage.setItem(KEYS.phrases, JSON.stringify(phrases));
}

function deleteBook(bookId) {
  const books = loadBooks().filter(b => b.id !== bookId);
  saveBooks(books);
  localStorage.removeItem(KEYS.pages(bookId));
  const phrases = loadPhrases().filter(p => p.bookId !== bookId);
  savePhrases(phrases);
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
    // Strip isolated page numbers (a line that is just a number)
    text = text.replace(/^\s*\d+\s*$/gm, '').trim();
    // Skip mostly-empty pages (less than 50 chars of content)
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
function updatePhraseCounts() {
  const count = loadPhrases().length;
  const text = count > 0 ? `Сөз тіркестері → ${count}` : 'Сөз тіркестері →';
  const libBadge = $('#lib-phrase-count');
  const readBadge = $('#reading-phrase-count');
  if (libBadge) libBadge.textContent = text;
  if (readBadge) readBadge.textContent = text;
}

// ── Library Rendering ──
function renderLibrary() {
  const books = loadBooks();
  const list = $('#book-list');
  updatePhraseCounts();

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

  // Event delegation
  list.onclick = (e) => {
    const readBtn = e.target.closest('[data-read]');
    const delBtn = e.target.closest('[data-delete]');
    if (readBtn) openBook(readBtn.dataset.read);
    if (delBtn) {
      const book = books.find(b => b.id === delBtn.dataset.delete);
      if (book && confirm(`"${book.title}" кітабын жою керек пе?`)) {
        deleteBook(delBtn.dataset.delete);
        renderLibrary();
      }
    }
  };
}

// ── Reading View ──
let currentBookId = null;
let viewingDayIndex = null;

function openBook(bookId) {
  currentBookId = bookId;
  localStorage.setItem(KEYS.currentBook, bookId);

  const books = loadBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) return renderLibrary();

  viewingDayIndex = getTodayDayIndex(book);
  renderReadingView(book, viewingDayIndex);
}

function renderReadingView(book, dayIndex) {
  showView(readingView);
  updatePhraseCounts();
  removeSaveButton();

  const chunk = getChunk(book, dayIndex);
  const pages = loadPages(book.id);
  const todayDayIndex = getTodayDayIndex(book);
  const progress = getProgress(book);

  // Header
  $('#reading-book-title').textContent = book.title;

  // Completion
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

  // Page range & progress
  $('#reading-page-range').textContent = `Бет ${chunk.startPage + 1}–${chunk.endPage}`;
  $('#reading-progress-fill').style.width = `${progress.percent}%`;
  $('#reading-progress-info').textContent = `${book.totalPages} беттің ${chunk.endPage}-і`;

  // Render pages as plain text paragraphs
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

  // Highlight previously saved phrases on this page range
  highlightSavedPhrases(book.id, chunk.startPage + 1, chunk.endPage);

  // Day navigation
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

  // Scroll to top
  window.scrollTo(0, 0);
}

// ── Highlight saved phrases in the rendered text ──
function highlightSavedPhrases(bookId, startPage, endPage) {
  const phrases = loadPhrases().filter(p =>
    p.bookId === bookId && p.page >= startPage && p.page <= endPage
  );
  if (phrases.length === 0) return;

  const paragraphs = document.querySelectorAll('#pages-container .paragraph');
  paragraphs.forEach(div => {
    const page = parseInt(div.dataset.page);
    const relevantPhrases = phrases.filter(p => p.page === page);
    if (relevantPhrases.length === 0) return;

    let html = escapeHtml(div.textContent);
    // Sort by length descending to avoid partial matches overwriting longer ones
    relevantPhrases.sort((a, b) => b.phrase.length - a.phrase.length);
    for (const p of relevantPhrases) {
      const escaped = escapeHtml(p.phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      html = html.replace(regex, `<mark class="saved-phrase">$&</mark>`);
    }
    div.innerHTML = html;
  });
}

// ── Phrase Selection & Save ──
let saveBtn = null;

function removeSaveButton() {
  if (saveBtn) {
    saveBtn.remove();
    saveBtn = null;
  }
}

document.addEventListener('mouseup', (e) => {
  // Small delay to let selection settle
  setTimeout(() => handleSelection(e), 10);
});

document.addEventListener('mousedown', (e) => {
  if (saveBtn && !saveBtn.contains(e.target)) {
    removeSaveButton();
  }
});

function handleSelection(e) {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';

  if (!text || text.length < 2) {
    return;
  }

  // Check if selection is within the pages container
  const container = $('#pages-container');
  if (!container) return;

  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if (!container.contains(anchor) || !container.contains(focus)) return;

  // Find the page number from the nearest paragraph
  const paragraph = anchor.nodeType === 3
    ? anchor.parentElement.closest('.paragraph')
    : anchor.closest('.paragraph');
  const page = paragraph ? parseInt(paragraph.dataset.page) : null;

  // Position the save button near the selection
  removeSaveButton();
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  saveBtn = document.createElement('button');
  saveBtn.className = 'save-phrase-btn';
  saveBtn.textContent = '✓ Сақтау';
  saveBtn.style.left = `${rect.left + window.scrollX + rect.width / 2 - 40}px`;
  saveBtn.style.top = `${rect.top + window.scrollY - 35}px`;
  document.body.appendChild(saveBtn);

  saveBtn.addEventListener('click', () => {
    const books = loadBooks();
    const book = books.find(b => b.id === currentBookId);
    if (!book) return;

    const phrases = loadPhrases();
    phrases.push({
      phrase: text,
      bookId: currentBookId,
      bookTitle: book.title,
      page: page,
      savedAt: new Date().toISOString()
    });
    savePhrases(phrases);
    updatePhraseCounts();

    // Highlight the just-saved phrase
    if (paragraph) {
      let html = paragraph.innerHTML;
      const escaped = escapeHtml(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      html = html.replace(regex, `<mark class="saved-phrase">$&</mark>`);
      paragraph.innerHTML = html;
    }

    sel.removeAllRanges();
    removeSaveButton();
    showToast(`✓ сақталды`);
  });
}

// ── Navigation Handlers ──
$('#back-to-library').addEventListener('click', renderLibrary);
$('#completion-back').addEventListener('click', renderLibrary);

$('#prev-day').addEventListener('click', () => {
  if (viewingDayIndex > 0) {
    viewingDayIndex--;
    const book = loadBooks().find(b => b.id === currentBookId);
    if (book) renderReadingView(book, viewingDayIndex);
  }
});

$('#next-day').addEventListener('click', () => {
  const book = loadBooks().find(b => b.id === currentBookId);
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
      $('#loading-text').textContent = `Оқылғаны... ${done} / ${total} бет`;
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
    const books = loadBooks();
    books.push(book);
    saveBooks(books);
    savePages(id, pages);
    renderLibrary();
  } catch (err) {
    console.error('PDF parsing failed:', err);
    alert('PDF файлын оқу мүмкін болмады.');
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
      dropText.textContent = `Оқылғаны... ${done} / ${total} бет`;
    });
    pendingParsedData = result;
    dropText.textContent = `${result.totalPages} бет оқыдыңыз`;
    $('#modal-title').value = result.title;
    $('#modal-pages-per-day').value = 5;
    $('#modal-fields').style.display = '';
    $('#modal-save').style.display = '';
  } catch (err) {
    console.error('PDF parsing failed:', err);
    dropText.textContent = 'Қате. Қайта таңдаңыз.';
  }
});

$('#modal-save').addEventListener('click', () => {
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

  try {
    const books = loadBooks();
    books.push(book);
    saveBooks(books);
    savePages(id, pendingParsedData.pages);
  } catch {
    return; // QuotaExceededError already alerted in savePages
  }

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

// ── Utility ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ──
function init() {
  const books = loadBooks();
  if (books.length === 0) {
    showView(uploadScreen);
  } else {
    renderLibrary();
  }
}

init();
