import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Order, ProductItem, RoleMode } from "../types";
import { exportStockAndSalesReportCsv } from "../utils/csvExport";
import { ResilientImage } from "./ResilientImage";

type StockFilterMode = "all" | "low" | "normal" | "out";
type SortMode =
  | "stock_asc"
  | "stock_desc"
  | "name_asc"
  | "price_asc"
  | "price_desc";

interface InventoryViewProps {
  role: RoleMode;
  products: ProductItem[];
  orders: Order[];
  categories: string[];
  initialStockFilter?: "all" | "low";
  onConsumeInitialFilter?: () => void;
  lastSyncedLabel: string;
  onSyncNow: () => void;
  onNotify?: (msg: string, icon?: string) => void;
  onQuickCreateOrderForProduct: (product: ProductItem) => void;
  onNavigateAccounting: () => void;
  onOpenAddProduct: () => void;
  onAddCategory: (categoryName: string) => void;
  onSelectProduct: (product: ProductItem) => void;
  onDeleteProduct: (productId: string) => void;
  onDeleteCategory: (categoryName: string) => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSkuText(value: string): string {
  return value.toLowerCase().replace(/[\s\-_]+/g, "");
}

function renderHighlightedText(text: string, query: string): ReactNode {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return text;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className="bg-primary-fixed/85 text-on-primary-fixed rounded-xs px-0.5 font-semibold"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function InventoryView({
  role,
  products,
  orders,
  categories,
  initialStockFilter,
  onConsumeInitialFilter,
  lastSyncedLabel,
  onSyncNow,
  onNotify,
  onQuickCreateOrderForProduct,
  onNavigateAccounting,
  onOpenAddProduct,
  onAddCategory,
  onSelectProduct,
  onDeleteProduct,
  onDeleteCategory,
}: InventoryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilterMode>(
    initialStockFilter || "all"
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("ทั้งหมด");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortMode, setSortMode] = useState<SortMode>("stock_asc");
  const [syncing, setSyncing] = useState(false);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<
    string | null
  >(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (initialStockFilter) {
      setStockFilter(initialStockFilter);
      setSelectedCategory("ทั้งหมด");
      onConsumeInitialFilter?.();
    }
  }, [initialStockFilter, onConsumeInitialFilter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const totalUnits = useMemo(
    () => products.reduce((sum, p) => sum + p.stock, 0),
    [products]
  );

  const totalCostValueThb = useMemo(
    () => products.reduce((sum, p) => sum + p.stock * p.landedCostThb, 0),
    [products]
  );

  const totalRetailValueThb = useMemo(
    () => products.reduce((sum, p) => sum + p.stock * p.sellPriceThb, 0),
    [products]
  );

  const lowStockItems = useMemo(
    () =>
      products
        .filter((p) => p.stock < p.lowThreshold)
        .sort((a, b) => {
          const ratioA = a.lowThreshold > 0 ? a.stock / a.lowThreshold : 0;
          const ratioB = b.lowThreshold > 0 ? b.stock / b.lowThreshold : 0;
          return ratioA - ratioB;
        }),
    [products]
  );

  const outOfStockItems = useMemo(
    () => products.filter((p) => p.stock <= 0),
    [products]
  );

  const normalStockItems = useMemo(
    () => products.filter((p) => p.stock >= p.lowThreshold),
    [products]
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      map.set(p.category, (map.get(p.category) ?? 0) + 1);
    });
    return map;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    const tokens = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    const normalizedQuery = normalizeSkuText(trimmed);

    const list = products.filter((p) => {
      const nameLower = p.name.toLowerCase();
      const skuLower = p.sku.toLowerCase();
      const normalizedSku = normalizeSkuText(p.sku);
      const categoryLower = p.category.toLowerCase();
      const colorNamesLower = (p.colors ?? []).map((c) => c.name.toLowerCase());

      const matchesSearch =
        tokens.length === 0 ||
        (normalizedQuery.length > 0 && normalizedSku.includes(normalizedQuery)) ||
        tokens.every((token) => {
          const normalizedToken = normalizeSkuText(token);
          return (
            nameLower.includes(token) ||
            skuLower.includes(token) ||
            (normalizedToken.length > 0 &&
              normalizedSku.includes(normalizedToken)) ||
            categoryLower.includes(token) ||
            colorNamesLower.some((c) => c.includes(token))
          );
        });

      const matchesStock =
        stockFilter === "all"
          ? true
          : stockFilter === "low"
            ? p.stock < p.lowThreshold
            : stockFilter === "out"
              ? p.stock <= 0
              : p.stock >= p.lowThreshold;

      const matchesCategory =
        selectedCategory === "ทั้งหมด" || p.category === selectedCategory;

      return matchesSearch && matchesStock && matchesCategory;
    });

    return [...list].sort((a, b) => {
      switch (sortMode) {
        case "stock_asc":
          return a.stock - b.stock;
        case "stock_desc":
          return b.stock - a.stock;
        case "name_asc":
          return a.name.localeCompare(b.name, "th");
        case "price_asc":
          return a.sellPriceThb - b.sellPriceThb;
        case "price_desc":
          return b.sellPriceThb - a.sellPriceThb;
        default:
          return 0;
      }
    });
  }, [products, searchQuery, stockFilter, selectedCategory, sortMode]);

