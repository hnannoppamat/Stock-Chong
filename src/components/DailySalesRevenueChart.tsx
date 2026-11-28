import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Order, RoleMode } from "../types";

interface DailySalesRevenueChartProps {
  orders: Order[];
  role: RoleMode;
  onQuickCreateOrder: () => void;
  onNavigateAccounting?: () => void;
}

interface DailyRevenuePoint {
  dateKey: string;
  dayLabel: string;
  fullDateLabel: string;
  revenue: number;
  orderCount: number;
  isToday: boolean;
}

const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DailySalesRevenueChart({
  orders,
  role,
  onQuickCreateOrder,
  onNavigateAccounting,
}: DailySalesRevenueChartProps) {
  const { dailyData, total7d, dailyAverage, todayRevenue, totalOrders7d, peakDay } =
    useMemo(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const points: DailyRevenuePoint[] = [];
      const pointByKey = new Map<string, DailyRevenuePoint>();

      for (let offset = 6; offset >= 0; offset -= 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - offset);
        const key = toLocalDateKey(d);
        const weekday = THAI_WEEKDAYS[d.getDay()];
        const dayNum = d.getDate();
        const monthShort = d.toLocaleDateString("th-TH", { month: "short" });
        const isToday = offset === 0;

        const point: DailyRevenuePoint = {
          dateKey: key,
          dayLabel: isToday ? "วันนี้" : `${weekday} ${dayNum}`,
          fullDateLabel: isToday
            ? `วันนี้ (${weekday} ${dayNum} ${monthShort})`
            : `${weekday} ${dayNum} ${monthShort}`,
          revenue: 0,
          orderCount: 0,
          isToday,
        };

        points.push(point);
        pointByKey.set(key, point);
      }

      const todayKey = toLocalDateKey(today);

      orders.forEach((order) => {
        const orderDate = order.createdAtMillis
          ? new Date(order.createdAtMillis)
          : today;
        const key = toLocalDateKey(orderDate);
        const bucket =
          pointByKey.get(key) ??
          (order.createdAtMillis ? undefined : pointByKey.get(todayKey));
        if (!bucket) return;

        const amount = Number(order.totalThb);
        bucket.revenue += Number.isFinite(amount) && amount > 0 ? amount : 0;
        bucket.orderCount += 1;
      });

      const sumRevenue = points.reduce((acc, p) => acc + p.revenue, 0);
      const sumOrders = points.reduce((acc, p) => acc + p.orderCount, 0);
      const avg = Math.round(sumRevenue / 7);
      const todayPoint = points[points.length - 1];
      const top = points.reduce<DailyRevenuePoint | null>(
        (best, cur) => (!best || cur.revenue > best.revenue ? cur : best),
        null
      );

      return {
        dailyData: points,
        total7d: sumRevenue,
        dailyAverage: avg,
        todayRevenue: todayPoint?.revenue ?? 0,
        totalOrders7d: sumOrders,
        peakDay: top && top.revenue > 0 ? top : null,
      };
    }, [orders]);

  return (
    <section
      aria-label="กราฟยอดขายรายวันย้อนหลัง 7 วัน"
      className="bg-surface-container-lowest border border-outline-variant/45 rounded-xl p-4 sm:p-5 flex flex-col gap-4"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
              bar_chart
            </span>
            <h2 className="text-[16px] font-bold text-on-surface tracking-tight">
              ยอดขายรายวันย้อนหลัง 7 วัน
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[12px] text-on-surface-variant tabular-nums">
            <span>
              รวม 7 วัน{" "}
              <strong className="font-bold text-primary">
                ฿{total7d.toLocaleString()}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>เฉลี่ยวันละ ฿{dailyAverage.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>{totalOrders7d.toLocaleString()} ออเดอร์</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-left sm:text-right tabular-nums">
            <p className="text-[11px] text-on-surface-variant">ยอดขายวันนี้</p>
            <p className="text-[18px] font-bold text-primary leading-tight">
              ฿{todayRevenue.toLocaleString()}
            </p>
          </div>
          {role === "owner" && onNavigateAccounting && (
            <button
              type="button"
              onClick={onNavigateAccounting}
              className="h-9 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary text-[12px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>ดูบัญชีเต็ม</span>
              <span className="material-symbols-outlined text-[15px]">
                arrow_forward
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Bar Chart Body */}
      {totalOrders7d === 0 ? (
        <div className="rounded-xl bg-surface-container-low/75 px-4 py-9 text-center flex flex-col items-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">
              bar_chart
            </span>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-on-surface">
              ยังไม่มียอดขายในช่วง 7 วันที่ผ่านมา
            </p>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              เมื่อสร้างออเดอร์ใหม่ กราฟยอดขายรายวันจะอัปเดตทันทีอัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={onQuickCreateOrder}
            className="mt-1 h-9 px-4 rounded-xl bg-primary hover:bg-primary-dim text-on-primary text-[12.5px] font-semibold transition-colors cursor-pointer"
          >
            + สร้างออเดอร์แรก
          </button>
        </div>
      ) : (
        <div className="w-full h-[230px] sm:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyData}
              margin={{ top: 10, right: 8, left: -6, bottom: 2 }}
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
                formatter={(value: unknown, _name: unknown, item) => {
                  const count = Number(
                    (item?.payload as DailyRevenuePoint | undefined)?.orderCount ?? 0
                  );
                  return [
                    `฿${Number(value || 0).toLocaleString()} (${count} ออเดอร์)`,
                    "ยอดขาย",
                  ];
                }}
                labelFormatter={(_, payload) =>
                  (payload?.[0]?.payload as DailyRevenuePoint | undefined)
                    ?.fullDateLabel || ""
                }
              />
              <Bar
                dataKey="revenue"
                name="ยอดขายรายวัน"
                radius={[8, 8, 0, 0]}
                maxBarSize={44}
              >
                {dailyData.map((entry) => (
                  <Cell
                    key={entry.dateKey}
                    fill={
                      entry.isToday
                        ? "#ae5482"
                        : peakDay && entry.dateKey === peakDay.dateKey
                          ? "#68b89e"
                          : "#dfb0c9"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quiet Legend & Peak Footnote */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-container text-[11.5px] text-on-surface-variant">
        <div className="flex items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#dfb0c9] inline-block" />
            <span>วันก่อนหน้า</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#ae5482] inline-block" />
            <span>วันนี้</span>
          </span>
          {peakDay && !peakDay.isToday && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#68b89e] inline-block" />
              <span>ยอดสูงสุด</span>
            </span>
          )}
        </div>
        {peakDay && (
          <span className="tabular-nums">
            สูงสุด: {peakDay.fullDateLabel} (฿{peakDay.revenue.toLocaleString()})
          </span>
        )}
      </div>
    </section>
  );
}
