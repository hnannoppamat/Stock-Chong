import { RoleMode, TabId } from "../types";

interface BottomNavProps {
  role: RoleMode;
  ownerName: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  lowStockCount: number;
  pendingOrdersCount: number;
  pendingApprovalsCount: number;
}

export function BottomNav({
  role,
  ownerName,
  activeTab,
  onTabChange,
  lowStockCount,
  pendingOrdersCount,
  pendingApprovalsCount,
}: BottomNavProps) {
  const tabs: { id: TabId; label: string; icon: string; badge?: number }[] = [
    {
      id: "dashboard",
      label: "แดชบอร์ด",
      icon: "dashboard",
    },
    {
      id: "inventory",
      label: "คลังสินค้า",
      icon: "inventory_2",
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    ...(role === "owner"
      ? [{ id: "accounting" as const, label: "บัญชี", icon: "account_balance_wallet" }]
      : []),
    {
      id: "orders",
      label: "ออเดอร์",
      icon: "receipt_long",
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
    },
    {
      id: "customers",
      label: "ลูกค้า",
      icon: "group",
    },
    {
      id: "owner-auth",
      label: role === "staff" ? "พนักงาน" : "เจ้าของ",
      icon: role === "staff" ? "badge" : "admin_panel_settings",
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
  ];

  return (
    <nav
      aria-label="แถบนำทางล่าง"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface/95 backdrop-blur-xl shadow-[0_-2px_14px_rgba(225,29,116,0.08)] border-t border-outline-variant/35 select-none"
    >
      <div
        className={`grid items-center h-[64px] px-1 ${
          role === "owner" ? "grid-cols-6" : "grid-cols-5"
        }`}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[52px] px-0.5 transition-all active:scale-95 cursor-pointer ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span
                className={`relative flex items-center justify-center w-11 h-7 rounded-full transition-colors ${
                  isActive ? "bg-primary-fixed/85" : "bg-transparent"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[21px] ${
                    isActive ? "material-symbols-filled" : ""
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.badge !== undefined && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-error text-on-error text-[9px] font-bold flex items-center justify-center tabular-nums shadow-xs">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] leading-[13px] tracking-[0.01em] whitespace-nowrap truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
