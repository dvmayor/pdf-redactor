# PDF Redactor

Redact sensitive information from PDFs before sharing them. Select any text — names, addresses, account numbers, anything — and black it out with one click. The text is permanently removed from the file, not just painted over.

---

## How to use

1. **Open a PDF** — click "Open PDF" or drag and drop a file onto the page
2. **Find the text** you want to redact and drag to highlight it
3. **Click "Redact Selected"** — a solid black box replaces the text on every page it appears
4. **Repeat** for any other sensitive information
5. **Click "Download"** to save the redacted PDF

> Redaction removes the text from every page at once. If a name appears 10 times across 5 pages, one selection removes all 10.

---

## Features

- **True redaction** — underlying text is stripped from the PDF file, not just visually covered. The data cannot be recovered by selecting, copying, or inspecting the file.
- **All pages at once** — one selection redacts the text from every page it appears on
- **Scrollable multi-page view** — all pages visible, no pagination
- **Undo** — step back through your redactions (`Ctrl+Z`)
- **Light / dark mode** — toggle with the icon in the top-right corner
- **Drag and drop** — drop a PDF directly onto the viewer
- **No uploads** — the PDF never leaves your browser until you click Download. Processing happens locally (or on your own server if self-hosted).

---

## Run locally

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/pdf-redactor.git
cd pdf-redactor

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start
python app.py
```

The browser opens automatically at `http://localhost:8080`.

---

## Deploy to Vercel

This app runs as a serverless Python function on Vercel — no database or paid add-ons required.

### One-time setup

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
3. Leave all build settings blank (Vercel auto-detects the config from `vercel.json`)
4. Click **Deploy**

That's it. Vercel gives you a public URL.

### Re-deploying after changes

```bash
# install the Vercel CLI once
npm i -g vercel

# deploy
vercel --prod
```

Or just push to your GitHub repo — Vercel auto-deploys on every push if you connected it.

> **Note:** Vercel's free tier has a 4.5 MB request size limit. PDFs under 4.5 MB work fine — this covers most documents, bank statements, contracts, and forms. Very large PDFs (scanned books, image-heavy reports) may exceed this limit; run the app locally for those.

---

## Tech stack

| | |
|---|---|
| Backend | Python, FastAPI, PyMuPDF |
| Frontend | Vanilla JS, PDF.js |
| Deployment | Vercel (serverless Python) |

---

## Privacy

PDFs are processed in your browser's memory and sent directly to the server only when you click Redact. Nothing is stored on the server between requests — each redaction is a stateless operation. On Vercel, the function processes your PDF and immediately discards it.
