import { useEffect, useState } from "react";
import { AiChatWidget } from "./components/AiChatWidget";
import { AiScannerView } from "./components/AiScannerView";
import { BottomNav } from "./components/BottomNav";
import { CustomersView } from "./components/CustomersView";
import { Header } from "./components/Header";
import { InventoryView } from "./components/InventoryView";
import {
  AddProductModal,
  CreateOrderModal,
  DeliveryConfirmModal,
  EditProductModal,
  PrintLabelModal,
} from "./components/Modals";
import { OrdersView } from "./components/OrdersView";
import { OwnerAuthView } from "./components/OwnerAuthView";
import {
  INITIAL_APPROVALS,
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_INVOICE,
  INITIAL_NOTIFICATIONS,
  INITIAL_ORDERS,
  INITIAL_PRODUCTS,
  LEGACY_DEFAULT_CATEGORIES,
} from "./data/initialData";
import {
  AppNotification,
  CourierName,
  Customer,
  DeliveryConfirmationMethod,
  Order,
  OrderFulfillmentType,
  OrderItem,
  OrdersTab,
  ProductItem,
  RoleMode,
  ScannedBillItem,
  ScannedInvoice,
  ShippingOption,
  StockApprovalRequest,
  TabId,
} from "./types";

const DEFAULT_OWNER_NAME = "คุณธนวัฒน์";
const DEFAULT_OWNER_PIN = "123456";
const STORAGE_KEY = "denewstock_store_v1";

interface PersistedStore {
  ownerName: string;
  ownerPin: string;
  categories: string[];
  products: ProductItem[];
  orders: Order[];
  customers: Customer[];
  approvals: StockApprovalRequest[];
  notifications: AppNotification[];
  exchangeRate: number;
  freightCost: number;
  splitByQty: boolean;
  autoSave: boolean;
}

function isLegacyOnlyCategories(cats: unknown): boolean {
  if (!Array.isArray(cats) || cats.length === 0) return true;
  return cats.every(
    (c) => typeof c === "string" && LEGACY_DEFAULT_CATEGORIES.includes(c)
  );
}

