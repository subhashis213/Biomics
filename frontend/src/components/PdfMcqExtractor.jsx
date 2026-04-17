import { useMemo, useState } from 'react';
import { extractMcqFromPdf } from '../api';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function emptyQuestion() {
  return { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' };
}

function normalizeQuestions(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const options = Array.isArray(item?.options)
      ? item.options.map((opt) => String(opt || '').trim()).slice(0, 4)
      : [];

    while (options.length < 4) options.push('');

    const correct = Number(item?.correctIndex);
    return {
      question: String(item?.question || '').trim(),
      options,
      correctIndex: Number.isInteger(correct) && correct >= 0 && correct <= 3 ? correct : 0,
      explanation: String(item?.explanation || '').trim()
    };
  });
}

export default function PdfMcqExtractor({
  sectionName = 'Question Builder',
  onApplyQuestions
}) {
  const [file, setFile] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgressText, setExtractProgressText] = useState('');
  const [questions, setQuestions] = useState([]);
  const [toast, setToast] = useState(null);

  const stats = useMemo(() => {
    const total = questions.length;
    const complete = questions.filter((item) => {
      if (!item.question.trim()) return false;
      if (!Array.isArray(item.options) || item.options.length !== 4) return false;
      if (item.options.some((opt) => !String(opt || '').trim())) return false;
      return Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex <= 3;
    }).length;

    return {
      total,
      complete,
      needsReview: Math.max(0, total - complete)
    };
  }, [questions]);

  function showToast(type, text) {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((current) => (current?.text === text ? null : current));
    }, 3200);
  }

  function validatePdf(selectedFile) {
    if (!selectedFile) return 'Please choose a PDF file.';

    const name = String(selectedFile.name || '').toLowerCase();
    const type = String(selectedFile.type || '').toLowerCase();
    const isPdf = type === 'application/pdf' || name.endsWith('.pdf');
    if (!isPdf) return 'Only PDF files are accepted.';

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      return 'PDF must be 25MB or smaller.';
    }

    return '';
  }

  function handlePickedFile(selectedFile) {
    const validationError = validatePdf(selectedFile);
    if (validationError) {
      showToast('error', validationError);
      return;
    }
    setFile(selectedFile);
    showToast('success', `${selectedFile.name} ready for extraction.`);
  }

  function handleFileInputChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    handlePickedFile(selectedFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragActive(false);
    const selectedFile = event.dataTransfer?.files?.[0];
    if (!selectedFile) return;
    handlePickedFile(selectedFile);
  }

  async function handleExtract() {
    if (isExtracting) return;
    const validationError = validatePdf(file);
    if (validationError) {
      showToast('error', validationError);
      return;
    }

    setIsExtracting(true);
    setExtractProgressText('Uploading PDF...');

    const stageTicker = window.setInterval(() => {
      setExtractProgressText((current) => {
        if (current === 'Uploading PDF...') return 'Reading PDF pages...';
        if (current === 'Reading PDF pages...') return 'Asking Gemini to extract MCQs...';
        if (current === 'Asking Gemini to extract MCQs...') return 'Structuring editable questions...';
        return current;
      });
    }, 1200);

    try {
      const response = await extractMcqFromPdf(file);
      const normalized = normalizeQuestions(response?.questions || []);
      setQuestions(normalized);
      onApplyQuestions?.(normalized);
      showToast('success', `Extracted ${normalized.length} question${normalized.length !== 1 ? 's' : ''}.`);
      setExtractProgressText('Extraction completed.');
    } catch (error) {
      showToast('error', error.message || 'Failed to extract questions.');
      setExtractProgressText('Extraction failed.');
    } finally {
      window.clearInterval(stageTicker);
      setIsExtracting(false);
    }
  }

  function updateQuestion(index, field, value) {
    setQuestions((current) => current.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  }

  function updateOption(questionIndex, optionIndex, value) {
    setQuestions((current) => current.map((item, idx) => {
      if (idx !== questionIndex) return item;
      const nextOptions = [...item.options];
      nextOptions[optionIndex] = value;
      return { ...item, options: nextOptions };
    }));
  }

  function addQuestion() {
    setQuestions((current) => [...current, emptyQuestion()]);
  }

  function deleteQuestion(index) {
    setQuestions((current) => current.filter((_, idx) => idx !== index));
  }

  function applyToFormOnly() {
    onApplyQuestions?.(questions);
    showToast('success', 'Questions applied to the form.');
  }

  return (
    <section className="card workspace-panel pdf-mcq-extractor">
      <div className="section-header compact">
        <div>
          <p className="eyebrow">AI PDF Extractor</p>
          <h3>PDF to MCQ for {sectionName}</h3>
          <p className="subtitle">Upload one PDF and auto-generate editable MCQs using Gemini AI.</p>
        </div>
      </div>

      <div
        className={`pdf-mcq-dropzone${isDragActive ? ' is-drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
      >
        <p className="pdf-mcq-dropzone-title">Drop PDF here</p>
        <p className="pdf-mcq-dropzone-subtitle">or click to upload (PDF only, max 25MB)</p>
        <input type="file" accept="application/pdf,.pdf" onChange={handleFileInputChange} />
        {file ? <p className="pdf-mcq-file-pill">{file.name}</p> : null}
      </div>

      <div className="pdf-mcq-actions">
        <button type="button" className="primary-btn" disabled={!file || isExtracting} onClick={handleExtract}>
          {isExtracting ? 'Extracting...' : 'Extract Questions with AI'}
        </button>
        {extractProgressText ? <span className="pdf-mcq-progress-text">{extractProgressText}</span> : null}
      </div>

      {questions.length > 0 ? (
        <>
          <div className="pdf-mcq-stats-bar" role="status">
            <span>Total: <strong>{stats.total}</strong></span>
            <span>Complete: <strong>{stats.complete}</strong></span>
            <span>Needs review: <strong>{stats.needsReview}</strong></span>
          </div>

          <div className="pdf-mcq-list">
            {questions.map((item, index) => (
              <article key={`pdf-mcq-${index}`} className="pdf-mcq-card">
                <div className="pdf-mcq-card-head">
                  <strong>Question {index + 1}</strong>
                  <button type="button" className="danger-text-btn" onClick={() => deleteQuestion(index)}>Delete</button>
                </div>

                <label>
                  Question text
                  <textarea
                    className="qe-textarea qe-textarea-expanded"
                    value={item.question}
                    onChange={(event) => updateQuestion(index, 'question', event.target.value)}
                    placeholder="Enter question"
                  />
                </label>

                <div className="quiz-options-list">
                  {item.options.map((option, optionIndex) => (
                    <label key={`pdf-mcq-opt-${index}-${optionIndex}`}>
                      Option {['A', 'B', 'C', 'D'][optionIndex]}
                      <input
                        value={option}
                        onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                        placeholder={`Option ${['A', 'B', 'C', 'D'][optionIndex]}`}
                      />
                    </label>
                  ))}
                </div>

                <label>
                  Correct answer
                  <select
                    value={item.correctIndex}
                    onChange={(event) => updateQuestion(index, 'correctIndex', Number(event.target.value))}
                  >
                    <option value={0}>Option A</option>
                    <option value={1}>Option B</option>
                    <option value={2}>Option C</option>
                    <option value={3}>Option D</option>
                  </select>
                </label>
              </article>
            ))}
          </div>

          <div className="workspace-inline-actions pdf-mcq-bottom-actions">
            <button type="button" className="secondary-btn" onClick={addQuestion}>Add Question</button>
            <button type="button" className="secondary-btn" onClick={applyToFormOnly}>Apply to Form</button>
          </div>
        </>
      ) : null}

      {toast ? <p className={`inline-message ${toast.type} pdf-mcq-toast`}>{toast.text}</p> : null}
    </section>
  );
}
