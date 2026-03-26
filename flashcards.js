// ── Storage (reuse db.js helpers already loaded) ──
async function loadBooks() {
  try { return (await dbGet('readx_books')) || []; }
  catch { return []; }
}

async function loadPhrases() {
  try { return (await dbGet('readx_phrases')) || []; }
  catch { return []; }
}

// ── State ──
let cards = [];
let currentIdx = 0;
let isFlipped = false;

// ── Shuffle ──
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Render card ──
function showCard(idx) {
  const card = cards[idx];
  document.getElementById('flashcard-phrase').textContent = card.phrase;
  document.getElementById('flashcard-note').textContent = card.note || '—';
  document.getElementById('flashcard-meta').textContent =
    (card.bookTitle || '') + (card.page ? ` · ${card.page}-бет` : '');
  document.getElementById('fc-counter').textContent = `${idx + 1} / ${cards.length}`;
  document.getElementById('fc-prev').disabled = idx <= 0;
  document.getElementById('fc-next').disabled = idx >= cards.length - 1;

  // Reset flip
  isFlipped = false;
  document.getElementById('flashcard-inner').classList.remove('flipped');
}

// ── Filter & init deck ──
async function buildDeck(filterBookId) {
  let phrases = await loadPhrases();
  if (filterBookId) phrases = phrases.filter(p => p.bookId === filterBookId);

  cards = shuffle([...phrases]);
  currentIdx = 0;

  const emptyEl = document.getElementById('empty-state');
  const deckEl = document.getElementById('flashcard-deck');

  if (cards.length === 0) {
    emptyEl.style.display = '';
    deckEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  deckEl.style.display = '';
  showCard(0);
}

// ── Populate filter ──
async function populateFilter() {
  const books = await loadBooks();
  const filterEl = document.getElementById('phrases-filter');
  const selectEl = document.getElementById('book-filter');

  if (books.length > 1) {
    filterEl.style.display = '';
    selectEl.innerHTML = '<option value="">Барлығы</option>';
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title;
      selectEl.appendChild(opt);
    });
  } else {
    filterEl.style.display = 'none';
  }
}

// ── Events ──
document.getElementById('flashcard').addEventListener('click', () => {
  isFlipped = !isFlipped;
  document.getElementById('flashcard-inner').classList.toggle('flipped', isFlipped);
});

document.getElementById('fc-prev').addEventListener('click', () => {
  if (currentIdx > 0) { currentIdx--; showCard(currentIdx); }
});

document.getElementById('fc-next').addEventListener('click', () => {
  if (currentIdx < cards.length - 1) { currentIdx++; showCard(currentIdx); }
});

document.getElementById('fc-shuffle').addEventListener('click', () => {
  const filterBookId = document.getElementById('book-filter').value;
  buildDeck(filterBookId);
});

document.getElementById('book-filter').addEventListener('change', (e) => {
  buildDeck(e.target.value);
});

// ── Keyboard navigation ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (currentIdx < cards.length - 1) { currentIdx++; showCard(currentIdx); }
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (currentIdx > 0) { currentIdx--; showCard(currentIdx); }
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    isFlipped = !isFlipped;
    document.getElementById('flashcard-inner').classList.toggle('flipped', isFlipped);
  }
});

// ── Init ──
async function init() {
  await populateFilter();
  await buildDeck('');
}

init();
