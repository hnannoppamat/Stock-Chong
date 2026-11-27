import { Order, ProductItem, StockApprovalRequest } from "../types";

export type AutoLineEventType =
  | "new_order"
  | "stock_approved"
  | "stock_request"
  | "low_stock"
  | "test";

export interface LineNotifyStatus {
  configured: boolean;
  lineMessagingApiReady: boolean;
  webhookReady: boolean;
}

export interface LineNotifyResult {
  delivered: boolean;
  configured: boolean;
  channels: string[];
  targetLineId: string;
  error?: string;
}

export function getLineDirectChatUrl(lineId: string): string {
  return `https://line.me/ti/p/~${encodeURIComponent(lineId.trim())}`;
}

export function getLineShareUrl(message: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(message)}`;
}

export function buildNewOrderLineMessage(
  order: Order,
  ownerLineId: string
): string {
  const typeLabel = order.orderType === "walk_in" ? "Walk-in หน้าร้าน" : "จัดส่งพัสดุ";
  const totalPieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemLines = order.items.map(
    (item, idx) =>
      `${idx + 1}. ${item.name}${item.colorName ? ` (${item.colorName})` : ""} × ${item.quantity} = ฿${(
        item.quantity * item.unitPriceThb
      ).toLocaleString()}`
  );

  return [
    "🛍️ [DenewStock] มีออเดอร์ใหม่เข้า!",
    `รหัสออเดอร์: #${order.id}`,
    `ลูกค้า: ${order.customerName}`,
    `ประเภท: ${typeLabel} · เวลา ${order.createdAt} น.`,
    "————————————",
    ...itemLines,
    "————————————",
    `รวมทั้งหมด: ${totalPieces} ใบ · ยอดสุทธิ ฿${order.totalThb.toLocaleString()}`,
    `แจ้งเตือนถึง LINE ID: ${ownerLineId}`,
  ].join("\n");
}

export function buildStockApprovedLineMessage(
  req: StockApprovalRequest,
  ownerLineId: string,
  ownerName: string
): string {
  const diff = req.requestedStock - req.currentStock;
  const diffLabel = diff >= 0 ? `+${diff}` : `${diff}`;
  const nowTime = new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "✅ [DenewStock] อนุมัติการแก้ไขสต็อกแล้ว",
    `รหัสคำขอ: #${req.id}`,
    `สินค้า: ${req.productName} (${req.sku})`,
    `ยอดสต็อก: ${req.currentStock} → ${req.requestedStock} ชิ้น (${diffLabel} ชิ้น)`,
    `เหตุผล: ${req.reason}`,
    `ผู้ขอปรับ: ${req.requestedBy}`,
    `ผู้อนุมัติ: ${ownerName} · เวลา ${nowTime} น.`,
    `แจ้งเตือนถึง LINE ID: ${ownerLineId}`,
  ].join("\n");
}

export function buildLowStockLineMessage(
  items: ProductItem[],
  ownerLineId: string,
  triggerContext?: string
): string {
  const nowTime = new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const nowDate = new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });

  const headerLines = [
    "⚠️ [DenewStock] แจ้งเตือนสินค้าใกล้หมดสต็อก",
    ...(triggerContext ? [`สาเหตุ: ${triggerContext}`] : []),
    `จำนวนที่ต้องสั่งเติม: ${items.length} รายการ`,
    `เวลาแจ้งเตือน: ${nowDate} ${nowTime} น.`,
    `ถึง LINE ID: ${ownerLineId}`,
    "————————————",
  ];

  const itemLines = items.map((p, idx) => {
    const isOut = p.stock <= 0;
    const shortfall = Math.max(0, p.lowThreshold - p.stock);
    const outColors =
      p.colors?.filter((c) => typeof c.stock === "number" && c.stock <= 0) ??
      [];
    const statusTag = isOut
      ? "🔴 หมดสต็อก"
      : p.stock < p.lowThreshold
        ? "🟡 ใกล้หมด"
        : "🟠 มีสีหมด";

    const parts = [
      `${idx + 1}. ${statusTag} ${p.name} (${p.sku})`,
      `   คงเหลือ: ${p.stock} ชิ้น (เกณฑ์ขั้นต่ำ ${p.lowThreshold} ชิ้น${
        shortfall > 0 ? ` · ควรสั่งเติมอย่างน้อย +${shortfall} ชิ้น` : ""
      })`,
    ];
    if (outColors.length > 0) {
      parts.push(`   สีที่หมด: ${outColors.map((c) => c.name).join(", ")}`);
    }
    return parts.join("\n");
  });

  return [
    ...headerLines,
    ...itemLines,
    "————————————",
    "กรุณาตรวจสอบและสั่งเติมสต็อกใน DenewStock",
  ].join("\n");
}

export async function fetchLineNotifyStatus(): Promise<LineNotifyStatus> {
  try {
    const res = await fetch("/api/line-notify/status");
    if (!res.ok) {
      return {
        configured: false,
        lineMessagingApiReady: false,
        webhookReady: false,
      };
    }
    return (await res.json()) as LineNotifyStatus;
  } catch {
    return {
      configured: false,
      lineMessagingApiReady: false,
      webhookReady: false,
    };
  }
}

export async function sendAutomaticLineNotification(payload: {
  eventType: AutoLineEventType;
  targetLineId: string;
  message: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<LineNotifyResult> {
  try {
    const res = await fetch("/api/line-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return {
        delivered: false,
        configured: true,
        channels: [],
        targetLineId: payload.targetLineId,
        error: "ส่งแจ้งเตือนไม่สำเร็จ",
      };
    }
    return (await res.json()) as LineNotifyResult;
  } catch {
    return {
      delivered: false,
      configured: false,
      channels: [],
      targetLineId: payload.targetLineId,
      error: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์แจ้งเตือนได้",
    };
  }
}
