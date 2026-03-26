// ── IndexedDB wrapper ──
const DB_NAME = 'readx_db';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAllKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Migrate from localStorage if needed ──
async function migrateFromLocalStorage() {
  const migrated = await dbGet('_migrated');
  if (migrated) return;

  const lsKeys = ['readx_books', 'readx_phrases', 'readx_current_book'];
  for (const key of lsKeys) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      await dbPut(key, JSON.parse(val));
    }
  }

  // Migrate pages
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('readx_book_') && key.endsWith('_pages')) {
      try {
        const val = JSON.parse(localStorage.getItem(key));
        await dbPut(key, val);
      } catch {}
    }
  }

  await dbPut('_migrated', true);
  // Clear localStorage after migration
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('readx_')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
