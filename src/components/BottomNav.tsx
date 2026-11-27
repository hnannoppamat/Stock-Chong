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
      ? [{ id: "ai-scanner" as const, label: "สแกนบิล", icon: "document_scanner" }]
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
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-1px_8px_rgba(0,0,0,0.04)] border-t border-outline-variant/20"
    >
      <div
        className={`grid items-center h-16 px-0.5 ${
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
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-1 transition-colors cursor-pointer ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[22px] ${
                  isActive ? "material-symbols-filled" : ""
                }`}
              >
                {tab.icon}
              </span>
              <span className="text-[10px] leading-[13px] tracking-[0.01em] whitespace-nowrap truncate max-w-full">
                {tab.label}
              </span>
              {tab.badge !== undefined && (
                <span className="absolute top-1 right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-error text-on-error text-[9px] font-semibold flex items-center justify-center tabular-nums">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
