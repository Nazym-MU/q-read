# ReadX

A personal daily reading tracker for PDF books in Kazakh. Upload a PDF, read 5 pages per day, and save words you want to remember — all from a single HTML file with no server required.

## How to use

1. Open `index.html` in your browser (Arc, Chrome, Firefox, etc.)
2. Upload a PDF book when prompted
3. Read 5 pages each day — the app advances automatically at midnight
4. Click any word to save it to your word list
5. View saved words on the "Сөздер" page
6. Add more books anytime with the "+ Жаңа кітап қосу" button

### Pin in Arc browser

Right-click the tab → Pin Tab. The app will always be ready when you open Arc.

## Data storage

All data is stored in your browser's localStorage. Nothing is sent to any server.

- Your books, pages, and saved words stay in this browser only
- To reset everything: open browser console (`Cmd+Option+J`) and type `localStorage.clear()`
- localStorage has a ~5-10 MB limit depending on browser — this typically fits 2-3 books

## Hosting on GitHub Pages (optional)

1. Push this folder to a GitHub repository
2. Go to Settings → Pages → Source: Deploy from branch → `main` / `root`
3. Your app will be available at `https://yourusername.github.io/readx/`

## Tech

- Pure HTML, CSS, vanilla JavaScript
- PDF.js (loaded from CDN) for PDF text extraction
- Google Fonts: Noto Serif + Noto Sans for Cyrillic support
- Zero build step, zero dependencies to install
