import io
import re
import time
import threading
import webbrowser
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
import uvicorn

BASE = Path(__file__).parent

app = FastAPI(title="PDF Redactor")
app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")


@app.get("/")
def index():
    return FileResponse(str(BASE / "static" / "index.html"))


def _search_text(page: fitz.Page, text: str) -> list:
    """Find all bounding boxes for text on the page, handling multi-line selections."""
    hits = page.search_for(text)
    if hits:
        return hits
    # Multi-line selection: search each non-empty line separately
    lines = [ln.strip() for ln in re.split(r"[\r\n]+", text) if ln.strip()]
    return [hit for ln in lines for hit in page.search_for(ln)]


@app.post("/redact")
async def redact(file: UploadFile = File(...), selected_text: str = Form(...)):
    if not selected_text.strip():
        raise HTTPException(400, "No text provided.")

    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50 MB).")

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise HTTPException(400, "Could not open PDF. It may be encrypted or corrupted.")

    total_hits = 0
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        hits = _search_text(page, selected_text)
        if hits:
            for rect in hits:
                page.add_redact_annot(rect, fill=(0, 0, 0))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
            total_hits += len(hits)

    if total_hits == 0:
        doc.close()
        raise HTTPException(
            422,
            "Text not found in any page. "
            "The PDF may be scanned (image-based) or the selection may contain "
            "special characters that don't match the stored text.",
        )

    buf = io.BytesIO()
    # garbage=4: remove all unreferenced objects so redacted text is truly gone
    doc.save(buf, garbage=4, deflate=True)
    doc.close()

    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"X-Redaction-Count": str(total_hits)},
    )


if __name__ == "__main__":
    def _open_browser():
        time.sleep(1.2)
        webbrowser.open("http://localhost:8080")

    threading.Thread(target=_open_browser, daemon=True).start()
    uvicorn.run("app:app", host="127.0.0.1", port=8080, reload=False)
