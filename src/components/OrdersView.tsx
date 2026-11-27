import { useState } from "react";
import {
  CourierName,
  Order,
  OrdersTab,
  RoleMode,
  ShippingOption,
} from "../types";
import { ResilientImage } from "./ResilientImage";
import { WeeklySalesChart } from "./WeeklySalesChart";

interface OrdersViewProps {
  role: RoleMode;
  orders: Order[];
  activeOrderTab: OrdersTab;
  onTabChange: (tab: OrdersTab) => void;
  onOpenCreateOrder: () => void;
  onToggleItemPicked: (orderId: string, itemIndex: number) => void;
  onConfirmPack: (orderId: string) => void;
  onMarkReadyToShip: (orderId: string) => void;
  onConfirmShip: (
    orderId: string,
    options: {
      shippingOption: ShippingOption;
      carrierName?: string;
      courier?: CourierName;
      trackingCode?: string;
    }
  ) => void;
  onOpenPrintLabel: (order: Order) => void;
  onOpenPaymentQr: (order: Order) => void;
  onOpenDeliveryConfirm: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
}

const COURIERS: CourierName[] = [
  "Flash Express",
  "J&T Express",
  "Kerry Express",
  "ไปรษณีย์ไทย",
];

const CUSTOM_CARRIER_VALUE = "__custom__";

const SHIPPING_OPTIONS: {
  id: ShippingOption;
  label: string;
  shortDesc: string;
  icon: string;
}[] = [
  {
    id: "store_delivery",
    label: "ส่งถึงหน้าร้าน",
    shortDesc: "ร้านนำส่งให้ถึงหน้าร้านลูกค้า",
    icon: "store",
  },
  {
    id: "carrier",
    label: "ส่งขนส่ง",
    shortDesc: "ส่งผ่านบริษัทขนส่งพร้อมระบุชื่อขนส่ง",
    icon: "local_shipping",
  },
  {
    id: "store_pickup",
    label: "มารับหน้าร้าน",
    shortDesc: "ลูกค้าเข้ามารับสินค้าด้วยตนเอง",
    icon: "storefront",
  },
];

function getShippingOptionLabel(
  option?: ShippingOption,
  carrierName?: string,
  courier?: CourierName
): string {
  if (option === "store_delivery") return "ส่งถึงหน้าร้าน";
  if (option === "store_pickup") return "มารับหน้าร้าน";
  if (option === "carrier") {
    const name = carrierName || courier;
    return name ? `ส่งขนส่ง (${name})` : "ส่งขนส่ง";
  }
  if (carrierName) return carrierName;
  if (courier) return courier;
  return "จัดส่งสำเร็จ";
}

function generateTrackingCode(courierName: string): string {
  const num = Math.floor(100000000 + Math.random() * 900000000);
  if (courierName === "Flash Express") return `TH${num}A`;
  if (courierName === "J&T Express") return `82${num}`;
  if (courierName === "Kerry Express") return `KEX${num}`;
  if (courierName === "ไปรษณีย์ไทย") return `ED${num}TH`;
  return `SF${num}`;
}

