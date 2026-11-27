import { useMemo, useState } from "react";
import { Order, OrderStatus, ProductItem, RoleMode } from "../types";
import { ResilientImage } from "./ResilientImage";

interface DashboardOverviewWidgetsProps {
  role: RoleMode;
  orders: Order[];
  products: ProductItem[];
  ownerLineId: string;
  onNotifyLowStockLine: (items: ProductItem[]) => void;
  onNavigateOrdersWithTab: (tab: OrderStatus) => void;
  onSelectProductForEdit: (product: ProductItem) => void;
  onQuickCreateOrderForProduct: (product: ProductItem) => void;
  onConfirmPack: (orderId: string) => void;
  onMarkReadyToShip: (orderId: string) => void;
  onOpenPaymentQr: (order: Order) => void;
  onNavigateAccounting: () => void;
  onQuickCreateOrder: () => void;
  onFilterLowStockInInventory: () => void;
  onDeleteOrder: (orderId: string) => void;
  onDeleteProduct: (productId: string) => void;
}

type StockAlertFilter = "all" | "critical" | "color_out";

interface OrderStatusMeta {
  id: OrderStatus;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  iconBoxClass: string;
  countClass: string;
  actionHint: string;
}

const ORDER_STATUS_CONFIG: OrderStatusMeta[] = [
  {
    id: "pending",
    label: "ออเดอร์ใหม่",
    shortLabel: "รอแพ็ค",
    description: "รอตรวจสอบและแพ็คสินค้า",
    icon: "fiber_new",
    iconBoxClass: "bg-error-container text-error",
    countClass: "text-error",
    actionHint: "กดดูและแพ็คสินค้า",
  },
  {
    id: "packing",
    label: "กำลังแพ็ค",
    shortLabel: "กำลังแพ็ค",
    description: "ตัดสต็อกแล้ว รอเตรียมส่ง",
    icon: "package_2",
    iconBoxClass: "bg-tertiary-fixed text-on-tertiary-fixed",
    countClass: "text-on-tertiary-container",
    actionHint: "กดดูและเปลี่ยนเป็นรอจัดส่ง",
  },
  {
    id: "ready_to_ship",
    label: "รอจัดส่ง",
    shortLabel: "รอจัดส่ง",
    description: "แพ็คเสร็จพร้อมส่งมอบ",
    icon: "outbox",
    iconBoxClass: "bg-primary-fixed text-primary",
    countClass: "text-primary",
    actionHint: "กดดูรายการรอจัดส่ง",
  },
  {
    id: "shipped",
    label: "ส่งแล้ว",
    shortLabel: "ส่งแล้ว",
    description: "ส่งมอบและบันทึกเรียบร้อย",
    icon: "local_shipping",
    iconBoxClass: "bg-secondary-container text-on-secondary-container",
    countClass: "text-secondary",
    actionHint: "กดดูประวัติจัดส่ง",
  },
];

function getShippingLabel(order: Order): string {
  if (order.shippingOption === "store_delivery") return "ส่งถึงหน้าร้าน";
  if (order.shippingOption === "store_pickup") return "ลูกค้ามารับหน้าร้าน";
  if (order.carrierName || order.courier) {
    return `${order.carrierName || order.courier}${
      order.trackingCode ? ` · ${order.trackingCode}` : ""
    }`;
  }
  return order.orderType === "walk_in" ? "Walk-in หน้าร้าน" : "ส่งของ";
}

function getStockSeverity(product: ProductItem): {
  level: "out" | "critical" | "low" | "color_out";
  label: string;
  icon: string;
  textClass: string;
  barClass: string;
} {
  if (product.stock <= 0) {
    return {
      level: "out",
      label: "หมดสต็อก",
      icon: "error",
      textClass: "text-error",
      barClass: "bg-error",
    };
  }
  const ratio =
    product.lowThreshold > 0 ? product.stock / product.lowThreshold : 1;
  if (ratio <= 0.4) {
    return {
      level: "critical",
      label: "วิกฤต ต้องสั่งด่วน",
      icon: "notification_important",
      textClass: "text-error",
      barClass: "bg-error",
    };
  }
  if (product.stock < product.lowThreshold) {
    return {
      level: "low",
      label: "ต่ำกว่าเกณฑ์",
      icon: "warning",
      textClass: "text-secondary",
      barClass: "bg-primary",
    };
  }
  return {
    level: "color_out",
    label: "มีบางสีหมด",
    icon: "palette",
    textClass: "text-on-tertiary-fixed-variant",
    barClass: "bg-secondary",
  };
}

