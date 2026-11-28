import { useState, useRef, useEffect } from "react";
import { AppNotification, ProductItem, RoleMode, TabId } from "../types";
import { GoogleLogoSvg } from "./GoogleLoginScreen";

interface HeaderProps {
  role: RoleMode;
  ownerName: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onEnterStaffMode: () => void;
  onOpenAiChat: () => void;
  isAiChatOpen: boolean;
  lowStockProducts: ProductItem[];
  onSelectLowStockProduct: (product: ProductItem) => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onDeleteNotification: (notiId: string) => void;
  onClearAllNotifications: () => void;
  onSelectNotification: (noti: AppNotification) => void;
  cloudStatus: "connected" | "connecting" | "local";
  cloudUserEmail?: string | null;
  cloudUserName?: string | null;
  cloudUserPhoto?: string | null;
  liveStatus: "connected" | "connecting" | "reconnecting" | "offline";
  onlineDevicesCount: number;
  onCloudSyncClick: () => void;
  onConnectCloud?: () => void;
  onDisconnectCloud?: () => void;
  onSyncAllToCloud?: () => void;
  isSyncingCloudAll?: boolean;
  isStandalone?: boolean;
  onInstallApp?: () => void;
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
  onSelectLowStockProduct,
  notifications,
  onMarkAllRead,
  onDeleteNotification,
  onClearAllNotifications,
  onSelectNotification,
  cloudStatus,
  cloudUserEmail,
  cloudUserName,
  cloudUserPhoto,
  liveStatus,
  onlineDevicesCount,
  onCloudSyncClick,
  onConnectCloud,
  onDisconnectCloud,
  onSyncAllToCloud,
  isSyncingCloudAll = false,
  isStandalone = false,
  onInstallApp,
}: HeaderProps) {
  const [openNoti, setOpenNoti] = useState(false);
  const [openAccount, setOpenAccount] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const totalAlertCount = unreadCount + lowStockProducts.length;

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenNoti(false);
        setOpenAccount(false);
      }
    }
    if (openNoti || openAccount) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openNoti, openAccount]);

  const roleTabLabel = role === "staff" ? "พนักงาน" : ownerName;
  const roleTabIcon = role === "staff" ? "badge" : "admin_panel_settings";

  const navItems: { id: TabId; label: string; icon: string; badge?: number }[] = [
    {
      id: "dashboard",
      label: "แดชบอร์ด",
      icon: "dashboard",
    },
    {
      id: "inventory",
      label: "คลังสินค้า",
      icon: "inventory_2",
      badge: lowStockProducts.length > 0 ? lowStockProducts.length : undefined,
    },
    ...(role === "owner"
      ? [{ id: "accounting" as const, label: "บัญชี", icon: "account_balance_wallet" }]
      : []),
    { id: "orders", label: "ออเดอร์", icon: "receipt_long" },
    { id: "customers", label: "ลูกค้า", icon: "group" },
    { id: "owner-auth", label: roleTabLabel, icon: roleTabIcon },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/92 backdrop-blur-xl shadow-[0_1px_10px_rgba(174,84,130,0.08)] border-b border-outline-variant/40 pt-safe select-none">
      <div className="h-14 md:h-16 max-w-6xl mx-auto px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 md:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
          <button
            type="button"
            onClick={() => onTabChange("dashboard")}
            className="text-[16px] leading-6 font-bold text-primary tracking-tight whitespace-nowrap cursor-pointer active:opacity-80"
          >
            DenewStock
          </button>
          <button
            type="button"
            onClick={() => onTabChange("owner-auth")}
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap truncate max-w-[84px] sm:max-w-[120px] transition-colors cursor-pointer active:scale-95 ${
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
                className={`px-2.5 lg:px-3 py-1.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
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

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative" ref={popoverRef}>
          <button
            type="button"
            onClick={onCloudSyncClick}
            aria-label={
              liveStatus === "connected"
                ? `ออนไลน์พร้อมกัน ${onlineDevicesCount} เครื่อง`
                : "จัดการการใช้งานหลายเครื่อง"
            }
            title={
              liveStatus === "connected"
                ? `ออนไลน์พร้อมกัน ${onlineDevicesCount} เครื่อง${
                    cloudStatus === "connected"
                      ? ` · สำรองคลาวด์แล้ว (${cloudUserEmail || "Google"})`
                      : ""
                  }`
                : "จัดการการใช้งานพร้อมกันหลายเครื่อง & ซิงก์คลาวด์"
            }
            className={`h-9 px-2 sm:px-2.5 rounded-full text-[11.5px] font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95 border ${
              liveStatus === "connected" || cloudStatus === "connected"
                ? "bg-secondary-container/75 text-on-secondary-container border-secondary/35 hover:bg-secondary-container"
                : liveStatus === "connecting" || liveStatus === "reconnecting"
                  ? "bg-surface-container text-on-surface-variant border-outline-variant/40"
                  : "bg-surface-container-lowest text-primary border-primary/35 hover:bg-primary-fixed/40"
            }`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {liveStatus === "connected" && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  liveStatus === "connected"
                    ? "bg-secondary"
                    : liveStatus === "connecting" || liveStatus === "reconnecting"
                      ? "bg-amber-500"
                      : "bg-outline"
                }`}
              />
            </span>
            <span className="material-symbols-outlined text-[16px]">
              {cloudStatus === "connected" ? "cloud_done" : "devices"}
            </span>
            <span className="tabular-nums">
              {liveStatus === "connected" ? (
                <>
                  {onlineDevicesCount}
                  <span className="hidden sm:inline"> เครื่อง</span>
                </>
              ) : liveStatus === "connecting" || liveStatus === "reconnecting" ? (
                <span className="hidden sm:inline">กำลังเชื่อม...</span>
              ) : (
                <span className="hidden sm:inline">หลายเครื่อง</span>
              )}
            </span>
          </button>

          {role === "owner" ? (
            <button
              type="button"
              onClick={onEnterStaffMode}
              className="hidden sm:flex h-9 px-3 rounded-full bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary text-[12px] font-semibold items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">badge</span>
              <span>พนักงานเข้าใช้งาน</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTabChange("owner-auth")}
              className="hidden sm:flex h-9 px-3 rounded-full bg-primary-fixed text-on-primary-fixed hover:bg-primary hover:text-on-primary text-[12px] font-semibold items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">lock_open</span>
              <span>เข้าเจ้าของร้าน</span>
            </button>
          )}

          <button
            type="button"
            aria-label="เปิดผู้ช่วย AI"
            onClick={onOpenAiChat}
            className={`h-9 w-9 sm:w-auto sm:px-2.5 rounded-full flex items-center justify-center gap-1 text-[12px] font-semibold transition-all cursor-pointer active:scale-95 border shrink-0 ${
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
            onClick={() => {
              setOpenAccount(false);
              setOpenNoti((prev) => !prev);
            }}
            className="relative w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded-full transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {totalAlertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center tabular-nums">
                {totalAlertCount}
              </span>
            )}
          </button>

          {cloudUserEmail ? (
            <button
              type="button"
              aria-label="บัญชีที่เข้าสู่ระบบ"
              title={`บัญชีร้าน: ${cloudUserEmail}`}
              onClick={() => {
                setOpenNoti(false);
                setOpenAccount((prev) => !prev);
              }}
              className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary/40 hover:border-primary flex items-center justify-center bg-primary-fixed text-on-primary-fixed font-bold text-[13px] shrink-0 transition-all active:scale-95 cursor-pointer"
            >
              {cloudUserPhoto ? (
                <img
                  src={cloudUserPhoto}
                  alt={cloudUserName || cloudUserEmail}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>
                  {(cloudUserName || cloudUserEmail).charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          ) : (
            onConnectCloud && (
              <button
                type="button"
                disabled={cloudStatus === "connecting"}
                onClick={onConnectCloud}
                aria-label="เข้าสู่ระบบด้วย Google"
                title="เข้าสู่ระบบด้วย Google เพื่อบันทึกขึ้น Firebase"
                className="h-9 px-2.5 rounded-full bg-white hover:bg-surface-container-low text-[#1f1f1f] border border-outline-variant text-[12px] font-semibold flex items-center gap-1.5 shrink-0 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-60"
              >
                <GoogleLogoSvg className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">ล็อกอิน Google</span>
              </button>
            )
          )}

          {openAccount && cloudUserEmail && (
            <div className="fixed sm:absolute right-3 sm:right-0 top-[calc(3.75rem+env(safe-area-inset-top))] sm:top-13 w-[calc(100vw-1.5rem)] sm:w-76 max-w-sm bg-surface-container-lowest rounded-2xl sm:rounded-xl shadow-xl border border-outline-variant/60 p-3.5 z-50 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden border border-outline-variant/60 bg-primary-fixed text-on-primary-fixed font-bold flex items-center justify-center shrink-0">
                  {cloudUserPhoto ? (
                    <img
                      src={cloudUserPhoto}
                      alt={cloudUserName || cloudUserEmail}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {(cloudUserName || cloudUserEmail).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-on-surface truncate">
                    {cloudUserName || "บัญชีร้านค้า"}
                  </p>
                  <p className="text-[11.5px] text-on-surface-variant truncate">
                    {cloudUserEmail}
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-semibold">
                    <span className="material-symbols-outlined text-[12px]">
                      cloud_done
                    </span>
                    <span>บันทึกบน Firebase อัตโนมัติ</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-surface-container">
                {onSyncAllToCloud && (
                  <button
                    type="button"
                    disabled={isSyncingCloudAll}
                    onClick={() => {
                      setOpenAccount(false);
                      onSyncAllToCloud();
                    }}
                    className="w-full h-9 px-3 rounded-xl bg-primary-fixed/60 hover:bg-primary-fixed text-on-primary-fixed text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <span
                      className={`material-symbols-outlined text-[16px] ${
                        isSyncingCloudAll ? "animate-spin" : ""
                      }`}
                    >
                      {isSyncingCloudAll ? "progress_activity" : "cloud_sync"}
                    </span>
                    <span>ซิงก์ข้อมูลทั้งหมดขึ้น Firebase</span>
                  </button>
                )}
                {onDisconnectCloud && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAccount(false);
                      onDisconnectCloud();
                    }}
                    className="w-full h-9 px-3 rounded-xl bg-surface-container-low hover:bg-error-container hover:text-error text-on-surface text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      logout
                    </span>
                    <span>ออกจากระบบ</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {openNoti && (
            <div className="fixed sm:absolute right-3 sm:right-0 top-[calc(3.75rem+env(safe-area-inset-top))] sm:top-13 w-[calc(100vw-1.5rem)] sm:w-88 max-w-md bg-surface-container-lowest rounded-2xl sm:rounded-xl shadow-xl border border-outline-variant/60 p-3 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container gap-2">
                <span className="text-[14px] font-semibold text-on-surface">
                  การแจ้งเตือน ({totalAlertCount})
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                    >
                      อ่านทั้งหมด
                    </button>
                  )}
                  {role === "owner" && notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAllNotifications}
                      className="text-[11px] font-semibold text-error hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        delete_sweep
                      </span>
                      <span>ลบทั้งหมด</span>
                    </button>
                  )}
                </div>
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
                    <div
                      key={noti.id}
                      className={`p-2.5 rounded-lg transition-colors flex items-start gap-2 ${
                        noti.read
                          ? "bg-surface-container-low/50 hover:bg-surface-container-low"
                          : "bg-primary-fixed/20 hover:bg-primary-fixed/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectNotification(noti);
                          setOpenNoti(false);
                        }}
                        className="text-left flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer"
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
                      {role === "owner" && (
                        <button
                          type="button"
                          aria-label="ลบการแจ้งเตือนนี้"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNotification(noti.id);
                          }}
                          className="w-7 h-7 rounded-md hover:bg-error-container text-on-surface-variant hover:text-error flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            delete
                          </span>
                        </button>
                      )}
                    </div>
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
