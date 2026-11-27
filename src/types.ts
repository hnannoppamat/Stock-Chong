export type TabId =
  | "dashboard"
  | "inventory"
  | "ai-scanner"
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

export interface ScannedBillItem {
  id: string;
  chineseName: string;
  thaiName: string;
  sku: string;
  category: string;
  quantity: number;
  unitPriceCny: number;
  imageUrl?: string;
  productType?: string;
  material?: string;
  colorVariants?: string[];
  sizeSpec?: string;
  suggestedSellPriceThb?: number;
  aiReason?: string;
  isNewCategory?: boolean;
  matchedExistingSku?: string;
  confidence?: number;
}

export interface BillAiAnalysis {
  summary: string;
  supplierType?: string;
  currencyDetected?: string;
  keyHighlights: string[];
  suggestedNewCategories?: string[];
  analyzedAt?: string;
}

export interface ScannedInvoice {
  title: string;
  code: string;
  confidence: number;
  imageUrl: string;
  items: ScannedBillItem[];
  aiAnalysis?: BillAiAnalysis;
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
