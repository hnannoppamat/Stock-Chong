import { useState, useRef, useEffect } from "react";
import { AppNotification, ProductItem, RoleMode, TabId } from "../types";

interface HeaderProps {
  role: RoleMode;
  ownerName: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onEnterStaffMode: () => void;
  onOpenAiChat: () => void;
  isAiChatOpen: boolean;
  lowStockProducts: ProductItem[];
  ownerLineId: string;
  onNotifyLowStockLine: (products: ProductItem[]) => void;
  onSelectLowStockProduct: (product: ProductItem) => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onSelectNotification: (noti: AppNotification) => void;
}

export function Header({
  role,
  ownerName,
  activeTab,
  onTabChange,
  onEnterStaffMode,
  onOpenAiChat,
  isAiChatOpen,
  lowStockProducts,
  ownerLineId,
  onNotifyLowStockLine,
  onSelectLowStockProduct,
  notifications,
  onMarkAllRead,
  onSelectNotification,
}: HeaderProps) {
  const [openNoti, setOpenNoti] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const totalAlertCount = unreadCount + lowStockProducts.length;

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenNoti(false);
      }
    }
    if (openNoti) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openNoti]);

  const roleTabLabel = role === "staff" ? "พนักงาน" : ownerName;
  const roleTabIcon = role === "staff" ? "badge" : "admin_panel_settings";

  const navItems: { id: TabId; label: string; icon: string; badge?: number }[] = [
    {
      id: "inventory",
      label: "แดชบอร์ด",
      icon: "dashboard",
      badge: lowStockProducts.length > 0 ? lowStockProducts.length : undefined,
    },
    ...(role === "owner"
      ? [{ id: "ai-scanner" as const, label: "สแกนบิล", icon: "document_scanner" }]
      : []),
    { id: "orders", label: "ออเดอร์", icon: "receipt_long" },
    { id: "customers", label: "ลูกค้า", icon: "group" },
    { id: "owner-auth", label: roleTabLabel, icon: roleTabIcon },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl shadow-[0_1px_10px_rgba(225,29,116,0.08)] border-b border-outline-variant/40 pt-safe">
      <div className="h-14 md:h-16 max-w-6xl mx-auto px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onTabChange("inventory")}
            className="text-[16px] leading-6 font-bold text-primary tracking-tight whitespace-nowrap cursor-pointer"
          >
            DenewStock
          </button>
          <button
            type="button"
            onClick={() => onTabChange("owner-auth")}
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              role === "owner"
                ? "bg-primary-fixed text-on-primary-fixed"
                : "bg-secondary-container text-on-secondary-container"
            }`}
          >
            {roleTabLabel}
          </button>
        </div>

        {/* Desktop navigation links */}
        <nav
          aria-label="เมนูหลัก"
          className="hidden md:flex items-center gap-1 bg-surface-container/80 p-1 rounded-xl"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    isActive ? "material-symbols-filled" : ""
                  }`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    title={`สินค้าใกล้หมด ${item.badge} รายการ`}
                    className="min-w-[18px] h-[18px] px-1 rounded-full bg-secondary-container text-on-secondary-container border border-secondary/30 text-[10px] font-bold flex items-center justify-center tabular-nums"
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 shrink-0 relative" ref={popoverRef}>
          {role === "owner" ? (
            <button
              type="button"
              onClick={onEnterStaffMode}
              className="h-9 px-3 rounded-full bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary text-[12px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">badge</span>
              <span>พนักงานเข้าใช้งาน</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTabChange("owner-auth")}
              className="h-9 px-3 rounded-full bg-primary-fixed text-on-primary-fixed hover:bg-primary hover:text-on-primary text-[12px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">lock_open</span>
              <span>เข้าเจ้าของร้าน</span>
            </button>
          )}

          <button
            type="button"
            aria-label="เปิดผู้ช่วย AI"
            onClick={onOpenAiChat}
            className={`h-9 px-2.5 rounded-full flex items-center gap-1 text-[12px] font-semibold transition-all cursor-pointer active:scale-95 border shrink-0 ${
              isAiChatOpen
                ? "bg-primary text-on-primary border-primary shadow-sm"
                : "bg-secondary-container/80 text-on-secondary-container border-secondary/40 hover:bg-secondary-container"
            }`}
          >
            <span className="material-symbols-outlined text-[17px] material-symbols-filled">
              auto_awesome
            </span>
            <span className="hidden sm:inline">ผู้ช่วย AI</span>
          </button>

          <button
            type="button"
            aria-label="การแจ้งเตือน"
            onClick={() => setOpenNoti((prev) => !prev)}
            className="relative w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded-full transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {totalAlertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center tabular-nums">
                {totalAlertCount}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label="สลับโหมดผู้ใช้งาน"
            onClick={() => onTabChange("owner-auth")}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer ${
              role === "owner"
                ? "bg-primary text-on-primary"
                : "bg-secondary-container text-on-secondary-container border border-secondary/30"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {role === "owner" ? "person" : "badge"}
            </span>
          </button>

          {openNoti && (
            <div className="absolute right-0 top-13 w-84 max-w-[calc(100vw-2rem)] bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/60 p-3 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container">
                <span className="text-[14px] font-semibold text-on-surface">
                  การแจ้งเตือน ({totalAlertCount})
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    อ่านทั้งหมด
                  </button>
                )}
              </div>

              {/* Low-Stock Reorder Alert Section inside Notification Bell */}
              {lowStockProducts.length > 0 && (
                <div className="mt-2 pb-2 border-b border-surface-container flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-on-secondary-container flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        warning
                      </span>
                      <span>
                        สินค้าต่ำกว่าเกณฑ์ต้องสั่งเติม ({lowStockProducts.length} รายการ)
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onNotifyLowStockLine(lowStockProducts);
                          setOpenNoti(false);
                        }}
                        className="px-2 py-0.5 rounded-md bg-[#06C755] hover:bg-[#05b34c] text-white text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          chat
                        </span>
                        <span>แจ้ง LINE</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onTabChange("inventory");
                          setOpenNoti(false);
                        }}
                        className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        ดูทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    {lowStockProducts.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => {
                          onSelectLowStockProduct(prod);
                          setOpenNoti(false);
                        }}
                        className="text-left p-2 rounded-lg bg-tertiary-fixed/65 hover:bg-tertiary-fixed transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-on-tertiary-fixed truncate">
                            {prod.name}
                          </p>
                          <p className="text-[10px] text-on-tertiary-fixed-variant tabular-nums">
                            {prod.sku} · คงเหลือ {prod.stock} / ขั้นต่ำ {prod.lowThreshold} ชิ้น
                          </p>
                        </div>
                        <span className="text-[11px] font-bold text-primary shrink-0">
                          เติมสต็อก →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 mt-2 max-h-60 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-[12px] text-on-surface-variant text-center py-4">
                    ไม่มีการแจ้งเตือนใหม่
                  </p>
                ) : (
                  notifications.map((noti) => (
                    <button
                      key={noti.id}
                      type="button"
                      onClick={() => {
                        onSelectNotification(noti);
                        setOpenNoti(false);
                      }}
                      className={`text-left p-2.5 rounded-lg transition-colors flex items-start gap-2.5 cursor-pointer ${
                        noti.read
                          ? "bg-surface-container-low/50 hover:bg-surface-container-low"
                          : "bg-primary-fixed/20 hover:bg-primary-fixed/30"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">
                        {noti.type === "order"
                          ? "receipt_long"
                          : noti.type === "stock"
                            ? "warning"
                            : noti.type === "approval"
                              ? "approval"
                              : "info"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-on-surface truncate">
                            {noti.title}
                          </span>
                          <span className="text-[10px] text-on-surface-variant shrink-0">
                            {noti.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-2">
                          {noti.detail}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
