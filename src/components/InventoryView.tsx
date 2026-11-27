import { useRef, useState } from "react";
import { Order, OrderStatus, ProductItem, RoleMode } from "../types";
import { DashboardOverviewWidgets } from "./DashboardOverviewWidgets";
import { ResilientImage } from "./ResilientImage";

interface InventoryViewProps {
  role: RoleMode;
  products: ProductItem[];
  orders: Order[];
  categories: string[];
  lastSyncedLabel: string;
  onSyncNow: () => void;
  onQuickCreateOrder: () => void;
  onQuickCreateOrderForProduct: (product: ProductItem) => void;
  onNavigateOrdersWithTab: (tab: OrderStatus) => void;
  onConfirmPack: (orderId: string) => void;
  onMarkReadyToShip: (orderId: string) => void;
  onNavigateScanner: () => void;
  onOpenAddProduct: () => void;
  onSelectProduct: (product: ProductItem) => void;
}

export function InventoryView({
  role,
  products,
  orders,
  categories,
  lastSyncedLabel,
  onSyncNow,
  onQuickCreateOrder,
  onQuickCreateOrderForProduct,
  onNavigateOrdersWithTab,
  onConfirmPack,
  onMarkReadyToShip,
  onNavigateScanner,
  onOpenAddProduct,
  onSelectProduct,
}: InventoryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("ทั้งหมด");
  const [syncing, setSyncing] = useState(false);
  const inventoryCatalogRef = useRef<HTMLDivElement>(null);

  const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStockItems = products
    .filter((p) => p.stock < p.lowThreshold)
    .sort((a, b) => {
      const ratioA = a.lowThreshold > 0 ? a.stock / a.lowThreshold : 0;
      const ratioB = b.lowThreshold > 0 ? b.stock / b.lowThreshold : 0;
      return ratioA - ratioB;
    });

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      Boolean(p.colors?.some((c) => c.name.toLowerCase().includes(q)));

    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && p.stock < p.lowThreshold);

    const matchesCategory =
      selectedCategory === "ทั้งหมด" || p.category === selectedCategory;

    return matchesSearch && matchesStock && matchesCategory;
  });

  const handleSyncClick = () => {
    setSyncing(true);
    onSyncNow();
    setTimeout(() => setSyncing(false), 600);
  };

  const handleFilterLowStockInInventory = () => {
    setStockFilter("low");
    setSelectedCategory("ทั้งหมด");
    inventoryCatalogRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="flex flex-col w-full gap-5 pb-24">
      {/* Top Dashboard Quick Actions & Store Snapshot Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-4 flex items-stretch">
          <button
            type="button"
            onClick={onQuickCreateOrder}
            className="w-full h-12 px-4 rounded-xl bg-primary text-on-primary shadow-sm flex items-center justify-center gap-1.5 font-semibold text-[14px] transition-transform active:scale-95 hover:bg-primary-dim cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[20px]">
              add_shopping_cart
            </span>
            <span>+ สร้างออเดอร์ใหม่</span>
          </button>
        </div>

        <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <p className="text-[11px] text-on-surface-variant">
                สต็อกรวมทั้งร้าน
              </p>
              <p className="text-[15px] font-bold text-on-surface tabular-nums">
                {totalUnits.toLocaleString()} ชิ้น · {products.length} รายการ
              </p>
            </div>
            <div className="h-7 w-px bg-surface-container hidden sm:block" />
            <div className="min-w-0 hidden sm:block">
              <p className="text-[11px] text-on-surface-variant">
                บันทึกข้อมูลอัตโนมัติ
              </p>
              <p className="text-[12px] font-semibold text-primary tabular-nums truncate">
                ล่าสุด {lastSyncedLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncClick}
            className="shrink-0 h-9 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                syncing ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
            <span>บันทึกทันที</span>
          </button>
        </div>
      </div>

      {/* Main Dashboard Interactive Widgets: Order Status Summary + Stock Alerts */}
      <DashboardOverviewWidgets
        role={role}
        orders={orders}
        products={products}
        onNavigateOrdersWithTab={onNavigateOrdersWithTab}
        onSelectProductForEdit={onSelectProduct}
        onQuickCreateOrderForProduct={onQuickCreateOrderForProduct}
        onConfirmPack={onConfirmPack}
        onMarkReadyToShip={onMarkReadyToShip}
        onNavigateScanner={onNavigateScanner}
        onQuickCreateOrder={onQuickCreateOrder}
        onFilterLowStockInInventory={handleFilterLowStockInInventory}
      />

      {/* Search & Filters for Full Inventory */}
      <div
        ref={inventoryCatalogRef}
        className="flex flex-col gap-2.5 pt-2 border-t border-outline-variant/35 scroll-mt-20"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-bold text-on-surface tracking-tight">
              คลังสินค้าทั้งหมด
            </h2>
            <p className="text-[12px] text-on-surface-variant tabular-nums">
              แสดง {filteredProducts.length} จาก {products.length} รายการ
              {lowStockItems.length > 0
                ? ` · ใกล้หมด ${lowStockItems.length} รายการ`
                : ""}
            </p>
          </div>
        </div>

        <div className="relative flex items-center w-full bg-surface-container-lowest rounded-xl shadow-sm px-4 h-12">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px] mr-2">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า, SKU..."
            className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant text-[14px] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="ล้างคำค้นหา"
              onClick={() => setSearchQuery("")}
              className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          )}
        </div>

        {/* Stock Filter Controls */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setStockFilter("all")}
            className={`shrink-0 h-10 px-4 rounded-xl text-[12px] font-semibold transition-all active:scale-95 flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
              stockFilter === "all"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/50 hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">
              inventory_2
            </span>
            <span>ทั้งหมด ({products.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStockFilter("low")}
            className={`shrink-0 h-10 px-4 rounded-xl text-[12px] font-bold transition-all active:scale-95 flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums ${
              stockFilter === "low"
                ? "bg-primary text-on-primary shadow-md ring-2 ring-secondary-container"
                : lowStockItems.length > 0
                  ? "bg-secondary-container text-on-secondary-container border border-secondary/45 hover:bg-secondary hover:text-on-secondary shadow-xs"
                  : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/50 hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">
              notification_important
            </span>
            <span>สินค้าที่ต้องสั่งเติม ({lowStockItems.length})</span>
          </button>
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
                  กำลังแสดงเฉพาะสินค้าที่ต้องสั่งเติม ({filteredProducts.length} รายการ)
                </p>
                <p className="text-[11px] text-on-tertiary-fixed-variant tabular-nums">
                  สินค้าทุกชิ้นในรายการนี้มีสต็อกต่ำกว่าจุดแจ้งเตือน (lowThreshold) — ขาดจากเกณฑ์รวม{" "}
                  +
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
            <button
              type="button"
              onClick={() => setStockFilter("all")}
              className="h-8 px-3 rounded-lg bg-surface-container-lowest text-on-tertiary-fixed border border-secondary/35 hover:bg-surface-container-low text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              แสดงสินค้าทั้งหมด
            </button>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <span className="text-[11px] text-on-surface-variant shrink-0 mr-1">
            หมวดหมู่:
          </span>
          {["ทั้งหมด", ...categories].map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Manage Inventory Bar */}
      <div className="w-full flex flex-col gap-2 bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/30 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-primary">
              verified_user
            </span>
            <span className="text-[12px] text-on-surface font-semibold">
              จัดการคลังสินค้า
            </span>
            <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-[11px] font-medium">
              พนักงาน &amp; เจ้าของร้าน
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
            <span
              className={`material-symbols-outlined text-[13px] ${
                role === "owner" ? "text-secondary" : "text-error"
              }`}
            >
              {role === "owner" ? "lock_open" : "lock"}
            </span>
            <span>
              {role === "owner"
                ? "เจ้าของร้าน: แตะที่สินค้าเพื่อแก้ไขสต็อก"
                : "ไม่อนุญาตให้พนักงานแก้สต็อกตรง (ขออนุมัติได้)"}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAddProduct}
            className="flex-1 h-10 px-3 rounded-lg bg-primary text-on-primary text-[12px] font-medium flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>เพิ่มสินค้าใหม่</span>
          </button>
        </div>

        <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-2.5 py-1.5 border border-outline-variant/20">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[15px] text-primary shrink-0">
              save_as
            </span>
            <span className="text-[11px] text-on-surface-variant truncate">
              บันทึกข้อมูลลงเครื่องอัตโนมัติเมื่อเพิ่มสินค้า/แก้ไข
            </span>
          </div>
          <span className="text-[11px] text-primary shrink-0 flex items-center gap-0.5 font-medium">
            <span className="material-symbols-outlined text-[13px]">
              done_all
            </span>
            <span>บันทึกตลอดเวลา</span>
          </span>
        </div>
      </div>

      {/* Product Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 bg-surface-container-lowest rounded-xl shadow-sm">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[28px]">
              inventory
            </span>
          </div>
          <p className="text-[16px] font-semibold text-on-surface">
            ไม่พบสินค้าที่ค้นหา
          </p>
          <p className="text-[13px] text-on-surface-variant">
            ลองเปลี่ยนคำค้นหาหรือเลือกตัวกรองอื่น
          </p>
        </div>
      ) : (
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
                    ? "border-2 border-primary/70 shadow-md hover:shadow-lg"
                    : "border border-outline-variant/40 shadow-sm hover:shadow-md"
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
                        {product.name}
                      </h3>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-on-surface-variant tabular-nums">
                        <span>{product.sku}</span>
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
                        <span>ขั้นต่ำ {product.lowThreshold} ชิ้น</span>
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
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {product.colors.map((color) => {
                            const colorOut =
                              typeof color.stock === "number" && color.stock <= 0;
                            return (
                              <span
                                key={color.name}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                                  colorOut
                                    ? "bg-error-container/50 border-error/30 text-error line-through"
                                    : "bg-surface-container-low border-outline-variant/30 text-on-surface"
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
                                <span className="tabular-nums">
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
                          หมวดหมู่สินค้า
                        </p>
                        <p className="text-[13px] text-on-surface font-medium truncate">
                          {product.category}
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

                  {/* Quick Shortcut Buttons: Adjust Stock / Create Order */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-surface-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(product);
                      }}
                      className={`h-10 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
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
                      className="h-10 px-3 rounded-lg bg-secondary-container text-on-secondary-container border border-secondary/35 hover:bg-secondary hover:text-on-secondary text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        add_shopping_cart
                      </span>
                      <span>สร้างคำสั่งซื้อ</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenAddProduct}
          className="h-11 px-3 rounded-full bg-surface-container-lowest text-primary border border-outline-variant shadow-lg flex items-center gap-1 text-[12px] font-medium transition-transform active:scale-95 hover:bg-surface-container-low cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ สินค้าใหม่</span>
        </button>

        {role === "owner" && (
          <button
            type="button"
            onClick={onNavigateScanner}
            className="h-11 px-4 rounded-full bg-primary text-on-primary shadow-xl flex items-center gap-1.5 text-[12px] font-semibold transition-transform active:scale-95 hover:bg-primary-dim cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              document_scanner
            </span>
            <span>สแกนบิลสต็อก (AI)</span>
          </button>
        )}
      </div>
    </div>
  );
}
