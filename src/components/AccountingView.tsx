import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../data/initialData";
import {
  AccountingEntry,
  AccountingEntryType,
  AccountingPaymentMethod,
  Order,
  ProductItem,
  RoleMode,
} from "../types";
import { readImageAsDataUrl, uploadPhoto } from "../utils/image";

interface ScannedBillLineItem {
  name: string;
  qty: number;
  amountThb: number;
}

interface ScannedBillResult {
  type: AccountingEntryType;
  date: string;
  merchantName: string;
  title: string;
  category: string;
  amountThb: number;
  currencyDetected: string;
  paymentMethod: AccountingPaymentMethod;
  referenceCode: string;
  note: string;
  confidence: "high" | "medium" | "low";
  items: ScannedBillLineItem[];
}

interface AccountingViewProps {
  role: RoleMode;
  entries: AccountingEntry[];
  orders: Order[];
  products: ProductItem[];
  onAddEntry: (entry: Omit<AccountingEntry, "id">) => void;
  onUpdateEntry: (id: string, updates: Omit<AccountingEntry, "id">) => void;
  onDeleteEntry: (id: string) => void;
  onClearAllEntries: () => void;
  onSyncOrdersToAccounting: () => void;
  onNotify: (msg: string, icon?: string) => void;
  cloudStatus?: "connected" | "connecting" | "local";
  cloudUserEmail?: string | null;
  isSyncingCloudAll?: boolean;
  onConnectCloud?: () => void;
  onSyncAllToCloud?: () => void;
}

const PAYMENT_METHODS: AccountingPaymentMethod[] = [
  "โอนธนาคาร",
  "พร้อมเพย์",
  "เงินสด",
  "แพลตฟอร์ม (Shopee/TikTok)",
  "บัตรเครดิต",
];

type DateRangeFilter = "all" | "today" | "7d" | "30d" | "month";

function getTodayIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatThaiDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function formatShortAxisDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function AccountingView({
  role,
  entries,
  orders,
  products,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onClearAllEntries,
  onSyncOrdersToAccounting,
  onNotify,
  cloudStatus = "local",
  cloudUserEmail,
  isSyncingCloudAll = false,
  onConnectCloud,
  onSyncAllToCloud,
}: AccountingViewProps) {
  const [subTab, setSubTab] = useState<"ledger" | "order_pnl">("ledger");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AccountingEntryType>(
    "all"
  );
  const [dateRange, setDateRange] = useState<DateRangeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("ทั้งหมด");
  const [paymentFilter, setPaymentFilter] = useState<string>("ทั้งหมด");
  const [breakdownMode, setBreakdownMode] =
    useState<AccountingEntryType>("expense");

  // Add / Edit form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formType, setFormType] = useState<AccountingEntryType>("income");
  const [formDate, setFormDate] = useState<string>(getTodayIso());
  const [formCategory, setFormCategory] = useState<string>(
    INCOME_CATEGORIES[0]
  );
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPayment, setFormPayment] =
    useState<AccountingPaymentMethod>("โอนธนาคาร");
  const [formRef, setFormRef] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formReceiptImageUrl, setFormReceiptImageUrl] = useState<string>("");

  // AI Bill Scanner states
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isScanningBill, setIsScanningBill] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string>("");
  const [scanResult, setScanResult] = useState<ScannedBillResult | null>(null);
  const [isDraggingBill, setIsDraggingBill] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const billCameraInputRef = useRef<HTMLInputElement | null>(null);
  const billFileInputRef = useRef<HTMLInputElement | null>(null);

  // Inline delete confirmations (no window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const syncedOrderIds = useMemo(
    () =>
      new Set(
        entries
          .map((e) => e.sourceOrderId)
          .filter((id): id is string => Boolean(id))
      ),
    [entries]
  );

  const unsyncedOrdersCount = useMemo(
    () => orders.filter((o) => !syncedOrderIds.has(o.id)).length,
    [orders, syncedOrderIds]
  );

  // Filtered entries by date range (used for KPIs, Charts, and Ledger)
  const dateFilteredEntries = useMemo(() => {
    if (dateRange === "all") return entries;
    const todayIso = getTodayIso();
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    return entries.filter((entry) => {
      if (dateRange === "today") return entry.date === todayIso;
      const parts = entry.date.split("-");
      if (parts.length !== 3) return true;
      const entryDate = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
      );
      if (dateRange === "month") {
        return (
          entryDate.getFullYear() === now.getFullYear() &&
          entryDate.getMonth() === now.getMonth()
        );
      }
      const diffDays = Math.floor(
        (startOfToday.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (dateRange === "7d") return diffDays >= 0 && diffDays < 7;
      if (dateRange === "30d") return diffDays >= 0 && diffDays < 30;
      return true;
    });
  }, [entries, dateRange]);

  const ledgerEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...dateFilteredEntries]
      .filter((e) => {
        const matchesType = typeFilter === "all" || e.type === typeFilter;
        const matchesCat =
          categoryFilter === "ทั้งหมด" || e.category === categoryFilter;
        const matchesPay =
          paymentFilter === "ทั้งหมด" || e.paymentMethod === paymentFilter;
        const matchesQuery =
          !q ||
          e.title.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.referenceCode?.toLowerCase().includes(q) ?? false) ||
          (e.note?.toLowerCase().includes(q) ?? false);
        return matchesType && matchesCat && matchesPay && matchesQuery;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    dateFilteredEntries,
    typeFilter,
    categoryFilter,
    paymentFilter,
    searchQuery,
  ]);

  const financialStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    dateFilteredEntries.forEach((e) => {
      if (e.type === "income") {
        totalIncome += e.amountThb;
        incomeCount += 1;
      } else {
        totalExpense += e.amountThb;
        expenseCount += 1;
      }
    });
    const netProfit = totalIncome - totalExpense;
    const netMarginPct =
      totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;
    return {
      totalIncome,
      totalExpense,
      incomeCount,
      expenseCount,
      netProfit,
      netMarginPct,
    };
  }, [dateFilteredEntries]);

  const inventoryValuation = useMemo(() => {
    const costValue = products.reduce(
      (sum, p) => sum + p.stock * p.landedCostThb,
      0
    );
    const retailValue = products.reduce(
      (sum, p) => sum + p.stock * p.sellPriceThb,
      0
    );
    return { costValue, retailValue };
  }, [products]);

  // Daily Cashflow chart data
  const dailyChartData = useMemo(() => {
    const map = new Map<
      string,
      { date: string; label: string; income: number; expense: number }
    >();
    dateFilteredEntries.forEach((e) => {
      const existing = map.get(e.date) ?? {
        date: e.date,
        label: formatShortAxisDate(e.date),
        income: 0,
        expense: 0,
      };
      if (e.type === "income") existing.income += e.amountThb;
      else existing.expense += e.amountThb;
      map.set(e.date, existing);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);
  }, [dateFilteredEntries]);

  // Category breakdown (for selected breakdownMode: income or expense)
  const categoryBreakdown = useMemo(() => {
    const filtered = dateFilteredEntries.filter(
      (e) => e.type === breakdownMode
    );
    const total = filtered.reduce((sum, e) => sum + e.amountThb, 0);
    const map = new Map<string, { category: string; amount: number; count: number }>();
    filtered.forEach((e) => {
      const curr = map.get(e.category) ?? {
        category: e.category,
        amount: 0,
        count: 0,
      };
      curr.amount += e.amountThb;
      curr.count += 1;
      map.set(e.category, curr);
    });
    return {
      total,
      items: Array.from(map.values()).sort((a, b) => b.amount - a.amount),
    };
  }, [dateFilteredEntries, breakdownMode]);

  // Order-level Profit & Loss calculation using real product landedCostThb
  const orderPnlRows = useMemo(() => {
    return orders.map((order) => {
      let cogs = 0;
      order.items.forEach((item) => {
        const matchedProd = products.find(
          (p) =>
            p.id === item.productId ||
            p.sku.toLowerCase() === item.sku.toLowerCase()
        );
        const unitCost = matchedProd
          ? matchedProd.landedCostThb
          : item.unitPriceThb * 0.5;
        cogs += unitCost * item.quantity;
      });
      const grossProfit = order.totalThb - cogs;
      const marginPct =
        order.totalThb > 0
          ? Math.round((grossProfit / order.totalThb) * 100)
          : 0;
      return {
        order,
        cogs: Number(cogs.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        marginPct,
        isSynced: syncedOrderIds.has(order.id),
      };
    });
  }, [orders, products, syncedOrderIds]);

  const orderPnlSummary = useMemo(() => {
    const revenue = orderPnlRows.reduce((s, r) => s + r.order.totalThb, 0);
    const cogs = orderPnlRows.reduce((s, r) => s + r.cogs, 0);
    const grossProfit = revenue - cogs;
    const marginPct =
      revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
    return { revenue, cogs, grossProfit, marginPct };
  }, [orderPnlRows]);

  const openNewForm = (type: AccountingEntryType) => {
    setEditingEntryId(null);
    setFormType(type);
    setFormDate(getTodayIso());
    setFormCategory(
      type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
    );
    setFormTitle("");
    setFormAmount("");
    setFormPayment("โอนธนาคาร");
    setFormRef("");
    setFormNote("");
    setFormReceiptImageUrl("");
    setFormOpen(true);
    setSubTab("ledger");
  };

  const openEditForm = (entry: AccountingEntry) => {
    setEditingEntryId(entry.id);
    setFormType(entry.type);
    setFormDate(entry.date);
    setFormCategory(entry.category);
    setFormTitle(entry.title);
    setFormAmount(String(entry.amountThb));
    setFormPayment(entry.paymentMethod);
    setFormRef(entry.referenceCode || "");
    setFormNote(entry.note || "");
    setFormReceiptImageUrl(entry.receiptImageUrl || "");
    setFormOpen(true);
  };

  const handleFormTypeSwitch = (nextType: AccountingEntryType) => {
    setFormType(nextType);
    const list = nextType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!list.includes(formCategory)) {
      setFormCategory(list[0]);
    }
  };

  const handleScanBillFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScanError("กรุณาเลือกไฟล์รูปภาพ (JPG, PNG หรือ WebP)");
      onNotify("รองรับเฉพาะไฟล์รูปภาพเท่านั้น", "error");
      return;
    }

    setScannerOpen(true);
    setSubTab("ledger");
    setIsScanningBill(true);
    setScanError(null);
    setScanResult(null);

    try {
      // Prepare crisp image for Gemini OCR & upload receipt image in parallel
      const [ocrDataUrl, uploaded] = await Promise.all([
        readImageAsDataUrl(file, 1400, 950000),
        uploadPhoto(file, {
          folder: "receipts",
          maxDimension: 1200,
          maxFallbackChars: 135000,
        }),
      ]);

      setScanPreviewUrl(uploaded.url || ocrDataUrl);
      setFormReceiptImageUrl(uploaded.url);

      const response = await fetch("/api/accounting/scan-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: ocrDataUrl,
          incomeCategories: INCOME_CATEGORIES,
          expenseCategories: EXPENSE_CATEGORIES,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: ScannedBillResult;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.result) {
        const errMsg =
          data.error || "ไม่สามารถอ่านข้อมูลจากบิลนี้ได้ กรุณาลองใหม่อีกครั้ง";
        setScanError(errMsg);
        onNotify(errMsg, "error");
        return;
      }

      const result = data.result;
      setScanResult(result);

      // Automatically populate the accounting entry form for instant review or 1-click save
      setEditingEntryId(null);
      setFormType(result.type);
      setFormDate(result.date || getTodayIso());
      setFormCategory(result.category);
      setFormTitle(result.title);
      setFormAmount(result.amountThb > 0 ? String(result.amountThb) : "");
      setFormPayment(result.paymentMethod);
      setFormRef(result.referenceCode || "");
      setFormNote(result.note || "");
      setFormReceiptImageUrl(uploaded.url);
      setFormOpen(true);

      onNotify(
        `AI อ่านบิลสำเร็จ: ${result.title}${
          result.amountThb > 0 ? ` (฿${result.amountThb.toLocaleString()})` : ""
        }`,
        "document_scanner"
      );
    } catch {
      const msg = "เชื่อมต่อระบบสแกนบิล AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      setScanError(msg);
      onNotify(msg, "error");
    } finally {
      setIsScanningBill(false);
    }
  };

  const handleQuickSaveScannedBill = () => {
    const cleanTitle = formTitle.trim();
    const numericAmount = Number(formAmount);
    if (!cleanTitle || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      onNotify("กรุณาตรวจสอบชื่อรายการและยอดเงินให้มากกว่า 0 ก่อนบันทึก", "error");
      return;
    }

    onAddEntry({
      date: formDate || getTodayIso(),
      type: formType,
      category: formCategory,
      title: cleanTitle,
      amountThb: Number(numericAmount.toFixed(2)),
      paymentMethod: formPayment,
      referenceCode: formRef.trim() || undefined,
      note: formNote.trim() || undefined,
      receiptImageUrl: formReceiptImageUrl || undefined,
    });

    setFormOpen(false);
    setScannerOpen(false);
    setScanResult(null);
    setScanPreviewUrl("");
    setFormReceiptImageUrl("");
    setEditingEntryId(null);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    const numericAmount = Number(formAmount);
    if (!cleanTitle || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      onNotify("กรุณาระบุชื่อรายการและจำนวนเงินที่มากกว่า 0", "error");
      return;
    }

    const payload: Omit<AccountingEntry, "id"> = {
      date: formDate || getTodayIso(),
      type: formType,
      category: formCategory,
      title: cleanTitle,
      amountThb: Number(numericAmount.toFixed(2)),
      paymentMethod: formPayment,
      referenceCode: formRef.trim() || undefined,
      note: formNote.trim() || undefined,
      receiptImageUrl: formReceiptImageUrl || undefined,
    };

    if (editingEntryId) {
      const existing = entries.find((item) => item.id === editingEntryId);
      onUpdateEntry(editingEntryId, {
        ...payload,
        sourceOrderId: existing?.sourceOrderId,
      });
    } else {
      onAddEntry(payload);
    }

    setFormOpen(false);
    setScannerOpen(false);
    setScanResult(null);
    setScanPreviewUrl("");
    setFormReceiptImageUrl("");
    setEditingEntryId(null);
  };

  const handleExportCsv = () => {
    if (ledgerEntries.length === 0) {
      onNotify("ไม่มีรายการบัญชีสำหรับส่งออก", "info");
      return;
    }
    const headers = [
      "วันที่",
      "ประเภท",
      "หมวดหมู่",
      "รายการ",
      "ช่องทางชำระ",
      "เลขอ้างอิง",
      "จำนวนเงิน (บาท)",
      "หมายเหตุ",
    ];
    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? "");
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = ledgerEntries.map((e) => [
      e.date,
      e.type === "income" ? "รายรับ" : "รายจ่าย",
      e.category,
      e.title,
      e.paymentMethod,
      e.referenceCode || "",
      e.type === "income" ? e.amountThb : -e.amountThb,
      e.note || "",
    ]);

    const csvContent =
      "\uFEFF" +
      [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DenewStock-Accounting-${getTodayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify(`ส่งออกรายงานบัญชี (${ledgerEntries.length} รายการ) แล้ว`, "download");
  };

  const activeCategoryOptions =
    formType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const allUsedCategories = useMemo(() => {
    const set = new Set<string>([
      ...INCOME_CATEGORIES,
      ...EXPENSE_CATEGORIES,
      ...entries.map((e) => e.category),
    ]);
    return Array.from(set);
  }, [entries]);

  return (
    <div className="flex flex-col w-full gap-4 pb-24">
      {/* Page Header & Primary Accounting Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-on-surface tracking-tight">
            ระบบบัญชีและการเงิน
          </h1>
          <p className="text-[12px] text-on-surface-variant mt-0.5">
            บันทึกรายรับ-รายจ่าย สรุปกำไรสุทธิ และวิเคราะห์ต้นทุนขายรายออเดอร์ (เฉพาะเจ้าของร้าน)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setScannerOpen((prev) => !prev);
              setSubTab("ledger");
            }}
            className={`h-10 px-3.5 rounded-xl text-[13px] font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap ${
              scannerOpen
                ? "bg-on-surface text-surface"
                : "bg-tertiary text-on-tertiary hover:opacity-90"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              document_scanner
            </span>
            <span>สแกนบิลด้วย AI</span>
          </button>

          <button
            type="button"
            onClick={() => openNewForm("income")}
            className="h-10 px-3.5 rounded-xl bg-secondary text-on-secondary hover:opacity-90 text-[13px] font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">
              add_circle
            </span>
            <span>บันทึกรายรับ</span>
          </button>

          <button
            type="button"
            onClick={() => openNewForm("expense")}
            className="h-10 px-3.5 rounded-xl bg-primary text-on-primary hover:bg-primary-dim text-[13px] font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">
              remove_circle
            </span>
            <span>บันทึกรายจ่าย</span>
          </button>

          {unsyncedOrdersCount > 0 && (
            <button
              type="button"
              onClick={onSyncOrdersToAccounting}
              className="h-10 px-3 rounded-xl bg-primary-fixed text-on-primary-fixed hover:bg-primary hover:text-on-primary text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[17px]">
                sync
              </span>
              <span>ดึงยอดออเดอร์ (+{unsyncedOrdersCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:bg-surface-container-low text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[17px]">
              download
            </span>
            <span>ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {/* Hidden File Inputs for AI Bill Scanner */}
      <input
        ref={billCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = "";
          void handleScanBillFile(f);
        }}
      />
      <input
        ref={billFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = "";
          void handleScanBillFile(f);
        }}
      />

      {/* Google Cloud Sync Status Strip */}
      <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              cloudStatus === "connected"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-primary-fixed text-on-primary-fixed"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {cloudStatus === "connected"
                ? "cloud_done"
                : cloudStatus === "connecting"
                  ? "sync"
                  : "cloud_upload"}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-on-surface truncate">
              {cloudStatus === "connected"
                ? `เชื่อมต่อ Google Cloud แล้ว (${cloudUserEmail || "Firebase Cloud"})`
                : cloudStatus === "connecting"
                  ? "กำลังเชื่อมต่อ Google Cloud..."
                  : "ยังไม่ได้เชื่อม Google Cloud (บันทึกในเครื่องชั่วคราว)"}
            </p>
            <p className="text-[11px] text-on-surface-variant truncate">
              {cloudStatus === "connected"
                ? "สมุดบัญชี รูปบิล สต็อก ออเดอร์ และลูกค้าทั้งหมดซิงก์อัตโนมัติขึ้น Google Cloud"
                : "เชื่อมต่อบัญชี Google เพื่อบันทึกข้อมูลทุกอย่างและรูปบิลถาวรบน Google Cloud"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {cloudStatus === "connected" ? (
            onSyncAllToCloud && (
              <button
                type="button"
                disabled={isSyncingCloudAll}
                onClick={onSyncAllToCloud}
                className="h-9 px-3.5 rounded-lg bg-secondary text-on-secondary hover:opacity-90 text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    isSyncingCloudAll ? "animate-spin" : ""
                  }`}
                >
                  {isSyncingCloudAll ? "progress_activity" : "cloud_sync"}
                </span>
                <span>
                  {isSyncingCloudAll
                    ? "กำลังบันทึกขึ้น Cloud..."
                    : "ซิงก์ข้อมูลทั้งหมดขึ้น Google Cloud"}
                </span>
              </button>
            )
          ) : (
            onConnectCloud && (
              <button
                type="button"
                disabled={cloudStatus === "connecting"}
                onClick={onConnectCloud}
                className="h-9 px-3.5 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">
                  cloud_upload
                </span>
                <span>เชื่อม Google Cloud</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* AI Bill & Receipt Auto-Reader Panel */}
      {scannerOpen && (
        <section className="bg-surface-container-lowest border border-tertiary/40 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-surface-container">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-tertiary/15 text-tertiary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[19px]">
                  document_scanner
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-[14px] font-bold text-on-surface truncate">
                  สแกนบิล / ใบเสร็จ / สลิปโอนเงิน อ่านอัตโนมัติด้วย AI
                </h2>
                <p className="text-[11px] text-on-surface-variant truncate">
                  อัปโหลดหรือถ่ายรูปบิล AI จะแยกประเภท รายรับ/รายจ่าย วันที่ หมวดหมู่ ยอดเงิน และเลขอ้างอิงให้อัตโนมัติ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer shrink-0"
              aria-label="ปิดหน้าต่างสแกนบิล"
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
            {/* Upload / Camera Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingBill(true);
              }}
              onDragLeave={() => setIsDraggingBill(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingBill(false);
                const droppedFile = e.dataTransfer.files?.[0];
                void handleScanBillFile(droppedFile);
              }}
              className={`lg:col-span-5 rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center gap-2.5 transition-colors ${
                isDraggingBill
                  ? "border-tertiary bg-tertiary/10"
                  : "border-outline-variant/55 bg-surface-container-low/60"
              }`}
            >
              {scanPreviewUrl ? (
                <div className="w-full flex flex-col items-center gap-2">
                  <div className="relative w-full max-h-52 overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest flex items-center justify-center">
                    <img
                      src={scanPreviewUrl}
                      alt="ตัวอย่างรูปบิลที่สแกน"
                      className="max-h-52 w-auto object-contain"
                    />
                    {isScanningBill && (
                      <div className="absolute inset-0 bg-on-surface/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-surface">
                        <span className="material-symbols-outlined text-[28px] animate-spin">
                          progress_activity
                        </span>
                        <span className="text-[12.5px] font-semibold">
                          AI กำลังอ่านข้อมูลในบิล...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-tertiary/15 text-tertiary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[26px]">
                      receipt_long
                    </span>
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-on-surface">
                      วางรูปบิลที่นี่ หรือเลือกถ่ายรูป / อัปโหลด
                    </p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      รองรับบิลภาษาไทย จีน อังกฤษ · สลิปธนาคาร · ใบเสร็จขนส่ง (JPG, PNG, WebP)
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                <button
                  type="button"
                  disabled={isScanningBill}
                  onClick={() => billCameraInputRef.current?.click()}
                  className="h-9 px-3.5 rounded-lg bg-tertiary text-on-tertiary hover:opacity-90 text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    photo_camera
                  </span>
                  <span>ถ่ายรูปบิล</span>
                </button>
                <button
                  type="button"
                  disabled={isScanningBill}
                  onClick={() => billFileInputRef.current?.click()}
                  className="h-9 px-3.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:bg-surface-container text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    upload_file
                  </span>
                  <span>เลือกรูปบิล / สลิป</span>
                </button>
              </div>
            </div>

            {/* AI Extraction Preview Panel */}
            <div className="lg:col-span-7 flex flex-col gap-2.5">
              {isScanningBill && (
                <div className="rounded-xl bg-surface-container-low border border-outline-variant/35 p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-[24px] text-tertiary animate-spin shrink-0">
                    autorenew
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-on-surface">
                      AI กำลังวิเคราะห์รูปบิลและแยกรายการอัตโนมัติ...
                    </p>
                    <p className="text-[11.5px] text-on-surface-variant">
                      กำลังอ่านชื่อร้าน วันที่ หมวดหมู่ ยอดเงินสุทธิ และแปลงสกุลเงิน (หากเป็นหยวน)
                    </p>
                  </div>
                </div>
              )}

              {scanError && !isScanningBill && (
                <div className="rounded-xl bg-error-container/50 border border-error/30 p-3.5 flex items-start gap-2.5 text-error">
                  <span className="material-symbols-outlined text-[19px] shrink-0 mt-0.5">
                    error
                  </span>
                  <div className="text-[12.5px]">
                    <p className="font-bold">ไม่สามารถอ่านบิลได้</p>
                    <p className="mt-0.5">{scanError}</p>
                  </div>
                </div>
              )}

              {!isScanningBill && !scanError && !scanResult && (
                <div className="rounded-xl bg-surface-container-low/70 border border-outline-variant/30 p-4 flex flex-col gap-2">
                  <p className="text-[13px] font-bold text-on-surface">
                    สิ่งที่ AI อ่านให้อัตโนมัติจากบิลของคุณ:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[12px] text-on-surface-variant">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        check_circle
                      </span>
                      แยกประเภท รายรับ / รายจ่าย อัตโนมัติ
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        check_circle
                      </span>
                      อ่านวันที่ (แปลง พ.ศ. → ค.ศ. ให้ทันที)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        check_circle
                      </span>
                      จัดหมวดบัญชี + ช่องทางชำระเงินให้ตรง
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        check_circle
                      </span>
                      แนบรูปบิลเก็บไว้ใน Google Cloud ตลอดไป
                    </span>
                  </div>
                </div>
              )}

              {scanResult && !isScanningBill && (
                <div className="rounded-xl bg-surface-container-low/80 border border-secondary/35 p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">
                        auto_awesome
                      </span>
                      <span className="text-[13px] font-bold text-on-surface">
                        AI อ่านข้อมูลบิลเรียบร้อย — กรอกลงแบบฟอร์มให้แล้ว
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                        scanResult.confidence === "high"
                          ? "bg-secondary-container text-on-secondary-container"
                          : scanResult.confidence === "medium"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-error-container text-error"
                      }`}
                    >
                      {scanResult.confidence === "high"
                        ? "ความแม่นยำสูง"
                        : scanResult.confidence === "medium"
                          ? "ปานกลาง · ตรวจสอบยอด"
                          : "ภาพไม่ชัด · กรุณาตรวจทาน"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                    <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/30">
                      <p className="text-[10.5px] text-on-surface-variant">ประเภท</p>
                      <p
                        className={`font-bold mt-0.5 ${
                          scanResult.type === "income"
                            ? "text-secondary"
                            : "text-error"
                        }`}
                      >
                        {scanResult.type === "income" ? "รายรับ (+)" : "รายจ่าย (-)"}
                      </p>
                    </div>
                    <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/30">
                      <p className="text-[10.5px] text-on-surface-variant">ยอดสุทธิ</p>
                      <p className="font-bold text-on-surface tabular-nums mt-0.5">
                        ฿{scanResult.amountThb.toLocaleString()}
                        {scanResult.currencyDetected &&
                          scanResult.currencyDetected !== "THB" && (
                            <span className="text-[10px] font-medium text-on-surface-variant ml-1">
                              ({scanResult.currencyDetected})
                            </span>
                          )}
                      </p>
                    </div>
                    <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/30">
                      <p className="text-[10.5px] text-on-surface-variant">วันที่</p>
                      <p className="font-semibold text-on-surface tabular-nums mt-0.5">
                        {formatThaiDate(scanResult.date)}
                      </p>
                    </div>
                    <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/30">
                      <p className="text-[10.5px] text-on-surface-variant">หมวดหมู่</p>
                      <p className="font-semibold text-on-surface truncate mt-0.5">
                        {scanResult.category}
                      </p>
                    </div>
                  </div>

                  {scanResult.items.length > 0 && (
                    <div className="bg-surface-container-lowest rounded-lg p-2.5 border border-outline-variant/30">
                      <p className="text-[11px] font-semibold text-on-surface-variant mb-1.5">
                        รายการย่อยที่ AI อ่านได้จากบิล ({scanResult.items.length} รายการ)
                      </p>
                      <div className="max-h-28 overflow-y-auto divide-y divide-surface-container text-[11.5px]">
                        {scanResult.items.map((it, idx) => (
                          <div
                            key={`${it.name}-${idx}`}
                            className="py-1 flex items-center justify-between gap-2"
                          >
                            <span className="text-on-surface truncate">
                              {it.name}{" "}
                              <span className="text-on-surface-variant">
                                x{it.qty}
                              </span>
                            </span>
                            <span className="font-semibold tabular-nums text-on-surface shrink-0">
                              ฿{it.amountThb.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                    <span className="text-[11px] text-on-surface-variant">
                      ตรวจสอบหรือแก้ไขข้อมูลได้ในแบบฟอร์มด้านล่าง แล้วกดบันทึกได้เลย
                    </span>
                    <button
                      type="button"
                      onClick={handleQuickSaveScannedBill}
                      className="h-9 px-4 rounded-lg bg-secondary text-on-secondary hover:opacity-90 text-[12.5px] font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        check_circle
                      </span>
                      <span>บันทึกเข้าบัญชีทันที</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4-Column Financial KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-on-surface-variant">
            รายรับรวม
          </p>
          <p className="text-[20px] font-bold text-secondary tabular-nums mt-1">
            ฿{Math.round(financialStats.totalIncome).toLocaleString()}
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            {financialStats.incomeCount} รายการรายรับ
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-on-surface-variant">
            รายจ่ายรวม
          </p>
          <p className="text-[20px] font-bold text-error tabular-nums mt-1">
            ฿{Math.round(financialStats.totalExpense).toLocaleString()}
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            {financialStats.expenseCount} รายการรายจ่าย
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-on-surface-variant">
            กำไรสุทธิคงเหลือ
          </p>
          <p
            className={`text-[20px] font-bold tabular-nums mt-1 ${
              financialStats.netProfit >= 0 ? "text-primary" : "text-error"
            }`}
          >
            {financialStats.netProfit >= 0 ? "+" : "-"}฿
            {Math.abs(Math.round(financialStats.netProfit)).toLocaleString()}
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            อัตรากำไรสุทธิ {financialStats.netMarginPct}%
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-on-surface-variant">
            มูลค่าสต็อกคลัง (ทุน)
          </p>
          <p className="text-[20px] font-bold text-on-surface tabular-nums mt-1">
            ฿{Math.round(inventoryValuation.costValue).toLocaleString()}
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            มูลค่าขายปลีก ฿
            {Math.round(inventoryValuation.retailValue).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Add / Edit Accounting Entry Form */}
      {formOpen && (
        <form
          onSubmit={handleSubmitForm}
          className="bg-surface-container-lowest border border-primary/35 rounded-xl p-4 shadow-sm flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-surface-container">
            <h2 className="text-[15px] font-bold text-on-surface">
              {editingEntryId
                ? "แก้ไขรายการบัญชี"
                : formType === "income"
                  ? "บันทึกรายรับใหม่"
                  : "บันทึกรายจ่ายใหม่"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingEntryId(null);
              }}
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Type Segmented Control */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                ประเภทรายการ
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-container h-10">
                <button
                  type="button"
                  onClick={() => handleFormTypeSwitch("income")}
                  className={`rounded-md text-[12px] font-semibold transition-colors cursor-pointer ${
                    formType === "income"
                      ? "bg-secondary text-on-secondary shadow-xs"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  รายรับ (+)
                </button>
                <button
                  type="button"
                  onClick={() => handleFormTypeSwitch("expense")}
                  className={`rounded-md text-[12px] font-semibold transition-colors cursor-pointer ${
                    formType === "expense"
                      ? "bg-error text-on-error shadow-xs"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  รายจ่าย (-)
                </button>
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="acc-date"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                วันที่ทำรายการ
              </label>
              <input
                id="acc-date"
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="acc-category"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                หมวดบัญชี
              </label>
              <select
                id="acc-category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              >
                {activeCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="acc-amount"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                จำนวนเงิน (บาท) *
              </label>
              <input
                id="acc-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[14px] font-semibold text-on-surface tabular-nums focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Title */}
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor="acc-title"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                รายละเอียดรายการ *
              </label>
              <input
                id="acc-title"
                type="text"
                required
                placeholder={
                  formType === "income"
                    ? "เช่น ยอดขายหน้าร้านช่วงบ่าย / โอนยอดขายส่งกระเป๋า"
                    : "เช่น ซื้อกล่องพัสดุ / ค่าขนส่งจีน-ไทย ล็อตใหม่"
                }
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            {/* Payment Method */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="acc-payment"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                ช่องทางชำระเงิน
              </label>
              <select
                id="acc-payment"
                value={formPayment}
                onChange={(e) =>
                  setFormPayment(e.target.value as AccountingPaymentMethod)
                }
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>

            {/* Reference Code */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="acc-ref"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                เลขอ้างอิง / เลขบิล (ถ้ามี)
              </label>
              <input
                id="acc-ref"
                type="text"
                placeholder="เช่น INV-001, ORD-202501"
                value={formRef}
                onChange={(e) => setFormRef(e.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Optional Receipt Photo Attachment Preview inside Form */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-lg bg-surface-container-low/70 border border-outline-variant/35">
            <div className="flex items-center gap-2.5 min-w-0">
              {formReceiptImageUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxImage({
                      url: formReceiptImageUrl,
                      title: formTitle || "รูปบิลที่แนบ",
                    })
                  }
                  className="w-11 h-11 rounded-lg overflow-hidden border border-outline-variant/50 shrink-0 cursor-pointer hover:opacity-90"
                  title="คลิกเพื่อดูรูปบิลขนาดใหญ่"
                >
                  <img
                    src={formReceiptImageUrl}
                    alt="รูปบิลแนบ"
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="w-11 h-11 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <span className="material-symbols-outlined text-[20px]">
                    receipt
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-on-surface truncate">
                  {formReceiptImageUrl
                    ? "แนบรูปบิล/ใบเสร็จแล้ว (พร้อมบันทึกขึ้น Google Cloud)"
                    : "ยังไม่ได้แนบรูปบิล/ใบเสร็จ"}
                </p>
                <p className="text-[11px] text-on-surface-variant truncate">
                  สแกนรูปบิลเพื่อให้ AI กรอกข้อมูลอัตโนมัติและเก็บรูปไว้ตรวจสอบย้อนหลัง
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isScanningBill}
                onClick={() => billFileInputRef.current?.click()}
                className="h-8 px-2.5 rounded-lg bg-tertiary/15 text-tertiary hover:bg-tertiary hover:text-on-tertiary text-[11.5px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[15px]">
                  document_scanner
                </span>
                <span>{formReceiptImageUrl ? "สแกนบิลใหม่" : "สแกนบิล AI"}</span>
              </button>
              {formReceiptImageUrl && (
                <button
                  type="button"
                  onClick={() => setFormReceiptImageUrl("")}
                  className="h-8 px-2 rounded-lg bg-surface-container text-on-surface-variant hover:text-error text-[11.5px] font-medium cursor-pointer"
                >
                  ลบรูป
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label
                htmlFor="acc-note"
                className="text-[11px] font-semibold text-on-surface-variant"
              >
                หมายเหตุเพิ่มเติม (ถ้ามี)
              </label>
              <input
                id="acc-note"
                type="text"
                placeholder="รายละเอียดเพิ่มเติมสำหรับตรวจสอบย้อนหลัง"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0 justify-end">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingEntryId(null);
                  setFormReceiptImageUrl("");
                }}
                className="h-10 px-4 rounded-lg bg-surface-container text-on-surface-variant text-[13px] font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className={`h-10 px-5 rounded-lg text-[13px] font-semibold cursor-pointer shadow-xs ${
                  formType === "income"
                    ? "bg-secondary text-on-secondary"
                    : "bg-primary text-on-primary"
                }`}
              >
                {editingEntryId ? "บันทึกการแก้ไข" : "บันทึกลงสมุดบัญชี"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Sub-Tabs & Date Range Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="inline-flex items-center p-1 rounded-xl bg-surface-container self-start">
          <button
            type="button"
            onClick={() => setSubTab("ledger")}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === "ledger"
                ? "bg-surface-container-lowest text-primary shadow-xs"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            สมุดบัญชีรายรับ-รายจ่าย ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("order_pnl")}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === "order_pnl"
                ? "bg-surface-container-lowest text-primary shadow-xs"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            วิเคราะห์กำไรรายออเดอร์ ({orders.length})
          </button>
        </div>

        {subTab === "ledger" && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: "all", label: "ทั้งหมด" },
                { id: "today", label: "วันนี้" },
                { id: "7d", label: "7 วัน" },
                { id: "30d", label: "30 วัน" },
                { id: "month", label: "เดือนนี้" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDateRange(opt.id)}
                className={`h-8 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  dateRange === opt.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {subTab === "ledger" ? (
        <>
          {/* Cashflow Chart & Category Breakdown Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* BarChart: Daily Income vs Expense */}
            <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-[14px] font-bold text-on-surface">
                    สรุปกระแสเงินสดรายวัน (รายรับ vs รายจ่าย)
                  </h2>
                  <p className="text-[11px] text-on-surface-variant">
                    เปรียบเทียบยอดเงินเข้า-ออกตามวันที่ลงบัญชี
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-medium text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#16a34a] inline-block" />
                    รายรับ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#e11d74] inline-block" />
                    รายจ่าย
                  </span>
                </div>
              </div>

              {dailyChartData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-[13px] text-on-surface-variant">
                  ยังไม่มีข้อมูลบัญชีในช่วงเวลาที่เลือก
                </div>
              ) : (
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailyChartData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(148,163,184,0.22)"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
                      />
                      <Tooltip
                        formatter={(value: unknown, name: unknown) => [
                          `฿${Number(value || 0).toLocaleString()}`,
                          name === "income" ? "รายรับ" : "รายจ่าย",
                        ]}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid rgba(148,163,184,0.25)",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="income"
                        name="income"
                        fill="#16a34a"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="expense"
                        name="expense"
                        fill="#e11d74"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Category Breakdown */}
            <section className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[14px] font-bold text-on-surface">
                    สัดส่วนแยกตามหมวดบัญชี
                  </h2>
                  <p className="text-[11px] text-on-surface-variant">
                    กดที่หมวดเพื่อกรองรายการในสมุดบัญชี
                  </p>
                </div>
                <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setBreakdownMode("expense")}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                      breakdownMode === "expense"
                        ? "bg-surface-container-lowest text-error shadow-xs"
                        : "text-on-surface-variant"
                    }`}
                  >
                    รายจ่าย
                  </button>
                  <button
                    type="button"
                    onClick={() => setBreakdownMode("income")}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                      breakdownMode === "income"
                        ? "bg-surface-container-lowest text-secondary shadow-xs"
                        : "text-on-surface-variant"
                    }`}
                  >
                    รายรับ
                  </button>
                </div>
              </div>

              {categoryBreakdown.items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[13px] text-on-surface-variant py-8">
                  ไม่มีรายการ{breakdownMode === "income" ? "รายรับ" : "รายจ่าย"}ในช่วงเวลานี้
                </div>
              ) : (
                <div className="flex flex-col gap-2 overflow-y-auto max-h-56 pr-0.5">
                  {categoryBreakdown.items.map((item) => {
                    const pct =
                      categoryBreakdown.total > 0
                        ? Math.round(
                            (item.amount / categoryBreakdown.total) * 100
                          )
                        : 0;
                    const active = categoryFilter === item.category;
                    return (
                      <button
                        key={item.category}
                        type="button"
                        onClick={() =>
                          setCategoryFilter((prev) =>
                            prev === item.category ? "ทั้งหมด" : item.category
                          )
                        }
                        className={`w-full text-left rounded-lg p-2 border transition-colors cursor-pointer ${
                          active
                            ? "bg-primary-fixed/40 border-primary/50"
                            : "bg-surface-container-low/60 border-transparent hover:border-outline-variant/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                          <span className="font-semibold text-on-surface truncate">
                            {item.category}
                          </span>
                          <span className="font-bold tabular-nums shrink-0 text-on-surface">
                            ฿{Math.round(item.amount).toLocaleString()}{" "}
                            <span className="text-[11px] font-normal text-on-surface-variant">
                              ({pct}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              breakdownMode === "income"
                                ? "bg-secondary"
                                : "bg-primary"
                            }`}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Ledger Filter Bar */}
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
              <div className="relative flex items-center flex-1 bg-surface-container-low rounded-lg px-3 h-10">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-2">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหารายการบัญชี, หมวดหมู่, เลขอ้างอิง..."
                  className="w-full bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="ล้างคำค้นหา"
                    onClick={() => setSearchQuery("")}
                    className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      close
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container h-10">
                  {(
                    [
                      { id: "all", label: "ทั้งหมด" },
                      { id: "income", label: "รายรับ" },
                      { id: "expense", label: "รายจ่าย" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTypeFilter(t.id)}
                      className={`h-9 px-3 rounded-md text-[12px] font-semibold cursor-pointer transition-colors ${
                        typeFilter === t.id
                          ? "bg-surface-container-lowest text-primary shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="กรองตามหมวดบัญชี"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-10 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[12px] font-medium text-on-surface focus:outline-none cursor-pointer"
                >
                  <option value="ทั้งหมด">ทุกหมวดบัญชี</option>
                  {allUsedCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="กรองตามช่องทางชำระเงิน"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="h-10 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[12px] font-medium text-on-surface focus:outline-none cursor-pointer"
                >
                  <option value="ทั้งหมด">ทุกช่องทางชำระ</option>
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>

                {role === "owner" &&
                  entries.length > 0 &&
                  (confirmClearAll ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onClearAllEntries();
                          setConfirmClearAll(false);
                        }}
                        className="h-10 px-3 rounded-lg bg-error text-on-error text-[12px] font-semibold cursor-pointer"
                      >
                        ยืนยันลบทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearAll(false)}
                        className="h-10 px-2.5 rounded-lg bg-surface-container text-on-surface-variant text-[12px] font-medium cursor-pointer"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(true)}
                      className="h-10 px-3 rounded-lg bg-error-container/55 hover:bg-error text-error hover:text-on-error text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        delete_sweep
                      </span>
                      <span>ลบทั้งหมด</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* High-Density Accounting Ledger Table */}
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl overflow-hidden">
            {ledgerEntries.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant">
                  account_balance_wallet
                </span>
                <p className="text-[15px] font-semibold text-on-surface">
                  ไม่พบรายการบัญชีตามเงื่อนไขที่เลือก
                </p>
                <p className="text-[12px] text-on-surface-variant">
                  กดปุ่มบันทึกรายรับ/รายจ่ายด้านบน หรือล้างตัวกรองเพื่อดูรายการทั้งหมด
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[740px]">
                  <thead>
                    <tr className="border-b border-outline-variant/35 bg-surface-container-low/70 text-[11px] font-semibold text-on-surface-variant">
                      <th className="py-2.5 px-4">วันที่</th>
                      <th className="py-2.5 px-3">รายการ / อ้างอิง</th>
                      <th className="py-2.5 px-3">หมวดบัญชี</th>
                      <th className="py-2.5 px-3">ช่องทางชำระ</th>
                      <th className="py-2.5 px-3 text-right">จำนวนเงิน (฿)</th>
                      <th className="py-2.5 px-4 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container text-[13px]">
                    {ledgerEntries.map((entry) => {
                      const isIncome = entry.type === "income";
                      const isConfirmDel = confirmDeleteId === entry.id;
                      return (
                        <tr
                          key={entry.id}
                          className="hover:bg-surface-container-low/55 transition-colors"
                        >
                          <td className="py-2.5 px-4 text-[12px] text-on-surface-variant tabular-nums whitespace-nowrap">
                            {formatThaiDate(entry.date)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-start gap-2">
                              {entry.receiptImageUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxImage({
                                      url: entry.receiptImageUrl!,
                                      title: entry.title,
                                    })
                                  }
                                  className="w-9 h-9 rounded-lg overflow-hidden border border-outline-variant/50 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 mt-0.5"
                                  title="คลิกเพื่อดูรูปบิลที่แนบ"
                                >
                                  <img
                                    src={entry.receiptImageUrl}
                                    alt={`รูปบิล ${entry.title}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-semibold text-on-surface">
                                    {entry.title}
                                  </p>
                                  {entry.receiptImageUrl && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLightboxImage({
                                          url: entry.receiptImageUrl!,
                                          title: entry.title,
                                        })
                                      }
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-tertiary/15 text-tertiary hover:bg-tertiary hover:text-on-tertiary text-[10.5px] font-semibold transition-colors cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-[12px]">
                                        receipt_long
                                      </span>
                                      <span>ดูรูปบิล</span>
                                    </button>
                                  )}
                                </div>
                                {(entry.referenceCode || entry.note) && (
                                  <p className="text-[11px] text-on-surface-variant mt-0.5 tabular-nums">
                                    {entry.referenceCode
                                      ? `อ้างอิง: ${entry.referenceCode}`
                                      : ""}
                                    {entry.referenceCode && entry.note
                                      ? " · "
                                      : ""}
                                    {entry.note || ""}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-on-surface-variant whitespace-nowrap">
                            {entry.category}
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-on-surface-variant whitespace-nowrap">
                            {entry.paymentMethod}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap ${
                              isIncome ? "text-secondary" : "text-error"
                            }`}
                          >
                            {isIncome ? "+" : "-"}฿
                            {entry.amountThb.toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            {isConfirmDel ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteEntry(entry.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="h-7 px-2 rounded-md bg-error text-on-error text-[11px] font-semibold cursor-pointer"
                                >
                                  ยืนยันลบ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="h-7 px-2 rounded-md bg-surface-container text-on-surface-variant text-[11px] font-medium cursor-pointer"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`แก้ไข ${entry.title}`}
                                  onClick={() => openEditForm(entry)}
                                  className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-primary inline-flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    edit
                                  </span>
                                </button>
                                {role === "owner" && (
                                  <button
                                    type="button"
                                    aria-label={`ลบ ${entry.title}`}
                                    onClick={() => setConfirmDeleteId(entry.id)}
                                    className="w-8 h-8 rounded-lg bg-error-container/50 hover:bg-error text-error hover:text-on-error inline-flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">
                                      delete
                                    </span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Order Profit & Loss Analysis Sub-Tab */
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
              <p className="text-[11px] text-on-surface-variant">
                ยอดขายรวมจากออเดอร์ทั้งหมด
              </p>
              <p className="text-[19px] font-bold text-on-surface tabular-nums mt-0.5">
                ฿{Math.round(orderPnlSummary.revenue).toLocaleString()}
              </p>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
              <p className="text-[11px] text-on-surface-variant">
                ต้นทุนสินค้ารวม (COGS)
              </p>
              <p className="text-[19px] font-bold text-error tabular-nums mt-0.5">
                ฿{Math.round(orderPnlSummary.cogs).toLocaleString()}
              </p>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
              <p className="text-[11px] text-on-surface-variant">
                กำไรขั้นต้นรวมจากออเดอร์
              </p>
              <p className="text-[19px] font-bold text-secondary tabular-nums mt-0.5">
                +฿{Math.round(orderPnlSummary.grossProfit).toLocaleString()}{" "}
                <span className="text-[12px] font-semibold">
                  ({orderPnlSummary.marginPct}%)
                </span>
              </p>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl overflow-hidden">
            {orderPnlRows.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-on-surface-variant">
                ยังไม่มีออเดอร์ในระบบสำหรับวิเคราะห์กำไร-ขาดทุน
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-outline-variant/35 bg-surface-container-low/70 text-[11px] font-semibold text-on-surface-variant">
                      <th className="py-2.5 px-4">ออเดอร์ / ลูกค้า</th>
                      <th className="py-2.5 px-3">ประเภท / สถานะ</th>
                      <th className="py-2.5 px-3 text-right">ยอดขาย (฿)</th>
                      <th className="py-2.5 px-3 text-right">ต้นทุนรวม (฿)</th>
                      <th className="py-2.5 px-3 text-right">กำไรขั้นต้น (฿)</th>
                      <th className="py-2.5 px-4 text-right">ลงบัญชี</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container text-[13px]">
                    {orderPnlRows.map(
                      ({ order, cogs, grossProfit, marginPct, isSynced }) => (
                        <tr
                          key={order.id}
                          className="hover:bg-surface-container-low/55"
                        >
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-on-surface tabular-nums">
                              #{order.id} · {order.customerName}
                            </p>
                            <p className="text-[11px] text-on-surface-variant">
                              {order.items.length} รายการ · เวลา {order.createdAt}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-on-surface-variant whitespace-nowrap">
                            {order.orderType === "walk_in"
                              ? "หน้าร้าน"
                              : order.channel || "จัดส่ง"}{" "}
                            ·{" "}
                            {order.status === "shipped"
                              ? "ส่งแล้ว"
                              : order.status === "ready_to_ship"
                                ? "รอจัดส่ง"
                                : order.status === "packing"
                                  ? "กำลังแพ็ค"
                                  : "รอแพ็ค"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-on-surface tabular-nums whitespace-nowrap">
                            ฿{order.totalThb.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right text-on-surface-variant tabular-nums whitespace-nowrap">
                            ฿{cogs.toLocaleString()}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap ${
                              grossProfit >= 0 ? "text-secondary" : "text-error"
                            }`}
                          >
                            {grossProfit >= 0 ? "+" : "-"}฿
                            {Math.abs(Math.round(grossProfit)).toLocaleString()}{" "}
                            <span className="text-[11px] font-medium">
                              ({marginPct}%)
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right text-[12px] whitespace-nowrap">
                            {isSynced ? (
                              <span className="text-secondary font-semibold">
                                บันทึกแล้ว
                              </span>
                            ) : (
                              <span className="text-on-surface-variant">
                                ยังไม่ซิงก์
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Receipt Photo Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-on-surface/75 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="bg-surface-container-lowest rounded-2xl max-w-xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-outline-variant/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-outline-variant/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[19px] text-tertiary shrink-0">
                  receipt_long
                </span>
                <h3 className="text-[14px] font-bold text-on-surface truncate">
                  รูปบิล: {lightboxImage.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant cursor-pointer shrink-0"
                aria-label="ปิดรูปบิล"
              >
                <span className="material-symbols-outlined text-[18px]">
                  close
                </span>
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-surface-container-low">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[72vh] w-auto object-contain rounded-lg shadow-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
