import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { RoleMode } from "../types";

export interface GroundingSource {
  title: string;
  uri: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  sources?: GroundingSource[];
  searchQueries?: string[];
  searchUsed?: boolean;
  modelUsed?: string;
}

interface AiChatWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleMode;
  ownerName: string;
  lowStockCount: number;
  storeContext: string;
}

function getHostname(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-on-surface">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-surface-container text-[12px] font-mono text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed break-words">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={index} className="flex items-start gap-2 pl-1">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span className="flex-1">{renderInlineMarkdown(bulletMatch[1])}</span>
            </div>
          );
        }

        const numberedMatch = trimmed.match(/^(\d+\.)\s+(.+)$/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex items-start gap-2 pl-1">
              <span className="font-semibold text-primary tabular-nums shrink-0">
                {numberedMatch[1]}
              </span>
              <span className="flex-1">{renderInlineMarkdown(numberedMatch[2])}</span>
            </div>
          );
        }

        const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
        if (headingMatch) {
          return (
            <p key={index} className="font-bold text-on-surface pt-1">
              {renderInlineMarkdown(headingMatch[1])}
            </p>
          );
        }

        return <p key={index}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

export function AiChatWidget({
  open,
  onOpenChange,
  role,
  ownerName,
  lowStockCount,
  storeContext,
}: AiChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [useSearch, setUseSearch] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
      return () => window.clearTimeout(timer);
    }
  }, [open, messages.length, isLoading]);

  const quickPrompts =
    role === "owner"
      ? [
          {
            label:
              lowStockCount > 0
                ? `สรุปสินค้าใกล้หมด ${lowStockCount} รายการที่ต้องสั่งเติม`
                : "สรุปภาพรวมสต็อกและสินค้าขายดีตอนนี้",
            prompt:
              lowStockCount > 0
                ? "ช่วยสรุปรายการสินค้าที่สต็อกต่ำกว่าเกณฑ์ตอนนี้ และแนะนำลำดับความสำคัญในการสั่งเติม"
                : "ช่วยสรุปภาพรวมสต็อกสินค้าและออเดอร์ของร้านตอนนี้ให้หน่อย",
            icon: "inventory_2",
            needsSearch: false,
          },
          {
            label: "เช็กเรทเงินหยวน (CNY/THB) วันนี้",
            prompt:
              "ช่วยค้นหาอัตราแลกเปลี่ยนเงินหยวนจีน (CNY) เป็นเงินบาทไทย (THB) ล่าสุดวันนี้ พร้อมเปรียบเทียบกับเรทในระบบร้านตอนนี้",
            icon: "currency_yuan",
            needsSearch: true,
          },
          {
            label: "เทียบค่าส่ง Flash / J&T / Kerry ล่าสุด",
            prompt:
              "ช่วยค้นหาและเปรียบเทียบราคาค่าส่งพัสดุเริ่มต้นล่าสุดของ Flash Express, J&T Express และ KEX (Kerry) ในไทยสำหรับส่งของออนไลน์",
            icon: "local_shipping",
            needsSearch: true,
          },
          {
            label: "ไอเดียโปรโมชันเพิ่มยอดขายสัปดาห์นี้",
            prompt:
              "จากสินค้าในคลังและออเดอร์ของร้านตอนนี้ ช่วยแนะนำโปรโมชันจัดเซ็ตหรือวิธีเพิ่มยอดขายที่ทำได้ทันทีในสัปดาห์นี้",
            icon: "campaign",
            needsSearch: false,
          },
        ]
      : [
          {
            label:
              lowStockCount > 0
                ? `เช็กสินค้าใกล้หมด (${lowStockCount} รายการ)`
                : "เช็กสถานะสินค้าในคลังตอนนี้",
            prompt: "ช่วยสรุปรายการสินค้าที่ใกล้หมดสต็อกและต้องแจ้งเจ้าของร้านตอนนี้",
            icon: "warning",
            needsSearch: false,
          },
          {
            label: "สรุปออเดอร์รอแพ็คและรอจัดส่ง",
            prompt: "ช่วยสรุปออเดอร์ที่กำลังรอแพ็คและรอจัดส่งทั้งหมดในร้านตอนนี้",
            icon: "package_2",
            needsSearch: false,
          },
          {
            label: "เช็กค่าส่ง Flash / J&T ล่าสุด",
            prompt:
              "ช่วยค้นหาอัตราค่าส่งพัสดุเริ่มต้นล่าสุดของ Flash Express และ J&T Express ในประเทศไทย",
            icon: "local_shipping",
            needsSearch: true,
          },
          {
            label: "ทริคแพ็คกระเป๋าไม่เสียทรง",
            prompt:
              "แนะนำขั้นตอนการแพ็คกระเป๋าหนังและกระเป๋าแฟชั่นให้ไม่เสียทรงและปลอดภัยระหว่างขนส่ง",
            icon: "inventory",
            needsSearch: false,
          },
        ];

  const sendMessage = async (
    rawText: string,
    overrideSearch?: boolean
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed || isLoading) return;

    const searchFlag = overrideSearch ?? useSearch;
    if (overrideSearch !== undefined && overrideSearch !== useSearch) {
      setUseSearch(overrideSearch);
    }

    const nowLabel = new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
      timestamp: nowLabel,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setErrorMsg(null);
    setLastFailedPrompt(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, text: m.text })),
          useSearch: searchFlag,
          fastMode: !searchFlag && fastMode,
          storeContext,
          roleMode: role,
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        sources?: GroundingSource[];
        searchQueries?: string[];
        searchUsed?: boolean;
        modelUsed?: string;
        error?: string;
      };

      if (!response.ok || !data.reply) {
        throw new Error(
          data.error || "ไม่สามารถเชื่อมต่อผู้ช่วย AI ได้ กรุณาลองใหม่อีกครั้ง"
        );
      }

      const aiMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: "model",
        text: data.reply,
        timestamp: new Date().toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        sources: Array.isArray(data.sources) ? data.sources : [],
        searchQueries: Array.isArray(data.searchQueries)
          ? data.searchQueries
          : [],
        searchUsed: Boolean(data.searchUsed),
        modelUsed: data.modelUsed,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดในการเชื่อมต่อผู้ช่วย AI";
      setErrorMsg(msg);
      setLastFailedPrompt(trimmed);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <>
      {/* Desktop bottom-left launcher (never collides with bottom-right inventory FABs) */}
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="เปิดผู้ช่วย AI"
          className="hidden md:flex fixed bottom-6 left-6 z-40 items-center gap-2.5 h-12 pl-3.5 pr-4 rounded-2xl bg-primary text-on-primary shadow-[0_10px_28px_rgba(174,84,130,0.28)] hover:brightness-105 active:scale-95 transition-all cursor-pointer border-2 border-secondary-fixed"
        >
          <span className="w-7 h-7 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px] material-symbols-filled">
              auto_awesome
            </span>
          </span>
          <div className="text-left leading-tight">
            <p className="text-[13px] font-bold">ผู้ช่วย AI ร้านค้า</p>
            <p className="text-[10px] text-on-primary/85 font-medium">
              ถามสต็อก + ค้นหา Google
            </p>
          </div>
        </button>
      )}

      {/* Slide-over / Floating Chat Drawer */}
      {open && (
        <div
          role="dialog"
          aria-label="ผู้ช่วย AI ร้าน DenewStock"
          className="fixed inset-0 z-[60] md:inset-auto md:bottom-6 md:right-6 md:w-[430px] md:max-w-[calc(100vw-2rem)] md:h-[640px] md:max-h-[calc(100vh-5.5rem)] bg-surface-container-lowest md:rounded-2xl shadow-[0_20px_60px_rgba(63,49,71,0.18)] md:border border-outline-variant/80 flex flex-col overflow-hidden"
        >
          {/* Top Bar */}
          <div className="px-4 py-3 pt-safe md:pt-3 bg-gradient-to-r from-primary to-primary-dim text-on-primary flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px] material-symbols-filled">
                  auto_awesome
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold leading-tight truncate">
                  ผู้ช่วย AI DenewStock
                </h2>
                <p className="text-[11px] text-on-primary/90 truncate">
                  {role === "owner"
                    ? `โหมดเจ้าของร้าน (${ownerName}) · ข้อมูลสด`
                    : "โหมดพนักงาน · ข้อมูลสต็อกและออเดอร์"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  title="ล้างประวัติการสนทนา"
                  onClick={() => {
                    setMessages([]);
                    setErrorMsg(null);
                    setLastFailedPrompt(null);
                  }}
                  className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-on-primary flex items-center justify-center transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    delete_sweep
                  </span>
                </button>
              )}
              <button
                type="button"
                aria-label="ปิดหน้าต่างแชท"
                onClick={() => onOpenChange(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-on-primary flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>
          </div>

          {/* Grounding & Speed Controls */}
          <div className="px-3.5 py-2 bg-surface-container-low border-b border-outline-variant/50 flex items-center justify-between gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setUseSearch((prev) => !prev)}
              className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                useSearch
                  ? "bg-secondary-container text-on-secondary-container border-secondary/50 shadow-xs"
                  : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/60 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                travel_explore
              </span>
              <span>Google Search</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  useSearch
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {useSearch ? "เปิด" : "ปิด"}
              </span>
            </button>

            {!useSearch ? (
              <button
                type="button"
                onClick={() => setFastMode((prev) => !prev)}
                className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition-all cursor-pointer border ${
                  fastMode
                    ? "bg-primary-fixed text-on-primary-fixed border-primary/40"
                    : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/60 hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">
                  bolt
                </span>
                <span>โหมดตอบไว</span>
              </button>
            ) : (
              <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary">
                  verified
                </span>
                <span>ค้นหาข้อมูลเว็บล่าสุดพร้อมลิงก์อ้างอิง</span>
              </span>
            )}
          </div>

          {/* Scrollable Conversation Thread */}
          <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3.5 bg-surface/60">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 shadow-xs">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-7 h-7 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-[17px]">
                        waving_hand
                      </span>
                    </span>
                    <p className="text-[14px] font-bold text-on-surface">
                      สวัสดีครับ! พร้อมช่วยดูแลร้าน DenewStock
                    </p>
                  </div>
                  <p className="text-[12.5px] text-on-surface-variant leading-relaxed">
                    สอบถามเรื่องสต็อกสินค้า ออเดอร์ค้าง สินค้าใกล้หมด หรือเปิด{" "}
                    <span className="font-semibold text-primary">
                      Google Search
                    </span>{" "}
                    {role === "owner"
                      ? "เพื่อเช็กเรทเงินหยวนวันนี้ ค่าส่งขนส่งล่าสุด และเทรนด์ตลาดได้เลยครับ"
                      : "เพื่อเช็กค่าส่งขนส่งล่าสุดและข้อมูลการแพ็คจัดส่งได้เลยครับ"}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-on-surface-variant px-1">
                    คำถามแนะนำ
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {quickPrompts.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          void sendMessage(item.prompt, item.needsSearch)
                        }
                        className="text-left p-2.5 rounded-xl bg-surface-container-lowest hover:bg-primary-fixed/40 border border-outline-variant/60 hover:border-primary/40 transition-all flex items-center gap-2.5 cursor-pointer group"
                      >
                        <span className="w-8 h-8 rounded-lg bg-surface-container text-primary group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined text-[18px]">
                            {item.icon}
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold text-on-surface truncate">
                            {item.label}
                          </p>
                          <p className="text-[10.5px] text-on-surface-variant flex items-center gap-1">
                            {item.needsSearch ? (
                              <>
                                <span className="material-symbols-outlined text-[12px] text-secondary">
                                  travel_explore
                                </span>
                                <span>ค้นหาข้อมูลล่าสุดจาก Google</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[12px] text-primary">
                                  database
                                </span>
                                <span>วิเคราะห์จากข้อมูลร้านปัจจุบัน</span>
                              </>
                            )}
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary shrink-0">
                          arrow_forward
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[88%] px-3.5 py-2.5 shadow-xs ${
                        isUser
                          ? "bg-primary text-on-primary rounded-2xl rounded-br-sm"
                          : "bg-surface-container-lowest text-on-surface border border-outline-variant/60 rounded-2xl rounded-bl-sm"
                      }`}
                    >
                      {isUser ? (
                        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>
                      ) : (
                        <FormattedMessage text={msg.text} />
                      )}

                      {/* Google Search Grounding Sources */}
                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-outline-variant/50 space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-on-secondary-container">
                            <span className="material-symbols-outlined text-[14px] text-secondary">
                              travel_explore
                            </span>
                            <span>
                              แหล่งข้อมูลจาก Google Search ({msg.sources.length})
                            </span>
                          </div>

                          {msg.searchQueries && msg.searchQueries.length > 0 && (
                            <p className="text-[10.5px] text-on-surface-variant">
                              คำค้นหา: {msg.searchQueries.join(" · ")}
                            </p>
                          )}

                          <div className="flex flex-col gap-1.5">
                            {msg.sources.slice(0, 5).map((source, idx) => (
                              <a
                                key={`${msg.id}-src-${idx}`}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-secondary-container/50 hover:bg-secondary-container border border-secondary/30 flex items-center justify-between gap-2 transition-colors group"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11.5px] font-semibold text-on-surface truncate group-hover:text-primary">
                                    {source.title}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant truncate">
                                    {getHostname(source.uri)}
                                  </p>
                                </div>
                                <span className="material-symbols-outlined text-[14px] text-on-surface-variant group-hover:text-primary shrink-0">
                                  open_in_new
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-1 px-1 flex items-center gap-1.5 text-[10px] text-on-surface-variant">
                      <span>{msg.timestamp}</span>
                      {!isUser && msg.searchUsed && (
                        <span>· Google Search</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-start">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-surface-container-lowest border border-outline-variant/60 shadow-xs flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                  <span
                    className="w-2 h-2 rounded-full bg-secondary animate-bounce"
                    style={{ animationDelay: "120ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: "240ms" }}
                  />
                  <span className="text-[12px] text-on-surface-variant font-medium">
                    {useSearch
                      ? "กำลังค้นหาข้อมูลจาก Google และเรียบเรียงคำตอบ..."
                      : "กำลังวิเคราะห์คำตอบ..."}
                  </span>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                    error
                  </span>
                  <p className="text-[12px] leading-snug break-words">
                    {errorMsg}
                  </p>
                </div>
                {lastFailedPrompt && (
                  <button
                    type="button"
                    onClick={() => void sendMessage(lastFailedPrompt)}
                    className="px-2.5 py-1 rounded-lg bg-error text-on-error text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    ลองใหม่
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-surface-container-lowest border-t border-outline-variant/60 shrink-0 pb-safe"
          >
            <div className="flex items-end gap-2 bg-surface-container-low border border-outline-variant/80 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 rounded-xl p-1.5 transition-all">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  useSearch
                    ? "ถามเรื่องร้าน หรือค้นหาข้อมูลล่าสุดจาก Google..."
                    : "พิมพ์คำถามเกี่ยวกับคลังสินค้าหรือออเดอร์..."
                }
                disabled={isLoading}
                className="flex-1 bg-transparent resize-none px-2 py-1.5 text-[13.5px] text-on-surface placeholder:text-on-surface-variant/75 focus:outline-none max-h-28"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                aria-label="ส่งข้อความ"
                className="w-9 h-9 rounded-lg bg-primary text-on-primary disabled:opacity-40 hover:brightness-105 active:scale-95 flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[19px]">
                  send
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