function loadInitialStore(): PersistedStore {
  const defaults: PersistedStore = {
    ownerName: DEFAULT_OWNER_NAME,
    ownerPin: DEFAULT_OWNER_PIN,
    categories: INITIAL_CATEGORIES,
    products: INITIAL_PRODUCTS,
    orders: INITIAL_ORDERS,
    customers: INITIAL_CUSTOMERS,
    approvals: INITIAL_APPROVALS,
    notifications: INITIAL_NOTIFICATIONS,
    exchangeRate: 4.95,
    freightCost: 1250,
    splitByQty: true,
    autoSave: true,
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedStore>;

    const categories = isLegacyOnlyCategories(parsed.categories)
      ? INITIAL_CATEGORIES
      : (parsed.categories as string[]);

    const ownerPin =
      typeof parsed.ownerPin === "string" && /^\d{6}$/.test(parsed.ownerPin)
        ? parsed.ownerPin
        : DEFAULT_OWNER_PIN;

    return {
      ownerName:
        typeof parsed.ownerName === "string" && parsed.ownerName.trim()
          ? parsed.ownerName.trim()
          : DEFAULT_OWNER_NAME,
      ownerPin,
      categories,
      products: Array.isArray(parsed.products)
        ? parsed.products
        : INITIAL_PRODUCTS,
      orders: Array.isArray(parsed.orders) ? parsed.orders : INITIAL_ORDERS,
      customers: Array.isArray(parsed.customers)
        ? parsed.customers
        : INITIAL_CUSTOMERS,
      approvals: Array.isArray(parsed.approvals)
        ? parsed.approvals
        : INITIAL_APPROVALS,
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications
        : INITIAL_NOTIFICATIONS,
      exchangeRate:
        typeof parsed.exchangeRate === "number" &&
        Number.isFinite(parsed.exchangeRate)
          ? parsed.exchangeRate
          : 4.95,
      freightCost:
        typeof parsed.freightCost === "number" &&
        Number.isFinite(parsed.freightCost)
          ? parsed.freightCost
          : 1250,
      splitByQty:
        typeof parsed.splitByQty === "boolean" ? parsed.splitByQty : true,
      autoSave: typeof parsed.autoSave === "boolean" ? parsed.autoSave : true,
    };
  } catch {
    return defaults;
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function App() {
  const [initialStore] = useState<PersistedStore>(() => loadInitialStore());

  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  // Open directly in Staff mode without any login screen; Owner mode unlocks via 6-digit PIN
  const [role, setRole] = useState<RoleMode>("staff");
  const [ownerName, setOwnerName] = useState<string>(initialStore.ownerName);
  const [ownerPin, setOwnerPin] = useState<string>(initialStore.ownerPin);
  const [products, setProducts] = useState<ProductItem[]>(
    initialStore.products
  );
  const [categories, setCategories] = useState<string[]>(
    initialStore.categories
  );
  const [orders, setOrders] = useState<Order[]>(initialStore.orders);
  const [customers, setCustomers] = useState<Customer[]>(
    initialStore.customers
  );
  const [approvals, setApprovals] = useState<StockApprovalRequest[]>(
    initialStore.approvals
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(
    initialStore.notifications
  );
  const [invoice, setInvoice] = useState<ScannedInvoice>(INITIAL_INVOICE);
  const [exchangeRate, setExchangeRate] = useState<number>(
    initialStore.exchangeRate
  );
  const [freightCost, setFreightCost] = useState<number>(
    initialStore.freightCost
  );
  const [splitByQty, setSplitByQty] = useState<boolean>(
    initialStore.splitByQty
  );
  const [autoSave, setAutoSave] = useState<boolean>(initialStore.autoSave);

  const [activeOrderTab, setActiveOrderTab] = useState<OrdersTab>("pending");
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [preselectedOrderCustomer, setPreselectedOrderCustomer] =
    useState<Customer | null>(null);
  const [preselectedOrderProduct, setPreselectedOrderProduct] =
    useState<ProductItem | null>(null);
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string>("เมื่อสักครู่");

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(
    null
  );
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [confirmingDeliveryOrder, setConfirmingDeliveryOrder] =
    useState<Order | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    icon: string;
  }>({ visible: false, message: "", icon: "check_circle" });

  const stampSynced = () => {
    const now = new Date();
    setLastSyncedLabel(
      now.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  // Auto-persist store state to localStorage
  useEffect(() => {
    try {
      const payload: PersistedStore = {
        ownerName,
        ownerPin,
        categories,
        products,
        orders,
        customers,
        approvals,
        notifications,
        exchangeRate,
        freightCost,
        splitByQty,
        autoSave,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      stampSynced();
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [
    ownerName,
    ownerPin,
    categories,
    products,
    orders,
    customers,
    approvals,
    notifications,
    exchangeRate,
    freightCost,
    splitByQty,
    autoSave,
  ]);

  // Bill scanner and weekly sales chart are restricted to Owner mode only
  useEffect(() => {
    if (role === "staff" && activeTab === "ai-scanner") {
      setActiveTab("inventory");
    }
    if (role === "staff" && activeOrderTab === "weekly_chart") {
      setActiveOrderTab("pending");
    }
  }, [role, activeTab, activeOrderTab]);

  const showToast = (message: string, icon = "check_circle") => {
    setToast({ visible: true, message, icon });
    window.clearTimeout((window as unknown as { _sfToast?: number })._sfToast);
    (window as unknown as { _sfToast?: number })._sfToast = window.setTimeout(
      () => {
        setToast((prev) => ({ ...prev, visible: false }));
      },
      2600
    );
  };

  const pushNotification = (
    title: string,
    detail: string,
    type: AppNotification["type"]
  ) => {
    const noti: AppNotification = {
      id: makeId("noti"),
      title,
      detail,
      time: "เมื่อสักครู่",
      type,
      read: false,
    };
    setNotifications((prev) => [noti, ...prev].slice(0, 50));
  };

  const pendingOrdersCount = orders.filter((o) => o.status === "pending").length;
  const packingOrdersCount = orders.filter((o) => o.status === "packing").length;
  const readyToShipOrdersCount = orders.filter(
    (o) => o.status === "ready_to_ship"
  ).length;
  const shippedOrdersCount = orders.filter((o) => o.status === "shipped").length;
  const pendingApprovalsCount = approvals.filter(
    (a) => a.status === "pending"
  ).length;
  const lowStockProducts = products
    .filter((p) => p.stock < p.lowThreshold)
    .sort((a, b) => {
      const ratioA = a.lowThreshold > 0 ? a.stock / a.lowThreshold : 0;
      const ratioB = b.lowThreshold > 0 ? b.stock / b.lowThreshold : 0;
      return ratioA - ratioB;
    });

  const totalStockUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const totalOrdersRevenue = orders.reduce((sum, o) => sum + o.totalThb, 0);

  const aiStoreContext = [
    `วันที่ปัจจุบัน: ${new Date().toLocaleDateString("th-TH", {
      dateStyle: "medium",
    })}`,
    `โหมดผู้ใช้งาน: ${role === "owner" ? `เจ้าของร้าน (${ownerName})` : "พนักงานหน้าร้าน"}`,
    `ภาพรวมคลังสินค้า: ${products.length} รายการ (SKU), รวม ${totalStockUnits} ชิ้น, สินค้าต่ำกว่าเกณฑ์ต้องสั่งเติม ${lowStockProducts.length} รายการ`,
    ...(role === "owner"
      ? [
          `การตั้งค่านำเข้า (เฉพาะเจ้าของร้าน): อัตราแลกเปลี่ยนปัจจุบัน ${exchangeRate} บาท/หยวน, ค่าขนส่งจีน-ไทยตั้งต้น ฿${freightCost.toLocaleString()}`,
        ]
      : []),
    `สรุปออเดอร์: ทั้งหมด ${orders.length} ออเดอร์ (รอแพ็ค ${pendingOrdersCount}, กำลังแพ็ค ${packingOrdersCount}, รอจัดส่ง ${readyToShipOrdersCount}, จัดส่งแล้ว ${shippedOrdersCount}) ยอดขายรวม ฿${totalOrdersRevenue.toLocaleString()}`,
    lowStockProducts.length > 0
      ? `รายการสินค้าใกล้หมด (stock < lowThreshold):\n${lowStockProducts
          .map(
            (p) =>
              `- ${p.name} (${p.sku}): คงเหลือ ${p.stock} ชิ้น (ขั้นต่ำ ${p.lowThreshold} ชิ้น), ราคาขาย ฿${p.sellPriceThb}${
                role === "owner"
                  ? `, ต้นทุนนำเข้า ฿${p.landedCostThb}${
                      p.cnyUnitPrice ? ` (¥${p.cnyUnitPrice})` : ""
                    }`
                  : ""
              }`
          )
          .join("\n")}`
      : "รายการสินค้าใกล้หมด: ไม่มี (สต็อกทุกรายการอยู่ในเกณฑ์ปกติ)",
    `รายการสินค้าในคลัง (สูงสุด 35 รายการ):\n${products
      .slice(0, 35)
      .map((p) => {
        const colorInfo =
          p.colors && p.colors.length > 0
            ? ` [สี: ${p.colors
                .map((c) =>
                  typeof c.stock === "number" ? `${c.name}(${c.stock})` : c.name
                )
                .join(", ")}]`
            : "";
        return `- ${p.sku} | ${p.name} | หมวด: ${p.category} | คงเหลือ ${p.stock} (ขั้นต่ำ ${p.lowThreshold}) | ขาย ฿${p.sellPriceThb}${
          role === "owner" ? ` | ทุน ฿${p.landedCostThb}` : ""
        }${colorInfo}`;
      })
      .join("\n")}`,
    orders.length > 0
      ? `รายการออเดอร์ล่าสุด (สูงสุด 15 ออเดอร์):\n${orders
          .slice(0, 15)
          .map(
            (o) =>
              `- #${o.id} | ลูกค้า: ${o.customerName} | ประเภท: ${
                o.orderType === "walk_in" ? "Walk-in" : "ส่งของ"
              } | สถานะ: ${o.status} | ยอด ฿${o.totalThb.toLocaleString()} | รายการ: ${o.items
                .map(
                  (i) =>
                    `${i.name}${i.colorName ? `(${i.colorName})` : ""} x${i.quantity}`
                )
                .join(", ")}`
          )
          .join("\n")}`
      : "รายการออเดอร์: ยังไม่มีออเดอร์ในระบบ",
  ].join("\n\n");

  const handleQuickCreateOrder = () => {
    setPreselectedOrderCustomer(null);
    setPreselectedOrderProduct(null);
    setShowCreateOrderModal(true);
  };

  const handleQuickCreateOrderForCustomer = (customer: Customer) => {
    setPreselectedOrderProduct(null);
    setPreselectedOrderCustomer(customer);
    setShowCreateOrderModal(true);
  };

  const handleQuickCreateOrderForProduct = (product: ProductItem) => {
    setPreselectedOrderCustomer(null);
    setPreselectedOrderProduct(product);
    setShowCreateOrderModal(true);
  };

  const handleTabChange = (nextTab: TabId) => {
    if (nextTab === "ai-scanner" && role !== "owner") {
      setActiveTab("inventory");
      return;
    }
    setActiveTab(nextTab);
  };

  const handleRoleChange = (
    nextRole: RoleMode,
    toastMsg: string,
    icon: string
  ) => {
    setRole(nextRole);
    if (nextRole === "staff" && activeTab === "ai-scanner") {
      setActiveTab("inventory");
    }
    showToast(toastMsg, icon);
  };

  const handleSaveScanToInventory = (
    items: ScannedBillItem[],
    rate: number,
    freightPerUnit: number
  ) => {
    let importedUnits = 0;

    setProducts((prev) => {
      const next = [...prev];
      items.forEach((scanned) => {
        importedUnits += scanned.quantity;
        const landedCost = Number(
          (scanned.unitPriceCny * rate + freightPerUnit).toFixed(2)
        );
        const existingIdx = next.findIndex(
          (p) => p.sku.toLowerCase() === scanned.sku.toLowerCase()
        );
        if (existingIdx >= 0) {
          const existing = next[existingIdx];
          next[existingIdx] = {
            ...existing,
            stock: existing.stock + scanned.quantity,
            landedCostThb: landedCost,
            cnyUnitPrice: scanned.unitPriceCny,
            freightPerUnitThb: Number(freightPerUnit.toFixed(2)),
            imageUrl: scanned.imageUrl || existing.imageUrl,
            updatedAt: "เมื่อสักครู่",
          };
        } else {
          next.unshift({
            id: makeId("prod"),
            name: scanned.thaiName,
            sku: scanned.sku,
            origin: "cn",
            category:
              scanned.category || categories[0] || INITIAL_CATEGORIES[0],
            stock: scanned.quantity,
            lowThreshold: 15,
            landedCostThb: landedCost,
            cnyUnitPrice: scanned.unitPriceCny,
            freightPerUnitThb: Number(freightPerUnit.toFixed(2)),
            sellPriceThb: Math.ceil((landedCost * 1.9) / 10) * 10 - 1,
            imageUrl: scanned.imageUrl,
            updatedAt: "เมื่อสักครู่",
          });
        }
      });
      return next;
    });

    showToast(
      role === "owner"
        ? `นำเข้าสต็อก ${importedUnits} ชิ้น และอัปเดตต้นทุนเรียบร้อยแล้ว`
        : `นำเข้าสต็อก ${importedUnits} ชิ้นเรียบร้อยแล้ว`,
      "inventory_2"
    );
    pushNotification(
      "นำเข้าสินค้าจากบิลสำเร็จ",
      `นำเข้า ${items.length} รายการ (${importedUnits} ชิ้น) จาก ${invoice.code}`,
      "stock"
    );
  };

  const handleAddProduct = (newProd: Omit<ProductItem, "id" | "updatedAt">) => {
    const created: ProductItem = {
      ...newProd,
      id: makeId("prod"),
      updatedAt: "เมื่อสักครู่",
    };
    setProducts((prev) => [created, ...prev]);
    showToast(`เพิ่มสินค้า "${newProd.name}" เข้าคลังแล้ว`, "add_box");
  };

  const handleAddCategory = (categoryName: string) => {
    if (categories.includes(categoryName)) return;
    setCategories((prev) => [...prev, categoryName]);
    showToast(`เพิ่มหมวดหมู่ "${categoryName}" แล้ว`, "category");
  };

  const handleUpdateProductOwner = (updated: ProductItem) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === updated.id
          ? {
              ...p,
              stock: updated.stock,
              sellPriceThb: updated.sellPriceThb,
              landedCostThb: updated.landedCostThb,
              updatedAt: "เมื่อสักครู่",
            }
          : p
      )
    );
    showToast(`อัปเดตสต็อก ${updated.name} เป็น ${updated.stock} ชิ้น`, "save");
  };

  const handleRequestStockChange = (
    product: ProductItem,
    requestedStock: number,
    reason: string
  ) => {
    const req: StockApprovalRequest = {
      id: `REQ-${Date.now().toString().slice(-5)}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      requestedBy: "พนักงานหน้าร้าน",
      currentStock: product.stock,
      requestedStock,
      reason,
      createdAt: new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "pending",
    };
    setApprovals((prev) => [req, ...prev]);
    pushNotification(
      "คำขออนุมัติปรับสต็อกใหม่",
      `${product.sku}: ขอปรับ ${product.stock} → ${requestedStock} ชิ้น`,
      "approval"
    );
    showToast("ส่งคำขออนุมัติไปยังเจ้าของร้านแล้ว", "send");
  };

  const handleApproveStockRequest = (reqId: string, approve: boolean) => {
    const target = approvals.find((r) => r.id === reqId);
    if (!target) return;

    setApprovals((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? { ...r, status: approve ? "approved" : "rejected" }
          : r
      )
    );

    if (approve) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === target.productId
            ? {
                ...p,
                stock: target.requestedStock,
                updatedAt: "เมื่อสักครู่",
              }
            : p
        )
      );
      showToast(
        `อนุมัติปรับสต็อก ${target.sku} เป็น ${target.requestedStock} ชิ้นแล้ว`,
        "check_circle"
      );
    } else {
      showToast(`ปฏิเสธคำขอปรับสต็อก ${target.sku} แล้ว`, "cancel");
    }
  };

  const handleToggleItemPicked = (orderId: string, itemIndex: number) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId || order.status === "shipped") return order;
        return {
          ...order,
          items: order.items.map((item, idx) =>
            idx === itemIndex ? { ...item, picked: !item.picked } : item
          ),
        };
      })
    );
  };

  const handleConfirmPack = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== "pending") return;

    // Aggregate stock deductions per product (including per-color quantities)
    const deductionsByProduct = new Map<
      string,
      { totalQty: number; byColor: Map<string, number> }
    >();
    order.items.forEach((orderItem) => {
      const prod = products.find(
        (p) => p.id === orderItem.productId || p.sku === orderItem.sku
      );
      if (!prod) return;
      const entry = deductionsByProduct.get(prod.id) ?? {
        totalQty: 0,
        byColor: new Map<string, number>(),
      };
      entry.totalQty += orderItem.quantity;
      if (orderItem.colorName) {
        entry.byColor.set(
          orderItem.colorName,
          (entry.byColor.get(orderItem.colorName) ?? 0) + orderItem.quantity
        );
      }
      deductionsByProduct.set(prod.id, entry);
    });

    setProducts((prev) =>
      prev.map((prod) => {
        const deduction = deductionsByProduct.get(prod.id);
        if (!deduction) return prod;
        const nextStock = Math.max(0, prod.stock - deduction.totalQty);
        const updatedColors = prod.colors?.map((c) => {
          const colorDeduct = deduction.byColor.get(c.name) ?? 0;
          if (colorDeduct > 0 && typeof c.stock === "number") {
            return { ...c, stock: Math.max(0, c.stock - colorDeduct) };
          }
          return c;
        });
        return {
          ...prod,
          stock: nextStock,
          ...(updatedColors ? { colors: updatedColors } : {}),
          updatedAt: "ตัดสต็อกอัตโนมัติ",
        };
      })
    );

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "packing",
              items: o.items.map((i) => ({ ...i, picked: true })),
            }
          : o
      )
    );
    showToast(`แพ็ค #${orderId} สำเร็จ — ตัดสต็อกอัตโนมัติแล้ว`, "check_circle");
  };

  const handleMarkReadyToShip = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== "packing") return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "ready_to_ship" } : o
      )
    );
    showToast(`ออเดอร์ #${orderId} พร้อมจัดส่งแล้ว (สถานะรอจัดส่ง)`, "outbox");
  };

  const handleConfirmShip = (
    orderId: string,
    options: {
      shippingOption: ShippingOption;
      carrierName?: string;
      courier?: CourierName;
      trackingCode?: string;
    }
  ) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.status !== "ready_to_ship") return;

    const isCarrier = options.shippingOption === "carrier";
    const tracking = isCarrier
      ? options.trackingCode ||
        `TH${Math.floor(100000000 + Math.random() * 900000000)}A`
      : options.trackingCode;

    const updatedOrder: Order = {
      ...targetOrder,
      status: "shipped",
      shippingOption: options.shippingOption,
      carrierName: options.carrierName,
      courier: options.courier,
      trackingCode: tracking,
    };

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? updatedOrder : o))
    );

    const toastSummary =
      options.shippingOption === "store_delivery"
        ? `ยืนยันส่งถึงหน้าร้าน #${orderId} แล้ว`
        : options.shippingOption === "store_pickup"
          ? `ยืนยันลูกค้ามารับหน้าร้าน #${orderId} แล้ว`
          : `จัดส่ง #${orderId} แล้ว (${options.carrierName || options.courier || "ขนส่ง"}: ${tracking})`;

    showToast(toastSummary, "local_shipping");
    setConfirmingDeliveryOrder(updatedOrder);
  };

  const handleConfirmDelivery = (payload: {
    orderId: string;
    method: DeliveryConfirmationMethod;
    proofImage?: string;
    cashReceivedThb?: number;
    note?: string;
  }) => {
    const confirmedTime = new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    setOrders((prev) =>
      prev.map((o) =>
        o.id === payload.orderId
          ? {
              ...o,
              deliveryConfirmationMethod: payload.method,
              deliveryProofImage: payload.proofImage,
              cashReceivedThb: payload.cashReceivedThb,
              deliveryNote: payload.note,
              deliveryConfirmedAt: confirmedTime,
            }
          : o
      )
    );

    showToast(
      payload.method === "cash"
        ? `บันทึกชำระเงินสด #${payload.orderId} เรียบร้อยแล้ว`
        : `บันทึกรูปยืนยันการจัดส่ง #${payload.orderId} เรียบร้อยแล้ว`,
      payload.method === "cash" ? "payments" : "photo_camera"
    );
  };

  const handleCreateOrder = (
    customerName: string,
    items: OrderItem[],
    orderType: OrderFulfillmentType,
    customerId?: string
  ) => {
    const totalThb = items.reduce(
      (sum, i) => sum + i.quantity * i.unitPriceThb,
      0
    );
    const newId = `ORD-${Math.floor(202504 + Math.random() * 8000)}`;
    const newOrder: Order = {
      id: newId,
      ...(customerId ? { customerId } : {}),
      customerName,
      orderType,
      status: "pending",
      totalThb,
      createdAt: new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      items,
    };
    setOrders((prev) => [newOrder, ...prev]);
    setPreselectedOrderCustomer(null);
    setPreselectedOrderProduct(null);
    setActiveOrderTab("pending");
    setActiveTab("orders");
    const typeLabel = orderType === "walk_in" ? "Walk-in" : "ส่งของ";
    pushNotification(
      `ออเดอร์ใหม่ #${newId} (${typeLabel})`,
      `${customerName} · ฿${totalThb.toLocaleString()}`,
      "order"
    );
    showToast(`สร้างออเดอร์ #${newId} (${typeLabel}) สำเร็จ`, "add_shopping_cart");
  };

  const handleCreateCustomer = (data: Omit<Customer, "id" | "createdAt">) => {
    const newCustomer: Customer = {
      ...data,
      id: makeId("cust"),
      createdAt: new Date().toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    showToast(`เพิ่มลูกค้า "${data.name}" เรียบร้อยแล้ว`, "person_add");
  };

  const handleUpdateCustomer = (
    customerId: string,
    updates: Omit<Customer, "id" | "createdAt">
  ) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              name: updates.name,
              phone: updates.phone || "",
              lineId: updates.lineId || "",
              email: updates.email || "",
              address: updates.address || "",
              note: updates.note || "",
            }
          : c
      )
    );
    showToast(`อัปเดตข้อมูล "${updates.name}" แล้ว`, "save");
  };

  const handleDeleteCustomer = (customerId: string) => {
    const target = customers.find((c) => c.id === customerId);
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    showToast(
      `ลบลูกค้า "${target?.name || ""}" ออกจากรายชื่อแล้ว`,
      "person_remove"
    );
  };

  const handleImportOrderCustomers = (names: string[]) => {
    const createdAt = new Date().toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
    const imported: Customer[] = names.map((name, idx) => ({
      id: `${makeId("cust")}-${idx}`,
      name,
      createdAt,
    }));
    setCustomers((prev) => [...imported, ...prev]);
    showToast(`นำเข้าลูกค้าจากออเดอร์เดิม ${names.length} รายแล้ว`, "group_add");
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      <Header
        role={role}
        ownerName={ownerName}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onEnterStaffMode={() =>
          handleRoleChange("staff", "เข้าสู่โหมดพนักงานแล้ว", "badge")
        }
        onOpenAiChat={() => setAiChatOpen((prev) => !prev)}
        isAiChatOpen={aiChatOpen}
        lowStockProducts={lowStockProducts}
        onSelectLowStockProduct={(prod) => {
          setActiveTab("inventory");
          setEditingProduct(prod);
        }}
        notifications={notifications}
        onMarkAllRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
        onSelectNotification={(noti) => {
          if (!noti.read) {
            setNotifications((prev) =>
              prev.map((n) => (n.id === noti.id ? { ...n, read: true } : n))
            );
          }
          if (noti.type === "order") setActiveTab("orders");
          else if (noti.type === "stock") setActiveTab("inventory");
          else if (noti.type === "approval") setActiveTab("owner-auth");
        }}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 pt-18 md:pt-20 pb-24 md:pb-10">
        {role === "owner" && activeTab === "ai-scanner" && (
          <AiScannerView
            role={role}
            invoice={invoice}
            onUpdateInvoice={setInvoice}
            exchangeRate={exchangeRate}
            onExchangeRateChange={setExchangeRate}
            freightCost={freightCost}
            onFreightCostChange={setFreightCost}
            splitByQty={splitByQty}
            onSplitByQtyChange={setSplitByQty}
            autoSave={autoSave}
            onAutoSaveChange={setAutoSave}
            pendingCount={pendingOrdersCount}
            packingCount={packingOrdersCount}
            readyToShipCount={readyToShipOrdersCount}
            shippedCount={shippedOrdersCount}
            onQuickCreateOrder={handleQuickCreateOrder}
            onGoToOrders={() => setActiveTab("orders")}
            onOpenAddProduct={() => setShowAddProductModal(true)}
            onSaveToInventory={handleSaveScanToInventory}
            onToggleRoleMode={() => {
              if (role === "owner") {
                handleRoleChange("staff", "สลับเป็นโหมดพนักงานแล้ว", "badge");
              } else {
                setActiveTab("owner-auth");
              }
            }}
            onNotify={showToast}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryView
            role={role}
            products={products}
            orders={orders}
            categories={categories}
            lastSyncedLabel={lastSyncedLabel}
            onSyncNow={() => {
              stampSynced();
              showToast("บันทึกข้อมูลสต็อกลงเครื่องเรียบร้อยแล้ว", "save");
            }}
            onQuickCreateOrder={handleQuickCreateOrder}
            onQuickCreateOrderForProduct={handleQuickCreateOrderForProduct}
            onNavigateOrdersWithTab={(tab) => {
              setActiveOrderTab(tab);
              setActiveTab("orders");
            }}
            onConfirmPack={handleConfirmPack}
            onMarkReadyToShip={handleMarkReadyToShip}
            onNavigateScanner={() => setActiveTab("ai-scanner")}
            onOpenAddProduct={() => setShowAddProductModal(true)}
            onSelectProduct={(prod) => setEditingProduct(prod)}
          />
        )}

        {activeTab === "orders" && (
          <OrdersView
            role={role}
            orders={orders}
            activeOrderTab={activeOrderTab}
            onTabChange={setActiveOrderTab}
            onOpenCreateOrder={() => {
              setPreselectedOrderCustomer(null);
              setPreselectedOrderProduct(null);
              setShowCreateOrderModal(true);
            }}
            onToggleItemPicked={handleToggleItemPicked}
            onConfirmPack={handleConfirmPack}
            onMarkReadyToShip={handleMarkReadyToShip}
            onConfirmShip={handleConfirmShip}
            onOpenPrintLabel={(order) => setPrintingOrder(order)}
            onOpenDeliveryConfirm={(order) => setConfirmingDeliveryOrder(order)}
          />
        )}

        {activeTab === "customers" && (
          <CustomersView
            customers={customers}
            orders={orders}
            onCreateCustomer={handleCreateCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onQuickCreateOrderForCustomer={handleQuickCreateOrderForCustomer}
            onImportOrderCustomers={handleImportOrderCustomers}
          />
        )}

        {activeTab === "owner-auth" && (
          <OwnerAuthView
            role={role}
            ownerName={ownerName}
            onUpdateOwnerName={(newName) => {
              setOwnerName(newName);
              showToast(`อัปเดตชื่อเจ้าของร้านเป็น "${newName}" แล้ว`, "badge");
            }}
            ownerPin={ownerPin}
            onChangeOwnerPin={(newPin) => {
              setOwnerPin(newPin);
              showToast("เปลี่ยนรหัสผ่านเจ้าของร้านเรียบร้อยแล้ว", "key");
            }}
            pendingCount={pendingOrdersCount}
            packingCount={packingOrdersCount}
            readyToShipCount={readyToShipOrdersCount}
            shippedCount={shippedOrdersCount}
            approvalRequests={approvals}
            onQuickCreateOrder={handleQuickCreateOrder}
            onGoToOrders={() => setActiveTab("orders")}
            onAuthenticateOwner={() =>
              handleRoleChange(
                "owner",
                "ปลดล็อกโหมดเจ้าของร้านแล้ว",
                "admin_panel_settings"
              )
            }
            onSwitchToStaff={() =>
              handleRoleChange("staff", "เข้าสู่โหมดพนักงานแล้ว", "badge")
            }
            onApproveStockRequest={handleApproveStockRequest}
            onNotify={showToast}
          />
        )}
      </main>

      <BottomNav
        role={role}
        ownerName={ownerName}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        lowStockCount={lowStockProducts.length}
        pendingOrdersCount={pendingOrdersCount}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      {/* Toast Notification */}
      <div
        className={`fixed bottom-20 md:bottom-6 left-4 right-4 z-50 pointer-events-none transition-all duration-200 flex justify-center ${
          toast.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2"
        }`}
      >
        <div className="bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 max-w-sm w-full">
          <span className="material-symbols-outlined text-secondary-fixed-dim text-[20px]">
            {toast.icon}
          </span>
          <span className="text-[13px] flex-1">{toast.message}</span>
        </div>
      </div>

      {/* Modals */}
      {showAddProductModal && (
        <AddProductModal
          role={role}
          categories={categories}
          onAddCategory={handleAddCategory}
          onClose={() => setShowAddProductModal(false)}
          onSave={handleAddProduct}
        />
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          role={role}
          onClose={() => setEditingProduct(null)}
          onUpdateOwner={handleUpdateProductOwner}
          onRequestStockChange={handleRequestStockChange}
          onSwitchToOwnerAuth={() => setActiveTab("owner-auth")}
        />
      )}

      {printingOrder && (
        <PrintLabelModal
          order={printingOrder}
          onClose={() => setPrintingOrder(null)}
          onPrinted={(orderId) =>
            showToast(`กำลังส่งคำสั่งพิมพ์ใบปะหน้า #${orderId}`, "print")
          }
        />
      )}

      {showCreateOrderModal && (
        <CreateOrderModal
          products={products}
          customers={customers}
          initialCustomer={preselectedOrderCustomer}
          initialProduct={preselectedOrderProduct}
          onClose={() => {
            setShowCreateOrderModal(false);
            setPreselectedOrderCustomer(null);
            setPreselectedOrderProduct(null);
          }}
          onCreateOrder={handleCreateOrder}
        />
      )}

      {confirmingDeliveryOrder && (
        <DeliveryConfirmModal
          order={confirmingDeliveryOrder}
          canEdit={
            role === "owner" || !confirmingDeliveryOrder.deliveryConfirmedAt
          }
          onClose={() => setConfirmingDeliveryOrder(null)}
          onConfirm={handleConfirmDelivery}
        />
      )}

      <AiChatWidget
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        role={role}
        ownerName={ownerName}
        lowStockCount={lowStockProducts.length}
        storeContext={aiStoreContext}
      />
    </div>
  );
}
