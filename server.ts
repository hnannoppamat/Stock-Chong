import express from "express";
import fs from "fs/promises";
import crypto from "crypto";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { attachLiveSyncServer } from "./serverLiveSync.ts";

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

  // --- Real-Time Live CNY -> THB Market Exchange Rate (5-min server cache) ---
  interface CachedFxRate {
    pair: string;
    rate: number;
    updatedAt: string;
    fetchedAtMs: number;
    source: string;
    isFallback: boolean;
  }

  let cachedCnyThbRate: CachedFxRate = {
    pair: "CNY/THB",
    rate: 4.95,
    updatedAt: new Date().toISOString(),
    fetchedAtMs: 0,
    source: "อัตราอ้างอิงเริ่มต้น",
    isFallback: true,
  };

  async function fetchLiveCnyThbRate(force = false): Promise<CachedFxRate> {
    const now = Date.now();
    const ageMs = now - cachedCnyThbRate.fetchedAtMs;
    const minCooldown = force ? 15_000 : 5 * 60_000;
    if (!cachedCnyThbRate.isFallback && ageMs < minCooldown) {
      return cachedCnyThbRate;
    }

    // Provider 1: Frankfurter (European Central Bank live market feed)
    try {
      const res = await fetch(
        "https://api.frankfurter.app/latest?from=CNY&to=THB",
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          rates?: { THB?: number };
          date?: string;
        };
        const rate = Number(json.rates?.THB);
        if (Number.isFinite(rate) && rate > 1 && rate < 20) {
          cachedCnyThbRate = {
            pair: "CNY/THB",
            rate: Number(rate.toFixed(4)),
            updatedAt: new Date().toISOString(),
            fetchedAtMs: now,
            source: "ECB Live FX",
            isFallback: false,
          };
          return cachedCnyThbRate;
        }
      }
    } catch {
      // Fallback to Provider 2
    }

    // Provider 2: Open Exchange Rates (open.er-api.com)
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/CNY", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          rates?: { THB?: number };
        };
        const rate = Number(json.rates?.THB);
        if (Number.isFinite(rate) && rate > 1 && rate < 20) {
          cachedCnyThbRate = {
            pair: "CNY/THB",
            rate: Number(rate.toFixed(4)),
            updatedAt: new Date().toISOString(),
            fetchedAtMs: now,
            source: "Open ER Live",
            isFallback: false,
          };
          return cachedCnyThbRate;
        }
      }
    } catch {
      // Return last known good or fallback rate
    }

    return cachedCnyThbRate;
  }

  app.get("/api/rates/cny-thb", async (req, res) => {
    const force = req.query.refresh === "1" || req.query.refresh === "true";
    const data = await fetchLiveCnyThbRate(force);
    res.json({
      ok: true,
      pair: data.pair,
      rate: data.rate,
      updatedAt: data.updatedAt,
      source: data.source,
      isFallback: data.isFallback,
    });
  });

  // --- Photo Upload API (Online-ready: local server storage + optional ImgBB CDN relay) ---
  const UPLOADS_DIR = path.resolve(__dirname, "uploads");
  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
  const PHOTO_FILENAME_REGEX = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/;
  const ALLOWED_FOLDERS = new Set([
    "products",
    "colors",
    "delivery",
    "receipts",
    "general",
  ]);

  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_PHOTO_BYTES,
      files: 1,
    },
  });

  function detectImageMagicBytes(
    buf: Buffer
  ): { ext: "jpg" | "png" | "webp" | "gif"; mimeType: string } | null {
    if (buf.length < 12) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { ext: "jpg", mimeType: "image/jpeg" };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return { ext: "png", mimeType: "image/png" };
    }
    // WEBP: RIFF....WEBP
    if (
      buf.subarray(0, 4).toString("ascii") === "RIFF" &&
      buf.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return { ext: "webp", mimeType: "image/webp" };
    }
    // GIF: GIF87a or GIF89a
    const gifHeader = buf.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
      return { ext: "gif", mimeType: "image/gif" };
    }
    return null;
  }

  function resolveSafePhotoPath(filename: string): string | null {
    if (!PHOTO_FILENAME_REGEX.test(filename)) return null;
    const resolved = path.resolve(UPLOADS_DIR, filename);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return null;
    return resolved;
  }

  function mimeFromExt(ext: string): string {
    switch (ext.toLowerCase()) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      default:
        return "application/octet-stream";
    }
  }

  async function tryUploadToImgbb(
    buf: Buffer,
    name: string
  ): Promise<string | null> {
    const apiKey = process.env.IMGBB_API_KEY?.trim();
    if (!apiKey) return null;
    try {
      const form = new URLSearchParams();
      form.set("image", buf.toString("base64"));
      form.set("name", name);
      const res = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as {
        success?: boolean;
        data?: { url?: string; display_url?: string };
      };
      const url = json.data?.display_url || json.data?.url;
      if (typeof url === "string" && url.startsWith("https://")) {
        return url;
      }
      return null;
    } catch {
      return null;
    }
  }

  app.get("/api/photos/status", (_req, res) => {
    const hasImgbb = Boolean(process.env.IMGBB_API_KEY?.trim());
    res.json({
      ready: true,
      provider: hasImgbb ? "imgbb_cdn" : "server_storage",
      maxSizeMb: 5,
      acceptedFormats: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });
  });

  const handlePhotoUpload: express.RequestHandler = async (req, res) => {
    try {
      const filesMap = req.files as
        | Record<string, Express.Multer.File[]>
        | undefined;
      const uploadedFile = filesMap?.photo?.[0] || filesMap?.file?.[0];

      let rawBuffer: Buffer | null = null;
      let folder = "general";

      if (uploadedFile && uploadedFile.buffer?.length) {
        rawBuffer = uploadedFile.buffer;
        if (
          typeof req.body?.folder === "string" &&
          ALLOWED_FOLDERS.has(req.body.folder)
        ) {
          folder = req.body.folder;
        }
      } else if (req.body && typeof req.body === "object") {
        const body = req.body as {
          dataUrl?: unknown;
          image?: unknown;
          folder?: unknown;
        };
        if (typeof body.folder === "string" && ALLOWED_FOLDERS.has(body.folder)) {
          folder = body.folder;
        }
        const rawStr =
          typeof body.dataUrl === "string"
            ? body.dataUrl
            : typeof body.image === "string"
              ? body.image
              : "";
        if (rawStr) {
          const base64Part = rawStr.includes(",")
            ? rawStr.split(",")[1] || ""
            : rawStr;
          rawBuffer = Buffer.from(base64Part, "base64");
        }
      }

      if (!rawBuffer || rawBuffer.length === 0) {
        res.status(400).json({ error: "กรุณาเลือกรูปภาพที่ต้องการอัปโหลด" });
        return;
      }

      if (rawBuffer.length > MAX_PHOTO_BYTES) {
        res.status(413).json({ error: "ขนาดไฟล์รูปภาพต้องไม่เกิน 5 MB" });
        return;
      }

      const detected = detectImageMagicBytes(rawBuffer);
      if (!detected) {
        res.status(400).json({
          error: "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WebP หรือ GIF เท่านั้น",
        });
        return;
      }

      const id = `${folder}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      const filename = `${id}.${detected.ext}`;

      // Try optional permanent CDN first if IMGBB_API_KEY is configured
      const cdnUrl = await tryUploadToImgbb(rawBuffer, id);
      if (cdnUrl) {
        res.status(201).json({
          ok: true,
          id,
          filename,
          url: cdnUrl,
          mimeType: detected.mimeType,
          size: rawBuffer.length,
          storage: "imgbb_cdn",
        });
        return;
      }

      const targetPath = resolveSafePhotoPath(filename);
      if (!targetPath) {
        res.status(400).json({ error: "ชื่อไฟล์ไม่ถูกต้อง" });
        return;
      }

      await fs.writeFile(targetPath, rawBuffer);
      const relativeUrl = `/api/photos/${filename}`;
      const appBaseUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
      const absoluteUrl = appBaseUrl ? `${appBaseUrl}${relativeUrl}` : relativeUrl;

      res.status(201).json({
        ok: true,
        id,
        filename,
        url: relativeUrl,
        absoluteUrl,
        mimeType: detected.mimeType,
        size: rawBuffer.length,
        storage: "server_storage",
      });
    } catch (error) {
      console.error("Photo upload error:", error);
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ" });
    }
  };

  const photoUploadFields = uploadMiddleware.fields([
    { name: "photo", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]);

  const handleMulterOrNext: express.RequestHandler = (req, res, next) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      photoUploadFields(req, res, (err) => {
        if (err) {
          const message =
            err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
              ? "ขนาดไฟล์รูปภาพต้องไม่เกิน 5 MB"
              : "รูปแบบไฟล์อัปโหลดไม่ถูกต้อง";
          res.status(400).json({ error: message });
          return;
        }
        next();
      });
    } else {
      next();
    }
  };

  app.post("/api/upload-photo", handleMulterOrNext, handlePhotoUpload);
  app.post("/api/photos/upload", handleMulterOrNext, handlePhotoUpload);

  app.get("/api/photos/:filename", async (req, res) => {
    const safePath = resolveSafePhotoPath(req.params.filename || "");
    if (!safePath) {
      res.status(400).json({ error: "รหัสรูปภาพไม่ถูกต้อง" });
      return;
    }
    try {
      const fileBuf = await fs.readFile(safePath);
      const ext = path.extname(safePath);
      res.setHeader("Content-Type", mimeFromExt(ext));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(fileBuf);
    } catch {
      res.status(404).json({ error: "ไม่พบรูปภาพที่ต้องการ" });
    }
  });

  app.delete("/api/photos/:filename", async (req, res) => {
    const safePath = resolveSafePhotoPath(req.params.filename || "");
    if (!safePath) {
      res.status(400).json({ error: "รหัสรูปภาพไม่ถูกต้อง" });
      return;
    }
    try {
      await fs.unlink(safePath);
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: "ไม่พบรูปภาพที่ต้องการลบ" });
    }
  });

  // --- AI Accounting Bill / Receipt Scanner (Gemini Multimodal) ---
  const DEFAULT_INCOME_CATS = [
    "ยอดขายสินค้า",
    "ขายส่ง / ตัวแทน",
    "เก็บเงินปลายทาง (COD)",
    "คืนเงินจากซัพพลายเออร์",
    "รายรับอื่นๆ",
  ];
  const DEFAULT_EXPENSE_CATS = [
    "สั่งซื้อสินค้า / เติมสต็อก",
    "ค่าขนส่งจีน-ไทย / ชิปปิ้ง",
    "ค่าจัดส่งพัสดุในไทย",
    "ค่ากล่อง / อุปกรณ์แพ็ค",
    "ค่าโฆษณา / การตลาด",
    "ค่าเช่า / ค่าน้ำ-ค่าไฟ",
    "เงินเดือน / ค่าแรงพนักงาน",
    "รายจ่ายอื่นๆ",
  ];
  const ALLOWED_PAYMENT_METHODS_LIST = [
    "เงินสด",
    "โอนธนาคาร",
    "พร้อมเพย์",
    "บัตรเครดิต",
    "แพลตฟอร์ม (Shopee/TikTok)",
  ] as const;

  function normalizeScannedIsoDate(raw: unknown): string {
    const today = new Date();
    const fallback = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (typeof raw !== "string") return fallback;
    const trimmed = raw.trim();
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return fallback;
    let year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    // Convert Buddhist Era (พ.ศ. e.g. 2569) to Gregorian (ค.ศ. 2026) automatically
    if (year >= 2400 && year <= 2700) {
      year -= 543;
    }
    if (
      year < 2000 ||
      year > 2100 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return fallback;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  app.post("/api/accounting/scan-bill", async (req, res) => {
    try {
      const body = req.body as {
        dataUrl?: unknown;
        imageBase64?: unknown;
        mimeType?: unknown;
        incomeCategories?: unknown;
        expenseCategories?: unknown;
      };

      const rawInput =
        typeof body.dataUrl === "string" && body.dataUrl.trim()
          ? body.dataUrl.trim()
          : typeof body.imageBase64 === "string" && body.imageBase64.trim()
            ? body.imageBase64.trim()
            : "";

      if (!rawInput) {
        res.status(400).json({ error: "กรุณาอัปโหลดหรือถ่ายรูปบิล/ใบเสร็จก่อนสแกน" });
        return;
      }

      const base64Clean = rawInput.includes(",")
        ? rawInput.split(",")[1] || ""
        : rawInput;
      const imageBuffer = Buffer.from(base64Clean, "base64");

      if (!imageBuffer.length) {
        res.status(400).json({ error: "ข้อมูลรูปภาพไม่ถูกต้อง" });
        return;
      }
      if (imageBuffer.length > 8 * 1024 * 1024) {
        res.status(413).json({ error: "ขนาดรูปบิลต้องไม่เกิน 8 MB" });
        return;
      }

      const detected = detectImageMagicBytes(imageBuffer);
      if (!detected) {
        res.status(400).json({
          error: "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WebP หรือ GIF เท่านั้น",
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Secrets panel จึงไม่สามารถสแกนบิลด้วย AI ได้",
        });
        return;
      }

      const incomeCats =
        Array.isArray(body.incomeCategories) && body.incomeCategories.length > 0
          ? body.incomeCategories
              .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
              .slice(0, 20)
          : DEFAULT_INCOME_CATS;

      const expenseCats =
        Array.isArray(body.expenseCategories) && body.expenseCategories.length > 0
          ? body.expenseCategories
              .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
              .slice(0, 20)
          : DEFAULT_EXPENSE_CATS;

      const todayIso = normalizeScannedIsoDate("");
      const liveFx = await fetchLiveCnyThbRate(false);

      const prompt = [
        "คุณคือผู้เชี่ยวชาญด้านบัญชีและ OCR ภาษาไทย-จีน-อังกฤษ สำหรับร้านค้าปลีก/ส่งกระเป๋า 'DenewStock'",
        "กรุณาอ่านและวิเคราะห์รูปบิล ใบเสร็จ ใบกำกับภาษี ใบเสร็จขนส่ง หรือสลิปโอนเงินในภาพนี้ แล้วแยกข้อมูลบัญชีให้แม่นยำที่สุด",
        "",
        "กฎสำคัญในการอ่านบิล:",
        "1. ระบุ type เป็น 'expense' (รายจ่าย) สำหรับบิลซื้อของ, ใบเสร็จขนส่ง (Flash/J&T/Kerry/ไปรษณีย์/ชิปปิ้งจีน), บิลค่ากล่องแพ็ค, ค่าไฟ/ค่าเช่า, สลิปจ่ายเงินให้ร้านค้า/ซัพพลายเออร์ และระบุ 'income' (รายรับ) สำหรับสลิปลูกค้าโอนชำระเงินเข้าบัญชีร้าน หรือบิลรับเงินยอดขาย",
        `2. date ต้องเป็นรูปแบบ ค.ศ. YYYY-MM-DD เสมอ หากบิลเป็น พ.ศ. (เช่น 2568, 2569 หรือ 69) ให้แปลงเป็น ค.ศ. (ลบ 543) หากไม่เห็นวันที่ชัดเจนให้ใช้ ${todayIso}`,
        `3. amountThb ให้ใช้ยอดสุทธิที่ต้องชำระ/ยอดโอนจริงเป็นบาท (THB) หากบิลเป็นเงินหยวน (CNY/RMB/¥) ให้แปลงเป็นบาทตามอัตราแลกเปลี่ยนปัจจุบัน (1 หยวน ≈ ${liveFx.rate.toFixed(2)} บาท) และระบุยอดเดิมเป็นหยวนไว้ใน note ด้วย`,
        `4. category ให้เลือกให้ตรงที่สุดจากรายการนี้เท่านั้น:`,
        `   - หมวดรายรับ: ${incomeCats.join(", ")}`,
        `   - หมวดรายจ่าย: ${expenseCats.join(", ")}`,
        `5. paymentMethod ให้เลือก 1 อย่างจาก: ${ALLOWED_PAYMENT_METHODS_LIST.join(", ")}`,
        "6. title ตั้งชื่อรายการบัญชีภาษาไทยให้กระชับชัดเจน (เช่น 'ค่าขนส่ง Flash Express', 'ซื้อกล่องพัสดุและเทปแพ็ค', 'สลิปลูกค้าโอนชำระค่าสินค้า')",
        "7. referenceCode ดึงเลขที่ใบเสร็จ / เลขที่บิล / รหัสอ้างอิงสลิป (ถ้ามีในภาพ)",
        "8. items แยกรายการสินค้า/ค่าใช้จ่ายย่อยที่อ่านได้ในบิล (สูงสุด 15 รายการ) และสรุปรายละเอียดสำคัญ (ชื่อร้านค้า, VAT, สกุลเงินเดิม) ไว้ใน note",
      ].join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: detected.mimeType,
                  data: imageBuffer.toString("base64"),
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ["income", "expense"],
                description: "Direction of transaction: income or expense",
              },
              date: {
                type: Type.STRING,
                description: "Transaction date in Gregorian YYYY-MM-DD format",
              },
              merchantName: {
                type: Type.STRING,
                description: "Merchant, vendor, courier, or payer name read from the receipt",
              },
              title: {
                type: Type.STRING,
                description: "Concise Thai accounting entry title",
              },
              category: {
                type: Type.STRING,
                description: "Best matching Thai accounting category from the provided lists",
              },
              amountThb: {
                type: Type.NUMBER,
                description: "Total net amount in THB",
              },
              currencyDetected: {
                type: Type.STRING,
                description: "Original currency code on bill, e.g. THB, CNY, USD",
              },
              paymentMethod: {
                type: Type.STRING,
                enum: [...ALLOWED_PAYMENT_METHODS_LIST],
                description: "Payment method detected",
              },
              referenceCode: {
                type: Type.STRING,
                description: "Receipt number, invoice number, or transfer ref code if visible",
              },
              note: {
                type: Type.STRING,
                description: "Concise Thai summary of line items, VAT, or original currency",
              },
              confidence: {
                type: Type.STRING,
                enum: ["high", "medium", "low"],
                description: "Confidence level of OCR extraction",
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                    amountThb: { type: Type.NUMBER },
                  },
                  required: ["name", "qty", "amountThb"],
                },
              },
            },
            required: [
              "type",
              "date",
              "title",
              "category",
              "amountThb",
              "paymentMethod",
              "confidence",
            ],
          },
        },
      });

      const rawText = response.text?.trim() || "";
      if (!rawText) {
        res.status(502).json({ error: "AI ไม่สามารถอ่านข้อมูลจากรูปบิลนี้ได้ กรุณาลองถ่ายภาพให้ชัดเจนขึ้น" });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          res.status(502).json({ error: "รูปแบบข้อมูลที่ AI อ่านได้ไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง" });
          return;
        }
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }

      const entryType = parsed.type === "income" ? "income" : "expense";
      const allowedCats = entryType === "income" ? incomeCats : expenseCats;
      const rawCategory =
        typeof parsed.category === "string" ? parsed.category.trim() : "";
      const matchedCategory = allowedCats.includes(rawCategory)
        ? rawCategory
        : allowedCats[allowedCats.length - 1] ||
          (entryType === "income" ? "รายรับอื่นๆ" : "รายจ่ายอื่นๆ");

      const rawPayment =
        typeof parsed.paymentMethod === "string" ? parsed.paymentMethod.trim() : "";
      const paymentMethod = (
        ALLOWED_PAYMENT_METHODS_LIST as readonly string[]
      ).includes(rawPayment)
        ? rawPayment
        : "โอนธนาคาร";

      const rawAmount = Number(parsed.amountThb);
      const amountThb =
        Number.isFinite(rawAmount) && rawAmount > 0
          ? Number(Math.min(100000000, rawAmount).toFixed(2))
          : 0;

      const items = Array.isArray(parsed.items)
        ? parsed.items
            .slice(0, 15)
            .map((it) => {
              const obj = (it && typeof it === "object" ? it : {}) as Record<
                string,
                unknown
              >;
              return {
                name:
                  typeof obj.name === "string" && obj.name.trim()
                    ? obj.name.trim().slice(0, 120)
                    : "รายการสินค้า",
                qty:
                  Number.isFinite(Number(obj.qty)) && Number(obj.qty) > 0
                    ? Number(obj.qty)
                    : 1,
                amountThb:
                  Number.isFinite(Number(obj.amountThb)) && Number(obj.amountThb) >= 0
                    ? Number(Number(obj.amountThb).toFixed(2))
                    : 0,
              };
            })
            .filter((it) => it.name.length > 0)
        : [];

      const merchantName =
        typeof parsed.merchantName === "string" && parsed.merchantName.trim()
          ? parsed.merchantName.trim().slice(0, 100)
          : "";

      const title =
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, 200)
          : merchantName
            ? `${entryType === "income" ? "รับเงินจาก" : "ชำระบิล"} ${merchantName}`
            : "รายการจากบิลสแกน AI";

      const referenceCode =
        typeof parsed.referenceCode === "string" && parsed.referenceCode.trim()
          ? parsed.referenceCode.trim().slice(0, 64)
          : "";

      const note =
        typeof parsed.note === "string" && parsed.note.trim()
          ? parsed.note.trim().slice(0, 500)
          : "";

      const currencyDetected =
        typeof parsed.currencyDetected === "string" && parsed.currencyDetected.trim()
          ? parsed.currencyDetected.trim().toUpperCase().slice(0, 10)
          : "THB";

      const confidence =
        parsed.confidence === "high" ||
        parsed.confidence === "medium" ||
        parsed.confidence === "low"
          ? parsed.confidence
          : "medium";

      res.json({
        ok: true,
        result: {
          type: entryType,
          date: normalizeScannedIsoDate(parsed.date),
          merchantName,
          title,
          category: matchedCategory,
          amountThb,
          currencyDetected,
          paymentMethod,
          referenceCode,
          note,
          confidence,
          items,
        },
      });
    } catch (error) {
      console.error("Error in /api/accounting/scan-bill:", error);
      const message =
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการสแกนบิลด้วย AI";
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

  const httpServer = http.createServer(app);
  const liveSync = await attachLiveSyncServer(httpServer);

  app.get("/api/live/status", async (req, res) => {
    try {
      const roomParam =
        typeof req.query.room === "string" ? req.query.room : undefined;
      const status = await liveSync.getRoomStatus(roomParam);
      res.json(status);
    } catch {
      res.status(500).json({ ok: false, error: "ไม่สามารถดึงสถานะห้องซิงก์ได้" });
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`DenewStock running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
