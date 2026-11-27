import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useState } from "react";
import { AiChatWidget } from "./components/AiChatWidget";
import { AiScannerView } from "./components/AiScannerView";
import { AuthGate } from "./components/AuthGate";
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
  INITIAL_CATEGORIES,
  INITIAL_INVOICE,
} from "./data/initialData";
import { auth, signOutUser } from "./firebase";
import {
  confirmOrderDeliveryDoc,
  confirmOrderShipDoc,
  createApprovalDoc,
  createCustomerDoc,
  createNotificationDoc,
  createOrderDoc,
  createProductDoc,
  deleteCustomerDoc,
  ensureUserWorkspace,
  markNotificationReadDoc,
  markOrderReadyToShipDoc,
  packOrderDoc,
  resolveApprovalDoc,
  sanitizeDocId,
  subscribeApprovals,
  subscribeCustomers,
  subscribeNotifications,
  subscribeOrders,
  subscribeProducts,
  subscribeWorkspace,
  updateCustomerDoc,
  updateOrderItemsDoc,
  updateProductDoc,
  updateWorkspaceSettings,
} from "./services/firestoreService";
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
const ADMIN_EMAIL = "hnan.noppamat@gmail.com";

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [role, setRole] = useState<RoleMode>("owner");
  const [ownerName, setOwnerName] = useState<string>(DEFAULT_OWNER_NAME);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [approvals, setApprovals] = useState<StockApprovalRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invoice, setInvoice] = useState<ScannedInvoice>(INITIAL_INVOICE);
  const [exchangeRate, setExchangeRate] = useState<number>(4.95);
  const [freightCost, setFreightCost] = useState<number>(1250);
  const [splitByQty, setSplitByQty] = useState<boolean>(true);
  const [autoSave, setAutoSave] = useState<boolean>(true);

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

  // Surface Firestore errors to ErrorBoundary cleanly
  if (fatalError) {
    throw fatalError;
  }

  const stampSynced = () => {
    const now = new Date();
    setLastSyncedLabel(
      now.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  // Track Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setWorkspaceReady(false);
        setProducts([]);
        setOrders([]);
        setCustomers([]);
        setApprovals([]);
        setNotifications([]);
      }
    });
    return () => unsub();
  }, []);

  // Initialize workspace & attach Firestore real-time listeners ONLY when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    let cancelled = false;
    const unsubscribers: (() => void)[] = [];

    const handleErr = (err: unknown) => {
      if (cancelled) return;
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    };

    const boot = async () => {
      try {
        await ensureUserWorkspace(
          user.uid,
          user.displayName?.trim() || DEFAULT_OWNER_NAME
        );
        if (cancelled) return;

        unsubscribers.push(
          subscribeWorkspace(
            user.uid,
            (ws) => {
              setOwnerName(ws.ownerName || DEFAULT_OWNER_NAME);
              setRole(ws.roleMode === "staff" ? "staff" : "owner");
              setCategories(
                Array.isArray(ws.categories) && ws.categories.length > 0
                  ? ws.categories
                  : INITIAL_CATEGORIES
              );
              setExchangeRate(Number(ws.exchangeRate ?? 4.95));
              setFreightCost(Number(ws.freightCost ?? 1250));
              setSplitByQty(Boolean(ws.splitByQty));
              setAutoSave(Boolean(ws.autoSave));
              setWorkspaceReady(true);
              stampSynced();
            },
            handleErr
          )
        );

        unsubscribers.push(
          subscribeProducts(
            user.uid,
            (list) => {
              setProducts(list);
              stampSynced();
            },
            handleErr
          )
        );

        unsubscribers.push(
          subscribeOrders(
            user.uid,
            (list) => {
              setOrders(list);
              stampSynced();
            },
            handleErr
          )
        );

        unsubscribers.push(
          subscribeApprovals(
            user.uid,
            (list) => {
              setApprovals(list);
              stampSynced();
            },
            handleErr
          )
        );

        unsubscribers.push(
          subscribeNotifications(
            user.uid,
            (list) => {
              setNotifications(list);
              stampSynced();
            },
            handleErr
          )
        );

        unsubscribers.push(
          subscribeCustomers(
            user.uid,
            (list) => {
              setCustomers(list);
              stampSynced();
            },
            handleErr
          )
        );
      } catch (err) {
        handleErr(err);
      }
    };

    boot();

    return () => {
      cancelled = true;
      unsubscribers.forEach((fn) => fn());
    };
  }, [authReady, user]);

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

  if (!authReady || !user) {
    return <AuthGate loading={!authReady} />;
  }

  if (!workspaceReady) {
    return <AuthGate loading={true} />;
  }

  const uid = user.uid;
  const isBootstrappedAdmin = user.email === ADMIN_EMAIL;

  const runDb = (promise: Promise<unknown>) => {
    promise.catch((err) => {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    });
  };

  const pushNotification = (
    title: string,
    detail: string,
    type: AppNotification["type"]
  ) => {
    const noti: AppNotification = {
      id: sanitizeDocId(`noti-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`),
      title,
      detail,
      time: "เมื่อสักครู่",
      type,
      read: false,
    };
    runDb(createNotificationDoc(uid, noti));
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

  const handleRoleChange = (nextRole: RoleMode, toastMsg: string, icon: string) => {
    setRole(nextRole);
    if (nextRole === "staff" && activeTab === "ai-scanner") {
      setActiveTab("inventory");
    }
    runDb(updateWorkspaceSettings(uid, { roleMode: nextRole }));
    showToast(toastMsg, icon);
  };

  const handleSaveScanToInventory = (
    items: ScannedBillItem[],
    rate: number,
    freightPerUnit: number
  ) => {
    let importedUnits = 0;
    items.forEach((scanned) => {
      importedUnits += scanned.quantity;
      const landedCost = Number(
        (scanned.unitPriceCny * rate + freightPerUnit).toFixed(2)
      );
      const existing = products.find(
        (p) => p.sku.toLowerCase() === scanned.sku.toLowerCase()
      );
      if (existing) {
        runDb(
          updateProductDoc(uid, existing.id, {
            stock: existing.stock + scanned.quantity,
            landedCostThb: landedCost,
            cnyUnitPrice: scanned.unitPriceCny,
            freightPerUnitThb: Number(freightPerUnit.toFixed(2)),
            imageUrl: scanned.imageUrl || existing.imageUrl,
            updatedAtLabel: "เมื่อสักครู่",
          })
        );
      } else {
        const newId = sanitizeDocId(
          `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        runDb(
          createProductDoc(uid, newId, {
            name: scanned.thaiName,
            sku: scanned.sku,
            origin: "cn",
            category: scanned.category || categories[0] || INITIAL_CATEGORIES[0],
            stock: scanned.quantity,
            lowThreshold: 15,
            landedCostThb: landedCost,
            cnyUnitPrice: scanned.unitPriceCny,
            freightPerUnitThb: Number(freightPerUnit.toFixed(2)),
            sellPriceThb: Math.ceil((landedCost * 1.9) / 10) * 10 - 1,
            imageUrl: scanned.imageUrl,
          })
        );
      }
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
    const newId = sanitizeDocId(`prod-${Date.now()}`);
    runDb(createProductDoc(uid, newId, newProd));
    showToast(`เพิ่มสินค้า "${newProd.name}" เข้าคลังแล้ว`, "add_box");
  };

  const handleAddCategory = (categoryName: string) => {
    const nextCategories = [...categories, categoryName];
    setCategories(nextCategories);
    runDb(updateWorkspaceSettings(uid, { categories: nextCategories }));
    showToast(`เพิ่มหมวดหมู่ "${categoryName}" แล้ว`, "category");
  };

  const handleUpdateProductOwner = (updated: ProductItem) => {
    runDb(
      updateProductDoc(uid, updated.id, {
        stock: updated.stock,
        sellPriceThb: updated.sellPriceThb,
        landedCostThb: updated.landedCostThb,
        updatedAtLabel: "เมื่อสักครู่",
      })
    );
    showToast(`อัปเดตสต็อก ${updated.name} เป็น ${updated.stock} ชิ้น`, "save");
  };

  const handleRequestStockChange = (
    product: ProductItem,
    requestedStock: number,
    reason: string
  ) => {
    const req: StockApprovalRequest = {
      id: sanitizeDocId(`REQ-${Date.now().toString().slice(-5)}`),
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
    runDb(createApprovalDoc(uid, req));
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

    runDb(resolveApprovalDoc(uid, reqId, approve ? "approved" : "rejected"));

    if (approve) {
      runDb(
        updateProductDoc(uid, target.productId, {
          stock: target.requestedStock,
          updatedAtLabel: "เมื่อสักครู่",
        })
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
    const target = orders.find((o) => o.id === orderId);
    if (!target || target.status === "shipped") return;
    const nextItems = target.items.map((item, idx) =>
      idx === itemIndex ? { ...item, picked: !item.picked } : item
    );
    runDb(updateOrderItemsDoc(uid, orderId, nextItems));
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

    deductionsByProduct.forEach((deduction, prodId) => {
      const prod = products.find((p) => p.id === prodId);
      if (!prod) return;
      const nextStock = Math.max(0, prod.stock - deduction.totalQty);
      const updatedColors = prod.colors?.map((c) => {
        const colorDeduct = deduction.byColor.get(c.name) ?? 0;
        if (colorDeduct > 0 && typeof c.stock === "number") {
          return { ...c, stock: Math.max(0, c.stock - colorDeduct) };
        }
        return c;
      });
      runDb(
        updateProductDoc(uid, prod.id, {
          stock: nextStock,
          ...(updatedColors ? { colors: updatedColors } : {}),
          updatedAtLabel: "ตัดสต็อกอัตโนมัติ",
        })
      );
    });

    const pickedItems = order.items.map((i) => ({ ...i, picked: true }));
    runDb(packOrderDoc(uid, orderId, pickedItems));
    showToast(`แพ็ค #${orderId} สำเร็จ — ตัดสต็อกอัตโนมัติแล้ว`, "check_circle");
  };

  const handleMarkReadyToShip = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== "packing") return;
    runDb(markOrderReadyToShipDoc(uid, orderId));
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

    runDb(
      confirmOrderShipDoc(uid, orderId, {
        shippingOption: options.shippingOption,
        carrierName: options.carrierName,
        courier: options.courier,
        trackingCode: tracking,
      })
    );

    const toastSummary =
      options.shippingOption === "store_delivery"
        ? `ยืนยันส่งถึงหน้าร้าน #${orderId} แล้ว`
        : options.shippingOption === "store_pickup"
          ? `ยืนยันลูกค้ามารับหน้าร้าน #${orderId} แล้ว`
          : `จัดส่ง #${orderId} แล้ว (${options.carrierName || options.courier || "ขนส่ง"}: ${tracking})`;

    showToast(toastSummary, "local_shipping");
    setConfirmingDeliveryOrder({
      ...targetOrder,
      status: "shipped",
      shippingOption: options.shippingOption,
      carrierName: options.carrierName,
      courier: options.courier,
      trackingCode: tracking,
    });
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
    runDb(
      confirmOrderDeliveryDoc(uid, {
        ...payload,
        confirmedAt: confirmedTime,
      })
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
    const newId = sanitizeDocId(`ORD-${Math.floor(202504 + Math.random() * 8000)}`);
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
    runDb(createOrderDoc(uid, newOrder));
    setPreselectedOrderCustomer(null);
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
    const newId = sanitizeDocId(
      `cust-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
    );
    runDb(createCustomerDoc(uid, newId, data));
    showToast(`เพิ่มลูกค้า "${data.name}" เรียบร้อยแล้ว`, "person_add");
  };

  const handleUpdateCustomer = (
    customerId: string,
    updates: Omit<Customer, "id" | "createdAt">
  ) => {
    runDb(
      updateCustomerDoc(uid, customerId, {
        name: updates.name,
        phone: updates.phone || "",
        lineId: updates.lineId || "",
        email: updates.email || "",
        address: updates.address || "",
        note: updates.note || "",
      })
    );
    showToast(`อัปเดตข้อมูล "${updates.name}" แล้ว`, "save");
  };

  const handleDeleteCustomer = (customerId: string) => {
    const target = customers.find((c) => c.id === customerId);
    runDb(deleteCustomerDoc(uid, customerId));
    showToast(
      `ลบลูกค้า "${target?.name || ""}" ออกจากรายชื่อแล้ว`,
      "person_remove"
    );
  };

  const handleImportOrderCustomers = (names: string[]) => {
    names.forEach((name, idx) => {
      const newId = sanitizeDocId(
        `cust-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`
      );
      runDb(createCustomerDoc(uid, newId, { name }));
    });
    showToast(`นำเข้าลูกค้าจากออเดอร์เดิม ${names.length} รายแล้ว`, "group_add");
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch {
      showToast("ไม่สามารถออกจากระบบได้ กรุณาลองใหม่", "error");
    }
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
          notifications
            .filter((n) => !n.read)
            .forEach((n) => runDb(markNotificationReadDoc(uid, n.id)));
        }}
        onSelectNotification={(noti) => {
          if (!noti.read) {
            runDb(markNotificationReadDoc(uid, noti.id));
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
            onExchangeRateChange={(val) => {
              setExchangeRate(val);
              runDb(updateWorkspaceSettings(uid, { exchangeRate: val }));
            }}
            freightCost={freightCost}
            onFreightCostChange={(val) => {
              setFreightCost(val);
              runDb(updateWorkspaceSettings(uid, { freightCost: val }));
            }}
            splitByQty={splitByQty}
            onSplitByQtyChange={(val) => {
              setSplitByQty(val);
              runDb(updateWorkspaceSettings(uid, { splitByQty: val }));
            }}
            autoSave={autoSave}
            onAutoSaveChange={(val) => {
              setAutoSave(val);
              runDb(updateWorkspaceSettings(uid, { autoSave: val }));
            }}
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
              showToast("ซิงก์ข้อมูลสต็อกกับ Cloud Firestore แล้ว", "cloud_done");
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
            userEmail={user.email}
            onUpdateOwnerName={(newName) => {
              setOwnerName(newName);
              runDb(updateWorkspaceSettings(uid, { ownerName: newName }));
              showToast(`อัปเดตชื่อเจ้าของร้านเป็น "${newName}" แล้ว`, "badge");
            }}
            onSignOut={handleSignOut}
            ownerPin="123456"
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
            isBootstrappedAdmin || !confirmingDeliveryOrder.deliveryConfirmedAt
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
