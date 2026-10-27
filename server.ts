import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));

// Shared Gemini AI client with telemetry user-agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// AI Lecture Action API Endpoint
app.post('/api/ai/lecture-action', async (req, res) => {
  try {
    const { action, title, subject, yearTitle, description, summaryStyle, questionCount, userQuestion } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured',
        useFallback: true,
      });
    }

    if (action === 'summary') {
      const prompt = `أنت أستاذ جامعي ومساعد أكاديمي ذكي. قم بإعداد ملخص شامل وواضح للمحاضرة التالية:
المادة: ${subject || 'غير محدد'}
الفرقة الدراسية: ${yearTitle || 'الجامعة'}
عنوان المحاضرة: ${title}
الوصف: ${description || 'محاضرة أكاديمية'}
أسلوب التلخيص المطلوب: ${summaryStyle || 'detailed'}

المطلوب: قم بالرد بصيغة JSON حصراً بدون أي نصوص قبلية أو بعدية، بالشكل التالي:
{
  "title": "ملخص: ${title}",
  "keyPoints": ["نقطة 1", "نقطة 2", "نقطة 3", "نقطة 4"],
  "summaryText": "نص التلخيص الشامل باللغة العربية...",
  "importantFormulasOrDefinitions": ["تعريف أو قانون 1", "تعريف أو قانون 2"],
  "examAdvice": "نصيحة هامة للطلاب في الامتحان حول هذا الدرس"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const responseText = response.text || '';
      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json({ success: true, result: parsed });
        } catch {
          // fallback to text
        }
      }

      return res.json({
        success: true,
        result: {
          title: `ملخص: ${title}`,
          keyPoints: ['مفاهيم الدرس الأساسية', 'التطبيقات العملية', 'أهم أسئلة الامتحان'],
          summaryText: responseText,
          importantFormulasOrDefinitions: ['أهم القوانين والمفاهيم الواردة بالمحاضرة'],
          examAdvice: 'راجع هذا المحتوى بعناية وحل التكليفات المرفقة لضمان التفوق.',
        },
      });
    }

    if (action === 'quiz') {
      const count = questionCount || 5;
      const prompt = `أنت أستاذ جامعي يعد امتحاناً للطلاب. أنشئ اختباراً اختيار من متعدد (MCQ) مكوناً من ${count} أسئلة دقيقة حول:
المادة: ${subject}
الفرقة: ${yearTitle}
الموضوع: ${title}
الوصف: ${description}

المطلوب: رد بصيغة JSON فقط بهذا الهيكل الدقيق:
{
  "title": "امتحان تدريبي تفاعلي: ${title}",
  "questions": [
    {
      "id": "q1",
      "question": "نص السؤال باللغة العربية؟",
      "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
      "correctAnswerIndex": 0,
      "explanation": "تفسير سبب صحة هذا الخيار بالتحديد."
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ success: true, result: parsed });
      }

      return res.status(500).json({ error: 'Failed to parse JSON quiz', useFallback: true });
    }

    if (action === 'ask') {
      const prompt = `أنت معيد وأستاذ جامعي صبور وذكي يجيب على أسئلة الطلاب في مادة (${subject}) بخصوص موضوع (${title}).
سؤال الطالب: "${userQuestion}"
سياق المحاضرة: ${description}

المطلوب: رد بصيغة JSON:
{
  "answer": "شرح وافٍ ومبسط باللغة العربية يجيب على السؤال بشكل مباشر ويقدم أمثلة توضيحية...",
  "relatedConcepts": ["مفهوم 1", "مفهوم 2", "مفهوم 3"]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ success: true, result: parsed });
      }

      return res.json({
        success: true,
        result: {
          answer: responseText,
          relatedConcepts: [subject, title],
        },
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({
      error: 'Gemini API call failed',
      useFallback: true,
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Online Courses App server running on port ${PORT}`);
  });
}

startServer();
