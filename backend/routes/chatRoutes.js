const express = require('express');
const { StreamChat } = require('stream-chat');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ChatHistory = require('../models/ChatHistory');

const MAX_HISTORY_MESSAGES = 200;
const CONTEXT_WINDOW = 20; // how many recent messages to send as context
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
const STREAM_CHANNEL_TYPE = 'messaging';
const STREAM_CHANNEL_ID = 'community-general';

function toStreamSafeUserId(role, username) {
  const safeName = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@_. -]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '');
  const suffix = safeName || 'member';
  return `${role}-${suffix}`.slice(0, 80);
}

// POST /chat/community/token — issue Stream user token for real-time community chat
router.post('/community/token', authenticateToken(), async (req, res) => {
  try {
    const apiKey = String(process.env.STREAM_API_KEY || '').trim();
    const apiSecret = String(process.env.STREAM_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Stream chat is not configured on server.' });
    }

    const username = String(req.user?.username || '').trim();
    const role = req.user?.role === 'admin' ? 'admin' : 'user';
    if (!username) {
      return res.status(400).json({ error: 'Invalid session user.' });
    }

    const streamClient = StreamChat.getInstance(apiKey, apiSecret);
    const streamUserId = toStreamSafeUserId(role, username);
    const displayName = role === 'admin' ? `Admin · ${username}` : username;

    await streamClient.upsertUser({
      id: streamUserId,
      name: displayName,
      biomicsRole: role
    });

    const channel = streamClient.channel(STREAM_CHANNEL_TYPE, STREAM_CHANNEL_ID, {
      name: 'Biomics Community',
      members: [streamUserId],
      created_by_id: streamUserId
    });

    try {
      await channel.create();
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already exists')) {
        throw error;
      }
    }

    try {
      await channel.addMembers([streamUserId]);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already') && !message.includes('member')) {
        throw error;
      }
    }

    const token = streamClient.createToken(streamUserId);
    return res.json({
      apiKey,
      token,
      user: {
        id: streamUserId,
        name: displayName,
        biomicsRole: role
      },
      channel: {
        type: STREAM_CHANNEL_TYPE,
        id: STREAM_CHANNEL_ID
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to initialize community chat.' });
  }
});

// DELETE /chat/community/messages — admin-only wipe of all community chat messages
router.delete('/community/messages', authenticateToken('admin'), async (req, res) => {
  try {
    const apiKey = String(process.env.STREAM_API_KEY || '').trim();
    const apiSecret = String(process.env.STREAM_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Stream chat is not configured on server.' });
    }

    const adminUsername = String(req.user?.username || '').trim();
    const adminId = toStreamSafeUserId('admin', adminUsername || 'admin');
    const streamClient = StreamChat.getInstance(apiKey, apiSecret);

    await streamClient.upsertUser({
      id: adminId,
      name: adminUsername ? `Admin · ${adminUsername}` : 'Admin',
      biomicsRole: 'admin'
    });

    const channel = streamClient.channel(STREAM_CHANNEL_TYPE, STREAM_CHANNEL_ID, {
      name: 'Biomics Community',
      created_by_id: adminId
    });

    try {
      await channel.create();
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already exists')) {
        throw error;
      }
    }

    await channel.truncate();

    return res.json({
      message: 'Community chat conversations cleared successfully.',
      clearedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to clear community chat.' });
  }
});

function estimateAnswerProfile(question = '') {
  const text = String(question || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lower = text.toLowerCase();
  const deepIntent = /(explain in detail|detailed|step by step|full|complete|elaborate|deeply|why|how|strategy|plan|roadmap|compare)/.test(lower);
  const shortIntent = /(short answer|brief|in short|one line|summarize|tl;dr)/.test(lower);

  if (shortIntent) {
    return { maxOutputTokens: 700, temperature: 0.45 };
  }
  if (deepIntent || words > 28) {
    return { maxOutputTokens: 1800, temperature: 0.6 };
  }
  if (words > 16) {
    return { maxOutputTokens: 1400, temperature: 0.55 };
  }
  return { maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS, temperature: 0.5 };
}

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
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: 0.5,
          topP: 0.9,
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
    'Default to concise answers, but provide full depth whenever the user asks for detail or when the topic requires it.',
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
    const answerProfile = estimateAnswerProfile(question);

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

    const { geminiRes, data } = await callGemini(apiKey, systemPrompt, contents, answerProfile);

    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || 'AI service returned an error';
      return res.status(502).json({ error: errMsg });
    }

    let answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Sorry, I could not generate a response. Please try again.';

    const finishReason = String(data.candidates?.[0]?.finishReason || '').toUpperCase();
    if (finishReason === 'MAX_TOKENS') {
      const continuationContents = [
        ...contents,
        { role: 'model', parts: [{ text: answer }] },
        {
          role: 'user',
          parts: [{ text: 'Continue from exactly where you stopped. Do not repeat prior lines.' }]
        }
      ];

      const { geminiRes: continuationRes, data: continuationData } = await callGemini(
        apiKey,
        systemPrompt,
        continuationContents,
        {
          maxOutputTokens: Math.min(1200, answerProfile.maxOutputTokens),
          temperature: Math.max(0.35, answerProfile.temperature - 0.1)
        }
      );

      if (continuationRes.ok) {
        const continuation = continuationData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (continuation) {
          answer = `${answer}\n\n${continuation}`.trim();
        }
      }
    }

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

// DELETE /chat/history/all — admin-only wipe of all AI tutor chat history in MongoDB
router.delete('/history/all', authenticateToken('admin'), async (req, res) => {
  try {
    const result = await ChatHistory.deleteMany({});
    res.json({
      ok: true,
      deletedCount: Number(result?.deletedCount || 0),
      message: 'All AI tutor chat histories were cleared.'
    });
  } catch (err) {
    console.error('Chat /history/all DELETE error:', err);
    res.status(500).json({ error: 'Failed to clear all AI tutor histories' });
  }
});

module.exports = router;
