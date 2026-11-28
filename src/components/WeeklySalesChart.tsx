import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Order } from "../types";

interface WeeklySalesChartProps {
  orders: Order[];
  onOpenCreateOrder: () => void;
}

type ChartMode = "revenue" | "trend";

interface DailyBucket {
  dateKey: string;
  dayLabel: string;
  fullDateLabel: string;
  walkInSales: number;
  deliverySales: number;
  totalSales: number;
  orderCount: number;
  walkInCount: number;
  deliveryCount: number;
}

const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWalkInOrder(order: Order): boolean {
  if (order.orderType === "walk_in") return true;
  if (order.orderType === "delivery") return false;
  if (order.shippingOption === "store_pickup") return true;
  if (order.channel && order.channel.includes("หน้าร้าน")) return true;
  return false;
}

export function WeeklySalesChart({
  orders,
  onOpenCreateOrder,
}: WeeklySalesChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("revenue");

  const { dailyData, summary } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets: DailyBucket[] = [];
    const bucketByKey = new Map<string, DailyBucket>();

    for (let offset = 6; offset >= 0; offset -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const key = toDateKey(d);
      const weekday = THAI_WEEKDAYS[d.getDay()];
      const dayNum = d.getDate();
      const monthShort = d.toLocaleDateString("th-TH", { month: "short" });
      const bucket: DailyBucket = {
        dateKey: key,
        dayLabel: offset === 0 ? `วันนี้ (${weekday})` : `${weekday} ${dayNum}`,
        fullDateLabel:
          offset === 0
            ? `วันนี้ · ${dayNum} ${monthShort}`
            : `${weekday} ${dayNum} ${monthShort}`,
        walkInSales: 0,
        deliverySales: 0,
        totalSales: 0,
        orderCount: 0,
        walkInCount: 0,
        deliveryCount: 0,
      };
      buckets.push(bucket);
      bucketByKey.set(key, bucket);
    }

    const todayKey = toDateKey(today);
    let totalRevenue7d = 0;
    let totalOrders7d = 0;
    let totalWalkInSales = 0;
    let totalDeliverySales = 0;
    let totalWalkInCount = 0;
    let totalDeliveryCount = 0;

    orders.forEach((order) => {
      const orderDate = order.createdAtMillis
        ? new Date(order.createdAtMillis)
        : today;
      const key = toDateKey(orderDate);
      const target = bucketByKey.get(key) ?? (order.createdAtMillis ? undefined : bucketByKey.get(todayKey));
      if (!target) return;

      const amount = Number(order.totalThb || 0);
      const walkIn = isWalkInOrder(order);

      target.totalSales += amount;
      target.orderCount += 1;
      if (walkIn) {
        target.walkInSales += amount;
        target.walkInCount += 1;
        totalWalkInSales += amount;
        totalWalkInCount += 1;
      } else {
        target.deliverySales += amount;
        target.deliveryCount += 1;
        totalDeliverySales += amount;
        totalDeliveryCount += 1;
      }

      totalRevenue7d += amount;
      totalOrders7d += 1;
    });

    const peakDay = buckets.reduce<DailyBucket | null>(
      (best, cur) => (!best || cur.totalSales > best.totalSales ? cur : best),
      null
    );

    const avgOrderValue =
      totalOrders7d > 0 ? Math.round(totalRevenue7d / totalOrders7d) : 0;

    return {
      dailyData: buckets,
      summary: {
        totalRevenue7d,
        totalOrders7d,
        avgOrderValue,
        totalWalkInSales,
        totalDeliverySales,
        totalWalkInCount,
        totalDeliveryCount,
        peakDay,
      },
    };
  }, [orders]);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 flex flex-col gap-1">
          <span className="text-[12px] text-on-surface-variant font-medium">
            ยอดขายรวม 7 วันล่าสุด
          </span>
          <span className="text-[22px] sm:text-[24px] font-bold text-primary tabular-nums">
            ฿{summary.totalRevenue7d.toLocaleString()}
          </span>
          <span className="text-[11px] text-on-surface-variant tabular-nums">
            {summary.totalOrders7d} ออเดอร์ในสัปดาห์นี้
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 flex flex-col gap-1">
          <span className="text-[12px] text-on-surface-variant font-medium">
            ค่าเฉลี่ยต่อออเดอร์
          </span>
          <span className="text-[22px] sm:text-[24px] font-bold text-on-surface tabular-nums">
            ฿{summary.avgOrderValue.toLocaleString()}
          </span>
          <span className="text-[11px] text-on-surface-variant">
            คำนวณจากออเดอร์จริงทั้งหมด
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 flex flex-col gap-1">
          <span className="text-[12px] text-on-surface-variant font-medium">
            ยอดขาย Walk-in (หน้าร้าน)
          </span>
          <span className="text-[22px] sm:text-[24px] font-bold text-secondary tabular-nums">
            ฿{summary.totalWalkInSales.toLocaleString()}
          </span>
          <span className="text-[11px] text-on-surface-variant tabular-nums">
            {summary.totalWalkInCount} ออเดอร์
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 flex flex-col gap-1">
          <span className="text-[12px] text-on-surface-variant font-medium">
            ยอดขายส่งของ (จัดส่ง)
          </span>
          <span className="text-[22px] sm:text-[24px] font-bold text-tertiary tabular-nums">
            ฿{summary.totalDeliverySales.toLocaleString()}
          </span>
          <span className="text-[11px] text-on-surface-variant tabular-nums">
            {summary.totalDeliveryCount} ออเดอร์
          </span>
        </div>
      </div>

      {/* Main Recharts Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/40 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">
                bar_chart
              </span>
              <span>กราฟสรุปยอดขายรายสัปดาห์ (7 วันล่าสุด)</span>
            </h3>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              ภาพรวมรายได้และจำนวนออเดอร์แยกตามประเภท Walk-in และส่งของ สำหรับเจ้าของร้าน
            </p>
          </div>

          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-surface-container self-start sm:self-auto"
            role="tablist"
            aria-label="มุมมองกราฟยอดขาย"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === "revenue"}
              onClick={() => setChartMode("revenue")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                chartMode === "revenue"
                  ? "bg-surface-container-lowest text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              แยก Walk-in / ส่งของ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === "trend"}
              onClick={() => setChartMode("trend")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                chartMode === "trend"
                  ? "bg-surface-container-lowest text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              แนวโน้ม &amp; จำนวนออเดอร์
            </button>
          </div>
        </div>

        {summary.totalOrders7d === 0 ? (
          <div className="py-12 px-4 rounded-xl bg-surface-container-low/70 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[26px]">
                analytics
              </span>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-on-surface">
                ยังไม่มียอดขายในรอบ 7 วันที่ผ่านมา
              </p>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                เมื่อสร้างออเดอร์ใหม่ ยอดขายจะอัปเดตบนกราฟรายสัปดาห์ทันทีแบบเรียลไทม์
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCreateOrder}
              className="h-10 px-4 rounded-xl bg-primary text-on-primary text-[13px] font-semibold cursor-pointer hover:bg-primary-dim transition-colors"
            >
              + สร้างออเดอร์แรก
            </button>
          </div>
        ) : (
          <div className="w-full h-[300px] sm:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === "revenue" ? (
                <BarChart
                  data={dailyData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="#e8ddef"
                  />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#72617d", fontSize: 12 }}
                    axisLine={{ stroke: "#e3d6ea" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#72617d", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `฿${(v / 1000).toFixed(1)}k` : `฿${v}`
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(174, 84, 130, 0.08)" }}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#e3d6ea",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px rgba(63, 49, 71, 0.10)",
                      fontSize: "12px",
                      color: "#3f3147",
                    }}
                    formatter={(value: unknown, name: unknown) => [
                      `฿${Number(value || 0).toLocaleString()}`,
                      String(name),
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullDateLabel || ""
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                  />
                  <Bar
                    dataKey="deliverySales"
                    name="ส่งของ (จัดส่ง)"
                    stackId="sales"
                    fill="#d884af"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={42}
                  />
                  <Bar
                    dataKey="walkInSales"
                    name="Walk-in (หน้าร้าน)"
                    stackId="sales"
                    fill="#95d5c0"
                    stroke="#6bb8a0"
                    strokeWidth={1}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              ) : (
                <ComposedChart
                  data={dailyData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
                >
                  <defs>
                    <linearGradient
                      id="pastelRoseMintArea"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#d884af" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="#d8f3e9" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="#e8ddef"
                  />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#72617d", fontSize: 12 }}
                    axisLine={{ stroke: "#e3d6ea" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: "#72617d", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `฿${(v / 1000).toFixed(1)}k` : `฿${v}`
                    }
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fill: "#3d7d69", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#e3d6ea",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px rgba(63, 49, 71, 0.10)",
                      fontSize: "12px",
                      color: "#3f3147",
                    }}
                    formatter={(value: unknown, name: unknown) => {
                      const num = Number(value || 0);
                      const label = String(name);
                      return label.includes("ออเดอร์")
                        ? [`${num} ออเดอร์`, label]
                        : [`฿${num.toLocaleString()}`, label];
                    }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullDateLabel || ""
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalSales"
                    name="ยอดขายรวม (บาท)"
                    stroke="#ae5482"
                    strokeWidth={2.5}
                    fill="url(#pastelRoseMintArea)"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orderCount"
                    name="จำนวนออเดอร์"
                    stroke="#5ca891"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#a3decb", strokeWidth: 2, stroke: "#3d7d69" }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Daily Breakdown Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-container flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-on-surface">
            ตารางสรุปยอดรายวัน (7 วันล่าสุด)
          </span>
          {summary.peakDay && summary.peakDay.totalSales > 0 && (
            <span className="text-[11px] text-on-surface-variant tabular-nums">
              วันที่ยอดสูงสุด: {summary.peakDay.fullDateLabel} (฿
              {summary.peakDay.totalSales.toLocaleString()})
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/80 text-[11px] font-semibold text-on-surface-variant">
                <th className="py-2.5 px-4">วัน</th>
                <th className="py-2.5 px-3 text-right">จำนวนออเดอร์</th>
                <th className="py-2.5 px-3 text-right">Walk-in</th>
                <th className="py-2.5 px-3 text-right">ส่งของ</th>
                <th className="py-2.5 px-4 text-right">ยอดขายรวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container text-[13px]">
              {dailyData.map((row) => (
                <tr
                  key={row.dateKey}
                  className="hover:bg-surface-container-low/50 transition-colors"
                >
                  <td className="py-2.5 px-4 font-medium text-on-surface whitespace-nowrap">
                    {row.fullDateLabel}
                  </td>
                  <td className="py-2.5 px-3 text-right text-on-surface-variant tabular-nums">
                    {row.orderCount}
                  </td>
                  <td className="py-2.5 px-3 text-right text-secondary font-medium tabular-nums">
                    ฿{row.walkInSales.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-primary font-medium tabular-nums">
                    ฿{row.deliverySales.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-on-surface tabular-nums">
                    ฿{row.totalSales.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
