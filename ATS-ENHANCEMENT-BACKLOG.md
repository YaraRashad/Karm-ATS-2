# ATS Enhancement / Bug Backlog

## High Priority

### ATS-BUG-001 - PDF Resume Parsing Is Incomplete/Unreliable

Priority: High  
Module: CV upload / Candidate import  
Status: Backlog

Issue:  
When uploading resumes, the system reads Word documents, but PDF resumes are not always parsed into candidate details.

Expected behavior:  
The ATS should extract candidate information from both PDF resumes and Word resumes when readable text exists. Manual entry must remain available.

Current implementation:
- Word `.docx` parsing is implemented in `react-ats-preview/src/App.jsx` with Mammoth (`mammoth.extractRawText`).
- Text-based PDF parsing is attempted in the browser with `pdfjs-dist` and `page.getTextContent()`.
- Scanned/image-based PDFs are not readable by text extraction and need OCR.
- Legacy `.doc` files are not parsed by the current browser parser.

Investigation:
1. Confirm which failing PDFs are text-based versus scanned/image-based.
2. Confirm whether `pdfjs-dist` extracts text from the failing text PDFs.
3. Identify whether scanned PDFs should go through OCR.
4. Decide whether parsing stays client-side or moves to a backend CV parsing endpoint.

Recommended safe implementation:
1. Keep client-side PDF.js parsing for text PDFs.
2. Add backend-side parsing for larger files and consistent logging.
3. Add OCR for scanned PDFs using Azure AI Document Intelligence or another approved OCR service, with size limits and clear privacy handling.
4. Keep manual candidate creation unblocked in all cases.

Error handling:
- If PDF text extraction succeeds, auto-fill candidate details.
- If the PDF is scanned/image-based or unreadable, show: "We could not read this PDF automatically. Please enter the candidate details manually."
- Do not block manual candidate creation.

Acceptance criteria:
- Text-based PDFs populate name/email/phone when present.
- Scanned PDFs show the clear manual-entry message.
- Word `.docx` parsing continues to work.
- No upload flow blocks manual save.
