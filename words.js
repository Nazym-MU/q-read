// ── Storage ──
function loadBooks() {
  try { return JSON.parse(localStorage.getItem('readx_books')) || []; }
  catch { return []; }
}

function loadPhrases() {
  try { return JSON.parse(localStorage.getItem('readx_phrases')) || []; }
  catch { return []; }
}

function savePhrases(phrases) {
  localStorage.setItem('readx_phrases', JSON.stringify(phrases));
}

// ── Kazakh month names ──
const months = [
  'қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым',
  'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'
];

function formatDate(isoString) {
  const d = new Date(isoString);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Rendering ──
function render(filterBookId) {
  let phrases = loadPhrases();
  const books = loadBooks();

  // Populate filter dropdown
  const filterEl = document.getElementById('phrases-filter');
  const selectEl = document.getElementById('book-filter');

  if (books.length > 1) {
    filterEl.style.display = '';
    const currentVal = selectEl.value;
    selectEl.innerHTML = '<option value="">Барлығы</option>';
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title;
      selectEl.appendChild(opt);
    });
    selectEl.value = filterBookId || currentVal || '';
  } else {
    filterEl.style.display = 'none';
  }

  // Filter
  if (filterBookId) {
    phrases = phrases.filter(p => p.bookId === filterBookId);
  }

  // Sort newest first
  phrases.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  // Count
  const countEl = document.getElementById('phrases-count');
  countEl.textContent = `Сөз тіркестер саны: ${phrases.length}`;

  const listEl = document.getElementById('phrases-list');
  const emptyEl = document.getElementById('empty-phrases');

  if (phrases.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.innerHTML = '';

  phrases.forEach((p, idx) => {
    const entry = document.createElement('div');
    entry.className = 'phrase-entry';
    entry.innerHTML = `
      <div class="phrase-entry-header">
        <span class="phrase-entry-text">${escapeHtml(p.phrase)}</span>
        <button class="phrase-entry-delete" data-idx="${idx}">жою</button>
      </div>
      <div class="phrase-entry-meta">
        ${escapeHtml(p.bookTitle || '')}${p.page ? ` &bull; ${p.page}-бет` : ''} &bull; ${formatDate(p.savedAt)}
      </div>
    `;
    listEl.appendChild(entry);
  });
}

// ── Events ──
document.getElementById('book-filter').addEventListener('change', (e) => {
  render(e.target.value);
});

document.getElementById('phrases-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.phrase-entry-delete');
  if (!btn) return;

  const filterBookId = document.getElementById('book-filter').value;
  let phrases = loadPhrases();

  // Find the actual phrase in the full list
  let filtered = filterBookId ? phrases.filter(p => p.bookId === filterBookId) : [...phrases];
  filtered.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const idx = parseInt(btn.dataset.idx);
  const phraseToRemove = filtered[idx];
  if (!phraseToRemove) return;

  // Remove from full list
  const fullIdx = phrases.findIndex(p =>
    p.phrase === phraseToRemove.phrase &&
    p.bookId === phraseToRemove.bookId &&
    p.page === phraseToRemove.page &&
    p.savedAt === phraseToRemove.savedAt
  );

  if (fullIdx !== -1) {
    phrases.splice(fullIdx, 1);
    savePhrases(phrases);
    render(filterBookId);
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ──
render('');
