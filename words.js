// ── Storage (db.js is loaded before this script) ──
async function loadBooks() {
  try { return (await dbGet('readx_books')) || []; }
  catch { return []; }
}

async function loadPhrases() {
  try { return (await dbGet('readx_phrases')) || []; }
  catch { return []; }
}

async function savePhrases(phrases) {
  await dbPut('readx_phrases', phrases);
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ── Rendering ──
async function render(filterBookId) {
  let phrases = await loadPhrases();
  const books = await loadBooks();

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

  if (filterBookId) {
    phrases = phrases.filter(p => p.bookId === filterBookId);
  }

  phrases.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

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
    entry.dataset.idx = idx;
    entry.innerHTML = `
      <div class="phrase-entry-header">
        <span class="phrase-entry-text">${escapeHtml(p.phrase)}</span>
        <div class="phrase-entry-actions">
          <button class="phrase-entry-edit" data-idx="${idx}">өңдеу</button>
          <button class="phrase-entry-delete" data-idx="${idx}">жою</button>
        </div>
      </div>
      ${p.note ? `<div class="phrase-entry-note">${escapeHtml(p.note)}</div>` : ''}
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

document.getElementById('phrases-list').addEventListener('click', async (e) => {
  const filterBookId = document.getElementById('book-filter').value;

  // Delete
  const delBtn = e.target.closest('.phrase-entry-delete');
  if (delBtn) {
    let phrases = await loadPhrases();
    let filtered = filterBookId ? phrases.filter(p => p.bookId === filterBookId) : [...phrases];
    filtered.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    const idx = parseInt(delBtn.dataset.idx);
    const phraseToRemove = filtered[idx];
    if (!phraseToRemove) return;

    const fullIdx = phrases.findIndex(p =>
      p.phrase === phraseToRemove.phrase &&
      p.bookId === phraseToRemove.bookId &&
      p.page === phraseToRemove.page &&
      p.savedAt === phraseToRemove.savedAt
    );

    if (fullIdx !== -1) {
      phrases.splice(fullIdx, 1);
      await savePhrases(phrases);
      render(filterBookId);
    }
    return;
  }

  // Edit
  const editBtn = e.target.closest('.phrase-entry-edit');
  if (editBtn) {
    const idx = parseInt(editBtn.dataset.idx);
    let phrases = await loadPhrases();
    let filtered = filterBookId ? phrases.filter(p => p.bookId === filterBookId) : [...phrases];
    filtered.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    const phraseToEdit = filtered[idx];
    if (!phraseToEdit) return;

    const entry = editBtn.closest('.phrase-entry');
    openEditMode(entry, phraseToEdit, phrases, filterBookId);
    return;
  }
});

function openEditMode(entry, phraseObj, allPhrases, filterBookId) {
  // Avoid double-opening
  if (entry.querySelector('.phrase-edit-form')) return;

  entry.innerHTML = `
    <div class="phrase-edit-form">
      <label class="phrase-edit-label">Сөз тіркес</label>
      <input class="phrase-edit-text" type="text" value="${escapeHtml(phraseObj.phrase)}" autocomplete="off">
      <label class="phrase-edit-label">Түсіндірме</label>
      <input class="phrase-edit-note" type="text" value="${escapeHtml(phraseObj.note || '')}" placeholder="Түсіндірме қосыңыз" autocomplete="off">
      <div class="phrase-edit-actions">
        <button class="phrase-edit-save btn">Сақтау</button>
        <button class="phrase-edit-cancel btn-ghost">Болдырмау</button>
      </div>
    </div>
  `;

  entry.querySelector('.phrase-edit-cancel').addEventListener('click', () => render(filterBookId));

  entry.querySelector('.phrase-edit-save').addEventListener('click', async () => {
    const newPhrase = entry.querySelector('.phrase-edit-text').value.trim();
    const newNote = entry.querySelector('.phrase-edit-note').value.trim();
    if (!newPhrase) return;

    const fullIdx = allPhrases.findIndex(p =>
      p.phrase === phraseObj.phrase &&
      p.bookId === phraseObj.bookId &&
      p.page === phraseObj.page &&
      p.savedAt === phraseObj.savedAt
    );

    if (fullIdx !== -1) {
      allPhrases[fullIdx] = { ...allPhrases[fullIdx], phrase: newPhrase, note: newNote };
      await savePhrases(allPhrases);
    }
    render(filterBookId);
  });
}

// ── Init ──
render('');
