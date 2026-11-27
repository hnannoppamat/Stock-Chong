import { useMemo, useState } from "react";
import { Customer, Order, OrderStatus } from "../types";
import { LIMITS } from "../services/firestoreService";

interface CustomersViewProps {
  customers: Customer[];
  orders: Order[];
  onCreateCustomer: (
    data: Omit<Customer, "id" | "createdAt">
  ) => void;
  onUpdateCustomer: (
    customerId: string,
    updates: Omit<Customer, "id" | "createdAt">
  ) => void;
  onDeleteCustomer: (customerId: string) => void;
  onQuickCreateOrderForCustomer: (customer: Customer) => void;
  onImportOrderCustomers: (names: string[]) => void;
}

const STATUS_META: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "รอแพ็ค",
    className: "bg-secondary-container text-on-secondary-container",
  },
  packing: {
    label: "กำลังแพ็ค",
    className: "bg-primary-fixed text-on-primary-fixed",
  },
  ready_to_ship: {
    label: "รอจัดส่ง",
    className: "bg-tertiary-fixed text-on-tertiary-fixed",
  },
  shipped: {
    label: "จัดส่งแล้ว",
    className: "bg-emerald-100 text-emerald-800",
  },
};

function matchesCustomerOrder(order: Order, customer: Customer): boolean {
  if (order.customerId && order.customerId === customer.id) return true;
  return (
    order.customerName.trim().toLowerCase() ===
    customer.name.trim().toLowerCase()
  );
}

interface CustomerFormModalProps {
  initial?: Customer | null;
  onClose: () => void;
  onSave: (data: Omit<Customer, "id" | "createdAt">) => void;
}

