import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from "fs";

async function startServer() {
  fs.writeFileSync('server-boot.log', 'Server started. Initial GEMINI_API_KEY: ' + process.env.GEMINI_API_KEY + '\n');
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API router for Gemini calls
  app.get("/api/debug2", (req, res) => {
    res.json({ key: process.env.GEMINI_API_KEY, check: true, cwd: process.cwd(), allEnv: process.env });
  });

  app.get("/api/crash", (req, res) => {
    console.log("Crashing server intentionally!");
    process.exit(1);
  });

  app.post("/api/gemini", async (req, res) => {
    try {
      const { prompt } = req.body;
      const apiKey = process.env.APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        throw new Error("AI Studio 시스템 내부 오류로 기본 제공 키가 꼬인 상태입니다. 이 문제를 해결하기 위해, 앱 우측 상단 Settings(톱니바퀴) -> Secrets 메뉴에서 기존 'GEMINI_API_KEY'는 삭제(또는 무시)하시고, 새롭게 'APP_GEMINI_API_KEY' 라는 이름으로 진짜 API 키(AIza...) 값을 복사해서 추가해주신 뒤 다시 'Share -> Update' 해주세요!");
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.2,
          tools: [{ googleSearch: {} }],
        }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Server AI Error:', error);
      res.status(500).json({ error: error.message || 'Server error' });
    }
  });

  // Vite middleware for development
  console.log('BEFORE VITE:', process.env.GEMINI_API_KEY);
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    fs.appendFileSync('server-boot.log', 'AFTER VITE GEMINI_API_KEY: ' + process.env.GEMINI_API_KEY + '\n');
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
