const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ChatHistory = require('../models/ChatHistory');

const MAX_HISTORY_MESSAGES = 200;
const CONTEXT_WINDOW = 10; // how many recent messages to send as context

function normalizeLanguage(language) {
  return ['en', 'hi', 'or'].includes(language) ? language : 'en';
}

function hasOdiaScript(text) {
  return /[\u0B00-\u0B7F]/.test(text || '');
}

async function callGemini(apiKey, systemPrompt, contents, generationConfig = {}) {
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 700,
          temperature: 0.65,
          ...generationConfig
        }
      })
    }
  );

  const data = await geminiRes.json();
  return { geminiRes, data };
}

async function enforceOdiaResponse(apiKey, answer, question) {
  // First pass: rewrite generated answer in strict Odia script.
  const rewritePrompt = 'Convert the answer strictly into Odia (Oriya script) only. Keep the same meaning. Do not use English or Hindi.';
  const rewriteContents = [{ role: 'user', parts: [{ text: `Convert to Odia:\n\n${answer}` }] }];
  const { geminiRes: rewriteRes, data: rewriteData } = await callGemini(
    apiKey,
    rewritePrompt,
    rewriteContents,
    { temperature: 0.1 }
  );

  if (rewriteRes.ok) {
    const rewritten = rewriteData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (rewritten && hasOdiaScript(rewritten)) {
      return rewritten;
    }
  }

  // Second pass: answer the original question directly in Odia if rewrite failed.
  const retryPrompt = [
    'You must answer only in Odia (Oriya script).',
    'Do not output English or Hindi.',
    'Give clear educational explanation with short points.'
  ].join(' ');
  const retryContents = [{ role: 'user', parts: [{ text: question }] }];
  const { geminiRes: retryRes, data: retryData } = await callGemini(
    apiKey,
    retryPrompt,
    retryContents,
    { temperature: 0.2 }
  );

  if (retryRes.ok) {
    const retried = retryData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (retried && hasOdiaScript(retried)) {
      return retried;
    }
  }

  // Final guaranteed Odia-script fallback text.
  return 'କ୍ଷମା କରିବେ। ଏହି ମୁହୂର୍ତ୍ତରେ ଓଡ଼ିଆରେ ପୂର୍ଣ୍ଣ ଉତ୍ତର ତିଆରି କରିପାରିଲି ନାହିଁ। ଦୟାକରି ପୁନର୍ବାର ପଚାରନ୍ତୁ।';
}

function buildSystemPrompt(language) {
  const langLabel = language === 'hi'
    ? 'Hindi (Devanagari script)'
    : language === 'or'
      ? 'Odia (Oriya script)'
      : 'English';
  return [
    'You are Sonupriya Sahu, a friendly and highly capable tutor for Indian students.',
    `Always respond in ${langLabel}.`,
    language === 'or'
      ? 'Important: Reply only in Odia script. Do not switch to English or Hindi unless user explicitly asks for translation.'
      : 'Reply in the selected language unless user explicitly asks to switch language.',
    'Teach with depth but in simple language, like a supportive personal tutor.',
    'Be clear, structured, accurate, and outcome-focused.',
    'Use numbered lists and clear headings where helpful.',
    'Keep answers between 150–400 words unless more detail is explicitly requested.',
    'You are strong in Botany, Biology, and Life Sciences for learners at any stage, with primary focus on CSIR-NET Life Science preparation.',
    'Support concept explanation, revision planning, problem-solving, and exam strategy for any study-related topic.',
    'When asked for exam dates, notification windows, syllabus updates, or application deadlines: provide the latest known timeline clearly, mention the exam year, and advise checking the official website for final confirmation.',
    'When asked for MCQs: generate realistic exam-style one-best-answer MCQs with 4 options, correct answer, and a short explanation.',
    'If the user asks for mock tests, provide mixed-difficulty questions similar to real exam patterns.',
    'If the user asks non-study small talk, answer briefly and guide back to productive study help.'
  ].join(' ');
}

// POST /chat/ask — get AI answer and persist to history
router.post('/ask', authenticateToken('user'), async (req, res) => {
  try {
    const { question, language = 'en', history = [] } = req.body;
    const { username } = req.user;
    const selectedLanguage = normalizeLanguage(language);

    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'AI service not configured. Add GEMINI_API_KEY to backend/.env'
      });
    }

    const systemPrompt = buildSystemPrompt(selectedLanguage);

    // Build Gemini contents array from recent conversation history
    const contents = [];
    const recentHistory = Array.isArray(history) ? history.slice(-CONTEXT_WINDOW) : [];
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: question.trim() }] });

    const { geminiRes, data } = await callGemini(apiKey, systemPrompt, contents);

    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || 'AI service returned an error';
      return res.status(502).json({ error: errMsg });
    }

    let answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Sorry, I could not generate a response. Please try again.';

    // Odia mode: enforce Odia output even if the first generation is not in Odia.
    if (selectedLanguage === 'or') {
      answer = await enforceOdiaResponse(apiKey, answer, question.trim());
    }

    // Persist to MongoDB, capped to MAX_HISTORY_MESSAGES
    await ChatHistory.findOneAndUpdate(
      { username },
      {
        $push: {
          messages: {
            $each: [
              { role: 'user', content: question.trim() },
              { role: 'assistant', content: answer }
            ],
            $slice: -MAX_HISTORY_MESSAGES
          }
        },
        $set: { language: selectedLanguage }
      },
      { upsert: true, new: true }
    );

    res.json({ answer });
  } catch (err) {
    console.error('Chat /ask error:', err);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

// GET /chat/history — load chat history for logged in user
router.get('/history', authenticateToken('user'), async (req, res) => {
  try {
    const record = await ChatHistory.findOne({ username: req.user.username }).lean();
    res.json({
      messages: record?.messages || [],
      language: record?.language || 'en'
    });
  } catch (err) {
    console.error('Chat /history error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// DELETE /chat/history — clear chat history for logged in user
router.delete('/history', authenticateToken('user'), async (req, res) => {
  try {
    await ChatHistory.findOneAndUpdate(
      { username: req.user.username },
      { $set: { messages: [] } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Chat /history DELETE error:', err);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

module.exports = router;
