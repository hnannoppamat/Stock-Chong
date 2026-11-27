export type TabId =
  | "dashboard"
  | "inventory"
  | "accounting"
  | "orders"
  | "customers"
  | "owner-auth";

export type RoleMode = "owner" | "staff";

export type ProductOrigin = "cn" | "th";

export type OrderChannel = "Shopee" | "TikTok Shop" | "Line OA" | "หน้าร้าน";

export type OrderStatus = "pending" | "packing" | "ready_to_ship" | "shipped";

export type OrdersTab = OrderStatus | "weekly_chart";

export type OrderFulfillmentType = "walk_in" | "delivery";

export type ShippingOption = "store_delivery" | "carrier" | "store_pickup";

export type CourierName =
  | "Flash Express"
  | "J&T Express"
  | "Kerry Express"
  | "ไปรษณีย์ไทย";

export type AccountingEntryType = "income" | "expense";

export type AccountingPaymentMethod =
  | "เงินสด"
  | "โอนธนาคาร"
  | "พร้อมเพย์"
  | "บัตรเครดิต"
  | "แพลตฟอร์ม (Shopee/TikTok)";

export interface AccountingEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: AccountingEntryType;
  category: string;
  title: string;
  amountThb: number;
  paymentMethod: AccountingPaymentMethod;
  referenceCode?: string;
  note?: string;
  sourceOrderId?: string;
  receiptImageUrl?: string;
}

export interface ProductColorVariant {
  name: string;
  hex: string;
  stock?: number;
  imageUrl?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  origin: ProductOrigin;
  category: string;
  stock: number;
  lowThreshold: number;
  landedCostThb: number;
  cnyUnitPrice?: number;
  freightPerUnitThb?: number;
  sellPriceThb: number;
  imageUrl?: string;
  colors?: ProductColorVariant[];
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceThb: number;
  picked: boolean;
  imageUrl?: string;
  colorName?: string;
  colorHex?: string;
}

export type DeliveryConfirmationMethod = "photo_proof" | "cash";

export interface Order {
  id: string;
  customerId?: string;
  customerName: string;
  channel?: string;
  orderType?: OrderFulfillmentType;
  status: OrderStatus;
  totalThb: number;
  createdAt: string;
  createdAtMillis?: number;
  shippingOption?: ShippingOption;
  carrierName?: string;
  courier?: CourierName;
  trackingCode?: string;
  deliveryMethod?: DeliveryConfirmationMethod;
  deliveryProofImage?: string;
  cashReceivedThb?: number;
  deliveryNote?: string;
  deliveryConfirmedAt?: string;
  items: OrderItem[];
}

export interface StockApprovalRequest {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  requestedBy: string;
  currentStock: number;
  requestedStock: number;
  reason: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  notifiedLineId?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  time: string;
  type: "order" | "stock" | "approval" | "system";
  read: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  lineId?: string;
  email?: string;
  address?: string;
  note?: string;
  createdAt: string;
}

export type DeviceFormFactor = "mobile" | "tablet" | "desktop";

export interface ConnectedDevice {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceFormFactor;
  roleMode: RoleMode;
  roomId?: string;
  connectedAt?: string;
  lastActiveAt: number;
  source?: "live" | "cloud";
}

export interface LiveActivityEvent {
  id: string;
  action: string;
  summary: string;
  category:
    | "order"
    | "stock"
    | "accounting"
    | "customer"
    | "approval"
    | "cloud"
    | "system";
  deviceName: string;
  timestamp: number;
  source: "live" | "cloud";
}

export interface LiveExchangeRate {
  pair: string;
  rate: number;
  updatedAt: string;
  source: string;
  isFallback?: boolean;
}

export interface LiveStoreSnapshot {
  version: number;
  ownerName: string;
  ownerPin: string;
  ownerLineId: string;
  promptPayId?: string;
  promptPayName?: string;
  categories: string[];
  products: ProductItem[];
  orders: Order[];
  customers: Customer[];
  approvals: StockApprovalRequest[];
  notifications: AppNotification[];
  accountingEntries: AccountingEntry[];
  recentEvents?: LiveActivityEvent[];
}
