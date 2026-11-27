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

  const DEFAULT_BAG_CATEGORIES = [
    "กระเป๋าสะพายข้าง",
    "กระเป๋าสะพายไหล่",
    "กระเป๋าถือ",
    "กระเป๋าเป้",
    "กระเป๋าสตางค์",
    "กระเป๋าเดินทาง",
    "กระเป๋าผ้า / Tote",
    "พวงกุญแจ & อะไหล่กระเป๋า",
  ];

  const sanitizeCategories = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return DEFAULT_BAG_CATEGORIES;
    const cleaned = raw
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim().slice(0, 60))
      .slice(0, 40);
    return cleaned.length > 0 ? cleaned : DEFAULT_BAG_CATEGORIES;
  };

  const sanitizeExistingProducts = (
    raw: unknown
  ): Array<{ sku: string; name: string; category: string; stock?: number }> => {
    if (!Array.isArray(raw)) return [];
    return raw
      .slice(0, 80)
      .filter(
        (p): p is Record<string, unknown> =>
          Boolean(p) && typeof p === "object" && !Array.isArray(p)
      )
      .map((p) => ({
        sku: typeof p.sku === "string" ? p.sku.trim().slice(0, 40) : "",
        name: typeof p.name === "string" ? p.name.trim().slice(0, 100) : "",
        category:
          typeof p.category === "string" ? p.category.trim().slice(0, 60) : "",
        stock: typeof p.stock === "number" ? Math.max(0, Math.round(p.stock)) : undefined,
      }))
      .filter((p) => p.sku || p.name);
  };

  const buildBillAnalysisPrompt = (params: {
    mode: "image" | "text" | "reanalyze";
    categories: string[];
    existingProducts: Array<{ sku: string; name: string; category: string; stock?: number }>;
    exchangeRate: number;
    freightCost: number;
    payloadText?: string;
  }) => {
    const categoryListStr = params.categories.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const existingListStr =
      params.existingProducts.length > 0
        ? params.existingProducts
            .map(
              (p) =>
                `- ${p.sku} | ${p.name} | หมวด: ${p.category}${
                  typeof p.stock === "number" ? ` (คงเหลือ ${p.stock})` : ""
                }`
            )
            .join("\n")
        : "ไม่มีข้อมูลสินค้าเดิมในคลัง";

    const taskIntro =
      params.mode === "image"
        ? "วิเคราะห์รูปภาพบิล/ใบเสร็จสินค้า (รองรับทั้งภาษาจีน ไทย อังกฤษ ทั้งพิมพ์และลายมือ) สำหรับร้านขายกระเป๋า DenewStock"
        : params.mode === "text"
          ? "วิเคราะห์ข้อความรายการสั่งซื้อ/บิลสินค้าด้านล่าง แล้วแยกแยะรายการสินค้าแต่ละชิ้นพร้อมจัดหมวดหมู่อย่างแม่นยำสำหรับร้านขายกระเป๋า DenewStock"
          : "วิเคราะห์และจัดหมวดหมู่รายการสินค้าในบิลปัจจุบันใหม่ทั้งหมด ให้ระบุประเภทสินค้า วัสดุ สีสัน สินค้าเดิมที่ตรงกับคลัง ราคาขายแนะนำ และสรุปจุดสำคัญของบิล";

    return [
      taskIntro,
      "",
      "สิ่งที่ต้องทำอย่างละเอียด:",
      "1. แยกแยะรายการสินค้าทุกชิ้นในบิลไม่ให้ตกหล่น (หาก 1 บรรทัดมีหลายรายการหรือระบุสี/ขนาด ให้แยกแยะข้อมูลให้ครบ)",
      "2. แปลและตั้งชื่อสินค้าภาษาไทยให้ชัดเจน สวยงาม เหมาะกับการขายหน้าร้านกระเป๋า พร้อมเก็บชื่อต้นฉบับในช่อง chineseName",
      "3. จัดหมวดหมู่ (category) โดยเลือกให้ตรงกับ 'หมวดหมู่ปัจจุบันของร้าน' เป็นอันดับแรก หากเป็นประเภทสินค้าที่ชัดเจนแต่ยังไม่มีในรายการหมวดหมู่ร้าน ให้ตั้งชื่อหมวดหมู่ภาษาไทยที่กระชับและตั้งค่า isNewCategory = true",
      "4. เทียบกับ 'สินค้าที่มีอยู่แล้วในคลัง' หากเป็นสินค้าเดียวกันให้ใช้ SKU เดิมและใส่ไว้ใน matchedExistingSku (ถ้าเป็นสินค้าใหม่ให้ตั้ง SKU ใหม่ที่สื่อความหมาย เช่น SKU-BAG-xx, SKU-TOTE-xx และปล่อย matchedExistingSku เป็นค่าว่าง)",
      `5. คำนวณราคาและต้นทุน: ใช้อัตราแลกเปลี่ยนอ้างอิง 1 หยวน = ${params.exchangeRate} บาท และค่าส่งรวมบิลประมาณ ${params.freightCost} บาท — หากบิลเป็นเงินบาท (THB) ให้ระบุ currencyDetected เป็น "THB (บาท)" และแปลง unitPriceCny = ราคาบาท / ${params.exchangeRate} (ปัดทศนิยม 2 ตำแหน่ง) เพื่อให้ระบบคำนวณต้นทุนต่อชิ้นได้ตรงกัน พร้อมแนะนำราคาขายปลีกที่เหมาะสม (suggestedSellPriceThb)`,
      "6. อธิบายเหตุผลสั้นๆ (aiReason) ภาษาไทยในแต่ละรายการว่า AI แยกแยะสินค้าและจัดเข้าหมวดหมู่นี้จากจุดสังเกตใด",
      "7. สรุปภาพรวมบิล (aiAnalysis) เป็นภาษาไทย: ภาพรวมสัดส่วนสินค้าแต่ละหมวด, แหล่งที่มา/ตลาดส่ง, รายการที่ช่วยเติมสต็อกเดิม vs สินค้าใหม่, และข้อแนะนำที่เจ้าของร้านนำไปใช้ได้จริง 2-4 ข้อ",
      "",
      "--- หมวดหมู่ปัจจุบันของร้าน ---",
      categoryListStr,
      "",
      "--- สินค้าที่มีอยู่แล้วในคลัง ---",
      existingListStr,
      ...(params.payloadText ? ["", "--- ข้อมูลบิล/รายการสินค้าที่ต้องการวิเคราะห์ ---", params.payloadText] : []),
    ].join("\n");
  };

  const invoiceAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
      invoiceTitle: {
        type: Type.STRING,
        description: "Supplier, market, or receipt title",
      },
      invoiceCode: {
        type: Type.STRING,
        description: "Invoice reference code, e.g. OCR #CN-9041",
      },
      confidence: {
        type: Type.INTEGER,
        description: "Overall OCR & classification confidence percentage from 0 to 100",
      },
      aiAnalysis: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "Concise Thai executive summary of the bill, product mix, and categorization",
          },
          supplierType: {
            type: Type.STRING,
            description: "Detected supplier or wholesale market type in Thai",
          },
          currencyDetected: {
            type: Type.STRING,
            description: "Detected currency in bill, e.g. CNY (หยวน) or THB (บาท)",
          },
          keyHighlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "2-4 actionable Thai insights about stock restock, margins, new items, or warnings",
          },
          suggestedNewCategories: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Any new category names proposed that are not in the shop's current categories",
          },
        },
        required: ["summary", "supplierType", "currencyDetected", "keyHighlights"],
      },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            chineseName: {
              type: Type.STRING,
              description: "Original item name from the bill",
            },
            thaiName: {
              type: Type.STRING,
              description: "Clean Thai product name for a bag shop",
            },
            sku: { type: Type.STRING },
            category: {
              type: Type.STRING,
              description: "Assigned Thai product category",
            },
            isNewCategory: {
              type: Type.BOOLEAN,
              description: "True if category is newly suggested and not in the shop's existing list",
            },
            matchedExistingSku: {
              type: Type.STRING,
              description: "Matched SKU from existing inventory, or empty string if new product",
            },
            productType: {
              type: Type.STRING,
              description: "Specific product sub-type or bag style in Thai",
            },
            material: {
              type: Type.STRING,
              description: "Detected material in Thai (e.g. หนัง PU, ผ้าแคนวาส, ไนลอน) or -",
            },
            colorVariants: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Detected color names in Thai if mentioned",
            },
            sizeSpec: {
              type: Type.STRING,
              description: "Size or spec if mentioned, else empty string",
            },
            quantity: { type: Type.INTEGER },
            unitPriceCny: { type: Type.NUMBER },
            suggestedSellPriceThb: {
              type: Type.INTEGER,
              description: "Suggested retail selling price in THB",
            },
            aiReason: {
              type: Type.STRING,
              description: "Concise Thai explanation of why AI identified and categorized this product this way",
            },
            confidence: {
              type: Type.INTEGER,
              description: "Item classification confidence 0-100",
            },
          },
          required: [
            "chineseName",
            "thaiName",
            "sku",
            "category",
            "isNewCategory",
            "productType",
            "quantity",
            "unitPriceCny",
            "suggestedSellPriceThb",
            "aiReason",
          ],
        },
      },
    },
    required: ["invoiceTitle", "invoiceCode", "confidence", "aiAnalysis", "items"],
  };

  app.post("/api/scan-invoice", async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType,
        categories,
        existingProducts,
        exchangeRate,
        freightCost,
      } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        categories?: unknown;
        existingProducts?: unknown;
        exchangeRate?: unknown;
        freightCost?: unknown;
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

      const safeCategories = sanitizeCategories(categories);
      const safeExistingProducts = sanitizeExistingProducts(existingProducts);
      const safeRate =
        typeof exchangeRate === "number" && Number.isFinite(exchangeRate) && exchangeRate > 0
          ? exchangeRate
          : 4.95;
      const safeFreight =
        typeof freightCost === "number" && Number.isFinite(freightCost) && freightCost >= 0
          ? freightCost
          : 1250;

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
              text: buildBillAnalysisPrompt({
                mode: "image",
                categories: safeCategories,
                existingProducts: safeExistingProducts,
                exchangeRate: safeRate,
                freightCost: safeFreight,
              }),
            },
          ],
        },
        config: {
          systemInstruction:
            "You are an expert China-Thailand bag-shop invoice OCR, product identification, and inventory categorization AI engine. Always return valid JSON strictly matching the schema.",
          responseMimeType: "application/json",
          responseSchema: invoiceAnalysisSchema,
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

  app.post("/api/analyze-bill", async (req, res) => {
    try {
      const {
        billText,
        items,
        invoiceTitle,
        invoiceCode,
        categories,
        existingProducts,
        exchangeRate,
        freightCost,
      } = req.body as {
        billText?: unknown;
        items?: unknown;
        invoiceTitle?: unknown;
        invoiceCode?: unknown;
        categories?: unknown;
        existingProducts?: unknown;
        exchangeRate?: unknown;
        freightCost?: unknown;
      };

      const trimmedText =
        typeof billText === "string" ? billText.trim().slice(0, 12000) : "";
      const hasItems = Array.isArray(items) && items.length > 0;

      if (!trimmedText && !hasItems) {
        res
          .status(400)
          .json({ error: "กรุณาวางข้อความบิลหรือมีรายการสินค้าที่ต้องการให้ AI วิเคราะห์" });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Secrets panel จึงไม่สามารถวิเคราะห์บิลด้วย AI ได้",
        });
        return;
      }

      const safeCategories = sanitizeCategories(categories);
      const safeExistingProducts = sanitizeExistingProducts(existingProducts);
      const safeRate =
        typeof exchangeRate === "number" && Number.isFinite(exchangeRate) && exchangeRate > 0
          ? exchangeRate
          : 4.95;
      const safeFreight =
        typeof freightCost === "number" && Number.isFinite(freightCost) && freightCost >= 0
          ? freightCost
          : 1250;

      let payloadText = trimmedText;
      const mode: "text" | "reanalyze" = trimmedText ? "text" : "reanalyze";

      if (!trimmedText && hasItems) {
        const sanitizedItems = (items as Array<Record<string, unknown>>)
          .slice(0, 60)
          .map((it, idx) => {
            const cn = typeof it.chineseName === "string" ? it.chineseName.slice(0, 120) : "";
            const th = typeof it.thaiName === "string" ? it.thaiName.slice(0, 120) : "";
            const sku = typeof it.sku === "string" ? it.sku.slice(0, 40) : "";
            const cat = typeof it.category === "string" ? it.category.slice(0, 60) : "";
            const qty = typeof it.quantity === "number" ? it.quantity : 1;
            const cny = typeof it.unitPriceCny === "number" ? it.unitPriceCny : 0;
            return `${idx + 1}. ชื่อต้นฉบับ: ${cn || "-"} | ชื่อไทย: ${th || "-"} | SKU: ${sku || "-"} | หมวดเดิม: ${cat || "-"} | จำนวน: ${qty} ชิ้น | ราคาหยวน: ¥${cny}`;
          })
          .join("\n");

        payloadText = [
          `ชื่อบิล: ${typeof invoiceTitle === "string" ? invoiceTitle.slice(0, 120) : "บิลสินค้า"}`,
          `รหัสบิล: ${typeof invoiceCode === "string" ? invoiceCode.slice(0, 60) : "OCR-BILL"}`,
          "รายการสินค้า:",
          sanitizedItems,
        ].join("\n");
      }

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: buildBillAnalysisPrompt({
          mode,
          categories: safeCategories,
          existingProducts: safeExistingProducts,
          exchangeRate: safeRate,
          freightCost: safeFreight,
          payloadText,
        }),
        config: {
          systemInstruction:
            "You are an expert China-Thailand bag-shop invoice analyst, product classifier, and inventory categorization AI engine. Always return valid JSON strictly matching the schema.",
          responseMimeType: "application/json",
          responseSchema: invoiceAnalysisSchema,
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json(parsed);
    } catch (error) {
      console.error("Error analyzing bill:", error);
      const message =
        error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการวิเคราะห์บิลด้วย AI";
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