export function DashboardOverviewWidgets({
  role,
  orders,
  products,
  ownerLineId,
  onNotifyLowStockLine,
  onNavigateOrdersWithTab,
  onSelectProductForEdit,
  onQuickCreateOrderForProduct,
  onConfirmPack,
  onMarkReadyToShip,
  onOpenPaymentQr,
  onNavigateAccounting,
  onQuickCreateOrder,
  onFilterLowStockInInventory,
  onDeleteOrder,
  onDeleteProduct,
}: DashboardOverviewWidgetsProps) {
  const [selectedOrderStatus, setSelectedOrderStatus] =
    useState<OrderStatus | null>(null);
  const [selectedAlertProductId, setSelectedAlertProductId] = useState<
    string | null
  >(null);
  const [stockAlertFilter, setStockAlertFilter] =
    useState<StockAlertFilter>("all");
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<
    string | null
  >(null);
  const [confirmDeleteAlertProduct, setConfirmDeleteAlertProduct] =
    useState(false);

  // Group orders by status with totals
  const ordersByStatus = useMemo(() => {
    const grouped: Record<
      OrderStatus,
      { list: Order[]; totalThb: number; totalItems: number }
    > = {
      pending: { list: [], totalThb: 0, totalItems: 0 },
      packing: { list: [], totalThb: 0, totalItems: 0 },
      ready_to_ship: { list: [], totalThb: 0, totalItems: 0 },
      shipped: { list: [], totalThb: 0, totalItems: 0 },
    };

    orders.forEach((order) => {
      const bucket = grouped[order.status];
      if (!bucket) return;
      bucket.list.push(order);
      bucket.totalThb += order.totalThb;
      bucket.totalItems += order.items.reduce((s, i) => s + i.quantity, 0);
    });

    return grouped;
  }, [orders]);

  const totalOrdersRevenue = useMemo(
    () => orders.reduce((sum, o) => sum + o.totalThb, 0),
    [orders]
  );

  // Stock alert products: either stock < lowThreshold OR any color variant has stock === 0
  const alertProducts = useMemo(() => {
    return products
      .filter((p) => {
        const isLow = p.stock < p.lowThreshold;
        const hasOutColor = Boolean(
          p.colors?.some((c) => typeof c.stock === "number" && c.stock <= 0)
        );
        return isLow || hasOutColor;
      })
      .sort((a, b) => {
        const aOut = a.stock <= 0 ? 0 : 1;
        const bOut = b.stock <= 0 ? 0 : 1;
        if (aOut !== bOut) return aOut - bOut;
        const ratioA =
          a.lowThreshold > 0 ? a.stock / a.lowThreshold : Number.POSITIVE_INFINITY;
        const ratioB =
          b.lowThreshold > 0 ? b.stock / b.lowThreshold : Number.POSITIVE_INFINITY;
        return ratioA - ratioB;
      });
  }, [products]);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.stock < p.lowThreshold).length,
    [products]
  );

  const criticalCount = useMemo(
    () =>
      alertProducts.filter((p) => {
        const sev = getStockSeverity(p).level;
        return sev === "out" || sev === "critical";
      }).length,
    [alertProducts]
  );

  const colorOutCount = useMemo(
    () =>
      alertProducts.filter((p) =>
        Boolean(
          p.colors?.some((c) => typeof c.stock === "number" && c.stock <= 0)
        )
      ).length,
    [alertProducts]
  );

  const visibleAlertProducts = useMemo(() => {
    if (stockAlertFilter === "critical") {
      return alertProducts.filter((p) => {
        const sev = getStockSeverity(p).level;
        return sev === "out" || sev === "critical";
      });
    }
    if (stockAlertFilter === "color_out") {
      return alertProducts.filter((p) =>
        Boolean(
          p.colors?.some((c) => typeof c.stock === "number" && c.stock <= 0)
        )
      );
    }
    return alertProducts;
  }, [alertProducts, stockAlertFilter]);

  const selectedAlertProduct = useMemo(
    () => products.find((p) => p.id === selectedAlertProductId) ?? null,
    [products, selectedAlertProductId]
  );

  // Active (not-yet-shipped) orders containing the inspected stock alert product
  const activeOrdersForSelectedProduct = useMemo(() => {
    if (!selectedAlertProduct) return [];
    return orders.filter(
      (o) =>
        o.status !== "shipped" &&
        o.items.some(
          (i) =>
            i.productId === selectedAlertProduct.id ||
            i.sku === selectedAlertProduct.sku
        )
    );
  }, [orders, selectedAlertProduct]);

  const activeOrderModalMeta = selectedOrderStatus
    ? ORDER_STATUS_CONFIG.find((c) => c.id === selectedOrderStatus) ?? null
    : null;
  const activeOrderModalBucket = selectedOrderStatus
    ? ordersByStatus[selectedOrderStatus]
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* WIDGET 1: Current Order Status Summary Cards */}
      <section aria-label="สรุปสถานะออเดอร์ปัจจุบัน" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-on-surface tracking-tight">
              สรุปสถานะออเดอร์ปัจจุบัน
            </h2>
            <p className="text-[12px] text-on-surface-variant tabular-nums">
              ทั้งหมด {orders.length.toLocaleString()} ออเดอร์ · ยอดรวม ฿
              {totalOrdersRevenue.toLocaleString()} · แตะที่คาร์ดเพื่อดูรายละเอียดทันที
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateOrdersWithTab("pending")}
            className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-primary hover:bg-surface-container-low text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>จัดการออเดอร์ทั้งหมด</span>
            <span className="material-symbols-outlined text-[16px]">
              arrow_forward
            </span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ORDER_STATUS_CONFIG.map((cfg) => {
            const bucket = ordersByStatus[cfg.id];
            const isSelected = selectedOrderStatus === cfg.id;
            return (
              <button
                key={cfg.id}
                type="button"
                onClick={() => setSelectedOrderStatus(cfg.id)}
                className={`group text-left bg-surface-container-lowest rounded-xl p-4 border transition-all cursor-pointer active:scale-[0.98] flex flex-col justify-between gap-3 focus-visible:outline-2 focus-visible:outline-primary ${
                  isSelected
                    ? "border-primary shadow-md"
                    : "border-outline-variant/45 hover:border-primary/60 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-on-surface truncate">
                      {cfg.label}
                    </p>
                    <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                      {cfg.description}
                    </p>
                  </div>
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.iconBoxClass}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {cfg.icon}
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-surface-container">
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span
                      className={`text-[24px] leading-none font-bold tabular-nums ${cfg.countClass}`}
                    >
                      {bucket.list.length}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      ออเดอร์
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold text-on-surface tabular-nums truncate">
                    ฿{bucket.totalThb.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                  <span className="tabular-nums truncate">
                    {bucket.totalItems.toLocaleString()} ชิ้น
                  </span>
                  <span className="text-primary font-semibold inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0">
                    <span>ดูรายละเอียด</span>
                    <span className="material-symbols-outlined text-[14px]">
                      chevron_right
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* WIDGET 2: Stock Alert Cards */}
      <section aria-label="รายการแจ้งเตือนสต็อก" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-on-surface tracking-tight">
              รายการแจ้งเตือนสต็อก
            </h2>
            <p className="text-[12px] text-on-surface-variant tabular-nums">
              {alertProducts.length > 0
                ? `ต้องตรวจสอบ ${alertProducts.length} รายการ · ต่ำกว่าเกณฑ์ ${lowStockCount} รายการ · วิกฤต ${criticalCount} รายการ`
                : "สต็อกทุกรายการอยู่ในเกณฑ์ปกติ พร้อมขายทุกรายการ"}
            </p>
          </div>

          {alertProducts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div
                role="tablist"
                aria-label="กรองรายการแจ้งเตือนสต็อก"
                className="flex items-center gap-1 p-1 rounded-lg bg-surface-container/80"
              >
                {(
                  [
                    { id: "all", label: `ทั้งหมด (${alertProducts.length})` },
                    { id: "critical", label: `หมด/วิกฤต (${criticalCount})` },
                    { id: "color_out", label: `มีสีหมด (${colorOutCount})` },
                  ] as const
                ).map((tab) => {
                  const active = stockAlertFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStockAlertFilter(tab.id)}
                      className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? "bg-surface-container-lowest text-primary shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => onNotifyLowStockLine(alertProducts)}
                className="h-9 px-3 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-[12px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chat
                </span>
                <span>แจ้งเตือน LINE ({ownerLineId})</span>
              </button>

              <button
                type="button"
                onClick={onFilterLowStockInInventory}
                className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:text-primary text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                กรองดูในคลัง
              </button>
            </div>
          )}
        </div>

        {alertProducts.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">
                  verified
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-on-surface">
                  สต็อกทุกรายการอยู่ในเกณฑ์ปลอดภัย
                </p>
                <p className="text-[12px] text-on-surface-variant tabular-nums">
                  สินค้าทั้ง {products.length} รายการมีจำนวนมากกว่าจุดแจ้งเตือนขั้นต่ำ
                </p>
              </div>
            </div>
            {role === "owner" && (
              <button
                type="button"
                onClick={onNavigateAccounting}
                className="h-10 px-4 rounded-lg bg-primary text-on-primary text-[12px] font-semibold hover:bg-primary-dim transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                เปิดระบบบัญชี
              </button>
            )}
          </div>
        ) : visibleAlertProducts.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/40 flex items-center justify-between gap-3">
            <p className="text-[13px] text-on-surface-variant">
              ไม่พบรายการสินค้าที่ตรงกับตัวกรองนี้
            </p>
            <button
              type="button"
              onClick={() => setStockAlertFilter("all")}
              className="h-9 px-3 rounded-lg bg-primary-fixed text-on-primary-fixed text-[12px] font-semibold cursor-pointer whitespace-nowrap"
            >
              แสดงทั้งหมด
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleAlertProducts.map((item) => {
              const severity = getStockSeverity(item);
              const shortfall = Math.max(0, item.lowThreshold - item.stock);
              const pct =
                item.lowThreshold > 0
                  ? Math.min(100, Math.round((item.stock / item.lowThreshold) * 100))
                  : 100;
              const outColors =
                item.colors?.filter(
                  (c) => typeof c.stock === "number" && c.stock <= 0
                ) ?? [];

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedAlertProductId(item.id)}
                  className="group text-left bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/45 hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99] flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <div className="flex items-start gap-3">
                    <ResilientImage
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-13 h-13 rounded-lg object-cover bg-surface-container shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-on-surface line-clamp-1">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                        {item.sku} · {item.category}
                      </p>
                      <div
                        className={`inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold ${severity.textClass}`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {severity.icon}
                        </span>
                        <span>{severity.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
                      <span className={`font-bold ${severity.textClass}`}>
                        คงเหลือ {item.stock} ชิ้น
                      </span>
                      <span className="text-on-surface-variant text-[11px]">
                        ขั้นต่ำ {item.lowThreshold} ชิ้น
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${severity.barClass}`}
                        style={{
                          width: `${item.stock <= 0 ? 4 : Math.max(8, pct)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-surface-container flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-on-surface-variant truncate tabular-nums">
                      {outColors.length > 0
                        ? `สีหมด: ${outColors.map((c) => c.name).join(", ")}`
                        : shortfall > 0
                          ? `ควรเติมอย่างน้อย +${shortfall} ชิ้น`
                          : `ราคาขาย ฿${item.sellPriceThb.toLocaleString()}`}
                    </span>
                    <span className="text-primary font-semibold inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0">
                      <span>ดูรายละเอียด</span>
                      <span className="material-symbols-outlined text-[14px]">
                        chevron_right
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* INSTANT DETAIL MODAL 1: Order Status Details */}
      {selectedOrderStatus && activeOrderModalMeta && activeOrderModalBucket && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`รายละเอียด${activeOrderModalMeta.label}`}
          className="fixed inset-0 z-50 bg-inverse-surface/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedOrderStatus(null)}
        >
          <div
            className="w-full sm:max-w-2xl max-h-[88vh] bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl shadow-2xl border border-outline-variant/50 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-surface-container flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeOrderModalMeta.iconBoxClass}`}
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {activeOrderModalMeta.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-bold text-on-surface truncate">
                    {activeOrderModalMeta.label} ({activeOrderModalBucket.list.length} ออเดอร์)
                  </h3>
                  <p className="text-[12px] text-on-surface-variant tabular-nums truncate">
                    ยอดรวม ฿{activeOrderModalBucket.totalThb.toLocaleString()} ·{" "}
                    {activeOrderModalBucket.totalItems.toLocaleString()} ชิ้น
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setSelectedOrderStatus(null)}
                className="w-10 h-10 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* Quick Status Switcher inside Modal */}
            <div className="px-5 py-2.5 bg-surface-container-low/70 border-b border-surface-container flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {ORDER_STATUS_CONFIG.map((cfg) => {
                const count = ordersByStatus[cfg.id].list.length;
                const active = selectedOrderStatus === cfg.id;
                return (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => setSelectedOrderStatus(cfg.id)}
                    className={`h-9 px-3 rounded-lg text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      active
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-outline-variant/40"
                    }`}
                  >
                    {cfg.shortLabel} ({count})
                  </button>
                );
              })}
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
              {activeOrderModalBucket.list.length === 0 ? (
                <div className="py-10 text-center flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">
                      inbox
                    </span>
                  </div>
                  <p className="text-[14px] font-semibold text-on-surface">
                    ยังไม่มีออเดอร์ในสถานะ{activeOrderModalMeta.label}
                  </p>
                  <p className="text-[12px] text-on-surface-variant">
                    เมื่อมีการสร้างหรืออัปเดตออเดอร์ รายการจะแสดงที่นี่ทันที
                  </p>
                  {selectedOrderStatus === "pending" && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderStatus(null);
                        onQuickCreateOrder();
                      }}
                      className="mt-2 h-10 px-4 rounded-lg bg-primary text-on-primary text-[12px] font-semibold hover:bg-primary-dim cursor-pointer"
                    >
                      + สร้างออเดอร์ใหม่
                    </button>
                  )}
                </div>
              ) : (
                activeOrderModalBucket.list.map((order) => {
                  const totalPieces = order.items.reduce(
                    (sum, i) => sum + i.quantity,
                    0
                  );
                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border border-outline-variant/45 bg-surface-container-lowest p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-on-surface truncate">
                            {order.customerName}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5 tabular-nums">
                            #{order.id} · {order.createdAt} · {getShippingLabel(order)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[15px] font-bold text-primary tabular-nums">
                            ฿{order.totalThb.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-on-surface-variant tabular-nums">
                            {totalPieces} ชิ้น ({order.items.length} รายการ)
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-surface-container pt-2.5 flex flex-col gap-1.5">
                        {order.items.map((item, idx) => (
                          <div
                            key={`${order.id}-${item.sku}-${item.colorName || idx}`}
                            className="flex items-center justify-between gap-2 text-[12px]"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {item.colorHex && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                                  style={{ backgroundColor: item.colorHex }}
                                />
                              )}
                              <span className="text-on-surface truncate">
                                {item.name}
                                {item.colorName ? ` (${item.colorName})` : ""}
                              </span>
                            </div>
                            <span className="text-on-surface-variant tabular-nums whitespace-nowrap shrink-0">
                              x{item.quantity} · ฿
                              {(item.quantity * item.unitPriceThb).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-surface-container flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenPaymentQr(order)}
                          className="h-9 px-3.5 rounded-lg bg-[#113566] hover:bg-[#0d2a52] text-white text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap mr-auto transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            qr_code_2
                          </span>
                          <span>สร้าง QR ชำระเงิน</span>
                        </button>
                        {order.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => onConfirmPack(order.id)}
                            className="h-9 px-3.5 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              check_circle
                            </span>
                            <span>แพ็คเสร็จ &amp; ตัดสต็อก</span>
                          </button>
                        )}
                        {order.status === "packing" && (
                          <button
                            type="button"
                            onClick={() => onMarkReadyToShip(order.id)}
                            className="h-9 px-3.5 rounded-lg bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              outbox
                            </span>
                            <span>เปลี่ยนเป็นรอจัดส่ง</span>
                          </button>
                        )}
                      </div>

                      {role === "owner" && (
                        <div className="pt-2 border-t border-surface-container flex items-center justify-end gap-2">
                          {confirmDeleteOrderId === order.id ? (
                            <>
                              <span className="text-[11px] font-semibold text-error mr-auto">
                                ยืนยันลบออเดอร์ #{order.id}?
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteOrder(order.id);
                                  setConfirmDeleteOrderId(null);
                                }}
                                className="h-8 px-3 rounded-lg bg-error text-on-error text-[11px] font-semibold cursor-pointer"
                              >
                                ยืนยันลบ
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOrderId(null)}
                                className="h-8 px-2.5 rounded-lg bg-surface-container text-on-surface-variant text-[11px] font-medium cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOrderId(order.id)}
                              className="h-8 px-3 rounded-lg bg-error-container/50 hover:bg-error text-error hover:text-on-error text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                delete
                              </span>
                              <span>ลบออเดอร์</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-surface-container bg-surface-container-low/50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedOrderStatus(null)}
                className="h-10 px-4 rounded-lg text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer whitespace-nowrap"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedOrderStatus;
                  setSelectedOrderStatus(null);
                  onNavigateOrdersWithTab(target);
                }}
                className="h-10 px-4 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <span>เปิดจัดการในหน้าออเดอร์</span>
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSTANT DETAIL MODAL 2: Stock Alert Product Details */}
      {selectedAlertProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`รายละเอียดสต็อก ${selectedAlertProduct.name}`}
          className="fixed inset-0 z-50 bg-inverse-surface/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedAlertProductId(null)}
        >
          {(() => {
            const severity = getStockSeverity(selectedAlertProduct);
            const shortfall = Math.max(
              0,
              selectedAlertProduct.lowThreshold - selectedAlertProduct.stock
            );
            const suggestedReorder = Math.max(
              shortfall,
              selectedAlertProduct.lowThreshold * 2 - selectedAlertProduct.stock,
              5
            );
            const profitPerUnit =
              selectedAlertProduct.sellPriceThb -
              selectedAlertProduct.landedCostThb;

            return (
              <div
                className="w-full sm:max-w-xl max-h-[88vh] bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl shadow-2xl border border-outline-variant/50 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-5 py-4 border-b border-surface-container flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ResilientImage
                      src={selectedAlertProduct.imageUrl}
                      alt={selectedAlertProduct.name}
                      className="w-14 h-14 rounded-xl object-cover bg-surface-container shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-bold text-on-surface line-clamp-2">
                        {selectedAlertProduct.name}
                      </h3>
                      <p className="text-[12px] text-on-surface-variant mt-0.5 truncate">
                        {selectedAlertProduct.sku} · {selectedAlertProduct.category} ·{" "}
                        {selectedAlertProduct.origin === "cn"
                          ? "สินค้านำเข้าจีน"
                          : "สินค้าในไทย"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="ปิดหน้าต่าง"
                    onClick={() => setSelectedAlertProductId(null)}
                    className="w-10 h-10 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[22px]">
                      close
                    </span>
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                  {/* Alert Status Banner */}
                  <div className="rounded-xl bg-surface-container-low p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`material-symbols-outlined text-[20px] shrink-0 ${severity.textClass}`}
                      >
                        {severity.icon}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-[13px] font-bold ${severity.textClass}`}>
                          สถานะสต็อก: {severity.label}
                        </p>
                        <p className="text-[11px] text-on-surface-variant tabular-nums">
                          {shortfall > 0
                            ? `ต่ำกว่าเกณฑ์ขั้นต่ำอยู่ ${shortfall} ชิ้น · แนะนำสั่งเติมประมาณ +${suggestedReorder} ชิ้น`
                            : "ยอดรวมยังเกินเกณฑ์ แต่มีบางสีที่หมดสต็อกแล้ว"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Key Stock & Pricing Numbers */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-outline-variant/40 p-3">
                      <p className="text-[11px] text-on-surface-variant">
                        คงเหลือปัจจุบัน
                      </p>
                      <p
                        className={`text-[20px] font-bold tabular-nums mt-0.5 ${severity.textClass}`}
                      >
                        {selectedAlertProduct.stock} ชิ้น
                      </p>
                    </div>
                    <div className="rounded-xl border border-outline-variant/40 p-3">
                      <p className="text-[11px] text-on-surface-variant">
                        จุดแจ้งเตือนขั้นต่ำ
                      </p>
                      <p className="text-[20px] font-bold text-on-surface tabular-nums mt-0.5">
                        {selectedAlertProduct.lowThreshold} ชิ้น
                      </p>
                    </div>
                    <div className="rounded-xl border border-outline-variant/40 p-3 col-span-2 sm:col-span-1">
                      <p className="text-[11px] text-on-surface-variant">
                        ราคาขายปลีก
                      </p>
                      <p className="text-[20px] font-bold text-primary tabular-nums mt-0.5">
                        ฿{selectedAlertProduct.sellPriceThb.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Owner-Only Cost Summary */}
                  {role === "owner" && (
                    <div className="rounded-xl border border-outline-variant/40 p-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px] tabular-nums">
                      <div>
                        <p className="text-[11px] text-on-surface-variant">
                          ต้นทุนนำเข้าต่อชิ้น (เฉพาะเจ้าของร้าน)
                        </p>
                        <p className="font-bold text-on-surface mt-0.5">
                          ฿{selectedAlertProduct.landedCostThb.toFixed(2)}/ชิ้น
                          {selectedAlertProduct.cnyUnitPrice !== undefined && (
                            <span className="font-normal text-on-surface-variant ml-1.5">
                              (¥{selectedAlertProduct.cnyUnitPrice} + ค่าส่ง ฿
                              {selectedAlertProduct.freightPerUnitThb ?? 0})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-on-surface-variant">
                          กำไรเบื้องต้น/ชิ้น
                        </p>
                        <p className="font-bold text-secondary mt-0.5">
                          ฿{profitPerUnit.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Per-Color Stock Breakdown */}
                  {selectedAlertProduct.colors &&
                    selectedAlertProduct.colors.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <h4 className="text-[13px] font-bold text-on-surface">
                          สต็อกแยกตามสี ({selectedAlertProduct.colors.length} สี)
                        </h4>
                        <div className="divide-y divide-surface-container rounded-xl border border-outline-variant/40 overflow-hidden">
                          {selectedAlertProduct.colors.map((c) => {
                            const colorOut =
                              typeof c.stock === "number" && c.stock <= 0;
                            const colorLow =
                              typeof c.stock === "number" &&
                              c.stock > 0 &&
                              c.stock <= 3;
                            return (
                              <div
                                key={c.name}
                                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-[12px]"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {c.imageUrl ? (
                                    <img
                                      src={c.imageUrl}
                                      alt={c.name}
                                      className="w-7 h-7 rounded-md object-cover border border-black/10 shrink-0"
                                    />
                                  ) : (
                                    <span
                                      className="w-5 h-5 rounded-full border border-black/15 shrink-0"
                                      style={{ backgroundColor: c.hex }}
                                    />
                                  )}
                                  <span
                                    className={`font-medium truncate ${
                                      colorOut
                                        ? "text-on-surface-variant line-through"
                                        : "text-on-surface"
                                    }`}
                                  >
                                    {c.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                  <span
                                    className={`font-bold ${
                                      colorOut
                                        ? "text-error"
                                        : colorLow
                                          ? "text-secondary"
                                          : "text-on-surface"
                                    }`}
                                  >
                                    {typeof c.stock === "number"
                                      ? `${c.stock} ชิ้น`
                                      : "ไม่ระบุจำนวน"}
                                  </span>
                                  {colorOut && (
                                    <span className="text-[11px] font-bold text-error">
                                      · หมดแล้ว
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Active Orders Demanding This Product */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[13px] font-bold text-on-surface">
                      ออเดอร์ค้างส่งที่มีสินค้านี้ ({activeOrdersForSelectedProduct.length})
                    </h4>
                    {activeOrdersForSelectedProduct.length === 0 ? (
                      <p className="text-[12px] text-on-surface-variant">
                        ขณะนี้ยังไม่มีออเดอร์ค้างแพ็คหรือรอจัดส่งสำหรับสินค้านี้
                      </p>
                    ) : (
                      <div className="divide-y divide-surface-container rounded-xl border border-outline-variant/40 overflow-hidden">
                        {activeOrdersForSelectedProduct.map((ord) => {
                          const matchingQty = ord.items
                            .filter(
                              (i) =>
                                i.productId === selectedAlertProduct.id ||
                                i.sku === selectedAlertProduct.sku
                            )
                            .reduce((s, i) => s + i.quantity, 0);
                          const statusLabel =
                            ORDER_STATUS_CONFIG.find((c) => c.id === ord.status)
                              ?.label || ord.status;
                          return (
                            <div
                              key={ord.id}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-[12px]"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-on-surface truncate">
                                  {ord.customerName}
                                </p>
                                <p className="text-[11px] text-on-surface-variant tabular-nums">
                                  #{ord.id} · {statusLabel} · {ord.createdAt}
                                </p>
                              </div>
                              <span className="font-bold text-primary tabular-nums whitespace-nowrap shrink-0">
                                ใช้ {matchingQty} ชิ้น
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="px-5 py-3.5 border-t border-surface-container bg-surface-container-low/50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const prod = selectedAlertProduct;
                        setSelectedAlertProductId(null);
                        onQuickCreateOrderForProduct(prod);
                      }}
                      className="h-10 px-3.5 rounded-lg bg-secondary-container text-on-secondary-container border border-secondary/35 hover:bg-secondary hover:text-on-secondary text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        add_shopping_cart
                      </span>
                      <span>สร้างคำสั่งซื้อ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const prod = selectedAlertProduct;
                        setSelectedAlertProductId(null);
                        onNotifyLowStockLine([prod]);
                      }}
                      className="h-10 px-3 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        chat
                      </span>
                      <span>แจ้ง LINE ({ownerLineId})</span>
                    </button>

                    {role === "owner" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAlertProductId(null);
                          onNavigateAccounting();
                        }}
                        className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:text-primary text-[12px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          account_balance_wallet
                        </span>
                        <span className="hidden sm:inline">ระบบบัญชี</span>
                      </button>
                    )}
                    {role === "owner" && (
                      confirmDeleteAlertProduct ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const prodId = selectedAlertProduct.id;
                              setConfirmDeleteAlertProduct(false);
                              setSelectedAlertProductId(null);
                              onDeleteProduct(prodId);
                            }}
                            className="h-10 px-3 rounded-lg bg-error text-on-error text-[12px] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            ยืนยันลบสินค้า
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAlertProduct(false)}
                            className="h-10 px-2.5 rounded-lg bg-surface-container text-on-surface-variant text-[12px] font-medium cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAlertProduct(true)}
                          className="h-10 px-3 rounded-lg bg-error-container/60 hover:bg-error text-error hover:text-on-error text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            delete
                          </span>
                          <span>ลบสินค้า</span>
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const prod = selectedAlertProduct;
                      setConfirmDeleteAlertProduct(false);
                      setSelectedAlertProductId(null);
                      onSelectProductForEdit(prod);
                    }}
                    className="h-10 px-4 rounded-lg bg-primary text-on-primary hover:bg-primary-dim text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[17px]">
                      {role === "owner" ? "tune" : "send"}
                    </span>
                    <span>
                      {role === "owner"
                        ? "ปรับจำนวนสินค้าทันที"
                        : "ส่งคำขอปรับจำนวน"}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