  const handleSyncClick = () => {
    setSyncing(true);
    onSyncNow();
    setTimeout(() => setSyncing(false), 600);
  };

  const handleExportStockReportCsv = () => {
    const result = exportStockAndSalesReportCsv(products, orders);
    onNotify?.(
      `ดาวน์โหลดรายงานสต็อกและประวัติการขายแล้ว (สินค้า ${result.productCount} รุ่น, ออเดอร์ ${result.orderCount} รายการ)`,
      "download"
    );
  };

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;
    onAddCategory(clean);
    setNewCategoryName("");
    setShowAddCategory(false);
  };

  return (
    <div className="flex flex-col w-full gap-4 pb-24">
      {/* Page Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-on-surface tracking-tight">
            คลังสินค้า (Inventory)
          </h1>
          <p className="text-[12px] text-on-surface-variant tabular-nums mt-0.5">
            {role === "owner"
              ? `จัดการสต็อกกระเป๋า ต้นทุน และหมวดหมู่ทั้งหมด · บันทึกล่าสุด ${lastSyncedLabel}`
              : `ตรวจเช็กสต็อกสินค้า สีคงเหลือ และส่งคำขอปรับสต็อกได้ทันที · อัปเดต ${lastSyncedLabel}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenAddProduct}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary hover:bg-primary-dim text-[13px] font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>เพิ่มสินค้าใหม่</span>
          </button>

          {role === "owner" && (
            <>
              <button
                type="button"
                onClick={handleExportStockReportCsv}
                className="h-10 px-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:bg-surface-container-low text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">
                  download
                </span>
                <span>ดาวน์โหลดรายงานสต็อก (CSV)</span>
              </button>

              <button
                type="button"
                onClick={onNavigateAccounting}
                className="h-10 px-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-primary hover:bg-surface-container-low text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">
                  account_balance_wallet
                </span>
                <span>ระบบบัญชี</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleSyncClick}
            aria-label="บันทึกข้อมูลทันที"
            title="บันทึกข้อมูลลงเครื่องทันที"
            className="h-10 w-10 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-secondary hover:bg-surface-container-low flex items-center justify-center cursor-pointer shrink-0"
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                syncing ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
          </button>
        </div>
      </div>

      {/* 4-Column Warehouse KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-on-surface-variant">
            รายการสินค้าทั้งหมด
          </p>
          <p className="text-[20px] font-bold text-on-surface tabular-nums mt-1">
            {products.length.toLocaleString()}{" "}
            <span className="text-[12px] font-normal text-on-surface-variant">
              รุ่น (SKU)
            </span>
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            แยกตาม {categories.length} หมวดหมู่กระเป๋า
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-on-surface-variant">
            จำนวนสต็อกรวมในคลัง
          </p>
          <p className="text-[20px] font-bold text-primary tabular-nums mt-1">
            {totalUnits.toLocaleString()}{" "}
            <span className="text-[12px] font-normal text-on-surface-variant">
              ชิ้น
            </span>
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            สต็อกปกติ {normalStockItems.length} รายการ
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setStockFilter((prev) => (prev === "low" ? "all" : "low"));
            setSelectedCategory("ทั้งหมด");
          }}
          className={`text-left rounded-xl p-3.5 border transition-colors cursor-pointer ${
            stockFilter === "low"
              ? "bg-tertiary-fixed/80 border-primary"
              : lowStockItems.length > 0
                ? "bg-surface-container-lowest border-secondary/50 hover:bg-tertiary-fixed/35"
                : "bg-surface-container-lowest border-outline-variant/40 hover:bg-surface-container-low"
          }`}
        >
          <p className="text-[11px] font-medium text-on-surface-variant">
            สินค้าที่ต้องสั่งเติม
          </p>
          <p
            className={`text-[20px] font-bold tabular-nums mt-1 ${
              lowStockItems.length > 0 ? "text-error" : "text-secondary"
            }`}
          >
            {lowStockItems.length.toLocaleString()}{" "}
            <span className="text-[12px] font-normal text-on-surface-variant">
              รายการ
            </span>
          </p>
          <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
            {outOfStockItems.length > 0
              ? `หมดสต็อก ${outOfStockItems.length} รายการ · กดเพื่อกรอง`
              : lowStockItems.length > 0
                ? "ต่ำกว่าจุดแจ้งเตือน · กดเพื่อกรอง"
                : "ไม่มีรายการใกล้หมด"}
          </p>
        </button>

        {role === "owner" ? (
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
            <p className="text-[11px] font-medium text-on-surface-variant">
              มูลค่าสต็อกคงเหลือ (ทุน)
            </p>
            <p className="text-[20px] font-bold text-secondary tabular-nums mt-1">
              ฿{Math.round(totalCostValueThb).toLocaleString()}
            </p>
            <p className="text-[11px] text-on-surface-variant tabular-nums mt-0.5">
              มูลค่าขายปลีก ฿{Math.round(totalRetailValueThb).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
            <p className="text-[11px] font-medium text-on-surface-variant">
              สิทธิ์การปรับสต็อก
            </p>
            <p className="text-[15px] font-bold text-on-surface mt-1.5">
              ส่งคำขออนุมัติ
            </p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              ส่งคำขอให้เจ้าของร้านอนุมัติในระบบ
            </p>
          </div>
        )}
      </div>

      {/* Search + Sort + View Mode Toolbar */}
      <div className="flex flex-col gap-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Real-Time Name & SKU Search Bar */}
          <div
            role="search"
            aria-label="ค้นหาสินค้าด้วยชื่อหรือรหัส SKU"
            className="relative flex items-center flex-1 bg-surface-container-low/80 border border-outline-variant/55 rounded-xl px-3.5 h-11 transition-all focus-within:bg-surface-container-lowest focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
          >
            <span
              className={`material-symbols-outlined text-[20px] mr-2 transition-colors ${
                searchQuery.trim()
                  ? "text-primary"
                  : "text-on-surface-variant"
              }`}
            >
              search
            </span>
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              aria-label="ค้นหาสินค้าด้วยชื่อหรือรหัส SKU"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && searchQuery) {
                  e.preventDefault();
                  setSearchQuery("");
                }
              }}
              placeholder="ค้นหาชื่อสินค้า หรือ รหัส SKU แบบเรียลไทม์..."
              className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant text-[13px] focus:outline-none"
            />
            {searchQuery.trim() ? (
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="text-[11px] font-semibold text-primary bg-primary-fixed/65 px-2 py-0.5 rounded-md tabular-nums whitespace-nowrap">
                  พบ {filteredProducts.length}
                </span>
                <button
                  type="button"
                  aria-label="ล้างคำค้นหา"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    close
                  </span>
                </button>
              </div>
            ) : (
              <kbd
                title="กดปุ่ม / เพื่อค้นหาทันที"
                className="hidden sm:inline-flex items-center justify-center h-6 min-w-6 px-1.5 ml-2 rounded-md border border-outline-variant/50 bg-surface-container-lowest text-[11px] font-semibold text-on-surface-variant shrink-0"
              >
                /
              </kbd>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Sort Select */}
            <select
              aria-label="เรียงลำดับสินค้า"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[12px] font-semibold text-on-surface focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="stock_asc">เรียง: สต็อกน้อย → มาก</option>
              <option value="stock_desc">เรียง: สต็อกมาก → น้อย</option>
              <option value="name_asc">เรียง: ชื่อสินค้า ก–ฮ</option>
              <option value="price_asc">เรียง: ราคาขายต่ำ → สูง</option>
              <option value="price_desc">เรียง: ราคาขายสูง → ต่ำ</option>
            </select>

            {/* Grid vs Table Switcher */}
            <div className="inline-flex items-center rounded-xl bg-surface-container p-1 h-11">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`h-9 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === "grid"
                    ? "bg-surface-container-lowest text-primary shadow-xs"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  grid_view
                </span>
                <span>การ์ด</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`h-9 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === "table"
                    ? "bg-surface-container-lowest text-primary shadow-xs"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  table_rows
                </span>
                <span>ตารางคลัง</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stock Status Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setStockFilter("all")}
            className={`shrink-0 h-9 px-3.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
              stockFilter === "all"
                ? "bg-primary text-on-primary shadow-xs"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>ทั้งหมด ({products.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStockFilter("low")}
            className={`shrink-0 h-9 px-3.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
              stockFilter === "low"
                ? "bg-primary text-on-primary shadow-sm ring-2 ring-secondary-container"
                : lowStockItems.length > 0
                  ? "bg-secondary-container text-on-secondary-container border border-secondary/45 hover:bg-secondary hover:text-on-secondary"
                  : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              notification_important
            </span>
            <span>สินค้าที่ต้องสั่งเติม ({lowStockItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStockFilter("normal")}
            className={`shrink-0 h-9 px-3.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
              stockFilter === "normal"
                ? "bg-primary text-on-primary shadow-xs"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>สต็อกปกติ ({normalStockItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStockFilter("out")}
            className={`shrink-0 h-9 px-3.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
              stockFilter === "out"
                ? "bg-error text-on-error shadow-xs"
                : outOfStockItems.length > 0
                  ? "bg-error-container/50 text-error hover:bg-error-container"
                  : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>หมดสต็อก ({outOfStockItems.length})</span>
          </button>
        </div>

        {/* Category Filter Strip + Owner Inline Category Management */}
        <div className="flex flex-col gap-2 pt-2 border-t border-surface-container">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <span className="text-[11px] font-medium text-on-surface-variant shrink-0 mr-1">
              หมวดหมู่กระเป๋า:
            </span>
            {["ทั้งหมด", ...categories].map((cat) => {
              const active = selectedCategory === cat;
              const count =
                cat === "ทั้งหมด"
                  ? products.length
                  : (categoryCounts.get(cat) ?? 0);
              const canDeleteCat =
                role === "owner" && cat !== "ทั้งหมด" && categories.length > 1;
              return (
                <div
                  key={cat}
                  className={`shrink-0 inline-flex items-center rounded-lg transition-all ${
                    active
                      ? "bg-primary text-on-primary shadow-xs"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`py-1.5 text-[11px] font-medium whitespace-nowrap cursor-pointer tabular-nums ${
                      canDeleteCat ? "pl-2.5 pr-1" : "px-2.5"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                  {canDeleteCat && (
                    <button
                      type="button"
                      aria-label={`ลบหมวดหมู่ ${cat}`}
                      title={`ลบหมวดหมู่ ${cat}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteCategory(cat);
                      }}
                      className={`mr-1 w-4 h-4 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                        active
                          ? "hover:bg-white/25 text-on-primary"
                          : "hover:bg-error-container hover:text-error text-on-surface-variant"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        close
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {role === "owner" && (
              <button
                type="button"
                onClick={() => setShowAddCategory((prev) => !prev)}
                className="shrink-0 h-7 px-2.5 rounded-lg border border-dashed border-primary/50 text-primary hover:bg-primary-fixed/40 text-[11px] font-semibold flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[14px]">
                  add
                </span>
                <span>เพิ่มหมวดหมู่</span>
              </button>
            )}
          </div>

          {role === "owner" && showAddCategory && (
            <form
              onSubmit={handleAddCategorySubmit}
              className="flex items-center gap-2 flex-wrap bg-surface-container-low rounded-lg p-2"
            >
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="ชื่อหมวดหมู่กระเป๋าใหม่ เช่น กระเป๋าคาดเอว..."
                className="flex-1 min-w-[200px] h-8 px-2.5 rounded-md bg-surface-container-lowest border border-outline-variant/50 text-[12px] text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!newCategoryName.trim()}
                className="h-8 px-3 rounded-md bg-primary text-on-primary text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              >
                บันทึกหมวดหมู่
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCategory(false);
                  setNewCategoryName("");
                }}
                className="h-8 px-2.5 rounded-md bg-surface-container text-on-surface-variant text-[11px] font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
            </form>
          )}

          {role === "owner" && confirmDeleteCategory && (
            <div className="rounded-lg bg-error-container/40 border border-error/30 px-3 py-2 flex items-center justify-between gap-2 flex-wrap text-[12px]">
              <span className="text-on-surface font-medium">
                ยืนยันลบหมวดหมู่{" "}
                <strong className="text-error">
                  "{confirmDeleteCategory}"
                </strong>{" "}
                ใช่หรือไม่?
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const catToRemove = confirmDeleteCategory;
                    if (selectedCategory === catToRemove) {
                      setSelectedCategory("ทั้งหมด");
                    }
                    onDeleteCategory(catToRemove);
                    setConfirmDeleteCategory(null);
                  }}
                  className="h-7 px-2.5 rounded-md bg-error text-on-error text-[11px] font-semibold cursor-pointer"
                >
                  ยืนยันลบหมวดหมู่
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteCategory(null)}
                  className="h-7 px-2.5 rounded-md bg-surface-container-lowest text-on-surface-variant text-[11px] font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Highlight Summary Banner when 'สินค้าที่ต้องสั่งเติม' Filter is Active */}
      {stockFilter === "low" && (
        <div className="rounded-xl bg-tertiary-fixed/80 border border-secondary/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
              warning
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-on-tertiary-fixed">
                กำลังแสดงเฉพาะสินค้าที่ต้องสั่งเติม ({filteredProducts.length}{" "}
                รายการ)
              </p>
              <p className="text-[11px] text-on-tertiary-fixed-variant tabular-nums">
                สินค้าทุกชิ้นในรายการนี้มีสต็อกต่ำกว่าเกณฑ์ (lowThreshold) —
                ขาดจากเกณฑ์รวม +
                {filteredProducts
                  .reduce(
                    (sum, p) => sum + Math.max(0, p.lowThreshold - p.stock),
                    0
                  )
                  .toLocaleString()}{" "}
                ชิ้น
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setStockFilter("all")}
              className="h-8 px-3 rounded-lg bg-surface-container-lowest text-on-tertiary-fixed border border-secondary/35 hover:bg-surface-container-low text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            >
              แสดงสินค้าทั้งหมด
            </button>
          </div>
        </div>
      )}

      {/* Results Count Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[12px] text-on-surface-variant tabular-nums">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            แสดง {filteredProducts.length} จาก {products.length} รายการ
            {selectedCategory !== "ทั้งหมด"
              ? ` · หมวด: ${selectedCategory}`
              : ""}
            {searchQuery.trim() ? ` · ค้นหา: "${searchQuery.trim()}"` : ""}
          </span>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              ล้างคำค้นหา
            </button>
          )}
        </div>
        <span>
          {role === "owner"
            ? "แตะที่รายการสินค้าเพื่อแก้ไขสต็อกและราคา"
            : "แตะที่สินค้าเพื่อแก้ไขข้อมูลหรือส่งคำขอปรับสต็อก"}
        </span>
      </div>

      {/* Empty State OR Product Grid / Warehouse Table */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 bg-surface-container-lowest border border-outline-variant/40 rounded-xl">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[28px]">
              inventory
            </span>
          </div>
          <p className="text-[16px] font-semibold text-on-surface">
            ไม่พบสินค้าที่ตรงกับตัวกรอง
          </p>
          <p className="text-[13px] text-on-surface-variant">
            ลองล้างคำค้นหา เปลี่ยนหมวดหมู่ หรือเพิ่มสินค้าใหม่เข้าคลัง
          </p>
          <div className="flex items-center gap-2 mt-2">
            {(searchQuery ||
              stockFilter !== "all" ||
              selectedCategory !== "ทั้งหมด") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStockFilter("all");
                  setSelectedCategory("ทั้งหมด");
                }}
                className="h-9 px-3.5 rounded-lg bg-surface-container text-on-surface text-[12px] font-semibold cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-[12px] font-semibold cursor-pointer"
            >
              + เพิ่มสินค้าใหม่
            </button>
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* High-Density Warehouse Table View */
        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[740px]">
              <thead>
                <tr className="border-b border-outline-variant/35 bg-surface-container-low/70 text-[11px] font-semibold text-on-surface-variant">
                  <th className="py-2.5 px-4">สินค้า / รหัส SKU</th>
                  <th className="py-2.5 px-3">หมวดหมู่</th>
                  <th className="py-2.5 px-3 text-right">คงเหลือ / ขั้นต่ำ</th>
                  {role === "owner" && (
                    <th className="py-2.5 px-3 text-right">ต้นทุน/ชิ้น</th>
                  )}
                  <th className="py-2.5 px-3 text-right">ราคาขาย</th>
                  <th className="py-2.5 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-[13px]">
                {filteredProducts.map((product) => {
                  const isLow = product.stock < product.lowThreshold;
                  const isOut = product.stock <= 0;
                  const isConfirmingDel =
                    confirmDeleteProductId === product.id;

                  return (
                    <tr
                      key={product.id}
                      onClick={() => onSelectProduct(product)}
                      className={`transition-colors cursor-pointer ${
                        isLow
                          ? "bg-tertiary-fixed/25 hover:bg-tertiary-fixed/45"
                          : "hover:bg-surface-container-low/60"
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ResilientImage
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover bg-surface-container shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-on-surface truncate max-w-[240px]">
                              {renderHighlightedText(product.name, searchQuery)}
                            </p>
                            <p className="text-[11px] text-on-surface-variant tabular-nums">
                              {renderHighlightedText(product.sku, searchQuery)}
                              {product.colors && product.colors.length > 0
                                ? ` · ${product.colors.length} สี`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[12px] text-on-surface-variant whitespace-nowrap">
                        {product.category}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            isOut
                              ? "text-error"
                              : isLow
                                ? "text-primary"
                                : "text-secondary"
                          }`}
                        >
                          {product.stock}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          {" "}
                          / {product.lowThreshold} ชิ้น
                        </span>
                        {isLow && (
                          <span className="block text-[10px] font-semibold text-error">
                            {isOut
                              ? "หมดสต็อก"
                              : `ขาด +${product.lowThreshold - product.stock}`}
                          </span>
                        )}
                      </td>
                      {role === "owner" && (
                        <td className="py-2.5 px-3 text-right tabular-nums text-[12px] text-on-surface-variant whitespace-nowrap">
                          ฿{product.landedCostThb.toFixed(2)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-primary whitespace-nowrap">
                        ฿{product.sellPriceThb.toLocaleString()}
                      </td>
                      <td
                        className="py-2.5 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {role === "owner" && isConfirmingDel ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteProduct(product.id);
                                setConfirmDeleteProductId(null);
                              }}
                              className="h-7 px-2 rounded-md bg-error text-on-error text-[11px] font-semibold cursor-pointer"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProductId(null)}
                              className="h-7 px-2 rounded-md bg-surface-container text-on-surface-variant text-[11px] font-medium cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectProduct(product)}
                              className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-on-surface text-[11px] font-semibold cursor-pointer"
                            >
                              {role === "owner" ? "ปรับสต็อก" : "ขอปรับ"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQuickCreateOrderForProduct(product)
                              }
                              className="h-8 px-2.5 rounded-lg bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary text-[11px] font-semibold cursor-pointer"
                            >
                              สั่งซื้อ
                            </button>
                            {role === "owner" && (
                              <button
                                type="button"
                                aria-label={`ลบสินค้า ${product.name}`}
                                onClick={() =>
                                  setConfirmDeleteProductId(product.id)
                                }
                                className="w-8 h-8 rounded-lg bg-error-container/55 hover:bg-error text-error hover:text-on-error inline-flex items-center justify-center transition-colors cursor-pointer"
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
        </div>
      ) : (
        /* Product Cards Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {filteredProducts.map((product) => {
            const isLow = product.stock < product.lowThreshold;
            const isOut = product.stock <= 0;
            const shortfall = Math.max(0, product.lowThreshold - product.stock);
            const stockPct =
              product.lowThreshold > 0
                ? Math.min(
                    100,
                    Math.round((product.stock / product.lowThreshold) * 100)
                  )
                : 100;

            return (
              <article
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className={`bg-surface-container-lowest rounded-xl overflow-hidden flex flex-col transition-all cursor-pointer ${
                  isLow
                    ? "border-2 border-primary/70 shadow-sm hover:shadow-md"
                    : "border border-outline-variant/40 hover:shadow-sm"
                }`}
              >
                {/* Prominent Reorder Banner for Items Below lowThreshold */}
                {isLow && (
                  <div className="px-4 py-2 bg-tertiary-fixed/90 border-b border-secondary/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`material-symbols-outlined text-[16px] shrink-0 ${
                          isOut ? "text-error" : "text-primary"
                        }`}
                      >
                        {isOut ? "error" : "notification_important"}
                      </span>
                      <span
                        className={`text-[12px] font-bold truncate ${
                          isOut ? "text-error" : "text-on-tertiary-fixed"
                        }`}
                      >
                        {isOut
                          ? "หมดสต็อก — ต้องสั่งเติมด่วน"
                          : "สินค้าที่ต้องสั่งเติม (ต่ำกว่าเกณฑ์)"}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-primary tabular-nums whitespace-nowrap shrink-0">
                      ขาดอีก +{shortfall} ชิ้น
                    </span>
                  </div>
                )}

                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start gap-3">
                    <ResilientImage
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-16 h-16 rounded-lg object-cover bg-surface-container shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-semibold text-on-surface line-clamp-2">
                        {renderHighlightedText(product.name, searchQuery)}
                      </h3>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-on-surface-variant tabular-nums">
                        <span>
                          {renderHighlightedText(product.sku, searchQuery)}
                        </span>
                        <span>·</span>
                        <span>{product.category}</span>
                        <span>·</span>
                        <span
                          className={`text-[12px] font-bold ${
                            isOut
                              ? "text-error"
                              : isLow
                                ? "text-primary"
                                : "text-secondary"
                          }`}
                        >
                          คงเหลือ {product.stock} ชิ้น
                        </span>
                        <span>·</span>
                        <span>ขั้นต่ำ {product.lowThreshold}</span>
                      </div>

                      {isLow && (
                        <div className="w-full h-1.5 rounded-full bg-surface-container mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOut ? "bg-error" : "bg-primary"
                            }`}
                            style={{
                              width: `${isOut ? 4 : Math.max(8, stockPct)}%`,
                            }}
                          />
                        </div>
                      )}

                      {product.colors && product.colors.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-on-surface-variant">
                          {product.colors.map((color) => {
                            const colorOut =
                              typeof color.stock === "number" &&
                              color.stock <= 0;
                            return (
                              <span
                                key={color.name}
                                className={`inline-flex items-center gap-1 tabular-nums ${
                                  colorOut ? "text-error line-through" : ""
                                }`}
                              >
                                {color.imageUrl ? (
                                  <img
                                    src={color.imageUrl}
                                    alt={color.name}
                                    className="w-3.5 h-3.5 rounded-full object-cover border border-black/10 shrink-0"
                                  />
                                ) : (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                                    style={{ backgroundColor: color.hex }}
                                  />
                                )}
                                <span>
                                  {color.name}
                                  {typeof color.stock === "number"
                                    ? ` (${color.stock})`
                                    : ""}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-surface-container-low rounded-lg p-2.5 flex items-center justify-between gap-3">
                    {role === "owner" ? (
                      <div className="min-w-0">
                        <p className="text-[11px] text-on-surface-variant">
                          ต้นทุนต่อชิ้น
                        </p>
                        <p className="text-[13px] text-on-surface font-semibold tabular-nums">
                          ฿{product.landedCostThb.toFixed(2)}/ชิ้น
                          {product.cnyUnitPrice !== undefined && (
                            <span className="font-normal text-on-surface-variant ml-1">
                              (¥{product.cnyUnitPrice} + ค่าส่ง ฿
                              {product.freightPerUnitThb ?? 0})
                            </span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-[11px] text-on-surface-variant">
                          อัปเดตล่าสุด
                        </p>
                        <p className="text-[13px] text-on-surface font-medium truncate">
                          {product.updatedAt}
                        </p>
                      </div>
                    )}
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-on-surface-variant">
                        ราคาขาย
                      </p>
                      <p className="text-[16px] font-semibold text-primary tabular-nums">
                        ฿{product.sellPriceThb.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Quick Shortcut Buttons: Adjust Stock / Create Order / Owner Delete */}
                  <div className="flex flex-col gap-2 pt-1 border-t border-surface-container">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(product);
                        }}
                        className={`flex-1 h-10 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                          isLow
                            ? "bg-primary text-on-primary hover:bg-primary-dim shadow-xs"
                            : "bg-surface-container-low text-on-surface hover:bg-surface-container border border-outline-variant/40"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {role === "owner" ? "tune" : "send"}
                        </span>
                        <span>
                          {role === "owner" ? "ปรับจำนวนสินค้า" : "ขอปรับจำนวน"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickCreateOrderForProduct(product);
                        }}
                        className="flex-1 h-10 px-3 rounded-lg bg-secondary-container text-on-secondary-container border border-secondary/35 hover:bg-secondary hover:text-on-secondary text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          add_shopping_cart
                        </span>
                        <span>สร้างคำสั่งซื้อ</span>
                      </button>

                      {role === "owner" && (
                        <button
                          type="button"
                          aria-label={`ลบสินค้า ${product.name}`}
                          title="ลบสินค้านี้"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteProductId(
                              confirmDeleteProductId === product.id
                                ? null
                                : product.id
                            );
                          }}
                          className="w-10 h-10 rounded-lg bg-error-container/55 hover:bg-error text-error hover:text-on-error flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            delete
                          </span>
                        </button>
                      )}
                    </div>

                    {role === "owner" &&
                      confirmDeleteProductId === product.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-error-container/45 border border-error/30 px-3 py-2 flex items-center justify-between gap-2 text-[12px]"
                        >
                          <span className="font-semibold text-error">
                            ยืนยันลบ "{product.name}"?
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteProduct(product.id);
                                setConfirmDeleteProductId(null);
                              }}
                              className="h-7 px-2.5 rounded-md bg-error text-on-error text-[11px] font-semibold cursor-pointer"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProductId(null)}
                              className="h-7 px-2 rounded-md bg-surface-container-lowest text-on-surface-variant text-[11px] font-medium cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