function CustomerFormModal({
  initial,
  onClose,
  onSave,
}: CustomerFormModalProps) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [lineId, setLineId] = useState(initial?.lineId || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("กรุณาระบุชื่อลูกค้า");
      return;
    }
    onSave({
      name: trimmedName.slice(0, LIMITS.CUSTOMER_NAME_MAX),
      phone: phone.trim().slice(0, LIMITS.CUSTOMER_PHONE_MAX) || undefined,
      lineId: lineId.trim().slice(0, LIMITS.CUSTOMER_LINE_MAX) || undefined,
      email: email.trim().slice(0, LIMITS.CUSTOMER_EMAIL_MAX) || undefined,
      address: address.trim().slice(0, LIMITS.CUSTOMER_ADDRESS_MAX) || undefined,
      note: note.trim().slice(0, LIMITS.CUSTOMER_NOTE_MAX) || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">
                {initial ? "edit" : "person_add"}
              </span>
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-on-surface">
                {initial ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"}
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                บันทึกข้อมูลติดต่อเพื่อเลือกใช้งานเร็วตอนสร้างออเดอร์
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
              ชื่อลูกค้า / ชื่อร้าน *
            </label>
            <input
              type="text"
              required
              autoFocus
              maxLength={LIMITS.CUSTOMER_NAME_MAX}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="เช่น คุณสมชาย ใจดี หรือ ร้านบิวตี้ช็อป"
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                maxLength={LIMITS.CUSTOMER_PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="081-234-5678"
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
                LINE ID / ช่องทางแชท
              </label>
              <input
                type="text"
                maxLength={LIMITS.CUSTOMER_LINE_MAX}
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                placeholder="@lineid หรือชื่อเฟซบุ๊ก"
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
              อีเมล (ไม่บังคับ)
            </label>
            <input
              type="email"
              maxLength={LIMITS.CUSTOMER_EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[14px] text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
              ที่อยู่จัดส่ง
            </label>
            <textarea
              rows={2}
              maxLength={LIMITS.CUSTOMER_ADDRESS_MAX}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์..."
              className="w-full p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-on-surface-variant mb-1">
              หมายเหตุลูกค้า
            </label>
            <textarea
              rows={2}
              maxLength={LIMITS.CUSTOMER_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ชอบส่ง Flash Express, ลูกค้าประจำ, มารับหน้าร้านทุกวันศุกร์..."
              className="w-full p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-[13px] text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {error && (
            <p className="text-[12px] text-error font-medium">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-surface-container text-on-surface font-semibold text-[14px] cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-[1.5] h-11 rounded-xl bg-primary text-on-primary font-semibold text-[14px] shadow-md active:scale-[0.98] transition-transform cursor-pointer"
            >
              {initial ? "บันทึกการแก้ไข" : "เพิ่มลูกค้า"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CustomersView({
  customers,
  orders,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onQuickCreateOrderForCustomer,
  onImportOrderCustomers,
}: CustomersViewProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      { orders: Order[]; totalSpent: number; lastOrderTime?: string }
    >();
    for (const c of customers) {
      const matched = orders.filter((o) => matchesCustomerOrder(o, c));
      const totalSpent = matched.reduce((sum, o) => sum + o.totalThb, 0);
      map.set(c.id, {
        orders: matched,
        totalSpent,
        lastOrderTime: matched[0]?.createdAt,
      });
    }
    return map;
  }, [customers, orders]);

  // Detect customers present in historical orders that aren't saved in the directory yet
  const unlinkedOrderCustomerNames = useMemo(() => {
    const existingNames = new Set(
      customers.map((c) => c.name.trim().toLowerCase())
    );
    const genericNames = new Set(["ลูกค้า walk-in", "ลูกค้าจัดส่ง", "-"]);
    const seen = new Set<string>();
    const names: string[] = [];
    for (const order of orders) {
      const clean = order.customerName.trim();
      const lower = clean.toLowerCase();
      if (
        clean &&
        !genericNames.has(lower) &&
        !existingNames.has(lower) &&
        !seen.has(lower)
      ) {
        seen.add(lower);
        names.push(clean);
      }
    }
    return names;
  }, [customers, orders]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.lineId && c.lineId.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.note && c.note.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const activeCustomer = useMemo(() => {
    if (selectedId) {
      const found = customers.find((c) => c.id === selectedId);
      if (found) return found;
    }
    return filteredCustomers[0] || customers[0] || null;
  }, [selectedId, customers, filteredCustomers]);

  const activeStats = activeCustomer
    ? customerStats.get(activeCustomer.id) ?? { orders: [], totalSpent: 0 }
    : { orders: [], totalSpent: 0 };

  const totalCustomersRevenue = useMemo(() => {
    let sum = 0;
    customerStats.forEach((s) => {
      sum += s.totalSpent;
    });
    return sum;
  }, [customerStats]);

  const activeOrderingCustomersCount = useMemo(() => {
    let count = 0;
    customerStats.forEach((s) => {
      if (s.orders.length > 0) count += 1;
    });
    return count;
  }, [customerStats]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-bold text-on-surface tracking-tight flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[21px]">
                group
              </span>
            </span>
            <span>ข้อมูลลูกค้า (Customers)</span>
          </h1>
          <p className="text-[13px] text-on-surface-variant mt-0.5">
            จัดการรายชื่อลูกค้า ข้อมูลติดต่อ และประวัติการสั่งซื้อเพื่อเลือกใช้งานไวในหน้าสร้างออเดอร์
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="h-11 px-4 rounded-xl bg-primary text-on-primary hover:brightness-105 font-semibold text-[13.5px] flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">
            person_add
          </span>
          <span>เพิ่มลูกค้าใหม่</span>
        </button>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-3 gap-2.5 md:gap-4">
        <div className="p-3.5 md:p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-xs">
          <p className="text-[11px] md:text-[12px] font-medium text-on-surface-variant">
            ลูกค้าทั้งหมด
          </p>
          <p className="text-[22px] md:text-[26px] font-bold text-primary tabular-nums mt-0.5">
            {customers.length}
            <span className="text-[12px] font-medium text-on-surface-variant ml-1">
              ราย
            </span>
          </p>
        </div>
        <div className="p-3.5 md:p-4 rounded-2xl bg-secondary-container/60 border border-secondary/35 shadow-xs">
          <p className="text-[11px] md:text-[12px] font-medium text-on-secondary-container">
            มีประวัติสั่งซื้อ
          </p>
          <p className="text-[22px] md:text-[26px] font-bold text-on-secondary-container tabular-nums mt-0.5">
            {activeOrderingCustomersCount}
            <span className="text-[12px] font-medium opacity-80 ml-1">ราย</span>
          </p>
        </div>
        <div className="p-3.5 md:p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-xs">
          <p className="text-[11px] md:text-[12px] font-medium text-on-surface-variant">
            ยอดซื้อสะสมรวม
          </p>
          <p className="text-[20px] md:text-[26px] font-bold text-on-surface tabular-nums mt-0.5 truncate">
            ฿{totalCustomersRevenue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* One-click Import Banner for Existing Order Customers */}
      {unlinkedOrderCustomerNames.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-secondary-container/75 border border-secondary/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[18px]">
                sync
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-on-secondary-container">
                พบชื่อลูกค้าจากออเดอร์เดิม {unlinkedOrderCustomerNames.length} รายที่ยังไม่ได้บันทึกในรายชื่อ
              </p>
              <p className="text-[11.5px] text-on-secondary-container/85 truncate">
                {unlinkedOrderCustomerNames.slice(0, 4).join(", ")}
                {unlinkedOrderCustomerNames.length > 4 ? " ..." : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onImportOrderCustomers(unlinkedOrderCustomerNames)}
            className="h-9 px-3.5 rounded-xl bg-primary text-on-primary text-[12px] font-semibold hover:brightness-105 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">
              download_done
            </span>
            <span>นำเข้าเป็นรายชื่อลูกค้า</span>
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/60 px-3.5 h-11 shadow-xs focus-within:border-primary">
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant mr-2">
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อลูกค้า, เบอร์โทร, LINE ID, อีเมล หรือที่อยู่..."
          className="w-full bg-transparent text-[13.5px] text-on-surface placeholder:text-on-surface-variant/65 focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="ล้างคำค้นหา"
            className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* Main Split View: Customer Directory List + Contact & Order History Detail */}
      {customers.length === 0 ? (
        <div className="p-10 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
            <span className="material-symbols-outlined text-[30px]">group</span>
          </div>
          <div>
            <p className="text-[16px] font-bold text-on-surface">
              ยังไม่มีรายชื่อลูกค้าในระบบ
            </p>
            <p className="text-[13px] text-on-surface-variant mt-1">
              เพิ่มลูกค้าประจำเพื่อเก็บข้อมูลติดต่อ ดูประวัติการสั่งซื้อ และเลือกชื่อได้ทันทีตอนสร้างออเดอร์
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary font-semibold text-[13px] flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              person_add
            </span>
            <span>เพิ่มลูกค้าคนแรก</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
          {/* Left Column: Customer List */}
          <div className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-0.5">
            {filteredCustomers.length === 0 ? (
              <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 text-center text-[13px] text-on-surface-variant">
                ไม่พบลูกค้าที่ตรงกับคำค้นหา "{search}"
              </div>
            ) : (
              filteredCustomers.map((customer) => {
                const stats = customerStats.get(customer.id) ?? {
                  orders: [],
                  totalSpent: 0,
                };
                const isSelected = activeCustomer?.id === customer.id;
                const initialChar =
                  customer.name.replace(/^คุณ/, "").trim().charAt(0) ||
                  customer.name.charAt(0) ||
                  "ล";

                return (
                  <div
                    key={customer.id}
                    onClick={() => {
                      setSelectedId(customer.id);
                      setConfirmDeleteId(null);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(customer.id);
                        setConfirmDeleteId(null);
                      }
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? "bg-primary-fixed/30 border-primary shadow-sm"
                        : "bg-surface-container-lowest border-outline-variant/50 hover:border-primary/40 hover:bg-surface-container-low/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl font-bold text-[15px] flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-primary text-on-primary"
                              : "bg-secondary-container text-on-secondary-container"
                          }`}
                        >
                          {initialChar}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-on-surface truncate">
                            {customer.name}
                          </p>
                          <p className="text-[11.5px] text-on-surface-variant truncate">
                            {customer.phone ||
                              customer.lineId ||
                              customer.email ||
                              "ยังไม่ได้ระบุเบอร์โทร"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[13px] font-bold text-primary tabular-nums block">
                          ฿{stats.totalSpent.toLocaleString()}
                        </span>
                        <span className="text-[10.5px] text-on-surface-variant tabular-nums">
                          {stats.orders.length} ออเดอร์
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-outline-variant/25">
                      <span className="text-[11px] text-on-surface-variant truncate">
                        {customer.lineId
                          ? `LINE: ${customer.lineId}`
                          : customer.address
                            ? customer.address
                            : `เพิ่มเมื่อ ${customer.createdAt}`}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickCreateOrderForCustomer(customer);
                        }}
                        className="h-7 px-2.5 rounded-lg bg-secondary-container hover:bg-secondary hover:text-on-secondary text-on-secondary-container text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          add_shopping_cart
                        </span>
                        <span>สั่งซื้อ</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Selected Customer Profile & Order History */}
          {activeCustomer && (
            <div className="flex flex-col gap-4">
              {/* Profile & Contact Card */}
              <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3.5 border-b border-surface-container">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold text-[19px] flex items-center justify-center shrink-0 shadow-sm">
                      {activeCustomer.name
                        .replace(/^คุณ/, "")
                        .trim()
                        .charAt(0) || activeCustomer.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[18px] font-bold text-on-surface truncate">
                        {activeCustomer.name}
                      </h2>
                      <p className="text-[12px] text-on-surface-variant">
                        เป็นลูกค้าตั้งแต่ {activeCustomer.createdAt} ·{" "}
                        {activeStats.orders.length} ออเดอร์ · ยอดรวม ฿
                        {activeStats.totalSpent.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onQuickCreateOrderForCustomer(activeCustomer)
                      }
                      className="h-9 px-3 rounded-xl bg-primary text-on-primary hover:brightness-105 text-[12px] font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        add_shopping_cart
                      </span>
                      <span>สร้างออเดอร์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCustomer(activeCustomer)}
                      className="h-9 px-3 rounded-xl bg-surface-container hover:bg-primary-fixed text-on-surface hover:text-on-primary-fixed text-[12px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        edit
                      </span>
                      <span>แก้ไข</span>
                    </button>
                    {confirmDeleteId === activeCustomer.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCustomer(activeCustomer.id);
                            setConfirmDeleteId(null);
                            setSelectedId(null);
                          }}
                          className="h-9 px-3 rounded-xl bg-error text-on-error text-[12px] font-semibold cursor-pointer"
                        >
                          ยืนยันลบ
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-9 px-2.5 rounded-xl bg-surface-container text-on-surface-variant text-[12px] font-medium cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="ลบข้อมูลลูกค้า"
                        onClick={() => setConfirmDeleteId(activeCustomer.id)}
                        className="w-9 h-9 rounded-xl bg-surface-container hover:bg-error-container text-on-surface-variant hover:text-error flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Contact Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/35 flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
                      call
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-on-surface-variant">
                        เบอร์โทรศัพท์
                      </p>
                      {activeCustomer.phone ? (
                        <a
                          href={`tel:${activeCustomer.phone}`}
                          className="text-[13.5px] font-semibold text-on-surface hover:text-primary transition-colors"
                        >
                          {activeCustomer.phone}
                        </a>
                      ) : (
                        <p className="text-[13px] text-on-surface-variant/60">
                          ไม่ได้ระบุ
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/35 flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
                      chat
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-on-surface-variant">
                        LINE ID / ช่องทางแชท
                      </p>
                      <p
                        className={`text-[13.5px] truncate ${
                          activeCustomer.lineId
                            ? "font-semibold text-on-surface"
                            : "text-on-surface-variant/60"
                        }`}
                      >
                        {activeCustomer.lineId || "ไม่ได้ระบุ"}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/35 flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
                      mail
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-on-surface-variant">
                        อีเมล
                      </p>
                      <p
                        className={`text-[13.5px] truncate ${
                          activeCustomer.email
                            ? "font-semibold text-on-surface"
                            : "text-on-surface-variant/60"
                        }`}
                      >
                        {activeCustomer.email || "ไม่ได้ระบุ"}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/35 flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
                      location_on
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-on-surface-variant">
                        ที่อยู่จัดส่ง
                      </p>
                      <p
                        className={`text-[13px] leading-snug ${
                          activeCustomer.address
                            ? "font-medium text-on-surface"
                            : "text-on-surface-variant/60"
                        }`}
                      >
                        {activeCustomer.address || "ไม่ได้ระบุ"}
                      </p>
                    </div>
                  </div>
                </div>

                {activeCustomer.note && (
                  <div className="p-3 rounded-xl bg-secondary-container/45 border border-secondary/30 flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-on-secondary-container shrink-0 mt-0.5">
                      sticky_note_2
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-on-secondary-container">
                        หมายเหตุลูกค้า
                      </p>
                      <p className="text-[12.5px] text-on-surface mt-0.5 leading-relaxed">
                        {activeCustomer.note}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Order History Card */}
              <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 shadow-xs flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-primary">
                      history
                    </span>
                    <span>
                      ประวัติการสั่งซื้อ ({activeStats.orders.length} ออเดอร์)
                    </span>
                  </h3>
                  <span className="text-[13px] font-bold text-primary tabular-nums">
                    รวม ฿{activeStats.totalSpent.toLocaleString()}
                  </span>
                </div>

                {activeStats.orders.length === 0 ? (
                  <div className="p-6 rounded-xl bg-surface-container-low text-center flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[28px] text-on-surface-variant/60">
                      receipt_long
                    </span>
                    <p className="text-[13px] text-on-surface-variant">
                      ยังไม่มีประวัติออเดอร์สำหรับลูกค้านี้
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onQuickCreateOrderForCustomer(activeCustomer)
                      }
                      className="mt-1 h-9 px-3.5 rounded-xl bg-primary-fixed text-on-primary-fixed hover:bg-primary hover:text-on-primary text-[12px] font-semibold transition-colors cursor-pointer"
                    >
                      + สร้างออเดอร์แรกให้ {activeCustomer.name}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {activeStats.orders.map((order) => {
                      const statusMeta = STATUS_META[order.status];
                      return (
                        <div
                          key={order.id}
                          className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-on-surface tabular-nums">
                                #{order.id}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${statusMeta.className}`}
                              >
                                {statusMeta.label}
                              </span>
                              {order.orderType && (
                                <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[10.5px] font-medium">
                                  {order.orderType === "walk_in"
                                    ? "Walk-in"
                                    : "ส่งของ"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-on-surface-variant">
                                {order.createdAt}
                              </span>
                              <span className="text-[14px] font-bold text-primary tabular-nums">
                                ฿{order.totalThb.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 pt-1.5 border-t border-outline-variant/25">
                            {order.items.map((item, idx) => (
                              <div
                                key={`${order.id}-${idx}`}
                                className="flex items-center justify-between gap-2 text-[12px]"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-on-surface truncate">
                                    {item.name}
                                  </span>
                                  {item.colorName && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container text-[10.5px] text-on-surface-variant shrink-0">
                                      <span
                                        className="w-2 h-2 rounded-full border border-black/15"
                                        style={{
                                          backgroundColor:
                                            item.colorHex || "#94a3b8",
                                        }}
                                      />
                                      <span>{item.colorName}</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-on-surface-variant tabular-nums shrink-0">
                                  x{item.quantity} · ฿
                                  {(
                                    item.quantity * item.unitPriceThb
                                  ).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>

                          {(order.trackingCode ||
                            order.carrierName ||
                            order.deliveryNote) && (
                            <div className="pt-1.5 border-t border-outline-variant/25 flex items-center gap-2 flex-wrap text-[11px] text-on-surface-variant">
                              {(order.carrierName || order.courier) && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-primary">
                                    local_shipping
                                  </span>
                                  <span>
                                    {order.carrierName || order.courier}
                                  </span>
                                </span>
                              )}
                              {order.trackingCode && (
                                <span className="font-mono text-on-surface">
                                  {order.trackingCode}
                                </span>
                              )}
                              {order.deliveryNote && (
                                <span className="italic">
                                  · โน้ต: {order.deliveryNote}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Customer Modals */}
      {showAddModal && (
        <CustomerFormModal
          onClose={() => setShowAddModal(false)}
          onSave={onCreateCustomer}
        />
      )}

      {editingCustomer && (
        <CustomerFormModal
          initial={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSave={(updates) => onUpdateCustomer(editingCustomer.id, updates)}
        />
      )}
    </div>
  );
}
