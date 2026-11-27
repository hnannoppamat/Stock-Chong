import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "", isQuotaError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || "เกิดข้อผิดพลาดที่ไม่คาดคิด";
    let displayMsg = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed.error) {
        displayMsg = `${parsed.error}${parsed.path ? ` (${parsed.operationType}: ${parsed.path})` : ""}`;
      }
    } catch {
      // plain string message
    }
    const isQuotaError = displayMsg.toLowerCase().includes("quota exceeded");
    return {
      hasError: true,
      message: displayMsg,
      isQuotaError,
    };
  }

  componentDidCatch(error: Error) {
    console.error("Application ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface-container-lowest rounded-2xl p-6 shadow-lg border border-outline-variant/40 flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-error-container text-on-error-container flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[26px]">error</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-[18px] font-semibold text-on-surface">
                {this.state.isQuotaError
                  ? "ใช้งานเกินโควตาฐานข้อมูลวันนี้"
                  : "ไม่สามารถเชื่อมต่อข้อมูลได้"}
              </h2>
              <p className="text-[13px] text-on-surface-variant break-words">
                {this.state.isQuotaError
                  ? "โควตาการใช้งานฟรีรายวันของ Firestore เต็มแล้ว ระบบจะรีเซ็ตในวันถัดไป"
                  : this.state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-xl bg-primary text-on-primary font-semibold text-[14px] cursor-pointer"
            >
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
