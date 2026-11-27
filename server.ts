import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const ALLOWED_LINE_EVENTS = new Set([
  "new_order",
  "stock_approved",
  "stock_request",
  "low_stock",
  "test",
]);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }
  return false;
}

function getValidatedWebhookUrl(): string | null {
  const raw = process.env.LINE_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getLineApiConfig(): {
  lineMessagingApiReady: boolean;
  webhookReady: boolean;
  channelAccessToken: string | null;
  targetUserId: string | null;
  webhookUrl: string | null;
} {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || null;
  const targetUserId = process.env.LINE_TARGET_USER_ID?.trim() || null;
  const webhookUrl = getValidatedWebhookUrl();

  return {
    lineMessagingApiReady: Boolean(channelAccessToken && targetUserId),
    webhookReady: Boolean(webhookUrl),
    channelAccessToken,
    targetUserId,
    webhookUrl,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/scan-invoice", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== "string") {
        res.status(400).json({ error: "กรุณาอัปโหลดรูปภาพบิลสินค้า" });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Secrets panel จึงไม่สามารถวิเคราะห์ภาพใหม่ด้วย AI ได้",
        });
        return;
      }

      const cleanBase64 = imageBase64.includes(",")
        ? imageBase64.split(",")[1]
        : imageBase64;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: cleanBase64,
              },
            },
            {
              text: "Analyze this Chinese wholesale invoice / purchase receipt for a bag shop. Extract the invoice header/code and every line item with its original Chinese name, a concise Thai product name translation, suggested SKU code, product category in Thai (one of: กระเป๋าสะพายข้าง, กระเป๋าสะพายไหล่, กระเป๋าถือ, กระเป๋าเป้, กระเป๋าสตางค์, กระเป๋าเดินทาง, กระเป๋าผ้า / Tote, พวงกุญแจ & อะไหล่กระเป๋า), quantity (integer), and unit price in CNY (number). Also estimate OCR confidence (0-100).",
            },
          ],
        },
        config: {
          systemInstruction:
            "You are an expert China-Thailand cross-border wholesale invoice OCR and translation engine. Always return valid JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              invoiceTitle: {
                type: Type.STRING,
                description: "Chinese market or supplier title from the receipt",
              },
              invoiceCode: {
                type: Type.STRING,
                description: "Invoice reference code, e.g. #CN-9041",
              },
              confidence: {
                type: Type.INTEGER,
                description: "OCR confidence percentage from 0 to 100",
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    chineseName: { type: Type.STRING },
                    thaiName: { type: Type.STRING },
                    sku: { type: Type.STRING },
                    category: { type: Type.STRING },
                    quantity: { type: Type.INTEGER },
                    unitPriceCny: { type: Type.NUMBER },
                  },
                  required: [
                    "chineseName",
                    "thaiName",
                    "sku",
                    "category",
                    "quantity",
                    "unitPriceCny",
                  ],
                },
              },
            },
            required: ["invoiceTitle", "invoiceCode", "confidence", "items"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json(parsed);
    } catch (error) {
      console.error("Error scanning invoice:", error);
      const message =
        error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสแกนบิล";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, useSearch, fastMode, storeContext, roleMode } =
        req.body as {
          messages?: Array<{ role?: string; text?: string }>;
          useSearch?: boolean;
          fastMode?: boolean;
          storeContext?: string;
          roleMode?: "owner" | "staff";
        };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "กรุณาส่งข้อความที่ต้องการสอบถาม" });
        return;
      }

      const sanitizedMessages = messages
        .slice(-20)
        .filter(
          (m): m is { role: "user" | "model"; text: string } =>
            (m?.role === "user" || m?.role === "model") &&
            typeof m?.text === "string" &&
            m.text.trim().length > 0
        )
        .map((m) => ({
          role: m.role,
          text: m.text.trim().slice(0, 4000),
        }));

      if (
        sanitizedMessages.length === 0 ||
        sanitizedMessages[sanitizedMessages.length - 1].role !== "user"
      ) {
        res.status(400).json({ error: "รูปแบบข้อความสนทนาไม่ถูกต้อง" });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Secrets panel จึงไม่สามารถใช้งานผู้ช่วย AI ได้",
        });
        return;
      }

      const searchEnabled = useSearch !== false;
      const model = searchEnabled
        ? "gemini-4-hydrogen"
        : fastMode
          ? "gemini-3.1-flash-lite"
          : "gemini-4-hydrogen";

      const isStaff = roleMode === "staff";
      const safeStoreContext =
        typeof storeContext === "string" ? storeContext.slice(0, 8000) : "";

      const systemInstruction = [
        "คุณคือ 'ผู้ช่วย AI ร้าน DenewStock' ผู้เชี่ยวชาญด้านการจัดการคลังสินค้า การนำเข้าสินค้าจีน-ไทย การแพ็คและจัดส่งพัสดุในไทย และการวางแผนธุรกิจร้านค้าปลีก/ส่ง",
        "ตอบเป็นภาษาไทยที่สุภาพ กระชับ ชัดเจน อ่านง่าย ใช้หัวข้อย่อยและตัวเลขให้ชัดเจนเมื่อสรุปข้อมูล",
        isStaff
          ? "ขณะนี้ผู้ใช้งานอยู่ใน 'โหมดพนักงาน' ห้ามเปิดเผย คาดเดา หรือคำนวณต้นทุนนำเข้า ราคาทุนต่อชิ้น ราคาหยวน หรือกำไรสุทธิ ให้เน้นช่วยเรื่องสต็อกสินค้า สินค้าใกล้หมด สีสินค้า การแพ็คของ ออเดอร์ และข้อมูลขนส่งทั่วไปเท่านั้น"
          : "ขณะนี้ผู้ใช้งานอยู่ใน 'โหมดเจ้าของร้าน' สามารถช่วยวิเคราะห์สต็อกใกล้หมด วางแผนสั่งเติมสินค้า วิเคราะห์ต้นทุนนำเข้า อัตราแลกเปลี่ยนหยวน-บาท กำไรต่อชิ้น และยอดขายได้อย่างเต็มที่",
        searchEnabled
          ? "คุณสามารถใช้ Google Search เพื่อค้นหาข้อมูลปัจจุบันแบบเรียลไทม์ เช่น อัตราแลกเปลี่ยน CNY/THB วันนี้ ค่าส่งขนส่งในไทยล่าสุด (Flash, J&T, Kerry, ไปรษณีย์ไทย) เทรนด์สินค้า หรือข่าวสารตลาด เมื่อใช้ข้อมูลจากเว็บให้สรุปชัดเจนและระบุวันที่/บริบทของข้อมูล"
          : "ตอบคำถามจากข้อมูลคลังสินค้าและออเดอร์ของร้านที่ให้ไว้ด้านล่าง อย่าแต่งข้อมูลสต็อกหรือออเดอร์ที่ไม่มีอยู่จริง",
        safeStoreContext
          ? `\n--- ข้อมูลร้านค้าปัจจุบัน (อัปเดตสดจากระบบ) ---\n${safeStoreContext}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const contents = sanitizedMessages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          ...(searchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      const replyText =
        response.text?.trim() ||
        "ขออภัย ระบบไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];

      for (const chunk of rawChunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title;
        if (
          typeof uri === "string" &&
          (uri.startsWith("https://") || uri.startsWith("http://")) &&
          !seenUris.has(uri)
        ) {
          seenUris.add(uri);
          sources.push({
            title:
              typeof title === "string" && title.trim()
                ? title.trim()
                : uri,
            uri,
          });
        }
      }

      const searchQueries = Array.isArray(groundingMetadata?.webSearchQueries)
        ? groundingMetadata.webSearchQueries.filter(
            (q): q is string => typeof q === "string" && q.trim().length > 0
          )
        : [];

      res.json({
        reply: replyText,
        sources,
        searchQueries,
        modelUsed: model,
        searchUsed: searchEnabled,
      });
    } catch (error) {
      console.error("Error in /api/chat:", error);
      const message =
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการเชื่อมต่อผู้ช่วย AI";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/line-notify/status", (_req, res) => {
    const cfg = getLineApiConfig();
    res.json({
      configured: cfg.lineMessagingApiReady || cfg.webhookReady,
      lineMessagingApiReady: cfg.lineMessagingApiReady,
      webhookReady: cfg.webhookReady,
    });
  });

  app.post("/api/line-notify", async (req, res) => {
    try {
      const body = req.body as {
        eventType?: unknown;
        targetLineId?: unknown;
        message?: unknown;
        metadata?: unknown;
      };

      const eventType =
        typeof body.eventType === "string" &&
        ALLOWED_LINE_EVENTS.has(body.eventType)
          ? body.eventType
          : null;

      if (!eventType) {
        res.status(400).json({ error: "ประเภทเหตุการณ์แจ้งเตือนไม่ถูกต้อง" });
        return;
      }

      const message =
        typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";

      if (!message) {
        res.status(400).json({ error: "กรุณาระบุข้อความแจ้งเตือน" });
        return;
      }

      const targetLineId =
        typeof body.targetLineId === "string" && body.targetLineId.trim()
          ? body.targetLineId.trim().slice(0, 64)
          : "Hnan145";

      const safeMetadata =
        body.metadata &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? Object.fromEntries(
              Object.entries(body.metadata as Record<string, unknown>)
                .slice(0, 12)
                .filter(
                  ([, v]) =>
                    typeof v === "string" ||
                    typeof v === "number" ||
                    typeof v === "boolean"
                )
            )
          : {};

      const cfg = getLineApiConfig();
      if (!cfg.lineMessagingApiReady && !cfg.webhookReady) {
        res.json({
          delivered: false,
          configured: false,
          channels: [],
          targetLineId,
        });
        return;
      }

      const deliveredChannels: string[] = [];
      const errors: string[] = [];

      // 1. Official LINE Messaging API Push (server-side secret token)
      if (cfg.lineMessagingApiReady && cfg.channelAccessToken && cfg.targetUserId) {
        try {
          const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cfg.channelAccessToken}`,
            },
            body: JSON.stringify({
              to: cfg.targetUserId,
              messages: [{ type: "text", text: message }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (lineRes.ok) {
            deliveredChannels.push("line_messaging_api");
          } else {
            errors.push(`LINE API status ${lineRes.status}`);
          }
        } catch {
          errors.push("LINE API request failed");
        }
      }

      // 2. Configured HTTPS Webhook Bridge (e.g. Make / Zapier / n8n / Apps Script)
      if (cfg.webhookReady && cfg.webhookUrl) {
        try {
          const whRes = await fetch(cfg.webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              source: "DenewStock",
              eventType,
              targetLineId,
              message,
              metadata: safeMetadata,
              timestamp: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (whRes.ok) {
            deliveredChannels.push("webhook");
          } else {
            errors.push(`Webhook status ${whRes.status}`);
          }
        } catch {
          errors.push("Webhook request failed");
        }
      }

      res.json({
        delivered: deliveredChannels.length > 0,
        configured: true,
        channels: deliveredChannels,
        targetLineId,
        ...(errors.length > 0 && deliveredChannels.length === 0
          ? { error: "ไม่สามารถส่งข้อความไปยังปลายทาง LINE ได้ในขณะนี้" }
          : {}),
      });
    } catch {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการส่งแจ้งเตือน LINE" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DenewStock running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
