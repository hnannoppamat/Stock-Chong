import { Order, ProductItem } from "../types";

export function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    return Number.isFinite(val) ? String(val) : "";
  }
  let str = String(val);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR) for text cells
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsvFile(
  filename: string,
  rows: (string | number | null | undefined)[][]
): void {
  const csvContent =
    "\uFEFF" +
    rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getTodayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatOrderStatusTh(status: Order["status"]): string {
  switch (status) {
    case "pending":
      return "รอแพ็ค";
    case "packing":
      return "กำลังแพ็ค";
    case "ready_to_ship":
      return "รอจัดส่ง";
    case "shipped":
      return "จัดส่งแล้ว";
    default:
      return status;
  }
}

function formatShippingOptionTh(order: Order): string {
  if (order.shippingOption === "store_delivery") return "ร้านจัดส่งเอง";
  if (order.shippingOption === "store_pickup") return "ลูกค้ารับเองหน้าร้าน";
  if (order.shippingOption === "carrier") return "ขนส่งพัสดุ";
  return order.orderType === "walk_in" ? "รับหน้าร้าน" : "-";
}

export function exportStockAndSalesReportCsv(
  products: ProductItem[],
  orders: Order[]
): { productCount: number; orderCount: number; filename: string } {
  const today = getTodayIsoDate();
  const exportedAt = new Date().toLocaleString("th-TH");
  const filename = `DenewStock-Stock-Sales-Report-${today}.csv`;

  const productById = new Map<string, ProductItem>();
  const productBySku = new Map<string, ProductItem>();
  for (const p of products) {
    productById.set(p.id, p);
    productBySku.set(p.sku, p);
  }

  let totalStockUnits = 0;
  let totalCostValue = 0;
  let totalRetailValue = 0;

  const productRows: (string | number)[][] = products.map((p) => {
    const unitProfit = p.sellPriceThb - p.landedCostThb;
    const costValue = p.stock * p.landedCostThb;
    const retailValue = p.stock * p.sellPriceThb;
    totalStockUnits += p.stock;
    totalCostValue += costValue;
    totalRetailValue += retailValue;

    const stockStatus =
      p.stock <= 0
        ? "สินค้าหมด"
        : p.stock < p.lowThreshold
          ? "ใกล้หมด (ต้องสั่งเติม)"
          : "สต็อกปกติ";

    const colorsSummary =
      p.colors && p.colors.length > 0
        ? p.colors
            .map((c) =>
              typeof c.stock === "number" ? `${c.name}(${c.stock})` : c.name
            )
            .join(" / ")
        : "-";

    return [
      p.sku,
      p.name,
      p.category,
      p.origin === "cn" ? "นำเข้าจากจีน" : "สินค้าไทย",
      p.stock,
      p.lowThreshold,
      stockStatus,
      colorsSummary,
      p.landedCostThb,
      p.sellPriceThb,
      unitProfit,
      costValue,
      retailValue,
      p.updatedAt || "-",
    ];
  });

  let totalOrdersRevenue = 0;
  let totalOrdersCogs = 0;
  let totalOrdersGrossProfit = 0;

  const orderRows: (string | number)[][] = orders.map((o) => {
    const itemsSummary = o.items
      .map((item) => {
        const colorPart = item.colorName ? ` [${item.colorName}]` : "";
        return `${item.name}${colorPart} x${item.quantity}`;
      })
      .join(" | ");

    const estimatedCogs = o.items.reduce((sum, item) => {
      const matched =
        productById.get(item.productId) || productBySku.get(item.sku);
      return sum + (matched ? matched.landedCostThb * item.quantity : 0);
    }, 0);
    const grossProfit = o.totalThb - estimatedCogs;

    totalOrdersRevenue += o.totalThb;
    totalOrdersCogs += estimatedCogs;
    totalOrdersGrossProfit += grossProfit;

    const deliverySummary = o.deliveryConfirmedAt
      ? o.deliveryMethod === "cash"
        ? `รับเงินสด ฿${(o.cashReceivedThb ?? o.totalThb).toLocaleString()} (${o.deliveryConfirmedAt})`
        : `แนบรูปหลักฐานแล้ว (${o.deliveryConfirmedAt})`
      : "-";

    return [
      o.id,
      o.createdAt,
      o.customerName,
      o.channel || "-",
      o.orderType === "walk_in" ? "ขายหน้าร้าน" : "จัดส่ง/ออนไลน์",
      formatOrderStatusTh(o.status),
      itemsSummary,
      o.totalThb,
      estimatedCogs,
      grossProfit,
      formatShippingOptionTh(o),
      o.carrierName || o.courier || "-",
      o.trackingCode || "-",
      deliverySummary,
    ];
  });

  const rows: (string | number | null | undefined)[][] = [
    ["รายงานสต็อกสินค้าและประวัติการขาย (DenewStock)", `สร้างเมื่อ: ${exportedAt}`],
    [],
    ["ส่วนที่ 1: ข้อมูลสต็อกสินค้าทั้งหมด"],
    [
      "รหัสสินค้า (SKU)",
      "ชื่อสินค้า",
      "หมวดหมู่",
      "แหล่งที่มา",
      "คงเหลือ (ชิ้น)",
      "เกณฑ์เตือนขั้นต่ำ",
      "สถานะสต็อก",
      "สี / ตัวเลือก",
      "ต้นทุนต่อชิ้น (บาท)",
      "ราคาขายต่อชิ้น (บาท)",
      "กำไรต่อชิ้น (บาท)",
      "มูลค่าต้นทุนรวม (บาท)",
      "มูลค่าราคาขายรวม (บาท)",
      "อัปเดตล่าสุด",
    ],
    ...productRows,
    [
      "รวมสต็อกสินค้า",
      `${products.length} รายการ (SKU)`,
      "",
      "",
      totalStockUnits,
      "",
      "",
      "",
      "",
      "",
      "",
      totalCostValue,
      totalRetailValue,
      "",
    ],
    [],
    ["ส่วนที่ 2: ประวัติการขายและออเดอร์ทั้งหมด"],
    [
      "รหัสออเดอร์",
      "วันที่ / เวลา",
      "ชื่อลูกค้า",
      "ช่องทางขาย",
      "ประเภทออเดอร์",
      "สถานะ",
      "รายการสินค้า (จำนวน)",
      "ยอดขายรวม (บาท)",
      "ต้นทุนประมาณการ (บาท)",
      "กำไรขั้นต้น (บาท)",
      "วิธีจัดส่ง",
      "บริษัทขนส่ง",
      "เลขพัสดุ",
      "การยืนยันส่งมอบ / รับเงิน",
    ],
    ...orderRows,
    [
      "รวมประวัติการขาย",
      `${orders.length} ออเดอร์`,
      "",
      "",
      "",
      "",
      "",
      totalOrdersRevenue,
      totalOrdersCogs,
      totalOrdersGrossProfit,
      "",
      "",
      "",
      "",
    ],
  ];

  downloadCsvFile(filename, rows);
  return {
    productCount: products.length,
    orderCount: orders.length,
    filename,
  };
}
