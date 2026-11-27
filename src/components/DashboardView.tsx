import { useEffect, useState } from "react";
import {
  LiveActivityEvent,
  LiveExchangeRate,
  Order,
  OrderStatus,
  ProductItem,
  RoleMode,
} from "../types";
import { LiveConnectionStatus } from "../utils/liveSync";
import { DashboardOverviewWidgets } from "./DashboardOverviewWidgets";
import { ResilientImage } from "./ResilientImage";

interface DashboardViewProps {
  role: RoleMode;
  products: ProductItem[];
  orders: Order[];
  categories: string[];
  ownerLineId: string;
  lastSyncedLabel: string;
  liveStatus: LiveConnectionStatus;
  cloudStatus: "connected" | "connecting" | "local";
  onlineDevicesCount: number;
  liveLatencyMs: number | null;
  liveEvents: LiveActivityEvent[];
  liveCnyRate: LiveExchangeRate | null;
  isRefreshingRate: boolean;
  onRefreshRate: () => void;
  onOpenMultiDevice: () => void;
  onSyncNow: () => void;
  onQuickCreateOrder: () => void;
  onQuickCreateOrderForProduct: (product: ProductItem) => void;
  onNavigateInventory: (filter?: "all" | "low") => void;
  onNavigateOrdersWithTab: (tab: OrderStatus) => void;
  onNavigateAccounting: () => void;
  onOpenAddProduct: () => void;
  onSelectProductForEdit: (product: ProductItem) => void;
  onConfirmPack: (orderId: string) => void;
  onMarkReadyToShip: (orderId: string) => void;
  onOpenPaymentQr: (order: Order) => void;
  onNotifyLowStockLine: (items: ProductItem[]) => void;
  onDeleteOrder: (orderId: string) => void;
  onDeleteProduct: (productId: string) => void;
}

