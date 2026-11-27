import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { AccountingView } from "./components/AccountingView";
import { AiChatWidget } from "./components/AiChatWidget";
import { BottomNav } from "./components/BottomNav";
import { CustomersView } from "./components/CustomersView";
import { DashboardView } from "./components/DashboardView";
import { Header } from "./components/Header";
import { InventoryView } from "./components/InventoryView";
import {
  AddProductModal,
  CreateOrderModal,
  DeliveryConfirmModal,
  EditProductModal,
  LowStockLineAlertModal,
  PrintLabelModal,
} from "./components/Modals";
import { MultiDeviceModal } from "./components/MultiDeviceModal";
import { OrderPaymentQrModal } from "./components/OrderPaymentQrModal";
import { OrdersView } from "./components/OrdersView";
import { OwnerAuthView } from "./components/OwnerAuthView";
import {
  INITIAL_ACCOUNTING_ENTRIES,
  INITIAL_APPROVALS,
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_NOTIFICATIONS,
  INITIAL_ORDERS,
  INITIAL_PRODUCTS,
  LEGACY_DEFAULT_CATEGORIES,
} from "./data/initialData";
import { auth, signInWithGoogle, signOutUser } from "./firebase";
import {
  confirmOrderDeliveryDoc,
  confirmOrderShipDoc,
  createAccountingDoc,
  createApprovalDoc,
  createCustomerDoc,
  createNotificationDoc,
  createOrderDoc,
  createProductDoc,
  deleteAccountingDoc,
  deleteApprovalDoc,
  deleteCustomerDoc,
  deleteDeviceSessionDoc,
  deleteDocsBatch,
  deleteNotificationDoc,
  deleteOrderDoc,
  deleteProductDoc,
  ensureUserWorkspace,
  LocalSeedSnapshot,
  markNotificationReadDoc,
  markOrderReadyToShipDoc,
  packOrderDoc,
  resolveApprovalDoc,
  subscribeAccounting,
  subscribeApprovals,
  subscribeCustomers,
  subscribeDevices,
  subscribeNotifications,
  subscribeOrders,
  subscribeProducts,
  subscribeWorkspace,
  syncFullWorkspaceToCloud,
  updateAccountingDoc,
  updateCustomerDoc,
  updateOrderItemsDoc,
  updateProductDoc,
  updateWorkspaceSettings,
  upsertDeviceSessionDoc,
} from "./services/firestoreService";
import {
  AccountingEntry,
  AppNotification,
  ConnectedDevice,
  CourierName,
  Customer,
  DeliveryConfirmationMethod,
  LiveActivityEvent,
  LiveExchangeRate,
  LiveStoreSnapshot,
  Order,
  OrderFulfillmentType,
  OrderItem,
  OrdersTab,
  ProductItem,
  RoleMode,
  ShippingOption,
  StockApprovalRequest,
  TabId,
} from "./types";
import {
  AutoLineEventType,
  buildLowStockLineMessage,
  buildNewOrderLineMessage,
  buildStockApprovedLineMessage,
  sendAutomaticLineNotification,
} from "./utils/lineAlert";
import {
  detectDeviceFormFactor,
  getOrCreateDeviceId,
  getSavedDeviceName,
  LiveConnectionStatus,
  LiveSyncClient,
  persistRoomId,
  RemoteLiveAction,
  resolveInitialRoomId,
  saveDeviceName,
} from "./utils/liveSync";

const DEFAULT_OWNER_NAME = "คุณธนวัฒน์";
const DEFAULT_OWNER_PIN = "4145";
const DEFAULT_OWNER_LINE_ID = "Hnan145";
const STORAGE_KEY = "denewstock_store_v1";

interface PersistedStore {
  ownerName: string;
  ownerPin: string;
  ownerLineId: string;
  promptPayId: string;
  promptPayName: string;
  categories: string[];
  products: ProductItem[];
  orders: Order[];
  customers: Customer[];
  approvals: StockApprovalRequest[];
  notifications: AppNotification[];
  accountingEntries: AccountingEntry[];
}

function isLegacyOnlyCategories(cats: unknown): boolean {
  if (!Array.isArray(cats) || cats.length === 0) return true;
  return cats.every(
    (c) => typeof c === "string" && LEGACY_DEFAULT_CATEGORIES.includes(c)
  );
}

function getTodayIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadInitialStore(): PersistedStore {
  const defaults: PersistedStore = {
    ownerName: DEFAULT_OWNER_NAME,
    ownerPin: DEFAULT_OWNER_PIN,
    ownerLineId: DEFAULT_OWNER_LINE_ID,
    promptPayId: "",
    promptPayName: "",
    categories: INITIAL_CATEGORIES,
    products: INITIAL_PRODUCTS,
    orders: INITIAL_ORDERS,
    customers: INITIAL_CUSTOMERS,
    approvals: INITIAL_APPROVALS,
    notifications: INITIAL_NOTIFICATIONS,
    accountingEntries: INITIAL_ACCOUNTING_ENTRIES,
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedStore>;

    const categories = isLegacyOnlyCategories(parsed.categories)
      ? INITIAL_CATEGORIES
      : (parsed.categories as string[]);

    const ownerPin =
      typeof parsed.ownerPin === "string" && /^\d{4}$/.test(parsed.ownerPin)
        ? parsed.ownerPin
        : DEFAULT_OWNER_PIN;

    const ownerLineId =
      typeof parsed.ownerLineId === "string" && parsed.ownerLineId.trim()
        ? parsed.ownerLineId.trim()
        : DEFAULT_OWNER_LINE_ID;

    return {
      ownerName:
        typeof parsed.ownerName === "string" && parsed.ownerName.trim()
          ? parsed.ownerName.trim()
          : DEFAULT_OWNER_NAME,
      ownerPin,
      ownerLineId,
      promptPayId:
        typeof parsed.promptPayId === "string"
          ? parsed.promptPayId.trim().slice(0, 20)
          : "",
      promptPayName:
        typeof parsed.promptPayName === "string"
          ? parsed.promptPayName.trim().slice(0, 80)
          : "",
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
      accountingEntries: Array.isArray(parsed.accountingEntries)
        ? parsed.accountingEntries
        : INITIAL_ACCOUNTING_ENTRIES,
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

  // Device identity & live multi-device room
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [deviceType] = useState(() => detectDeviceFormFactor());
  const [deviceName, setDeviceName] = useState<string>(() =>
    getSavedDeviceName(detectDeviceFormFactor())
  );
  const [roomId, setRoomId] = useState<string>(() => resolveInitialRoomId());
  const [liveStatus, setLiveStatus] =
    useState<LiveConnectionStatus>("connecting");
  const [liveDevices, setLiveDevices] = useState<ConnectedDevice[]>([]);
  const [cloudDevices, setCloudDevices] = useState<ConnectedDevice[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveActivityEvent[]>([]);
  const [liveLatencyMs, setLiveLatencyMs] = useState<number | null>(null);
  const [liveCnyRate, setLiveCnyRate] = useState<LiveExchangeRate | null>(null);
  const [isRefreshingRate, setIsRefreshingRate] = useState(false);
  const [showMultiDeviceModal, setShowMultiDeviceModal] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [inventoryInitialFilter, setInventoryInitialFilter] = useState<
    "all" | "low" | undefined
  >(undefined);
  // Open directly in Staff mode without any blocking login screen; Owner mode unlocks via 4-digit PIN
  const [role, setRole] = useState<RoleMode>("staff");
  const [ownerName, setOwnerName] = useState<string>(initialStore.ownerName);
  const [ownerPin, setOwnerPin] = useState<string>(initialStore.ownerPin);
  const [ownerLineId, setOwnerLineId] = useState<string>(
    initialStore.ownerLineId
  );
  const [promptPayId, setPromptPayId] = useState<string>(
    initialStore.promptPayId
  );
  const [promptPayName, setPromptPayName] = useState<string>(
    initialStore.promptPayName
  );
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
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>(
    initialStore.accountingEntries
  );

  // Online Cloud Sync state (Firebase Auth + real-time Firestore)
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudStatus, setCloudStatus] = useState<
    "connected" | "connecting" | "local"
  >("local");
  const [isSyncingCloudAll, setIsSyncingCloudAll] = useState(false);

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
  const [paymentQrOrder, setPaymentQrOrder] = useState<Order | null>(null);
  const [confirmingDeliveryOrder, setConfirmingDeliveryOrder] =
    useState<Order | null>(null);
  const [lowStockLineAlert, setLowStockLineAlert] = useState<{
    products: ProductItem[];
    triggerContext?: string;
  } | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    icon: string;
  }>({ visible: false, message: "", icon: "check_circle" });

  // Refs to access freshest state inside WebSocket & Firestore callbacks without re-subscribing
  const liveClientRef = useRef<LiveSyncClient | null>(null);
  const cloudUserRef = useRef<User | null>(null);
  cloudUserRef.current = cloudUser;

  const roleRef = useRef<RoleMode>(role);
  roleRef.current = role;

  const deviceNameRef = useRef<string>(deviceName);
  deviceNameRef.current = deviceName;

  const roomIdRef = useRef<string>(roomId);
  roomIdRef.current = roomId;

  const localSnapshotRef = useRef<PersistedStore>({
    ownerName,
    ownerPin,
    ownerLineId,
    promptPayId,
    promptPayName,
    categories,
    products,
    orders,
    customers,
    approvals,
    notifications,
    accountingEntries,
  });
  localSnapshotRef.current = {
    ownerName,
    ownerPin,
    ownerLineId,
    promptPayId,
    promptPayName,
    categories,
    products,
    orders,
    customers,
    approvals,
    notifications,
    accountingEntries,
  };

  // Merge WebSocket room devices + Firestore cloud devices (deduplicated by deviceId)
  const mergedDevices = useMemo<ConnectedDevice[]>(() => {
    const byId = new Map<string, ConnectedDevice>();
    for (const dev of cloudDevices) {
      byId.set(dev.deviceId, dev);
    }
    for (const dev of liveDevices) {
      byId.set(dev.deviceId, dev);
    }
    if (!byId.has(deviceId)) {
      byId.set(deviceId, {
        deviceId,
        deviceName,
        deviceType,
        roleMode: role,
        roomId,
        lastActiveAt: Date.now(),
        source: "live",
      });
    }
    return Array.from(byId.values()).sort((a, b) => {
      if (a.deviceId === deviceId) return -1;
      if (b.deviceId === deviceId) return 1;
      return b.lastActiveAt - a.lastActiveAt;
    });
  }, [cloudDevices, liveDevices, deviceId, deviceName, deviceType, role, roomId]);

  const stampSynced = () => {
    const now = new Date();
    setLastSyncedLabel(
      now.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  };

  const fetchLiveCnyRate = async (force = false) => {
    setIsRefreshingRate(true);
    try {
      const res = await fetch(
        `/api/rates/cny-thb${force ? "?refresh=1" : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        pair?: string;
        rate?: number;
        updatedAt?: string;
        source?: string;
        isFallback?: boolean;
      };
      if (data.ok && typeof data.rate === "number" && Number.isFinite(data.rate)) {
        setLiveCnyRate({
          pair: data.pair || "CNY/THB",
          rate: data.rate,
          updatedAt: data.updatedAt || new Date().toISOString(),
          source: data.source || "Live FX",
          isFallback: Boolean(data.isFallback),
        });
      }
    } catch {
      // Keep last known rate if temporarily offline
    } finally {
      setIsRefreshingRate(false);
    }
  };

  const showToast = (message: string, icon = "check_circle") => {
    setToast({ visible: true, message, icon });
    window.clearTimeout((window as unknown as { _sfToast?: number })._sfToast);
    (window as unknown as { _sfToast?: number })._sfToast = window.setTimeout(
      () => {
        setToast((prev) => ({ ...prev, visible: false }));
      },
      2800
    );
  };

  const runCloudWrite = (task: Promise<unknown>, errorMessage?: string) => {
    void task.catch((err) => {
      console.error("Cloud sync write error:", err);
      if (errorMessage) {
        showToast(errorMessage, "cloud_off");
      }
    });
  };

  const emitLiveAction = (action: string, payload: Record<string, unknown>) => {
    liveClientRef.current?.sendAction(
      action,
      payload,
      Boolean(cloudUserRef.current)
    );
  };

  // Mirror an incoming WebSocket action from another device up to Firestore if this device is cloud-connected
  const mirrorRemoteActionToCloud = (event: RemoteLiveAction) => {
    const uid = cloudUserRef.current?.uid;
    if (!uid || event.syncedToCloud || event.senderDeviceId === deviceId) return;

    const p = event.payload;
    switch (event.action) {
      case "product:create": {
        const prod = p.product as ProductItem | undefined;
        if (prod?.id) {
          const { id, updatedAt: _u, ...rest } = prod;
          runCloudWrite(createProductDoc(uid, id, rest));
        }
        break;
      }
      case "product:update": {
        const productId = p.productId as string | undefined;
        const updates = p.updates as Partial<ProductItem> | undefined;
        if (productId && updates) {
          runCloudWrite(
            updateProductDoc(uid, productId, {
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.sku !== undefined ? { sku: updates.sku } : {}),
              ...(updates.category !== undefined
                ? { category: updates.category }
                : {}),
              ...(updates.stock !== undefined ? { stock: updates.stock } : {}),
              ...(updates.lowThreshold !== undefined
                ? { lowThreshold: updates.lowThreshold }
                : {}),
              ...(updates.landedCostThb !== undefined
                ? { landedCostThb: updates.landedCostThb }
                : {}),
              ...(updates.sellPriceThb !== undefined
                ? { sellPriceThb: updates.sellPriceThb }
                : {}),
              ...(updates.imageUrl !== undefined
                ? { imageUrl: updates.imageUrl }
                : {}),
              ...(updates.colors !== undefined ? { colors: updates.colors } : {}),
              updatedAtLabel: updates.updatedAt || "เมื่อสักครู่",
            })
          );
        }
        break;
      }
      case "product:delete": {
        if (typeof p.productId === "string") {
          runCloudWrite(deleteProductDoc(uid, p.productId));
        }
        break;
      }
      case "category:add": {
        const cat = p.categoryName as string | undefined;
        if (cat && !localSnapshotRef.current.categories.includes(cat)) {
          runCloudWrite(
            updateWorkspaceSettings(uid, {
              categories: [...localSnapshotRef.current.categories, cat],
            })
          );
        }
        break;
      }
      case "category:delete": {
        const cat = p.categoryName as string | undefined;
        if (cat) {
          const remaining = localSnapshotRef.current.categories.filter(
            (c) => c !== cat
          );
          if (remaining.length > 0) {
            runCloudWrite(updateWorkspaceSettings(uid, { categories: remaining }));
          }
        }
        break;
      }
      case "order:create": {
        const order = p.order as Order | undefined;
        if (order?.id) {
          runCloudWrite(createOrderDoc(uid, order));
        }
        const acc = p.accountingEntry as AccountingEntry | undefined;
        if (acc?.id) {
          const { id, ...rest } = acc;
          runCloudWrite(createAccountingDoc(uid, id, rest));
        }
        const noti = p.notification as AppNotification | undefined;
        if (noti?.id) {
          runCloudWrite(createNotificationDoc(uid, noti));
        }
        break;
      }
      case "order:pack": {
        const orderId = p.orderId as string | undefined;
        const items = p.items as OrderItem[] | undefined;
        const updatedProducts = p.updatedProducts as ProductItem[] | undefined;
        if (orderId && Array.isArray(items)) {
          runCloudWrite(packOrderDoc(uid, orderId, items));
        }
        if (Array.isArray(updatedProducts)) {
          updatedProducts.forEach((prod) => {
            runCloudWrite(
              updateProductDoc(uid, prod.id, {
                stock: prod.stock,
                ...(prod.colors ? { colors: prod.colors } : {}),
                updatedAtLabel: "ตัดสต็อกอัตโนมัติ",
              })
            );
          });
        }
        break;
      }
      case "order:ready_to_ship": {
        if (typeof p.orderId === "string") {
          runCloudWrite(markOrderReadyToShipDoc(uid, p.orderId));
        }
        break;
      }
      case "order:ship": {
        const orderId = p.orderId as string | undefined;
        const updates = p.updates as
          | {
              shippingOption: ShippingOption;
              carrierName?: string;
              courier?: CourierName;
              trackingCode?: string;
            }
          | undefined;
        if (orderId && updates?.shippingOption) {
          runCloudWrite(confirmOrderShipDoc(uid, orderId, updates));
        }
        break;
      }
      case "order:confirm_delivery": {
        const orderId = p.orderId as string | undefined;
        const updates = p.updates as
          | {
              deliveryMethod?: DeliveryConfirmationMethod;
              deliveryProofImage?: string;
              cashReceivedThb?: number;
              deliveryNote?: string;
              deliveryConfirmedAt?: string;
            }
          | undefined;
        if (orderId && updates?.deliveryMethod) {
          runCloudWrite(
            confirmOrderDeliveryDoc(uid, {
              orderId,
              method: updates.deliveryMethod,
              proofImage: updates.deliveryProofImage,
              cashReceivedThb: updates.cashReceivedThb,
              note: updates.deliveryNote,
              confirmedAt: updates.deliveryConfirmedAt || "เมื่อสักครู่",
            })
          );
        }
        break;
      }
      case "order:delete": {
        if (typeof p.orderId === "string") {
          runCloudWrite(deleteOrderDoc(uid, p.orderId));
        }
        break;
      }
      case "approval:create": {
        const approval = p.approval as StockApprovalRequest | undefined;
        if (approval?.id) {
          runCloudWrite(createApprovalDoc(uid, approval));
        }
        const noti = p.notification as AppNotification | undefined;
        if (noti?.id) {
          runCloudWrite(createNotificationDoc(uid, noti));
        }
        break;
      }
      case "approval:resolve": {
        const reqId = p.reqId as string | undefined;
        const approve = Boolean(p.approve);
        const updatedProduct = p.updatedProduct as ProductItem | undefined;
        if (reqId) {
          runCloudWrite(
            resolveApprovalDoc(uid, reqId, approve ? "approved" : "rejected")
          );
        }
        if (approve && updatedProduct?.id) {
          runCloudWrite(
            updateProductDoc(uid, updatedProduct.id, {
              stock: updatedProduct.stock,
              updatedAtLabel: "เมื่อสักครู่",
            })
          );
        }
        break;
      }
      case "approval:delete": {
        if (typeof p.reqId === "string") {
          runCloudWrite(deleteApprovalDoc(uid, p.reqId));
        }
        break;
      }
      case "customer:create": {
        const cust = p.customer as Customer | undefined;
        if (cust?.id) {
          const { id, ...rest } = cust;
          runCloudWrite(createCustomerDoc(uid, id, rest));
        }
        break;
      }
      case "customer:update": {
        const customerId = p.customerId as string | undefined;
        const updates = p.updates as Partial<Customer> | undefined;
        if (customerId && updates) {
          runCloudWrite(updateCustomerDoc(uid, customerId, updates));
        }
        break;
      }
      case "customer:delete": {
        if (typeof p.customerId === "string") {
          runCloudWrite(deleteCustomerDoc(uid, p.customerId));
        }
        break;
      }
      case "accounting:create": {
        const entry = p.entry as AccountingEntry | undefined;
        if (entry?.id) {
          const { id, ...rest } = entry;
          runCloudWrite(createAccountingDoc(uid, id, rest));
        }
        break;
      }
      case "accounting:update": {
        const entryId = p.entryId as string | undefined;
        const updates = p.updates as Omit<AccountingEntry, "id"> | undefined;
        if (entryId && updates) {
          runCloudWrite(updateAccountingDoc(uid, entryId, updates));
        }
        break;
      }
      case "accounting:delete": {
        if (typeof p.entryId === "string") {
          runCloudWrite(deleteAccountingDoc(uid, p.entryId));
        }
        break;
      }
      case "notification:create": {
        const noti = p.notification as AppNotification | undefined;
        if (noti?.id) {
          runCloudWrite(createNotificationDoc(uid, noti));
        }
        break;
      }
      case "settings:update": {
        const updates: Partial<{
          ownerName: string;
          ownerPin: string;
          ownerLineId: string;
          promptPayId: string;
          promptPayName: string;
        }> = {};
        if (typeof p.ownerName === "string") updates.ownerName = p.ownerName;
        if (typeof p.ownerPin === "string") updates.ownerPin = p.ownerPin;
        if (typeof p.ownerLineId === "string") updates.ownerLineId = p.ownerLineId;
        if (typeof p.promptPayId === "string") updates.promptPayId = p.promptPayId;
        if (typeof p.promptPayName === "string") updates.promptPayName = p.promptPayName;
        if (Object.keys(updates).length > 0) {
          runCloudWrite(updateWorkspaceSettings(uid, updates));
        }
        break;
      }
      default:
        break;
    }
  };

  // Apply incoming WebSocket event idempotently to local React state
  const applyRemoteLiveAction = (event: RemoteLiveAction) => {
    const p = event.payload;
    const isFromOtherDevice = event.senderDeviceId !== deviceId;

    switch (event.action) {
      case "product:create": {
        const product = p.product as ProductItem | undefined;
        if (!product?.id) return;
        setProducts((prev) =>
          prev.some((item) => item.id === product.id) ? prev : [product, ...prev]
        );
        if (isFromOtherDevice) {
          showToast(
            `${event.senderDeviceName} เพิ่มสินค้า "${product.name}"`,
            "add_box"
          );
        }
        break;
      }

      case "product:update": {
        const productId = p.productId as string | undefined;
        const updates = p.updates as Partial<ProductItem> | undefined;
        if (!productId || !updates) return;
        setProducts((prev) =>
          prev.map((prod) =>
            prod.id === productId ? { ...prod, ...updates } : prod
          )
        );
        setEditingProduct((prev) =>
          prev && prev.id === productId ? { ...prev, ...updates } : prev
        );
        break;
      }

      case "product:delete": {
        const productId = p.productId as string | undefined;
        if (!productId) return;
        setProducts((prev) => prev.filter((prod) => prod.id !== productId));
        setApprovals((prev) => prev.filter((a) => a.productId !== productId));
        setEditingProduct((prev) => (prev?.id === productId ? null : prev));
        break;
      }

      case "category:add": {
        const categoryName = p.categoryName as string | undefined;
        if (!categoryName) return;
        setCategories((prev) =>
          prev.includes(categoryName) ? prev : [...prev, categoryName]
        );
        break;
      }

      case "category:delete": {
        const categoryName = p.categoryName as string | undefined;
        const fallbackCategory = p.fallbackCategory as string | undefined;
        if (!categoryName) return;
        setCategories((prev) => prev.filter((c) => c !== categoryName));
        if (fallbackCategory) {
          setProducts((prev) =>
            prev.map((prod) =>
              prod.category === categoryName
                ? { ...prod, category: fallbackCategory }
                : prod
            )
          );
        }
        break;
      }

      case "order:create": {
        const order = p.order as Order | undefined;
        if (!order?.id) return;
        setOrders((prev) =>
          prev.some((o) => o.id === order.id) ? prev : [order, ...prev]
        );
        const acc = p.accountingEntry as AccountingEntry | undefined;
        if (acc?.id) {
          setAccountingEntries((prev) =>
            prev.some((e) => e.id === acc.id) ? prev : [acc, ...prev]
          );
        }
        const noti = p.notification as AppNotification | undefined;
        if (noti?.id) {
          setNotifications((prev) =>
            prev.some((n) => n.id === noti.id)
              ? prev
              : [noti, ...prev].slice(0, 50)
          );
        }
        if (isFromOtherDevice) {
          showToast(
            `ออเดอร์ใหม่ #${order.id} จาก ${event.senderDeviceName}`,
            "add_shopping_cart"
          );
        }
        break;
      }

      case "order:toggle_pick": {
        const orderId = p.orderId as string | undefined;
        const itemIndex = p.itemIndex as number | undefined;
        if (!orderId || typeof itemIndex !== "number") return;
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId && o.status !== "shipped"
              ? {
                  ...o,
                  items: o.items.map((item, idx) =>
                    idx === itemIndex ? { ...item, picked: !item.picked } : item
                  ),
                }
              : o
          )
        );
        break;
      }

      case "order:pack": {
        const orderId = p.orderId as string | undefined;
        const updatedProducts = p.updatedProducts as ProductItem[] | undefined;
        const items = p.items as OrderItem[] | undefined;
        if (!orderId) return;
        if (Array.isArray(updatedProducts) && updatedProducts.length > 0) {
          const updatedMap = new Map(updatedProducts.map((u) => [u.id, u]));
          setProducts((prev) =>
            prev.map((prod) => updatedMap.get(prod.id) ?? prod)
          );
        }
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "packing",
                  items: Array.isArray(items)
                    ? items
                    : o.items.map((i) => ({ ...i, picked: true })),
                }
              : o
          )
        );
        if (isFromOtherDevice) {
          showToast(
            `${event.senderDeviceName} แพ็ค #${orderId} และตัดสต็อกแล้ว`,
            "inventory_2"
          );
        }
        break;
      }

      case "order:ready_to_ship": {
        const orderId = p.orderId as string | undefined;
        if (!orderId) return;
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, status: "ready_to_ship" } : o
          )
        );
        break;
      }

      case "order:ship": {
        const orderId = p.orderId as string | undefined;
        const updates = p.updates as Partial<Order> | undefined;
        if (!orderId || !updates) return;
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, ...updates, status: "shipped" } : o
          )
        );
        if (isFromOtherDevice) {
          showToast(
            `${event.senderDeviceName} จัดส่งออเดอร์ #${orderId} แล้ว`,
            "local_shipping"
          );
        }
        break;
      }

      case "order:confirm_delivery": {
        const orderId = p.orderId as string | undefined;
        const updates = p.updates as Partial<Order> | undefined;
        if (!orderId || !updates) return;
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o))
        );
        break;
      }

      case "order:delete": {
        const orderId = p.orderId as string | undefined;
        if (!orderId) return;
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setPrintingOrder((prev) => (prev?.id === orderId ? null : prev));
        setPaymentQrOrder((prev) => (prev?.id === orderId ? null : prev));
        setConfirmingDeliveryOrder((prev) =>
          prev?.id === orderId ? null : prev
        );
        break;
      }

      case "approval:create": {
        const approval = p.approval as StockApprovalRequest | undefined;
        if (!approval?.id) return;
        setApprovals((prev) =>
          prev.some((a) => a.id === approval.id) ? prev : [approval, ...prev]
        );
        const noti = p.notification as AppNotification | undefined;
        if (noti?.id) {
          setNotifications((prev) =>
            prev.some((n) => n.id === noti.id)
              ? prev
              : [noti, ...prev].slice(0, 50)
          );
        }
        if (isFromOtherDevice) {
          showToast(
            `คำขออนุมัติปรับสต็อก ${approval.sku} จาก ${event.senderDeviceName}`,
            "approval"
          );
        }
        break;
      }

      case "approval:resolve": {
        const reqId = p.reqId as string | undefined;
        const approve = Boolean(p.approve);
        const updatedProduct = p.updatedProduct as ProductItem | undefined;
        if (!reqId) return;
        setApprovals((prev) =>
          prev.map((a) =>
            a.id === reqId
              ? { ...a, status: approve ? "approved" : "rejected" }
              : a
          )
        );
        if (approve && updatedProduct?.id) {
          setProducts((prev) =>
            prev.map((prod) =>
              prod.id === updatedProduct.id ? updatedProduct : prod
            )
          );
        }
        if (isFromOtherDevice) {
          showToast(
            approve
              ? `เจ้าของร้านอนุมัติคำขอ #${reqId} แล้ว (อัปเดตสต็อกทันที)`
              : `เจ้าของร้านปฏิเสธคำขอ #${reqId}`,
            approve ? "check_circle" : "cancel"
          );
        }
        break;
      }

      case "approval:delete": {
        const reqId = p.reqId as string | undefined;
        if (!reqId) return;
        setApprovals((prev) => prev.filter((a) => a.id !== reqId));
        break;
      }

      case "approval:clear": {
        setApprovals([]);
        break;
      }

      case "customer:create": {
        const customer = p.customer as Customer | undefined;
        if (!customer?.id) return;
        setCustomers((prev) =>
          prev.some((c) => c.id === customer.id) ? prev : [customer, ...prev]
        );
        break;
      }

      case "customer:update": {
        const customerId = p.customerId as string | undefined;
        const updates = p.updates as Partial<Customer> | undefined;
        if (!customerId || !updates) return;
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerId ? { ...c, ...updates } : c))
        );
        break;
      }

      case "customer:delete": {
        const customerId = p.customerId as string | undefined;
        if (!customerId) return;
        setCustomers((prev) => prev.filter((c) => c.id !== customerId));
        break;
      }

      case "customer:import": {
        const incoming = p.customers as Customer[] | undefined;
        if (!Array.isArray(incoming)) return;
        setCustomers((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const toAdd = incoming.filter((c) => !existingIds.has(c.id));
          return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
        });
        break;
      }

      case "accounting:create": {
        const entry = p.entry as AccountingEntry | undefined;
        if (!entry?.id) return;
        setAccountingEntries((prev) =>
          prev.some((e) => e.id === entry.id) ? prev : [entry, ...prev]
        );
        break;
      }

      case "accounting:update": {
        const entryId = p.entryId as string | undefined;
        const updates = p.updates as Omit<AccountingEntry, "id"> | undefined;
        if (!entryId || !updates) return;
        setAccountingEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { id: entryId, ...updates } : e))
        );
        break;
      }

      case "accounting:delete": {
        const entryId = p.entryId as string | undefined;
        if (!entryId) return;
        setAccountingEntries((prev) => prev.filter((e) => e.id !== entryId));
        break;
      }

      case "accounting:clear": {
        setAccountingEntries([]);
        break;
      }

      case "accounting:sync_orders": {
        const entries = p.entries as AccountingEntry[] | undefined;
        if (!Array.isArray(entries)) return;
        setAccountingEntries((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const toAdd = entries.filter((e) => !existingIds.has(e.id));
          return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
        });
        break;
      }

      case "notification:create": {
        const notification = p.notification as AppNotification | undefined;
        if (!notification?.id) return;
        setNotifications((prev) =>
          prev.some((n) => n.id === notification.id)
            ? prev
            : [notification, ...prev].slice(0, 50)
        );
        break;
      }

      case "notification:read": {
        const notiId = p.notiId as string | undefined;
        if (!notiId) return;
        setNotifications((prev) =>
          prev.map((n) => (n.id === notiId ? { ...n, read: true } : n))
        );
        break;
      }

      case "notification:read_all": {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        break;
      }

      case "notification:delete": {
        const notiId = p.notiId as string | undefined;
        if (!notiId) return;
        setNotifications((prev) => prev.filter((n) => n.id !== notiId));
        break;
      }

      case "notification:clear": {
        setNotifications([]);
        break;
      }

      case "settings:update": {
        if (typeof p.ownerName === "string" && p.ownerName.trim()) {
          setOwnerName(p.ownerName.trim());
        }
        if (typeof p.ownerPin === "string" && /^\d{4}$/.test(p.ownerPin)) {
          setOwnerPin(p.ownerPin);
        }
        if (typeof p.ownerLineId === "string" && p.ownerLineId.trim()) {
          setOwnerLineId(p.ownerLineId.trim());
        }
        if (typeof p.promptPayId === "string") {
          setPromptPayId(p.promptPayId.trim().slice(0, 20));
        }
        if (typeof p.promptPayName === "string") {
          setPromptPayName(p.promptPayName.trim().slice(0, 80));
        }
        break;
      }

      default:
        break;
    }

    stampSynced();
    mirrorRemoteActionToCloud(event);
  };

  // Real-Time Multi-Device WebSocket Sync (works immediately across unlimited devices without login!)
  useEffect(() => {
    const client = new LiveSyncClient({
      roomId,
      deviceId,
      deviceName: deviceNameRef.current,
      deviceType,
      roleMode: roleRef.current,
      getHydrateSnapshot: () => localSnapshotRef.current,
      onStatusChange: (status) => {
        setLiveStatus(status);
      },
      onInitState: (snapshot: LiveStoreSnapshot) => {
        if (snapshot.ownerName) setOwnerName(snapshot.ownerName);
        if (snapshot.ownerPin && /^\d{4}$/.test(snapshot.ownerPin)) {
          setOwnerPin(snapshot.ownerPin);
        }
        if (snapshot.ownerLineId) setOwnerLineId(snapshot.ownerLineId);
        if (typeof snapshot.promptPayId === "string") {
          setPromptPayId(snapshot.promptPayId.trim().slice(0, 20));
        }
        if (typeof snapshot.promptPayName === "string") {
          setPromptPayName(snapshot.promptPayName.trim().slice(0, 80));
        }
        if (Array.isArray(snapshot.categories) && snapshot.categories.length > 0) {
          setCategories(snapshot.categories);
        }
        if (Array.isArray(snapshot.products)) setProducts(snapshot.products);
        if (Array.isArray(snapshot.orders)) setOrders(snapshot.orders);
        if (Array.isArray(snapshot.customers)) setCustomers(snapshot.customers);
        if (Array.isArray(snapshot.approvals)) setApprovals(snapshot.approvals);
        if (Array.isArray(snapshot.notifications)) {
          setNotifications(snapshot.notifications);
        }
        if (Array.isArray(snapshot.accountingEntries)) {
          setAccountingEntries(snapshot.accountingEntries);
        }
        stampSynced();
      },
      onRemoteAction: (event) => {
        applyRemoteLiveAction(event);
      },
      onPresenceChange: (devices) => {
        setLiveDevices(devices);
      },
      onActivityEvents: (events) => {
        setLiveEvents(events);
      },
      onActivityEvent: (event) => {
        setLiveEvents((prev) =>
          [event, ...prev.filter((item) => item.id !== event.id)].slice(0, 25)
        );
      },
      onLatencyChange: (ms) => {
        setLiveLatencyMs(ms);
      },
    });

    liveClientRef.current = client;
    return () => {
      client.destroy();
      if (liveClientRef.current === client) {
        liveClientRef.current = null;
      }
    };
    // Reconnect only when roomId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, deviceId, deviceType]);

  // Fetch real-time live CNY/THB exchange rate on startup & every 5 minutes while visible
  useEffect(() => {
    void fetchLiveCnyRate(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchLiveCnyRate(false);
      }
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep presence metadata in sync when role, deviceName, roomId, or cloudStatus changes
  useEffect(() => {
    liveClientRef.current?.updatePresence({
      deviceName,
      roleMode: role,
    });
    if (cloudUser && cloudStatus === "connected") {
      runCloudWrite(
        upsertDeviceSessionDoc(cloudUser.uid, deviceId, {
          deviceName,
          deviceType,
          roleMode: role,
          roomId,
        })
      );
    }
  }, [role, deviceName, roomId, cloudUser, cloudStatus, deviceId, deviceType]);

  // Auto-persist store state to localStorage (offline cache + instant reload)
  useEffect(() => {
    try {
      const payload: PersistedStore = {
        ownerName,
        ownerPin,
        ownerLineId,
        promptPayId,
        promptPayName,
        categories,
        products,
        orders,
        customers,
        approvals,
        notifications,
        accountingEntries,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      stampSynced();
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [
    ownerName,
    ownerPin,
    ownerLineId,
    promptPayId,
    promptPayName,
    categories,
    products,
    orders,
    customers,
    approvals,
    notifications,
    accountingEntries,
  ]);

  // Real-time Firebase Firestore online sync when user connects with Google
  useEffect(() => {
    let activeUnsubscribers: (() => void)[] = [];
    let heartbeatTimer: number | null = null;
    let cloudPushTimer: number | null = null;
    let cancelled = false;

    const cleanupSubs = () => {
      activeUnsubscribers.forEach((unsub) => unsub());
      activeUnsubscribers = [];
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (cloudPushTimer !== null) {
        window.clearTimeout(cloudPushTimer);
        cloudPushTimer = null;
      }
    };

    // Debounced bridge: whenever Firestore delivers real-time changes from Google Cloud,
    // push the authoritative snapshot into the WebSocket room so all connected staff devices stay in sync
    const scheduleCloudPushToLiveRoom = () => {
      if (cloudPushTimer !== null) {
        window.clearTimeout(cloudPushTimer);
      }
      cloudPushTimer = window.setTimeout(() => {
        cloudPushTimer = null;
        if (!cancelled) {
          liveClientRef.current?.pushCloudSnapshot(localSnapshotRef.current);
        }
      }, 380);
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      cleanupSubs();

      if (!user) {
        setCloudUser(null);
        setCloudStatus("local");
        setCloudDevices([]);
        return;
      }

      if (user.emailVerified === false) {
        setCloudUser(null);
        setCloudStatus("local");
        showToast(
          "กรุณาใช้อีเมลที่ยืนยันแล้วเพื่อเชื่อมต่อฐานข้อมูลออนไลน์",
          "error"
        );
        return;
      }

      setCloudUser(user);
      setCloudStatus("connecting");

      try {
        const snapshot: LocalSeedSnapshot = localSnapshotRef.current;
        await ensureUserWorkspace(
          user.uid,
          snapshot.ownerName || user.displayName || DEFAULT_OWNER_NAME,
          snapshot
        );
      } catch (err) {
        console.error("Failed to initialize cloud workspace:", err);
        if (!cancelled) {
          setCloudStatus("local");
          showToast(
            "เชื่อมต่อคลาวด์ไม่สำเร็จ ระบบยังซิงก์สดหลายเครื่องให้ตามปกติ",
            "cloud_off"
          );
        }
        return;
      }

      if (cancelled) return;

      const handleSnapshotError = (err: unknown) => {
        console.error("Firestore realtime listener error:", err);
      };

      // Periodically refresh this device in Firestore presence every 90s
      // (Initial write is performed automatically when cloudStatus transitions to "connected")
      heartbeatTimer = window.setInterval(() => {
        runCloudWrite(
          upsertDeviceSessionDoc(user.uid, deviceId, {
            deviceName: deviceNameRef.current,
            deviceType,
            roleMode: roleRef.current,
            roomId: roomIdRef.current,
          })
        );
      }, 90_000);

      activeUnsubscribers = [
        subscribeWorkspace(
          user.uid,
          (ws) => {
            if (ws.ownerName) setOwnerName(ws.ownerName);
            if (ws.ownerPin && /^\d{4}$/.test(ws.ownerPin)) {
              setOwnerPin(ws.ownerPin);
            }
            if (ws.ownerLineId && ws.ownerLineId.trim()) {
              setOwnerLineId(ws.ownerLineId.trim());
            }
            if (typeof ws.promptPayId === "string") {
              setPromptPayId(ws.promptPayId.trim().slice(0, 20));
            }
            if (typeof ws.promptPayName === "string") {
              setPromptPayName(ws.promptPayName.trim().slice(0, 80));
            }
            if (Array.isArray(ws.categories) && ws.categories.length > 0) {
              setCategories(ws.categories);
            }
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeProducts(
          user.uid,
          (cloudProducts) => {
            setProducts(cloudProducts);
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeOrders(
          user.uid,
          (cloudOrders) => {
            setOrders(cloudOrders);
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeCustomers(
          user.uid,
          (cloudCustomers) => {
            setCustomers(cloudCustomers);
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeApprovals(
          user.uid,
          (cloudApprovals) => {
            setApprovals(cloudApprovals);
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeNotifications(
          user.uid,
          (cloudNotifications) => {
            setNotifications(cloudNotifications);
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeAccounting(
          user.uid,
          (cloudAccounting) => {
            setAccountingEntries(cloudAccounting);
            stampSynced();
            scheduleCloudPushToLiveRoom();
          },
          handleSnapshotError
        ),
        subscribeDevices(
          user.uid,
          (devices) => {
            setCloudDevices(devices);
          },
          handleSnapshotError
        ),
      ];

      setCloudStatus("connected");

      // After initial Firestore snapshots settle, push authoritative cloud data to live room
      window.setTimeout(() => {
        if (!cancelled) {
          liveClientRef.current?.pushCloudSnapshot(localSnapshotRef.current);
        }
      }, 1000);
    });

    return () => {
      cancelled = true;
      cleanupSubs();
      unsubAuth();
    };
  }, [deviceId, deviceType]);

  const handleConnectCloud = async () => {
    try {
      setCloudStatus("connecting");
      const cred = await signInWithGoogle();
      showToast(
        `สำรองคลาวด์ออนไลน์แล้ว (${cred.user.email || "Google"})`,
        "cloud_done"
      );
    } catch (err) {
      setCloudStatus(cloudUser ? "connected" : "local");
      const code = (err as { code?: string })?.code || "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      showToast(
        "ไม่สามารถเชื่อมต่อบัญชี Google ได้ กรุณาลองใหม่อีกครั้ง",
        "cloud_off"
      );
    }
  };

  const handleDisconnectCloud = async () => {
    try {
      if (cloudUser) {
        await deleteDeviceSessionDoc(cloudUser.uid, deviceId).catch(() => {});
      }
      await signOutUser();
      showToast("ตัดการเชื่อมต่อคลาวด์ Google แล้ว", "cloud_off");
    } catch {
      showToast("ไม่สามารถตัดการเชื่อมต่อคลาวด์ได้", "error");
    }
  };

  const handleSyncAllToGoogleCloud = async () => {
    if (isSyncingCloudAll) return;
    setIsSyncingCloudAll(true);
    try {
      let targetUser = cloudUserRef.current;
      if (!targetUser) {
        setCloudStatus("connecting");
        const cred = await signInWithGoogle();
        targetUser = cred.user;
      }

      if (!targetUser || targetUser.emailVerified === false) {
        showToast(
          "กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันอีเมลแล้ว",
          "error"
        );
        return;
      }

      const summary = await syncFullWorkspaceToCloud(
        targetUser.uid,
        localSnapshotRef.current
      );
      stampSynced();
      showToast(
        `บันทึกข้อมูลทุกอย่างขึ้น Google Cloud สำเร็จ (สินค้า ${summary.products}, ออเดอร์ ${summary.orders}, บัญชี ${summary.accounting} รายการ)`,
        "cloud_done"
      );
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setCloudStatus(cloudUserRef.current ? "connected" : "local");
        return;
      }
      console.error("Full Google Cloud sync failed:", err);
      showToast(
        "ไม่สามารถซิงก์ข้อมูลขึ้น Google Cloud ได้ กรุณาลองใหม่อีกครั้ง",
        "cloud_off"
      );
    } finally {
      setIsSyncingCloudAll(false);
    }
  };

  const handleRenameDevice = (nextName: string) => {
    const clean = saveDeviceName(nextName);
    setDeviceName(clean);
    showToast(`เปลี่ยนชื่อเครื่องเป็น "${clean}" แล้ว`, "devices");
  };

  const handleChangeRoom = (nextRoomId: string) => {
    const clean = persistRoomId(nextRoomId);
    setRoomId(clean);
    showToast(`เชื่อมต่อห้องซิงก์ "${clean}" แล้ว`, "hub");
  };

  // Accounting and weekly sales chart are restricted to Owner mode only
  useEffect(() => {
    if (role === "staff" && activeTab === "accounting") {
      setActiveTab("dashboard");
    }
    if (role === "staff" && activeOrderTab === "weekly_chart") {
      setActiveOrderTab("pending");
    }
  }, [role, activeTab, activeOrderTab]);

  const pushNotification = (
    title: string,
    detail: string,
    type: AppNotification["type"],
    emitLive = true
  ): AppNotification => {
    const noti: AppNotification = {
      id: makeId("noti"),
      title,
      detail,
      time: "เมื่อสักครู่",
      type,
      read: false,
    };
    setNotifications((prev) => [noti, ...prev].slice(0, 50));
    if (emitLive) {
      emitLiveAction("notification:create", { notification: noti });
    }
    if (cloudUser) {
      runCloudWrite(createNotificationDoc(cloudUser.uid, noti));
    }
    return noti;
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
  const totalAccountingIncome = accountingEntries
    .filter((e) => e.type === "income")
    .reduce((sum, e) => sum + e.amountThb, 0);
  const totalAccountingExpense = accountingEntries
    .filter((e) => e.type === "expense")
    .reduce((sum, e) => sum + e.amountThb, 0);
  const netAccountingProfit = totalAccountingIncome - totalAccountingExpense;

  const aiStoreContext = [
    `วันที่ปัจจุบัน: ${new Date().toLocaleDateString("th-TH", {
      dateStyle: "medium",
    })}`,
    `โหมดผู้ใช้งาน: ${role === "owner" ? `เจ้าของร้าน (${ownerName})` : "พนักงานหน้าร้าน"}`,
    `สถานะใช้งานพร้อมกันหลายเครื่อง: ${
      liveStatus === "connected"
        ? `ออนไลน์สด ${mergedDevices.length} เครื่อง (ห้อง ${roomId})`
        : "กำลังเชื่อมต่อ"
    }${cloudStatus === "connected" ? ` · สำรองคลาวด์ Google (${cloudUser?.email || "Cloud"})` : ""}`,
    `ภาพรวมคลังสินค้า: ${products.length} รายการ (SKU), รวม ${totalStockUnits} ชิ้น, สินค้าต่ำกว่าเกณฑ์ต้องสั่งเติม ${lowStockProducts.length} รายการ`,
    ...(role === "owner"
      ? [
          `สรุประบบบัญชี (เฉพาะเจ้าของร้าน): ${accountingEntries.length} รายการ, รายรับรวม ฿${totalAccountingIncome.toLocaleString()}, รายจ่ายรวม ฿${totalAccountingExpense.toLocaleString()}, กำไรสุทธิ ฿${netAccountingProfit.toLocaleString()}`,
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
    if (nextTab === "accounting" && role !== "owner") {
      setActiveTab("dashboard");
      return;
    }
    setActiveTab(nextTab);
  };

  const handleNavigateInventory = (filter?: "all" | "low") => {
    setInventoryInitialFilter(filter || "all");
    setActiveTab("inventory");
  };

  const handleRoleChange = (
    nextRole: RoleMode,
    toastMsg: string,
    icon: string
  ) => {
    setRole(nextRole);
    if (nextRole === "staff" && activeTab === "accounting") {
      setActiveTab("dashboard");
    }
    showToast(toastMsg, icon);
  };

  const handleAddProduct = (newProd: Omit<ProductItem, "id" | "updatedAt">) => {
    const id = makeId("prod");
    const created: ProductItem = {
      ...newProd,
      id,
      updatedAt: "เมื่อสักครู่",
    };
    setProducts((prev) => [created, ...prev]);
    emitLiveAction("product:create", { product: created });
    if (cloudUser) {
      runCloudWrite(
        createProductDoc(cloudUser.uid, id, newProd),
        "บันทึกสินค้าลงคลาวด์ไม่สำเร็จ"
      );
    }
    showToast(`เพิ่มสินค้า "${newProd.name}" เข้าคลังแล้ว`, "add_box");
  };

  const handleAddCategory = (categoryName: string) => {
    if (categories.includes(categoryName)) return;
    const nextCategories = [...categories, categoryName];
    setCategories(nextCategories);
    emitLiveAction("category:add", { categoryName });
    if (cloudUser) {
      runCloudWrite(
        updateWorkspaceSettings(cloudUser.uid, { categories: nextCategories })
      );
    }
    showToast(`เพิ่มหมวดหมู่ "${categoryName}" แล้ว`, "category");
  };

  const dispatchAutoLineAlert = async (
    eventType: AutoLineEventType,
    message: string,
    metadata?: Record<string, string | number | boolean>,
    showFeedbackOnUnconfigured = false
  ) => {
    const result = await sendAutomaticLineNotification({
      eventType,
      targetLineId: ownerLineId,
      message,
      metadata,
    });
    if (result.delivered) {
      showToast(
        `ส่งแจ้งเตือนอัตโนมัติไปยัง LINE (${ownerLineId}) แล้ว`,
        "notifications_active"
      );
    } else if (showFeedbackOnUnconfigured) {
      if (!result.configured) {
        showToast(
          "ยังไม่ได้ตั้งค่า LINE API/Webhook ใน Secrets — พร้อมส่งผ่านปุ่ม LINE ในแอป",
          "info"
        );
      } else {
        showToast(
          result.error || "ไม่สามารถส่งแจ้งเตือนไปยัง LINE API ได้",
          "error"
        );
      }
    }
  };

  const openLowStockLineAlert = (
    items: ProductItem[],
    triggerContext?: string,
    recordNotification = false
  ) => {
    if (items.length === 0) return;
    if (recordNotification) {
      pushNotification(
        `แจ้งเตือนสินค้าใกล้หมด (LINE: ${ownerLineId})`,
        items
          .map((p) => `${p.name} เหลือ ${p.stock}/${p.lowThreshold} ชิ้น`)
          .join(", "),
        "stock"
      );
      void dispatchAutoLineAlert(
        "low_stock",
        buildLowStockLineMessage(items, ownerLineId, triggerContext),
        { count: items.length, triggerContext: triggerContext || "" }
      );
    }
    setLowStockLineAlert({ products: items, triggerContext });
  };

  const handleUpdateProductOwner = (updated: ProductItem) => {
    const previous = products.find((p) => p.id === updated.id);
    const updatedItem: ProductItem = {
      ...(previous || updated),
      name: updated.name,
      sku: updated.sku,
      category: updated.category,
      lowThreshold: updated.lowThreshold,
      stock: updated.stock,
      sellPriceThb: updated.sellPriceThb,
      landedCostThb: updated.landedCostThb,
      imageUrl: updated.imageUrl,
      updatedAt: "เมื่อสักครู่",
    };

    setProducts((prev) =>
      prev.map((p) => (p.id === updated.id ? updatedItem : p))
    );
    emitLiveAction("product:update", {
      productId: updated.id,
      updates: {
        name: updatedItem.name,
        sku: updatedItem.sku,
        category: updatedItem.category,
        lowThreshold: updatedItem.lowThreshold,
        stock: updatedItem.stock,
        sellPriceThb: updatedItem.sellPriceThb,
        landedCostThb: updatedItem.landedCostThb,
        imageUrl: updatedItem.imageUrl,
        updatedAt: updatedItem.updatedAt,
      },
    });
    if (cloudUser) {
      runCloudWrite(
        updateProductDoc(cloudUser.uid, updated.id, {
          name: updatedItem.name,
          sku: updatedItem.sku,
          category: updatedItem.category,
          lowThreshold: updatedItem.lowThreshold,
          stock: updatedItem.stock,
          sellPriceThb: updatedItem.sellPriceThb,
          landedCostThb: updatedItem.landedCostThb,
          ...(updatedItem.imageUrl !== undefined
            ? { imageUrl: updatedItem.imageUrl }
            : {}),
          updatedAtLabel: "เมื่อสักครู่",
        }),
        "อัปเดตสินค้าบนคลาวด์ไม่สำเร็จ"
      );
    }
    showToast(`บันทึกการแก้ไขสินค้า "${updated.name}" เรียบร้อยแล้ว`, "save");

    if (
      updatedItem.stock < updatedItem.lowThreshold &&
      (!previous || updatedItem.stock < previous.stock)
    ) {
      openLowStockLineAlert([updatedItem], "หลังแก้ไขสต็อกสินค้า", true);
    }
  };

  const handleUpdateProductDetails = (
    updated: Pick<
      ProductItem,
      | "id"
      | "name"
      | "sku"
      | "category"
      | "sellPriceThb"
      | "lowThreshold"
      | "imageUrl"
    >
  ) => {
    const patch = {
      name: updated.name,
      sku: updated.sku,
      category: updated.category,
      sellPriceThb: updated.sellPriceThb,
      lowThreshold: updated.lowThreshold,
      imageUrl: updated.imageUrl,
      updatedAt: "เมื่อสักครู่",
    };

    setProducts((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...patch } : p))
    );
    setEditingProduct((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...patch } : prev
    );
    emitLiveAction("product:update", {
      productId: updated.id,
      updates: patch,
    });
    if (cloudUser) {
      runCloudWrite(
        updateProductDoc(cloudUser.uid, updated.id, {
          name: updated.name,
          sku: updated.sku,
          category: updated.category,
          sellPriceThb: updated.sellPriceThb,
          lowThreshold: updated.lowThreshold,
          ...(updated.imageUrl !== undefined
            ? { imageUrl: updated.imageUrl }
            : {}),
          updatedAtLabel: "เมื่อสักครู่",
        }),
        "อัปเดตข้อมูลสินค้าบนคลาวด์ไม่สำเร็จ"
      );
    }
    showToast(`อัปเดตข้อมูลสินค้า "${updated.name}" แล้ว`, "save");
  };

  const handleRequestStockChange = (
    product: ProductItem,
    requestedStock: number,
    reason: string
  ): StockApprovalRequest => {
    const req: StockApprovalRequest = {
      id: `REQ-${Date.now().toString().slice(-5)}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      requestedBy: deviceName || "พนักงานหน้าร้าน",
      currentStock: product.stock,
      requestedStock,
      reason,
      createdAt: new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "pending",
      notifiedLineId: ownerLineId,
    };
    setApprovals((prev) => [req, ...prev]);
    const noti = pushNotification(
      `คำขออนุญาตแก้ไขสต็อก (แจ้ง LINE: ${ownerLineId})`,
      `${product.name} (${product.sku}): ขอปรับ ${product.stock} → ${requestedStock} ชิ้น`,
      "approval",
      false
    );
    emitLiveAction("approval:create", { approval: req, notification: noti });
    if (cloudUser) {
      runCloudWrite(
        createApprovalDoc(cloudUser.uid, req),
        "บันทึกคำขออนุมัติลงคลาวด์ไม่สำเร็จ"
      );
    }
    showToast(
      `ส่งคำขออนุญาตไปที่เจ้าของร้าน (LINE: ${ownerLineId}) แล้ว`,
      "send"
    );
    void dispatchAutoLineAlert(
      "stock_request",
      [
        "📦 [DenewStock] ขออนุญาตแก้ไขจำนวนสต็อก",
        `รหัสคำขอ: #${req.id}`,
        `สินค้า: ${req.productName} (${req.sku})`,
        `สต็อกเดิม: ${req.currentStock} → ขอปรับเป็น: ${req.requestedStock} ชิ้น`,
        `เหตุผล: ${req.reason}`,
        `แจ้งเตือนถึง LINE ID: ${ownerLineId}`,
      ].join("\n"),
      {
        requestId: req.id,
        sku: req.sku,
        currentStock: req.currentStock,
        requestedStock: req.requestedStock,
      }
    );
    return req;
  };

  const handleApproveStockRequest = (reqId: string, approve: boolean) => {
    const target = approvals.find((r) => r.id === reqId);
    if (!target) return;

    const nextStatus = approve ? "approved" : "rejected";
    setApprovals((prev) =>
      prev.map((r) => (r.id === reqId ? { ...r, status: nextStatus } : r))
    );
    emitLiveAction("approval:resolve", { reqId, approve });
    if (cloudUser) {
      runCloudWrite(resolveApprovalDoc(cloudUser.uid, reqId, nextStatus));
    }

    if (approve) {
      const targetProduct = products.find((p) => p.id === target.productId);
      const updatedProduct: ProductItem | null = targetProduct
        ? {
            ...targetProduct,
            stock: target.requestedStock,
            updatedAt: "เมื่อสักครู่",
          }
        : null;

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
      if (cloudUser && targetProduct) {
        runCloudWrite(
          updateProductDoc(cloudUser.uid, targetProduct.id, {
            stock: target.requestedStock,
            updatedAtLabel: "เมื่อสักครู่",
          })
        );
      }
      showToast(
        `อนุมัติปรับสต็อก ${target.sku} เป็น ${target.requestedStock} ชิ้นแล้ว`,
        "check_circle"
      );

      // Automatically push approval alert via LINE API / Webhook to Hnan145
      void dispatchAutoLineAlert(
        "stock_approved",
        buildStockApprovedLineMessage(target, ownerLineId, ownerName),
        {
          requestId: target.id,
          sku: target.sku,
          currentStock: target.currentStock,
          requestedStock: target.requestedStock,
          approvedBy: ownerName,
        }
      );

      if (
        updatedProduct &&
        targetProduct &&
        updatedProduct.stock < updatedProduct.lowThreshold &&
        updatedProduct.stock < targetProduct.stock
      ) {
        openLowStockLineAlert(
          [updatedProduct],
          `หลังอนุมัติปรับสต็อก #${reqId}`,
          true
        );
      }
    } else {
      showToast(`ปฏิเสธคำขอปรับสต็อก ${target.sku} แล้ว`, "cancel");
    }
  };

  const handleToggleItemPicked = (orderId: string, itemIndex: number) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.status === "shipped") return;
    const nextItems = targetOrder.items.map((item, idx) =>
      idx === itemIndex ? { ...item, picked: !item.picked } : item
    );

    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, items: nextItems } : order
      )
    );
    emitLiveAction("order:toggle_pick", { orderId, itemIndex });
    if (cloudUser) {
      runCloudWrite(updateOrderItemsDoc(cloudUser.uid, orderId, nextItems));
    }
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

    const newlyLowProducts: ProductItem[] = [];
    const updatedProductsForCloud: ProductItem[] = [];
    const nextProducts = products.map((prod) => {
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
      const updatedProd: ProductItem = {
        ...prod,
        stock: nextStock,
        ...(updatedColors ? { colors: updatedColors } : {}),
        updatedAt: "ตัดสต็อกอัตโนมัติ",
      };
      updatedProductsForCloud.push(updatedProd);

      const colorJustRanOut = Boolean(
        updatedColors?.some((c, idx) => {
          const prevColorStock = prod.colors?.[idx]?.stock;
          return (
            typeof c.stock === "number" &&
            c.stock <= 0 &&
            typeof prevColorStock === "number" &&
            prevColorStock > 0
          );
        })
      );

      if (nextStock < prod.lowThreshold || colorJustRanOut) {
        newlyLowProducts.push(updatedProd);
      }

      return updatedProd;
    });

    const pickedItems = order.items.map((i) => ({ ...i, picked: true }));

    setProducts(nextProducts);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "packing", items: pickedItems } : o
      )
    );
    emitLiveAction("order:pack", { orderId });

    if (cloudUser) {
      runCloudWrite(packOrderDoc(cloudUser.uid, orderId, pickedItems));
      updatedProductsForCloud.forEach((p) => {
        runCloudWrite(
          updateProductDoc(cloudUser.uid, p.id, {
            stock: p.stock,
            ...(p.colors ? { colors: p.colors } : {}),
            updatedAtLabel: "ตัดสต็อกอัตโนมัติ",
          })
        );
      });
    }

    showToast(`แพ็ค #${orderId} สำเร็จ — ตัดสต็อกอัตโนมัติแล้ว`, "check_circle");

    if (newlyLowProducts.length > 0) {
      openLowStockLineAlert(
        newlyLowProducts,
        `หลังตัดสต็อกออเดอร์ #${orderId}`,
        true
      );
    }
  };

  const handleMarkReadyToShip = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== "packing") return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "ready_to_ship" } : o
      )
    );
    emitLiveAction("order:ready_to_ship", { orderId });
    if (cloudUser) {
      runCloudWrite(markOrderReadyToShipDoc(cloudUser.uid, orderId));
    }
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

    const shipUpdates = {
      shippingOption: options.shippingOption,
      carrierName: options.carrierName,
      courier: options.courier,
      trackingCode: tracking,
    };

    const updatedOrder: Order = {
      ...targetOrder,
      status: "shipped",
      ...shipUpdates,
    };

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? updatedOrder : o))
    );
    emitLiveAction("order:ship", { orderId, updates: shipUpdates });
    if (cloudUser) {
      runCloudWrite(
        confirmOrderShipDoc(cloudUser.uid, orderId, shipUpdates)
      );
    }

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

    const deliveryUpdates = {
      deliveryMethod: payload.method,
      deliveryProofImage: payload.proofImage,
      cashReceivedThb: payload.cashReceivedThb,
      deliveryNote: payload.note,
      deliveryConfirmedAt: confirmedTime,
    };

    setOrders((prev) =>
      prev.map((o) =>
        o.id === payload.orderId ? { ...o, ...deliveryUpdates } : o
      )
    );
    emitLiveAction("order:confirm_delivery", {
      orderId: payload.orderId,
      updates: deliveryUpdates,
    });
    if (cloudUser) {
      runCloudWrite(
        confirmOrderDeliveryDoc(cloudUser.uid, {
          ...payload,
          confirmedAt: confirmedTime,
        })
      );
    }

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
      createdAtMillis: Date.now(),
      items,
    };
    setOrders((prev) => [newOrder, ...prev]);

    // Auto-log income entry in Accounting ledger for this order
    let createdAccEntry: AccountingEntry | undefined;
    if (totalThb > 0) {
      const accId = makeId("acc");
      const accEntryData: Omit<AccountingEntry, "id"> = {
        date: getTodayIso(),
        type: "income",
        category: "ยอดขายสินค้า",
        title: `ยอดขายออเดอร์ #${newId} (${customerName})`,
        amountThb: totalThb,
        paymentMethod: orderType === "walk_in" ? "เงินสด" : "โอนธนาคาร",
        referenceCode: newId,
        note: items
          .map(
            (i) =>
              `${i.name}${i.colorName ? `(${i.colorName})` : ""} x${i.quantity}`
          )
          .join(", "),
        sourceOrderId: newId,
      };
      createdAccEntry = { id: accId, ...accEntryData };
      setAccountingEntries((prev) => [createdAccEntry!, ...prev]);
      if (cloudUser) {
        runCloudWrite(createAccountingDoc(cloudUser.uid, accId, accEntryData));
      }
    }

    const typeLabel = orderType === "walk_in" ? "Walk-in" : "ส่งของ";
    const noti = pushNotification(
      `ออเดอร์ใหม่ #${newId} (${typeLabel})`,
      `${customerName} · ฿${totalThb.toLocaleString()}`,
      "order",
      false
    );

    emitLiveAction("order:create", {
      order: newOrder,
      accountingEntry: createdAccEntry,
      notification: noti,
    });

    if (cloudUser) {
      runCloudWrite(
        createOrderDoc(cloudUser.uid, newOrder),
        "บันทึกออเดอร์ลงคลาวด์ไม่สำเร็จ"
      );
    }

    setPreselectedOrderCustomer(null);
    setPreselectedOrderProduct(null);
    setActiveOrderTab("pending");
    setActiveTab("orders");
    showToast(`สร้างออเดอร์ #${newId} (${typeLabel}) สำเร็จ`, "add_shopping_cart");

    // Automatically push new order alert via LINE API / Webhook to Hnan145
    void dispatchAutoLineAlert(
      "new_order",
      buildNewOrderLineMessage(newOrder, ownerLineId),
      {
        orderId: newOrder.id,
        customerName: newOrder.customerName,
        orderType: newOrder.orderType || "delivery",
        totalThb: newOrder.totalThb,
        itemCount: newOrder.items.length,
      }
    );
  };

  // --- Accounting Handlers (Owner-only) ---

  const handleAddAccountingEntry = (entry: Omit<AccountingEntry, "id">) => {
    if (role !== "owner") return;
    const id = makeId("acc");
    const created: AccountingEntry = { id, ...entry };
    setAccountingEntries((prev) => [created, ...prev]);
    emitLiveAction("accounting:create", { entry: created });
    if (cloudUser) {
      runCloudWrite(
        createAccountingDoc(cloudUser.uid, id, entry),
        "บันทึกรายการบัญชีลงคลาวด์ไม่สำเร็จ"
      );
    }
    showToast(
      `บันทึก${entry.type === "income" ? "รายรับ" : "รายจ่าย"} ฿${entry.amountThb.toLocaleString()} แล้ว`,
      "account_balance_wallet"
    );
  };

  const handleUpdateAccountingEntry = (
    id: string,
    updates: Omit<AccountingEntry, "id">
  ) => {
    if (role !== "owner") return;
    setAccountingEntries((prev) =>
      prev.map((e) => (e.id === id ? { id, ...updates } : e))
    );
    emitLiveAction("accounting:update", { entryId: id, updates });
    if (cloudUser) {
      runCloudWrite(
        updateAccountingDoc(cloudUser.uid, id, updates),
        "อัปเดตรายการบัญชีบนคลาวด์ไม่สำเร็จ"
      );
    }
    showToast("อัปเดตรายการบัญชีเรียบร้อยแล้ว", "save");
  };

  const handleDeleteAccountingEntry = (id: string) => {
    if (role !== "owner") return;
    setAccountingEntries((prev) => prev.filter((e) => e.id !== id));
    emitLiveAction("accounting:delete", { entryId: id });
    if (cloudUser) {
      runCloudWrite(deleteAccountingDoc(cloudUser.uid, id));
    }
    showToast("ลบรายการบัญชีเรียบร้อยแล้ว", "delete");
  };

  const handleClearAllAccountingEntries = () => {
    if (role !== "owner") return;
    const ids = accountingEntries.map((e) => e.id);
    setAccountingEntries([]);
    emitLiveAction("accounting:clear", {});
    if (cloudUser && ids.length > 0) {
      runCloudWrite(deleteDocsBatch(cloudUser.uid, "accounting", ids));
    }
    showToast("ล้างรายการบัญชีทั้งหมดแล้ว", "delete_sweep");
  };

  const handleSyncOrdersToAccounting = () => {
    if (role !== "owner") return;
    const syncedOrderIds = new Set(
      accountingEntries
        .map((e) => e.sourceOrderId)
        .filter((id): id is string => Boolean(id))
    );
    const unsyncedOrders = orders.filter(
      (o) => !syncedOrderIds.has(o.id) && o.totalThb > 0
    );

    if (unsyncedOrders.length === 0) {
      showToast("ออเดอร์ทั้งหมดถูกบันทึกลงสมุดบัญชีครบแล้ว", "check_circle");
      return;
    }

    const today = getTodayIso();
    const newEntries: AccountingEntry[] = unsyncedOrders.map((order, idx) => ({
      id: `${makeId("acc")}-${idx}`,
      date: today,
      type: "income",
      category: "ยอดขายสินค้า",
      title: `ยอดขายออเดอร์ #${order.id} (${order.customerName})`,
      amountThb: order.totalThb,
      paymentMethod:
        order.deliveryMethod === "cash" || order.orderType === "walk_in"
          ? "เงินสด"
          : "โอนธนาคาร",
      referenceCode: order.id,
      note: order.items
        .map(
          (i) =>
            `${i.name}${i.colorName ? `(${i.colorName})` : ""} x${i.quantity}`
        )
        .join(", "),
      sourceOrderId: order.id,
    }));

    setAccountingEntries((prev) => [...newEntries, ...prev]);
    emitLiveAction("accounting:sync_orders", { entries: newEntries });
    if (cloudUser) {
      newEntries.forEach(({ id, ...rest }) => {
        runCloudWrite(createAccountingDoc(cloudUser.uid, id, rest));
      });
    }
    showToast(
      `ดึงยอดขายจากออเดอร์เข้าบัญชี ${newEntries.length} รายการแล้ว`,
      "sync"
    );
  };

  const handleUpdatePromptPayConfig = (config: {
    promptPayId: string;
    promptPayName: string;
  }) => {
    const cleanId = config.promptPayId.trim().slice(0, 20);
    const cleanName = config.promptPayName.trim().slice(0, 80);
    setPromptPayId(cleanId);
    setPromptPayName(cleanName);
    emitLiveAction("settings:update", {
      promptPayId: cleanId,
      promptPayName: cleanName,
    });
    if (cloudUser) {
      runCloudWrite(
        updateWorkspaceSettings(cloudUser.uid, {
          promptPayId: cleanId,
          promptPayName: cleanName,
        }),
        "บันทึกบัญชีพร้อมเพย์ขึ้นคลาวด์ไม่สำเร็จ"
      );
    }
    showToast("บันทึกบัญชีรับเงินพร้อมเพย์ (QR) เรียบร้อยแล้ว", "qr_code_2");
  };

  const handleRecordPromptPayPayment = (
    order: Order,
    paidAmountThb: number
  ) => {
    const amount = Number.isFinite(paidAmountThb) && paidAmountThb > 0
      ? Number(paidAmountThb.toFixed(2))
      : order.totalThb;
    const existing = accountingEntries.find(
      (e) => e.sourceOrderId === order.id
    );

    if (existing) {
      const updatedFields: Omit<AccountingEntry, "id"> = {
        date: existing.date || getTodayIso(),
        type: "income",
        category: existing.category || "ยอดขายสินค้า",
        title: `รับโอนพร้อมเพย์ออเดอร์ #${order.id} (${order.customerName})`,
        amountThb: amount,
        paymentMethod: "พร้อมเพย์",
        referenceCode: existing.referenceCode || order.id,
        note:
          existing.note ||
          order.items
            .map(
              (i) =>
                `${i.name}${i.colorName ? `(${i.colorName})` : ""} x${i.quantity}`
            )
            .join(", "),
        sourceOrderId: order.id,
        ...(existing.receiptImageUrl
          ? { receiptImageUrl: existing.receiptImageUrl }
          : {}),
      };
      setAccountingEntries((prev) =>
        prev.map((e) =>
          e.id === existing.id ? { id: existing.id, ...updatedFields } : e
        )
      );
      emitLiveAction("accounting:update", {
        entryId: existing.id,
        updates: updatedFields,
      });
      if (cloudUser) {
        runCloudWrite(
          updateAccountingDoc(cloudUser.uid, existing.id, updatedFields),
          "อัปเดตรายการรับโอนพร้อมเพย์บนคลาวด์ไม่สำเร็จ"
        );
      }
    } else {
      const accId = makeId("acc");
      const entryData: Omit<AccountingEntry, "id"> = {
        date: getTodayIso(),
        type: "income",
        category: "ยอดขายสินค้า",
        title: `รับโอนพร้อมเพย์ออเดอร์ #${order.id} (${order.customerName})`,
        amountThb: amount,
        paymentMethod: "พร้อมเพย์",
        referenceCode: order.id,
        note: order.items
          .map(
            (i) =>
              `${i.name}${i.colorName ? `(${i.colorName})` : ""} x${i.quantity}`
          )
          .join(", "),
        sourceOrderId: order.id,
      };
      const created: AccountingEntry = { id: accId, ...entryData };
      setAccountingEntries((prev) => [created, ...prev]);
      emitLiveAction("accounting:create", { entry: created });
      if (cloudUser) {
        runCloudWrite(
          createAccountingDoc(cloudUser.uid, accId, entryData),
          "บันทึกรับโอนพร้อมเพย์ลงคลาวด์ไม่สำเร็จ"
        );
      }
    }

    showToast(
      `ยืนยันรับโอนพร้อมเพย์ #${order.id} (฿${amount.toLocaleString()}) และบันทึกลงบัญชีแล้ว`,
      "task_alt"
    );
  };

  // --- Customer & Owner Delete Handlers ---

  const handleCreateCustomer = (data: Omit<Customer, "id" | "createdAt">) => {
    const id = makeId("cust");
    const createdAt = new Date().toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
    const newCustomer: Customer = {
      ...data,
      id,
      createdAt,
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    emitLiveAction("customer:create", { customer: newCustomer });
    if (cloudUser) {
      runCloudWrite(
        createCustomerDoc(cloudUser.uid, id, { ...data, createdAt })
      );
    }
    showToast(`เพิ่มลูกค้า "${data.name}" เรียบร้อยแล้ว`, "person_add");
  };

  const handleUpdateCustomer = (
    customerId: string,
    updates: Omit<Customer, "id" | "createdAt">
  ) => {
    const cleanUpdates = {
      name: updates.name,
      phone: updates.phone || "",
      lineId: updates.lineId || "",
      email: updates.email || "",
      address: updates.address || "",
      note: updates.note || "",
    };
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, ...cleanUpdates } : c))
    );
    emitLiveAction("customer:update", { customerId, updates: cleanUpdates });
    if (cloudUser) {
      runCloudWrite(updateCustomerDoc(cloudUser.uid, customerId, updates));
    }
    showToast(`อัปเดตข้อมูล "${updates.name}" แล้ว`, "save");
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (role !== "owner") return;
    const target = customers.find((c) => c.id === customerId);
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    emitLiveAction("customer:delete", { customerId });
    if (cloudUser) {
      runCloudWrite(deleteCustomerDoc(cloudUser.uid, customerId));
    }
    showToast(
      `ลบลูกค้า "${target?.name || ""}" ออกจากรายชื่อแล้ว`,
      "person_remove"
    );
  };

  const handleDeleteProduct = (productId: string) => {
    if (role !== "owner") return;
    const target = products.find((p) => p.id === productId);
    const relatedApprovalIds = approvals
      .filter((a) => a.productId === productId)
      .map((a) => a.id);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setApprovals((prev) => prev.filter((a) => a.productId !== productId));
    setEditingProduct((prev) => (prev?.id === productId ? null : prev));
    setPreselectedOrderProduct((prev) => (prev?.id === productId ? null : prev));
    emitLiveAction("product:delete", { productId });
    if (cloudUser) {
      runCloudWrite(deleteProductDoc(cloudUser.uid, productId));
      if (relatedApprovalIds.length > 0) {
        runCloudWrite(
          deleteDocsBatch(cloudUser.uid, "approvals", relatedApprovalIds)
        );
      }
    }
    showToast(
      `ลบสินค้า "${target?.name || ""}" ออกจากคลังแล้ว`,
      "delete"
    );
  };

  const handleDeleteCategory = (categoryName: string) => {
    if (role !== "owner") return;
    if (categories.length <= 1) return;
    const remaining = categories.filter((c) => c !== categoryName);
    setCategories(remaining);
    const fallbackCategory = remaining[0];
    const affectedProductIds = products
      .filter((p) => p.category === categoryName)
      .map((p) => p.id);
    if (fallbackCategory) {
      setProducts((prev) =>
        prev.map((p) =>
          p.category === categoryName ? { ...p, category: fallbackCategory } : p
        )
      );
    }
    emitLiveAction("category:delete", { categoryName });
    if (cloudUser) {
      runCloudWrite(
        updateWorkspaceSettings(cloudUser.uid, { categories: remaining })
      );
      if (fallbackCategory) {
        affectedProductIds.forEach((pid) => {
          runCloudWrite(
            updateProductDoc(cloudUser.uid, pid, { category: fallbackCategory })
          );
        });
      }
    }
    showToast(`ลบหมวดหมู่ "${categoryName}" แล้ว`, "delete");
  };

  const handleDeleteOrder = (orderId: string) => {
    if (role !== "owner") return;
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setPrintingOrder((prev) => (prev?.id === orderId ? null : prev));
    setPaymentQrOrder((prev) => (prev?.id === orderId ? null : prev));
    setConfirmingDeliveryOrder((prev) => (prev?.id === orderId ? null : prev));
    emitLiveAction("order:delete", { orderId });
    if (cloudUser) {
      runCloudWrite(deleteOrderDoc(cloudUser.uid, orderId));
    }
    showToast(`ลบออเดอร์ #${orderId} เรียบร้อยแล้ว`, "delete");
  };

  const handleDeleteNotification = (notiId: string) => {
    if (role !== "owner") return;
    setNotifications((prev) => prev.filter((n) => n.id !== notiId));
    emitLiveAction("notification:delete", { notiId });
    if (cloudUser) {
      runCloudWrite(deleteNotificationDoc(cloudUser.uid, notiId));
    }
    showToast("ลบการแจ้งเตือนแล้ว", "delete");
  };

  const handleClearAllNotifications = () => {
    if (role !== "owner") return;
    const ids = notifications.map((n) => n.id);
    setNotifications([]);
    emitLiveAction("notification:clear", {});
    if (cloudUser && ids.length > 0) {
      runCloudWrite(deleteDocsBatch(cloudUser.uid, "notifications", ids));
    }
    showToast("ลบการแจ้งเตือนทั้งหมดแล้ว", "delete_sweep");
  };

  const handleDeleteApprovalRequest = (reqId: string) => {
    if (role !== "owner") return;
    setApprovals((prev) => prev.filter((a) => a.id !== reqId));
    emitLiveAction("approval:delete", { reqId });
    if (cloudUser) {
      runCloudWrite(deleteApprovalDoc(cloudUser.uid, reqId));
    }
    showToast(`ลบคำขออนุมัติ #${reqId} แล้ว`, "delete");
  };

  const handleClearAllApprovals = () => {
    if (role !== "owner") return;
    const ids = approvals.map((a) => a.id);
    setApprovals([]);
    emitLiveAction("approval:clear", {});
    if (cloudUser && ids.length > 0) {
      runCloudWrite(deleteDocsBatch(cloudUser.uid, "approvals", ids));
    }
    showToast("ลบคำขออนุมัติทั้งหมดแล้ว", "delete_sweep");
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
    emitLiveAction("customer:import", { customers: imported });
    if (cloudUser) {
      imported.forEach((c) => {
        runCloudWrite(
          createCustomerDoc(cloudUser.uid, c.id, {
            name: c.name,
            createdAt: c.createdAt,
          })
        );
      });
    }
    showToast(`นำเข้าลูกค้าจากออเดอร์เดิม ${names.length} รายแล้ว`, "group_add");
  };

  const handleSyncNow = () => {
    liveClientRef.current?.requestResync();
    void fetchLiveCnyRate(true);
    if (cloudUser) {
      liveClientRef.current?.pushCloudSnapshot(localSnapshotRef.current);
    }
    stampSynced();
    showToast("ดึงข้อมูลเรียลไทม์ล่าสุดแล้ว", "sync");
  };

  const liveSyncDisplayLabel =
    liveStatus === "connected"
      ? `สด ${mergedDevices.length} เครื่อง · ${lastSyncedLabel}`
      : cloudStatus === "connected"
        ? `คลาวด์ · ${lastSyncedLabel}`
        : lastSyncedLabel;

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
        ownerLineId={ownerLineId}
        onNotifyLowStockLine={(items) =>
          openLowStockLineAlert(items, "สรุปรายการสินค้าใกล้หมด")
        }
        onSelectLowStockProduct={(prod) => {
          setActiveTab("inventory");
          setEditingProduct(prod);
        }}
        notifications={notifications}
        onMarkAllRead={() => {
          const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          emitLiveAction("notification:read_all", {});
          if (cloudUser) {
            unreadIds.forEach((id) => {
              runCloudWrite(markNotificationReadDoc(cloudUser.uid, id));
            });
          }
        }}
        onSelectNotification={(noti) => {
          if (!noti.read) {
            setNotifications((prev) =>
              prev.map((n) => (n.id === noti.id ? { ...n, read: true } : n))
            );
            emitLiveAction("notification:read", { notiId: noti.id });
            if (cloudUser) {
              runCloudWrite(markNotificationReadDoc(cloudUser.uid, noti.id));
            }
          }
          if (noti.type === "order") setActiveTab("orders");
          else if (noti.type === "stock") setActiveTab("inventory");
          else if (noti.type === "approval") setActiveTab("owner-auth");
        }}
        onDeleteNotification={handleDeleteNotification}
        onClearAllNotifications={handleClearAllNotifications}
        cloudStatus={cloudStatus}
        cloudUserEmail={cloudUser?.email}
        liveStatus={liveStatus}
        onlineDevicesCount={mergedDevices.length}
        onCloudSyncClick={() => setShowMultiDeviceModal(true)}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 pt-18 md:pt-20 pb-24 md:pb-10">
        {role === "owner" && activeTab === "accounting" && (
          <AccountingView
            role={role}
            entries={accountingEntries}
            orders={orders}
            products={products}
            onAddEntry={handleAddAccountingEntry}
            onUpdateEntry={handleUpdateAccountingEntry}
            onDeleteEntry={handleDeleteAccountingEntry}
            onClearAllEntries={handleClearAllAccountingEntries}
            onSyncOrdersToAccounting={handleSyncOrdersToAccounting}
            onNotify={showToast}
            cloudStatus={cloudStatus}
            cloudUserEmail={cloudUser?.email}
            isSyncingCloudAll={isSyncingCloudAll}
            onConnectCloud={() => void handleConnectCloud()}
            onSyncAllToCloud={() => void handleSyncAllToGoogleCloud()}
          />
        )}

        {activeTab === "dashboard" && (
          <DashboardView
            role={role}
            products={products}
            orders={orders}
            categories={categories}
            ownerLineId={ownerLineId}
            lastSyncedLabel={liveSyncDisplayLabel}
            liveStatus={liveStatus}
            cloudStatus={cloudStatus}
            onlineDevicesCount={mergedDevices.length}
            liveLatencyMs={liveLatencyMs}
            liveEvents={liveEvents}
            liveCnyRate={liveCnyRate}
            isRefreshingRate={isRefreshingRate}
            onRefreshRate={() => void fetchLiveCnyRate(true)}
            onOpenMultiDevice={() => setShowMultiDeviceModal(true)}
            onSyncNow={handleSyncNow}
            onQuickCreateOrder={handleQuickCreateOrder}
            onQuickCreateOrderForProduct={handleQuickCreateOrderForProduct}
            onNavigateInventory={handleNavigateInventory}
            onNavigateOrdersWithTab={(tab) => {
              setActiveOrderTab(tab);
              setActiveTab("orders");
            }}
            onNavigateAccounting={() => setActiveTab("accounting")}
            onOpenAddProduct={() => setShowAddProductModal(true)}
            onSelectProductForEdit={(prod) => setEditingProduct(prod)}
            onConfirmPack={handleConfirmPack}
            onMarkReadyToShip={handleMarkReadyToShip}
            onOpenPaymentQr={(order) => setPaymentQrOrder(order)}
            onNotifyLowStockLine={(items) =>
              openLowStockLineAlert(items, "รายการสินค้าใกล้หมด/ต้องสั่งเติม")
            }
            onDeleteOrder={handleDeleteOrder}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryView
            role={role}
            products={products}
            categories={categories}
            ownerLineId={ownerLineId}
            initialStockFilter={inventoryInitialFilter}
            onConsumeInitialFilter={() => setInventoryInitialFilter(undefined)}
            onNotifyLowStockLine={(items) =>
              openLowStockLineAlert(items, "รายการสินค้าใกล้หมด/ต้องสั่งเติม")
            }
            lastSyncedLabel={liveSyncDisplayLabel}
            onSyncNow={handleSyncNow}
            onQuickCreateOrderForProduct={handleQuickCreateOrderForProduct}
            onNavigateAccounting={() => setActiveTab("accounting")}
            onOpenAddProduct={() => setShowAddProductModal(true)}
            onAddCategory={handleAddCategory}
            onSelectProduct={(prod) => setEditingProduct(prod)}
            onDeleteProduct={handleDeleteProduct}
            onDeleteCategory={handleDeleteCategory}
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
            onOpenPaymentQr={(order) => setPaymentQrOrder(order)}
            onOpenDeliveryConfirm={(order) => setConfirmingDeliveryOrder(order)}
            onDeleteOrder={handleDeleteOrder}
          />
        )}

        {activeTab === "customers" && (
          <CustomersView
            role={role}
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
              emitLiveAction("settings:update", { ownerName: newName });
              if (cloudUser) {
                runCloudWrite(
                  updateWorkspaceSettings(cloudUser.uid, { ownerName: newName })
                );
              }
              showToast(`อัปเดตชื่อเจ้าของร้านเป็น "${newName}" แล้ว`, "badge");
            }}
            ownerPin={ownerPin}
            onChangeOwnerPin={(newPin) => {
              setOwnerPin(newPin);
              emitLiveAction("settings:update", { ownerPin: newPin });
              if (cloudUser) {
                runCloudWrite(
                  updateWorkspaceSettings(cloudUser.uid, { ownerPin: newPin })
                );
              }
              showToast("เปลี่ยนรหัสผ่านเจ้าของร้านเรียบร้อยแล้ว", "key");
            }}
            ownerLineId={ownerLineId}
            onUpdateOwnerLineId={(newLineId) => {
              setOwnerLineId(newLineId);
              emitLiveAction("settings:update", { ownerLineId: newLineId });
              if (cloudUser) {
                runCloudWrite(
                  updateWorkspaceSettings(cloudUser.uid, {
                    ownerLineId: newLineId,
                  })
                );
              }
              showToast(`อัปเดต LINE ID แจ้งเตือนเป็น "${newLineId}" แล้ว`, "chat");
            }}
            promptPayId={promptPayId}
            promptPayName={promptPayName}
            onUpdatePromptPayConfig={handleUpdatePromptPayConfig}
            onTestLineAutoNotify={() =>
              void dispatchAutoLineAlert(
                "test",
                `🔔 [DenewStock] ทดสอบการส่งข้อความแจ้งเตือนอัตโนมัติไปยัง LINE ID: ${ownerLineId} (${new Date().toLocaleTimeString(
                  "th-TH",
                  { hour: "2-digit", minute: "2-digit" }
                )} น.)`,
                { test: true },
                true
              )
            }
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
            onDeleteApprovalRequest={handleDeleteApprovalRequest}
            onClearAllApprovals={handleClearAllApprovals}
            onNotify={showToast}
            cloudStatus={cloudStatus}
            cloudUserEmail={cloudUser?.email}
            isSyncingCloudAll={isSyncingCloudAll}
            liveStatus={liveStatus}
            onlineDevicesCount={mergedDevices.length}
            roomId={roomId}
            onOpenMultiDevice={() => setShowMultiDeviceModal(true)}
            onConnectCloud={() => void handleConnectCloud()}
            onDisconnectCloud={() => void handleDisconnectCloud()}
            onSyncAllToCloud={() => void handleSyncAllToGoogleCloud()}
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
      {showMultiDeviceModal && (
        <MultiDeviceModal
          liveStatus={liveStatus}
          roomId={roomId}
          currentDeviceId={deviceId}
          currentDeviceName={deviceName}
          devices={mergedDevices}
          cloudStatus={cloudStatus}
          cloudUserEmail={cloudUser?.email}
          isSyncingCloudAll={isSyncingCloudAll}
          cloudRecordCounts={{
            products: products.length,
            orders: orders.length,
            customers: customers.length,
            accounting: accountingEntries.length,
          }}
          onRenameDevice={handleRenameDevice}
          onChangeRoom={handleChangeRoom}
          onConnectCloud={() => void handleConnectCloud()}
          onDisconnectCloud={() => void handleDisconnectCloud()}
          onSyncAllToCloud={() => void handleSyncAllToGoogleCloud()}
          onNotify={showToast}
          onClose={() => setShowMultiDeviceModal(false)}
        />
      )}

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
          categories={categories}
          ownerLineId={ownerLineId}
          pendingRequest={
            approvals.find(
              (a) =>
                a.productId === editingProduct.id && a.status === "pending"
            ) || null
          }
          onClose={() => setEditingProduct(null)}
          onUpdateOwner={handleUpdateProductOwner}
          onUpdateProductDetails={handleUpdateProductDetails}
          onRequestStockChange={handleRequestStockChange}
          onDeleteProduct={handleDeleteProduct}
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

      {paymentQrOrder && (
        <OrderPaymentQrModal
          order={paymentQrOrder}
          role={role}
          ownerName={ownerName}
          promptPayId={promptPayId}
          promptPayName={promptPayName}
          isAlreadyRecordedInAccounting={accountingEntries.some(
            (e) =>
              e.sourceOrderId === paymentQrOrder.id &&
              e.paymentMethod === "พร้อมเพย์"
          )}
          onSavePromptPayConfig={handleUpdatePromptPayConfig}
          onRecordPromptPayPayment={handleRecordPromptPayPayment}
          onNotify={showToast}
          onClose={() => setPaymentQrOrder(null)}
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

      {lowStockLineAlert && (
        <LowStockLineAlertModal
          products={lowStockLineAlert.products}
          ownerLineId={ownerLineId}
          triggerContext={lowStockLineAlert.triggerContext}
          onClose={() => setLowStockLineAlert(null)}
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