export function OrdersView({
  role,
  orders,
  activeOrderTab,
  onTabChange,
  onOpenCreateOrder,
  onToggleItemPicked,
  onConfirmPack,
  onMarkReadyToShip,
  onConfirmShip,
  onOpenPrintLabel,
  onOpenPaymentQr,
  onOpenDeliveryConfirm,
  onDeleteOrder,
}: OrdersViewProps) {
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(
    null
  );
  const [shippingOptionByOrder, setShippingOptionByOrder] = useState<
    Record<string, ShippingOption>
  >({});
  const [carrierSelectByOrder, setCarrierSelectByOrder] = useState<
    Record<string, string>
  >({});
  const [customCarrierByOrder, setCustomCarrierByOrder] = useState<
    Record<string, string>
  >({});
  const [trackingByOrder, setTrackingByOrder] = useState<Record<string, string>>(
    {}
  );
  const [carrierErrorByOrder, setCarrierErrorByOrder] = useState<
    Record<string, string>
  >({});

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const packingOrders = orders.filter((o) => o.status === "packing");
  const readyToShipOrders = orders.filter((o) => o.status === "ready_to_ship");
  const shippedOrders = orders.filter((o) => o.status === "shipped");

  const isWeeklyChartTab = role === "owner" && activeOrderTab === "weekly_chart";
  const visibleOrders = isWeeklyChartTab
    ? []
    : orders.filter((o) => o.status === activeOrderTab);

  const getSelectedShippingOption = (order: Order): ShippingOption => {
    if (shippingOptionByOrder[order.id]) return shippingOptionByOrder[order.id];
    if (order.shippingOption) return order.shippingOption;
    return order.orderType === "walk_in" ? "store_pickup" : "carrier";
  };

  const getSelectedCarrierChoice = (order: Order): string => {
    if (carrierSelectByOrder[order.id]) return carrierSelectByOrder[order.id];
    if (order.carrierName) {
      if (COURIERS.includes(order.carrierName as CourierName)) {
        return order.carrierName;
      }
      return CUSTOM_CARRIER_VALUE;
    }
    return order.courier ?? "Flash Express";
  };

  const getResolvedCarrierName = (order: Order): string => {
    const choice = getSelectedCarrierChoice(order);
    if (choice === CUSTOM_CARRIER_VALUE) {
      return (
        customCarrierByOrder[order.id] ??
        (order.carrierName && !COURIERS.includes(order.carrierName as CourierName)
          ? order.carrierName
          : "")
      ).trim();
    }
    return choice;
  };

  const tabs: {
    id: OrdersTab;
    label: string;
    count?: number;
    icon?: string;
  }[] = [
    {
      id: "pending",
      label: "รอดำเนินการ",
      count: pendingOrders.length,
    },
    {
      id: "packing",
      label: "กำลังแพ็ค",
      count: packingOrders.length,
    },
    {
      id: "ready_to_ship",
      label: "รอจัดส่ง",
      count: readyToShipOrders.length,
    },
    {
      id: "shipped",
      label: "จัดส่งแล้ว",
      count: shippedOrders.length,
    },
    ...(role === "owner"
      ? [
          {
            id: "weekly_chart" as const,
            label: "กราฟรายสัปดาห์",
            icon: "bar_chart",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col w-full gap-4 pb-6">
      {/* Top Quick Order CTA */}
      <button
        type="button"
        onClick={onOpenCreateOrder}
        className="w-full min-h-[48px] px-4 rounded-xl bg-primary text-on-primary font-semibold text-[14px] flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform cursor-pointer hover:bg-primary-dim"
      >
        <span className="material-symbols-outlined text-[20px]">
          add_shopping_cart
        </span>
        <span>+ สร้างออเดอร์ใหม่</span>
      </button>

      {/* Top Grid: Live Orders + Today Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          {/* Live Orders 4-Col Summary */}
          <div className="bg-surface-container-lowest rounded-xl p-3 shadow-sm flex flex-col gap-2 border border-outline-variant/40">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">
                  bolt
                </span>
                <span className="text-[12px] text-on-surface font-semibold">
                  สถานะออเดอร์สด (Live Orders)
                </span>
              </div>
              <span className="text-[11px] text-primary flex items-center gap-0.5 font-medium">
                <span className="material-symbols-outlined text-[15px]">
                  sync
                </span>
                อัปเดตอัตโนมัติ
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => onTabChange("pending")}
                className="bg-tertiary-fixed/55 rounded-lg p-2 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tertiary-fixed/85 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-tertiary text-[15px]">
                    notifications_active
                  </span>
                  <span className="text-[11px] text-tertiary font-semibold">
                    ออเดอร์ใหม่
                  </span>
                </div>
                <span className="text-[20px] text-tertiary font-bold tabular-nums">
                  +{pendingOrders.length}
                </span>
                <span className="text-[10px] text-on-tertiary-fixed/80">
                  เข้าใหม่ล่าสุด
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("packing")}
                className="bg-surface-container-low rounded-lg p-2 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-on-surface-variant text-[15px]">
                    package_2
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-semibold">
                    กำลังแพ็ค
                  </span>
                </div>
                <span className="text-[20px] text-on-surface font-bold tabular-nums">
                  {packingOrders.length}
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  กำลังจัดของ
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("ready_to_ship")}
                className="bg-primary-fixed/55 rounded-lg p-2 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-primary-fixed/85 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-primary text-[15px]">
                    outbox
                  </span>
                  <span className="text-[11px] text-primary font-semibold">
                    รอจัดส่ง
                  </span>
                </div>
                <span className="text-[20px] text-primary font-bold tabular-nums">
                  {readyToShipOrders.length}
                </span>
                <span className="text-[10px] text-on-primary-fixed/80">
                  เลือกวิธีจัดส่ง
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("shipped")}
                className="bg-secondary-container/55 rounded-lg p-2 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-secondary-container/85 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-secondary text-[15px]">
                    local_shipping
                  </span>
                  <span className="text-[11px] text-secondary font-semibold">
                    ส่งของแล้ว
                  </span>
                </div>
                <span className="text-[20px] text-secondary font-bold tabular-nums">
                  {shippedOrders.length}
                </span>
                <span className="text-[10px] text-on-secondary-container/80">
                  รายการวันนี้
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Today Total & Weekly Chart Quick Link */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-3.5 shadow-sm border border-outline-variant/40 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-primary-fixed text-[22px]">
                  shopping_bag
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-on-surface-variant truncate">
                  ยอดออเดอร์ทั้งหมด
                </p>
                <p className="text-[18px] font-bold text-on-surface truncate tabular-nums">
                  {orders.length} ออเดอร์
                </p>
              </div>
            </div>
            {role === "owner" && (
              <button
                type="button"
                onClick={() => onTabChange("weekly_chart")}
                className="h-9 px-2.5 rounded-lg bg-primary-fixed/70 text-on-primary-fixed hover:bg-primary hover:text-on-primary text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">
                  bar_chart
                </span>
                <span>ดูกราฟ</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-secondary-container/70 text-on-secondary-container px-2.5 py-1.5 rounded-lg w-fit">
            <span className="material-symbols-outlined text-[15px]">
              check_circle
            </span>
            <span className="text-[11px] font-medium">
              ตัดสต็อกอัตโนมัติ: เปิดใช้งาน
            </span>
          </div>
        </div>
      </div>

      {/* Status + Weekly Chart Tabs */}
      <div
        className={`bg-surface-container rounded-xl p-1 grid gap-1 ${
          role === "owner"
            ? "grid-cols-2 sm:grid-cols-5"
            : "grid-cols-2 sm:grid-cols-4"
        }`}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeOrderTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`py-2.5 px-2 rounded-lg text-[12px] font-medium transition-all flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
                isActive
                  ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              } ${
                tab.id === "weekly_chart" ? "col-span-2 sm:col-span-1" : ""
              }`}
            >
              {tab.icon && (
                <span className="material-symbols-outlined text-[16px]">
                  {tab.icon}
                </span>
              )}
              <span className="whitespace-nowrap">{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${
                    isActive
                      ? "bg-primary-fixed text-on-primary-fixed font-semibold"
                      : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Weekly Sales Chart Tab (Owner Only) */}
      {isWeeklyChartTab ? (
        <WeeklySalesChart
          orders={orders}
          onOpenCreateOrder={onOpenCreateOrder}
        />
      ) : visibleOrders.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 text-center flex flex-col items-center justify-center gap-2 shadow-sm border border-outline-variant/30">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[28px]">
              inventory_2
            </span>
          </div>
          <p className="text-[16px] font-semibold text-on-surface">
            ไม่มีออเดอร์ในหมวดนี้
          </p>
          <p className="text-[13px] text-on-surface-variant">
            ออเดอร์ที่อัปเดตสถานะแล้วจะแสดงที่นี่โดยอัตโนมัติ
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleOrders.map((order) => {
            const pickedCount = order.items.filter((i) => i.picked).length;
            const orderTypeLabel =
              order.orderType === "walk_in"
                ? "Walk-in"
                : order.orderType === "delivery"
                  ? "ส่งของ"
                  : order.channel;

            return (
              <div
                key={order.id}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/35 flex flex-col gap-3 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[16px] font-semibold text-on-surface">
                        #{order.id}
                      </span>
                      {orderTypeLabel && (
                        <span
                          className={`text-[12px] font-semibold inline-flex items-center gap-1 ${
                            order.orderType === "walk_in"
                              ? "text-secondary"
                              : "text-primary"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {order.orderType === "walk_in"
                              ? "storefront"
                              : "local_shipping"}
                          </span>
                          <span>{orderTypeLabel}</span>
                        </span>
                      )}
                      <span className="text-[11px] text-on-surface-variant tabular-nums">
                        · หยิบแล้ว {pickedCount}/{order.items.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[16px]">
                        person
                      </span>
                      <span className="text-[14px] text-on-surface font-medium">
                        {order.customerName}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        · {order.createdAt}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-[11px] text-on-surface-variant">
                        ยอดรวม
                      </p>
                      <p className="text-[18px] font-semibold text-primary tabular-nums">
                        ฿{order.totalThb.toLocaleString()}
                      </p>
                    </div>
                    {role === "owner" && (
                      confirmDeleteOrderId === order.id ? (
                        <div className="flex items-center gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteOrder(order.id);
                              setConfirmDeleteOrderId(null);
                            }}
                            className="h-8 px-2.5 rounded-lg bg-error text-on-error text-[11px] font-semibold cursor-pointer"
                          >
                            ยืนยันลบ
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOrderId(null)}
                            className="h-8 px-2 rounded-lg bg-surface-container text-on-surface-variant text-[11px] font-medium cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={`ลบออเดอร์ ${order.id}`}
                          title="ลบออเดอร์นี้"
                          onClick={() => setConfirmDeleteOrderId(order.id)}
                          className="w-8 h-8 rounded-lg bg-error-container/50 hover:bg-error text-error hover:text-on-error flex items-center justify-center transition-colors cursor-pointer mt-0.5"
                        >
                          <span className="material-symbols-outlined text-[17px]">
                            delete
                          </span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Order Items Checklist */}
                <div className="bg-surface-container-low rounded-lg p-2.5 flex flex-col gap-2">
                  {order.items.map((item, itemIdx) => (
                    <div
                      key={`${order.id}-${item.sku}-${item.colorName || itemIdx}`}
                      className={`flex items-center gap-2.5 bg-surface-container-lowest/90 p-2 rounded-lg border transition-colors ${
                        item.picked
                          ? "border-secondary/40"
                          : "border-outline-variant/35"
                      }`}
                    >
                      <ResilientImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-11 h-11 rounded-lg object-cover shrink-0 bg-surface-container"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-on-surface truncate">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[11px] text-on-surface-variant">
                          <span>{item.sku}</span>
                          {item.colorName && (
                            <span className="inline-flex items-center gap-1 text-on-surface font-medium">
                              <span>·</span>
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                                style={{
                                  backgroundColor: item.colorHex || "#94a3b8",
                                }}
                              />
                              <span>สี{item.colorName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-md bg-surface-container text-[12px] font-semibold text-on-surface tabular-nums">
                          x{item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleItemPicked(order.id, itemIdx)
                          }
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold active:scale-[0.98] transition-transform cursor-pointer ${
                            item.picked
                              ? "bg-secondary-container text-on-secondary-container"
                              : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {item.picked
                              ? "check_circle"
                              : "radio_button_unchecked"}
                          </span>
                          <span>
                            {item.picked
                              ? `จัดแล้ว (${item.quantity}/${item.quantity})`
                              : `รอหยิบ (0/${item.quantity})`}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Ready-to-Ship Fulfillment Options: ส่งถึงหน้าร้าน / ส่งขนส่ง (พร้อมระบุขนส่ง) / มารับหน้าร้าน */}
                {order.status === "ready_to_ship" &&
                  (() => {
                    const selectedOption = getSelectedShippingOption(order);
                    const selectedCarrierChoice =
                      getSelectedCarrierChoice(order);
                    const isCustomCarrier =
                      selectedCarrierChoice === CUSTOM_CARRIER_VALUE;
                    const customCarrierVal =
                      customCarrierByOrder[order.id] ??
                      (order.carrierName &&
                      !COURIERS.includes(order.carrierName as CourierName)
                        ? order.carrierName
                        : "");
                    const trackingVal =
                      trackingByOrder[order.id] ?? order.trackingCode ?? "";
                    const carrierError = carrierErrorByOrder[order.id];

                    return (
                      <div className="bg-primary-fixed/30 border border-primary/25 rounded-xl p-3 flex flex-col gap-2.5">
                        <span className="text-[12px] font-semibold text-primary flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">
                            outbox
                          </span>
                          <span>เลือกวิธีจัดส่งสินค้า (สถานะรอจัดส่ง)</span>
                        </span>

                        {/* 3-Option Fulfillment Selector */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {SHIPPING_OPTIONS.map((opt) => {
                            const active = selectedOption === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setShippingOptionByOrder((prev) => ({
                                    ...prev,
                                    [order.id]: opt.id,
                                  }));
                                  setCarrierErrorByOrder((prev) => ({
                                    ...prev,
                                    [order.id]: "",
                                  }));
                                }}
                                className={`py-2 px-1.5 rounded-lg border text-[11px] font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                  active
                                    ? "bg-primary text-on-primary border-primary shadow-sm"
                                    : "bg-surface-container-lowest text-on-surface border-outline-variant/50 hover:bg-surface-container-low"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {opt.icon}
                                </span>
                                <span className="whitespace-nowrap">
                                  {opt.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Conditional Details based on Selected Shipping Option */}
                        {selectedOption === "carrier" ? (
                          <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <select
                                aria-label="เลือกบริษัทขนส่ง"
                                value={selectedCarrierChoice}
                                onChange={(e) => {
                                  setCarrierSelectByOrder((prev) => ({
                                    ...prev,
                                    [order.id]: e.target.value,
                                  }));
                                  setCarrierErrorByOrder((prev) => ({
                                    ...prev,
                                    [order.id]: "",
                                  }));
                                }}
                                className="h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-[12px] font-medium text-on-surface focus:outline-none focus:border-primary"
                              >
                                {COURIERS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                                <option value={CUSTOM_CARRIER_VALUE}>
                                  ขนส่งอื่นๆ (ระบุชื่อขนส่งเอง)
                                </option>
                              </select>

                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={trackingVal}
                                  onChange={(e) =>
                                    setTrackingByOrder((prev) => ({
                                      ...prev,
                                      [order.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="เลขพัสดุ (ว่างไว้สุ่มอัตโนมัติ)"
                                  className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-[12px] font-mono text-on-surface placeholder:font-sans placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
                                />
                                <button
                                  type="button"
                                  title="สร้างเลขพัสดุอัตโนมัติ"
                                  onClick={() =>
                                    setTrackingByOrder((prev) => ({
                                      ...prev,
                                      [order.id]: generateTrackingCode(
                                        getResolvedCarrierName(order) ||
                                          "Flash Express"
                                      ),
                                    }))
                                  }
                                  className="h-9 w-9 shrink-0 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-primary hover:bg-primary-fixed/40 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[18px]">
                                    qr_code_2
                                  </span>
                                </button>
                              </div>
                            </div>

                            {isCustomCarrier && (
                              <div>
                                <input
                                  type="text"
                                  maxLength={80}
                                  value={customCarrierVal}
                                  onChange={(e) => {
                                    setCustomCarrierByOrder((prev) => ({
                                      ...prev,
                                      [order.id]: e.target.value,
                                    }));
                                    setCarrierErrorByOrder((prev) => ({
                                      ...prev,
                                      [order.id]: "",
                                    }));
                                  }}
                                  placeholder="ระบุชื่อบริษัทขนส่ง เช่น นิ่มเอ็กซ์เพรส, Lalamove, ขนส่งเอกชน..."
                                  className="w-full h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-primary/50 text-[12px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
                                />
                              </div>
                            )}

                            {carrierError && (
                              <p className="text-[11px] font-medium text-error">
                                {carrierError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="px-2.5 py-2 rounded-lg bg-surface-container-lowest/90 border border-outline-variant/40 text-[12px] text-on-surface-variant flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">
                              {selectedOption === "store_delivery"
                                ? "store"
                                : "storefront"}
                            </span>
                            <span>
                              {selectedOption === "store_delivery"
                                ? "จัดส่งสินค้าถึงหน้าร้านลูกค้าโดยตรง"
                                : "ลูกค้าเข้ามารับสินค้าเองที่หน้าร้าน"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* Delivery Confirmation Proof / Cash Summary for Shipped Orders */}
                {order.status === "shipped" && (
                  <div className="bg-secondary-container/35 border border-secondary/25 rounded-lg p-2.5 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {order.deliveryProofImage ? (
                        <button
                          type="button"
                          onClick={() => onOpenDeliveryConfirm(order)}
                          className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-secondary/30 cursor-pointer"
                        >
                          <img
                            src={order.deliveryProofImage}
                            alt="หลักฐานจัดส่ง"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[19px]">
                            {order.deliveryMethod === "cash"
                              ? "payments"
                              : order.deliveryMethod === "photo_proof"
                                ? "photo_camera"
                                : "pending_actions"}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-on-surface truncate">
                          {order.deliveryMethod === "cash"
                            ? `ชำระเงินสดแล้ว (รับ ฿${(order.cashReceivedThb ?? order.totalThb).toLocaleString()})`
                            : order.deliveryMethod === "photo_proof"
                              ? "ถ่ายรูปยืนยันการจัดส่งแล้ว"
                              : "ยังไม่ยืนยันรูปจัดส่ง / รับเงินสด"}
                        </p>
                        <p className="text-[11px] text-on-surface-variant truncate">
                          {getShippingOptionLabel(
                            order.shippingOption,
                            order.carrierName,
                            order.courier
                          )}
                          {order.trackingCode ? (
                            <>
                              {" · "}
                              <span className="font-mono">
                                {order.trackingCode}
                              </span>
                            </>
                          ) : null}
                          {order.deliveryConfirmedAt
                            ? ` · ${order.deliveryConfirmedAt}`
                            : ""}
                        </p>
                        {order.deliveryNote && (
                          <p className="text-[11px] text-on-surface-variant truncate">
                            หมายเหตุ: {order.deliveryNote}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenDeliveryConfirm(order)}
                      className={`shrink-0 h-9 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                        order.deliveryMethod
                          ? "bg-surface-container-lowest text-primary border border-outline-variant/50 hover:bg-primary-fixed/30"
                          : "bg-secondary text-on-secondary shadow-sm"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {order.deliveryMethod ? "visibility" : "photo_camera"}
                      </span>
                      <span>
                        {order.deliveryMethod
                          ? "ดูหลักฐาน"
                          : "ยืนยันส่ง/เงินสด"}
                      </span>
                    </button>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenPaymentQr(order)}
                    className="min-h-[46px] px-3 rounded-lg bg-[#113566] hover:bg-[#0d2a52] text-white font-semibold text-[12.5px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      qr_code_2
                    </span>
                    <span className="whitespace-nowrap">QR ชำระเงิน</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (order.status === "ready_to_ship") {
                        const selectedOption = getSelectedShippingOption(order);
                        const carrierName =
                          selectedOption === "carrier"
                            ? getResolvedCarrierName(order) || "Flash Express"
                            : undefined;
                        const trackingVal =
                          trackingByOrder[order.id] ?? order.trackingCode;
                        onOpenPrintLabel({
                          ...order,
                          shippingOption: selectedOption,
                          carrierName,
                          courier:
                            carrierName &&
                            COURIERS.includes(carrierName as CourierName)
                              ? (carrierName as CourierName)
                              : order.courier,
                          trackingCode: trackingVal || undefined,
                        });
                      } else {
                        onOpenPrintLabel(order);
                      }
                    }}
                    className="flex-1 min-h-[46px] px-3 rounded-lg bg-surface-container text-on-surface font-semibold text-[13px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      print
                    </span>
                    <span className="truncate">พิมพ์ใบปะหน้า</span>
                  </button>

                  {order.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => onConfirmPack(order.id)}
                      className="flex-[1.3] min-h-[46px] px-3 rounded-lg bg-primary text-on-primary font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer hover:bg-primary-dim"
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        inventory
                      </span>
                      <span className="truncate">ยืนยันแพ็คของ (ตัดสต็อก)</span>
                    </button>
                  )}

                  {order.status === "packing" && (
                    <button
                      type="button"
                      onClick={() => onMarkReadyToShip(order.id)}
                      className="flex-[1.3] min-h-[46px] px-3 rounded-lg bg-primary text-on-primary font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer hover:bg-primary-dim"
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        outbox
                      </span>
                      <span className="truncate">แพ็คเสร็จ (รอจัดส่ง)</span>
                    </button>
                  )}

                  {order.status === "ready_to_ship" &&
                    (() => {
                      const selectedOption = getSelectedShippingOption(order);
                      const confirmLabel =
                        selectedOption === "store_delivery"
                          ? "ยืนยันส่งถึงหน้าร้าน"
                          : selectedOption === "store_pickup"
                            ? "ยืนยันรับหน้าร้าน"
                            : "ยืนยันส่งขนส่งแล้ว";
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedOption === "carrier") {
                              const resolvedCarrier =
                                getResolvedCarrierName(order);
                              if (!resolvedCarrier) {
                                setCarrierErrorByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: "กรุณาระบุชื่อบริษัทขนส่งก่อนยืนยัน",
                                }));
                                return;
                              }
                              const trackingVal = (
                                trackingByOrder[order.id] ??
                                order.trackingCode ??
                                ""
                              ).trim();
                              onConfirmShip(order.id, {
                                shippingOption: "carrier",
                                carrierName: resolvedCarrier,
                                courier: COURIERS.includes(
                                  resolvedCarrier as CourierName
                                )
                                  ? (resolvedCarrier as CourierName)
                                  : undefined,
                                trackingCode: trackingVal || undefined,
                              });
                            } else {
                              onConfirmShip(order.id, {
                                shippingOption: selectedOption,
                              });
                            }
                          }}
                          className="flex-[1.3] min-h-[46px] px-3 rounded-lg bg-secondary text-on-secondary hover:bg-secondary-dim font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[19px]">
                            {selectedOption === "store_delivery"
                              ? "store"
                              : selectedOption === "store_pickup"
                                ? "storefront"
                                : "local_shipping"}
                          </span>
                          <span className="truncate">{confirmLabel}</span>
                        </button>
                      );
                    })()}

                  {order.status === "shipped" && (
                    <button
                      type="button"
                      onClick={() => onOpenDeliveryConfirm(order)}
                      className="flex-[1.3] min-h-[46px] px-3 rounded-lg bg-secondary-container/70 hover:bg-secondary-container text-on-secondary-container text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px] shrink-0">
                        {order.deliveryMethod === "cash"
                          ? "payments"
                          : "photo_camera"}
                      </span>
                      <span className="truncate">
                        {order.deliveryMethod
                          ? "ดู/แก้ไขการยืนยัน"
                          : "ถ่ายรูปยืนยัน / เงินสด"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
