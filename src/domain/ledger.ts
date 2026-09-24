// 寄样判断：状态推导、工艺比对、回签资格与导出格式。
// 这一层只做纯函数计算，不碰页面和存储。

export interface ProcessSnapshot {
  dyePercent: number; // 染料百分比 %
  weight: number; // 克重 g/m²
  liquorRatio: string; // 浴比，如 "1:10"
}

export interface Order {
  orderNo: string; // 客户订单号
  customer: string; // 客户
  fabric: string; // 面料
  process: ProcessSnapshot; // 订单现行工艺（业务员可改）
  revisedAt: string; // 工艺最近变更日期
}

export interface Shipment extends ProcessSnapshot {
  id: string; // 寄样编号
  orderNo: string;
  customer: string;
  fabric: string;
  deltaE: number; // 色差 ΔE
  shippedAt: string; // 寄出日期
  feedback: string | null; // 客户反馈
  signedBack: boolean; // 是否已回签
}

export type ShipmentStatus = "在寄" | "可回签" | "已回签" | "已作废";

export const STATUS_ORDER: ShipmentStatus[] = ["在寄", "可回签", "已回签", "已作废"];

/** 工艺指纹：寄样与订单现行工艺逐项比对，任一项不同即视为旧版工艺 */
export function processSignature(p: ProcessSnapshot): string {
  return [p.dyePercent, p.weight, p.liquorRatio.trim()].join("@");
}

export function isCurrentProcess(s: ProcessSnapshot, order: Order): boolean {
  return processSignature(s) === processSignature(order.process);
}

/**
 * 状态推导（不落库，随订单工艺实时重算）：
 * - 已回签的保持已回签，是历史事实；
 * - 订单工艺被改过的旧寄样一律「已作废」，留档但不可回签；
 * - 仍对应现行工艺的，有客户反馈才「可回签」，否则仍「在寄」。
 */
export function deriveStatus(s: Shipment, order: Order | undefined): ShipmentStatus {
  if (s.signedBack) return "已回签";
  if (!order || !isCurrentProcess(s, order)) return "已作废";
  return s.feedback ? "可回签" : "在寄";
}

export function canSignBack(s: Shipment, order: Order | undefined): boolean {
  return deriveStatus(s, order) === "可回签";
}

export function canLeaveFeedback(s: Shipment, order: Order | undefined): boolean {
  return deriveStatus(s, order) === "在寄";
}

export interface LedgerRow {
  shipment: Shipment;
  status: ShipmentStatus;
}

/** 把寄样与所属订单配对，逐条算出当前状态 */
export function enrich(shipments: Shipment[], orders: Order[]): LedgerRow[] {
  const byNo = new Map(orders.map((o) => [o.orderNo, o]));
  return shipments.map((shipment) => ({
    shipment,
    status: deriveStatus(shipment, byNo.get(shipment.orderNo)),
  }));
}

/** 生成下一个寄样编号 */
export function nextShipmentId(shipments: Shipment[]): string {
  const max = shipments.reduce((m, s) => {
    const n = parseInt(s.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `SH-${String(max + 1).padStart(4, "0")}`;
}

const CSV_HEADER = [
  "寄样编号",
  "客户订单",
  "客户",
  "面料",
  "染料(%)",
  "克重(g/m²)",
  "浴比",
  "色差ΔE",
  "寄出日期",
  "状态",
  "客户反馈",
];

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出 CSV（带 BOM，Excel 直接打开不乱码） */
export function buildCsv(rows: LedgerRow[]): string {
  const lines = rows.map(({ shipment: s, status }) =>
    [
      s.id,
      s.orderNo,
      s.customer,
      s.fabric,
      s.dyePercent,
      s.weight,
      s.liquorRatio,
      s.deltaE,
      s.shippedAt,
      status,
      s.feedback ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  return "\uFEFF" + [CSV_HEADER.map(csvCell).join(","), ...lines].join("\n");
}
