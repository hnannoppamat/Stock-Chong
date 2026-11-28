import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-above-nav left-4 right-4 z-40 pointer-events-none flex justify-center"
    >
      <div className="pointer-events-auto bg-inverse-surface text-inverse-on-surface px-3.5 py-2 rounded-full shadow-lg border border-outline-variant/30 flex items-center gap-2 text-[12px] font-medium">
        <span className="material-symbols-outlined text-[16px] text-secondary-fixed">
          wifi_off
        </span>
        <span>โหมดออฟไลน์ — ข้อมูลบันทึกในเครื่องและจะซิงก์เมื่อต่อเน็ต</span>
      </div>
    </div>
  );
}
