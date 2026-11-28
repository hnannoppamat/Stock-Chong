import { FormEvent, useState } from "react";
import { FIREBASE_AUTH_PROVIDERS_URL } from "../firebase";

interface GoogleLoginScreenProps {
  isSigningIn: boolean;
  errorMessage: string | null;
  providerDisabled?: boolean;
  onSignInWithPassword: (username: string, password: string) => Promise<void>;
  onRegisterWithPassword: (
    username: string,
    password: string,
    storeName?: string
  ) => Promise<void>;
  onClearError?: () => void;
}

export function GoogleLoginScreen({
  isSigningIn,
  errorMessage,
  providerDisabled = false,
  onSignInWithPassword,
  onRegisterWithPassword,
  onClearError,
}: GoogleLoginScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  const busy = isSigningIn || localBusy;
  const activeError = localError || errorMessage;

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setLocalError(null);
    onClearError?.();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setLocalError(null);
    onClearError?.();

    const cleanUser = username.trim();
    if (!cleanUser) {
      setLocalError("กรุณากรอกชื่อผู้ใช้ (Username)");
      return;
    }
    if (password.length < 6) {
      setLocalError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setLocalError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setLocalBusy(true);
    try {
      if (mode === "login") {
        await onSignInWithPassword(cleanUser, password);
      } else {
        await onRegisterWithPassword(cleanUser, password, storeName.trim());
      }
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-surface text-on-surface flex flex-col items-center justify-center px-4 py-6 pt-safe pb-safe">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-5 sm:p-6 shadow-[0_14px_40px_rgba(174,84,130,0.12)] border border-outline-variant/50 flex flex-col items-center text-center gap-4">
        <div className="flex flex-col items-center gap-2.5">
          <img
            src="/icon.svg"
            alt="DenewStock"
            className="w-16 h-16 rounded-2xl shadow-md border border-outline-variant/40"
          />
          <div>
            <h1 className="text-[21px] font-bold text-primary tracking-tight">
              DenewStock
            </h1>
            <p className="text-[12.5px] text-on-surface-variant mt-0.5 leading-relaxed">
              เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านเดียวกันทุกเครื่อง เพื่อดูและซิงก์ข้อมูลร้านชุดเดียวกันแบบเรียลไทม์
            </p>
          </div>
        </div>

        {mode === "register" && (
          <div className="w-full rounded-xl bg-primary-fixed/50 border border-primary/25 px-3 py-2 text-[11.5px] font-semibold text-on-primary-fixed flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">
              admin_panel_settings
            </span>
            <span>สำหรับเจ้าของร้านตั้งค่าบัญชีร้านครั้งแรกเท่านั้น</span>
          </div>
        )}

        {/* Username + Password Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="w-full space-y-3 text-left">
          <div>
            <label
              htmlFor="login-username"
              className="block text-[12px] font-semibold text-on-surface mb-1"
            >
              ชื่อผู้ใช้ (Username)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-[19px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                person
              </span>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="เช่น denewshop หรืออีเมล"
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/60 focus:border-primary focus:bg-surface-container-lowest outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/60 transition-colors"
              />
            </div>
            {mode === "register" && (
              <p className="text-[11px] text-on-surface-variant mt-1">
                ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข หรือ . _ - (3–32 ตัวอักษร)
              </p>
            )}
          </div>

          {mode === "register" && (
            <div>
              <label
                htmlFor="login-store-name"
                className="block text-[12px] font-semibold text-on-surface mb-1"
              >
                ชื่อร้าน / ชื่อเจ้าของร้าน (ไม่บังคับ)
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[19px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  storefront
                </span>
                <input
                  id="login-store-name"
                  type="text"
                  maxLength={80}
                  disabled={busy}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="เช่น ร้าน Denew หรือ คุณธนวัฒน์"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/60 focus:border-primary focus:bg-surface-container-lowest outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/60 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="login-password"
              className="block text-[12px] font-semibold text-on-surface mb-1"
            >
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-[19px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                lock
              </span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                className="w-full h-11 pl-10 pr-11 rounded-xl bg-surface-container-low border border-outline-variant/60 focus:border-primary focus:bg-surface-container-lowest outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/60 transition-colors"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[19px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div>
              <label
                htmlFor="login-confirm-password"
                className="block text-[12px] font-semibold text-on-surface mb-1"
              >
                ยืนยันรหัสผ่านอีกครั้ง
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[19px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  verified_user
                </span>
                <input
                  id="login-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  disabled={busy}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านให้ตรงกัน"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/60 focus:border-primary focus:bg-surface-container-lowest outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/60 transition-colors"
                />
              </div>
            </div>
          )}

          {activeError && (
            <div
              role="alert"
              className="w-full rounded-xl bg-error-container text-on-error-container border border-error/25 px-3.5 py-2.5 text-[12px] text-left space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                  error
                </span>
                <span className="leading-snug">{activeError}</span>
              </div>
              {providerDisabled && (
                <div className="pl-6 text-[11.5px] space-y-1">
                  <p className="opacity-90">
                    วิธีเปิด (ทำครั้งเดียว): เปิด Firebase Console → Authentication → Sign-in method → กดเปิด <strong>Email/Password</strong> แล้วกด Save
                  </p>
                  <a
                    href={FIREBASE_AUTH_PROVIDERS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold underline"
                  >
                    <span>เปิดหน้าตั้งค่า Firebase Authentication</span>
                    <span className="material-symbols-outlined text-[14px]">
                      open_in_new
                    </span>
                  </a>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-primary hover:bg-primary-dim text-on-primary font-bold text-[15px] shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <span className="material-symbols-outlined text-[20px] animate-spin">
                  progress_activity
                </span>
                <span>
                  {mode === "login" ? "กำลังเข้าสู่ระบบ..." : "กำลังสร้างบัญชีร้าน..."}
                </span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">
                  {mode === "login" ? "login" : "person_add"}
                </span>
                <span>
                  {mode === "login"
                    ? "เข้าสู่ระบบด้วยชื่อผู้ใช้"
                    : "สร้างบัญชีและเข้าใช้งาน"}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Sync guarantee note */}
        <div className="w-full bg-surface-container-low rounded-2xl p-3 text-left space-y-1.5 border border-outline-variant/35">
          <div className="flex items-center gap-2 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[17px] text-secondary shrink-0">
              devices
            </span>
            <span>ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกันทุกเครื่อง ข้อมูลสต็อกและออเดอร์จะตรงกันทันที</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[17px] text-primary shrink-0">
              lock
            </span>
            <span>ข้อมูลผูกเฉพาะบัญชีนี้ บัญชีอื่นไม่สามารถเข้ามาดูข้อมูลร้านของคุณได้</span>
          </div>
        </div>

        <div className="w-full pt-1 border-t border-outline-variant/30 text-center">
          {mode === "login" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => switchMode("register")}
              className="text-[12px] text-on-surface-variant hover:text-primary font-medium py-1.5 px-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              เจ้าของร้านใช้งานครั้งแรก?{" "}
              <span className="font-bold text-primary underline underline-offset-2">
                สร้างบัญชีร้านใหม่
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => switchMode("login")}
              className="text-[12px] text-on-surface-variant hover:text-primary font-medium py-1.5 px-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              มีบัญชีร้านอยู่แล้ว?{" "}
              <span className="font-bold text-primary underline underline-offset-2">
                กลับไปหน้าเข้าสู่ระบบ
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