function formatRelativeTimeTh(ts: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 15) return "เมื่อสักครู่";
  if (diffSec < 60) return `${diffSec} วิที่แล้ว`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`;
  return new Date(ts).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActivityIcon(cat: LiveActivityEvent["category"]): {
  icon: string;
  boxClass: string;
} {
  switch (cat) {
    case "order":
      return {
        icon: "shopping_bag",
        boxClass: "bg-primary-fixed text-primary",
      };
    case "stock":
      return {
        icon: "inventory_2",
        boxClass: "bg-secondary-container text-on-secondary-container",
      };
    case "accounting":
      return {
        icon: "account_balance_wallet",
        boxClass: "bg-tertiary-fixed text-on-tertiary-fixed",
      };
    case "approval":
      return {
        icon: "verified_user",
        boxClass: "bg-error-container text-error",
      };
    case "cloud":
      return {
        icon: "cloud_done",
        boxClass: "bg-primary-fixed text-primary",
      };
    case "customer":
      return {
        icon: "person",
        boxClass: "bg-surface-container text-on-surface-variant",
      };
    default:
      return {
        icon: "bolt",
        boxClass: "bg-surface-container text-on-surface-variant",
      };
  }
}

export function DashboardView({
  role,
  products,
  orders,
  categories,
  ownerLineId,
  lastSyncedLabel,
  liveStatus,
  cloudStatus,
  onlineDevicesCount,
  liveLatencyMs,
  liveEvents,
  liveCnyRate,
  isRefreshingRate,
  onRefreshRate,
  onOpenMultiDevice,
  onSyncNow,
  onQuickCreateOrder,
  onQuickCreateOrderForProduct,
  onNavigateInventory,
  onNavigateOrdersWithTab,
  onNavigateAccounting,
  onOpenAddProduct,
  onSelectProductForEdit,
  onConfirmPack,
  onMarkReadyToShip,
  onOpenPaymentQr,
  onNotifyLowStockLine,
  onDeleteOrder,
  onDeleteProduct,
}: DashboardViewProps) {
  const [syncing, setSyncing] = useState(false);
  const [cnyInput, setCnyInput] = useState("100");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Update relative timestamps smoothly while viewing real-time feed
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStockItems = products
    .filter((p) => p.stock < p.lowThreshold)
    .sort((a, b) => {
      const ratioA = a.lowThreshold > 0 ? a.stock / a.lowThreshold : 0;
      const ratioB = b.lowThreshold > 0 ? b.stock / b.lowThreshold : 0;
      return ratioA - ratioB;
    });

  // Show priority items (low stock first, then top inventory items) as a quick snapshot
  const previewProducts = [
    ...lowStockItems,
    ...products.filter((p) => p.stock >= p.lowThreshold),
  ].slice(0, 4);

  const handleSyncClick = () => {
    setSyncing(true);
    onSyncNow();
    setTimeout(() => setSyncing(false), 600);
  };

  const parsedCny = Math.max(0, parseFloat(cnyInput) || 0);
  const effectiveRate = liveCnyRate?.rate ?? 4.95;
  const convertedThb = parsedCny * effectiveRate;
  const rateUpdatedTime = liveCnyRate?.updatedAt
    ? new Date(liveCnyRate.updatedAt).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const isRealtimeActive =
    liveStatus === "connected" || cloudStatus === "connected";

  return (
    <div className="flex flex-col w-full gap-5 pb-24">
      {/* Top Dashboard Quick Actions & Real-Time Store Snapshot Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-4 flex items-stretch gap-2">
          <button
            type="button"
            onClick={onQuickCreateOrder}
            className="flex-1 h-12 px-4 rounded-xl bg-primary text-on-primary shadow-sm flex items-center justify-center gap-1.5 font-semibold text-[14px] transition-transform active:scale-95 hover:bg-primary-dim cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[20px]">
              add_shopping_cart
            </span>
            <span>+ สร้างออเดอร์ใหม่</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateInventory("all")}
            className="h-12 px-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-primary hover:bg-surface-container-low shadow-xs flex items-center justify-center gap-1.5 font-semibold text-[13px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[19px]">
              inventory_2
            </span>
            <span>คลังสินค้า</span>
          </button>
        </div>

        <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <p className="text-[11px] text-on-surface-variant">
                สต็อกรวมทั้งร้าน
              </p>
              <p className="text-[15px] font-bold text-on-surface tabular-nums">
                {totalUnits.toLocaleString()} ชิ้น · {products.length} รายการ ·{" "}
                {categories.length} หมวด
              </p>
            </div>
            <div className="h-7 w-px bg-surface-container hidden sm:block" />
            <button
              type="button"
              onClick={onOpenMultiDevice}
              className="min-w-0 hidden sm:flex flex-col text-left cursor-pointer group"
            >
              <span className="text-[11px] text-on-surface-variant inline-flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRealtimeActive
                      ? "bg-[#16a34a] animate-pulse"
                      : "bg-outline-variant"
                  }`}
                />
                <span>
                  {cloudStatus === "connected"
                    ? "เรียลไทม์ + Google Cloud"
                    : liveStatus === "connected"
                      ? `ซิงก์สดหลายเครื่อง (${onlineDevicesCount} เครื่อง)`
                      : "กำลังเชื่อมต่อเรียลไทม์..."}
                </span>
              </span>
              <span className="text-[12px] font-semibold text-primary group-hover:underline tabular-nums truncate">
                อัปเดต {lastSyncedLabel}
                {liveLatencyMs !== null && liveStatus === "connected"
                  ? ` · ${liveLatencyMs}ms`
                  : ""}
              </span>
            </button>
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
            <span>ซิงก์สดทันที</span>
          </button>
        </div>
      </div>

      {/* Interactive Order Status Summary & Stock Alert Widgets */}
      <DashboardOverviewWidgets
        role={role}
        orders={orders}
        products={products}
        ownerLineId={ownerLineId}
        onNotifyLowStockLine={onNotifyLowStockLine}
        onNavigateOrdersWithTab={onNavigateOrdersWithTab}
        onSelectProductForEdit={onSelectProductForEdit}
        onQuickCreateOrderForProduct={onQuickCreateOrderForProduct}
        onConfirmPack={onConfirmPack}
        onMarkReadyToShip={onMarkReadyToShip}
        onOpenPaymentQr={onOpenPaymentQr}
        onNavigateAccounting={onNavigateAccounting}
        onQuickCreateOrder={onQuickCreateOrder}
        onFilterLowStockInInventory={() => onNavigateInventory("low")}
        onDeleteOrder={onDeleteOrder}
        onDeleteProduct={onDeleteProduct}
      />

      {/* Real-Time Data Hub: Live Multi-Device Activity Feed & Live CNY/THB Market Exchange Rate */}
      <section
        aria-label="ข้อมูลเรียลไทม์และอัตราแลกเปลี่ยนสด"
        className="grid grid-cols-1 lg:grid-cols-12 gap-3"
      >
        {/* Live Activity Feed (Real WebSocket & Google Cloud Events) */}
        <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant/45 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isRealtimeActive
                    ? "bg-[#16a34a] animate-pulse"
                    : "bg-outline-variant"
                }`}
              />
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-on-surface tracking-tight truncate">
                  ความเคลื่อนไหวสดทุกเครื่อง (Real-Time)
                </h2>
                <p className="text-[11px] text-on-surface-variant tabular-nums">
                  เชื่อมต่อ {onlineDevicesCount} เครื่อง
                  {cloudStatus === "connected"
                    ? " · ซิงก์ Google Cloud อัตโนมัติ"
                    : " · อัปเดตทันทีผ่าน WebSocket"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenMultiDevice}
              className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">
                devices
              </span>
              <span>จัดการเครื่อง</span>
            </button>
          </div>

          {liveEvents.length === 0 ? (
            <div className="rounded-lg bg-surface-container-low/65 px-4 py-5 text-center flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[22px] text-primary">
                sensors
              </span>
              <p className="text-[13px] font-semibold text-on-surface">
                พร้อมรับข้อมูลเรียลไทม์แล้ว
              </p>
              <p className="text-[11px] text-on-surface-variant">
                เมื่อมีการสร้างออเดอร์ แพ็คของ ปรับสต็อก หรือบันทึกบัญชีจากเครื่องใดก็ตาม รายการจะเด้งขึ้นที่นี่ทันที
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-surface-container max-h-[210px] overflow-y-auto pr-1">
              {liveEvents.slice(0, 8).map((ev) => {
                const meta = getActivityIcon(ev.category);
                return (
                  <div
                    key={ev.id}
                    className="py-2 first:pt-0.5 last:pb-0.5 flex items-center gap-2.5"
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.boxClass}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {meta.icon}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-on-surface truncate">
                        {ev.summary}
                      </p>
                      <p className="text-[10px] text-on-surface-variant truncate">
                        {ev.deviceName}
                        {ev.source === "cloud" ? " · Google Cloud" : " · Live"}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-on-surface-variant tabular-nums whitespace-nowrap shrink-0">
                      {formatRelativeTimeTh(ev.timestamp, nowMs)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Market CNY -> THB Exchange Rate Widget */}
        <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant/45 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  currency_exchange
                </span>
                <h2 className="text-[15px] font-bold text-on-surface tracking-tight">
                  เรทหยวนสดวันนี้ (CNY → THB)
                </h2>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-0.5 tabular-nums">
                {liveCnyRate
                  ? `${liveCnyRate.source}${rateUpdatedTime ? ` · อัปเดต ${rateUpdatedTime}` : ""}`
                  : "กำลังดึงอัตราแลกเปลี่ยนสด..."}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshRate}
              disabled={isRefreshingRate}
              aria-label="รีเฟรชอัตราแลกเปลี่ยนสด"
              className="h-8 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-[15px] ${
                  isRefreshingRate ? "animate-spin" : ""
                }`}
              >
                refresh
              </span>
              <span>อัปเดต</span>
            </button>
          </div>

          <div className="rounded-xl bg-surface-container-low px-3.5 py-2.5 flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold text-on-surface-variant">
              1 หยวน (¥)
            </span>
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-[24px] font-bold text-primary leading-none">
                ฿{effectiveRate.toFixed(2)}
              </span>
              <span className="text-[11px] text-on-surface-variant">บาท</span>
            </div>
          </div>

          {/* Quick Live Import Cost Converter */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-2.5 h-10">
              <span className="text-[12px] font-bold text-on-surface-variant">
                ¥
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={cnyInput}
                onChange={(e) => setCnyInput(e.target.value)}
                aria-label="จำนวนเงินหยวนที่ต้องการคำนวณ"
                className="w-full bg-transparent text-[13px] font-semibold text-on-surface tabular-nums focus:outline-none"
                placeholder="100"
              />
            </div>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
              arrow_forward
            </span>
            <div className="flex-1 rounded-lg bg-primary-fixed/50 px-3 h-10 flex items-center justify-between gap-1 tabular-nums">
              <span className="text-[11px] font-medium text-on-primary-fixed">
                ประมาณ
              </span>
              <span className="text-[13px] font-bold text-primary truncate">
                ฿{convertedThb.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Warehouse Preview Section with Direct Link to Dedicated Inventory Page */}
      <section className="flex flex-col gap-3 pt-2 border-t border-outline-variant/35">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-[16px] font-bold text-on-surface tracking-tight">
              ภาพรวมสินค้าในคลังล่าสุด
            </h2>
            <p className="text-[12px] text-on-surface-variant tabular-nums">
              ทั้งหมด {products.length} รายการ ({totalUnits.toLocaleString()}{" "}
              ชิ้น)
              {lowStockItems.length > 0
                ? ` · ต้องสั่งเติม ${lowStockItems.length} รายการ`
                : " · สต็อกทุกรายการอยู่ในเกณฑ์ปกติ"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:bg-surface-container-low text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">
                add
              </span>
              <span>เพิ่มสินค้า</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateInventory("all")}
              className="h-9 px-3.5 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>ไปหน้าคลังสินค้าทั้งหมด</span>
              <span className="material-symbols-outlined text-[16px]">
                arrow_forward
              </span>
            </button>
          </div>
        </div>

        {previewProducts.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-8 text-center flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant">
              inventory_2
            </span>
            <p className="text-[14px] font-semibold text-on-surface">
              ยังไม่มีสินค้าในคลัง
            </p>
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="mt-1 h-9 px-4 rounded-lg bg-primary text-on-primary text-[12px] font-semibold cursor-pointer"
            >
              + เพิ่มสินค้าชิ้นแรก
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {previewProducts.map((product) => {
              const isLow = product.stock < product.lowThreshold;
              const isOut = product.stock <= 0;
              return (
                <article
                  key={product.id}
                  onClick={() => onSelectProductForEdit(product)}
                  className={`bg-surface-container-lowest rounded-xl p-3.5 flex items-center gap-3 transition-all cursor-pointer ${
                    isLow
                      ? "border border-primary/60 hover:shadow-md"
                      : "border border-outline-variant/40 hover:shadow-sm"
                  }`}
                >
                  <ResilientImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-14 h-14 rounded-lg object-cover bg-surface-container shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-on-surface truncate">
                      {product.name}
                    </p>
                    <p className="text-[11px] text-on-surface-variant tabular-nums truncate mt-0.5">
                      {product.sku} · {product.category}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[12px] tabular-nums">
                      <span
                        className={`font-bold ${
                          isOut
                            ? "text-error"
                            : isLow
                              ? "text-primary"
                              : "text-secondary"
                        }`}
                      >
                        คงเหลือ {product.stock} ชิ้น
                      </span>
                      <span className="text-on-surface-variant text-[11px]">
                        / ขั้นต่ำ {product.lowThreshold}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-bold text-primary tabular-nums">
                      ฿{product.sellPriceThb.toLocaleString()}
                    </p>
                    <span className="text-[11px] text-on-surface-variant">
                      แตะแก้ไข
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Floating Quick Action Buttons */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNavigateInventory("all")}
          className="h-11 px-3.5 rounded-full bg-surface-container-lowest text-primary border border-outline-variant shadow-lg flex items-center gap-1 text-[12px] font-semibold transition-transform active:scale-95 hover:bg-surface-container-low cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">
            inventory_2
          </span>
          <span>คลังสินค้า</span>
        </button>

        {role === "owner" && (
          <button
            type="button"
            onClick={onNavigateAccounting}
            className="h-11 px-4 rounded-full bg-primary text-on-primary shadow-xl flex items-center gap-1.5 text-[12px] font-semibold transition-transform active:scale-95 hover:bg-primary-dim cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              account_balance_wallet
            </span>
            <span>ระบบบัญชี</span>
          </button>
        )}
      </div>
    </div>
  );
}
