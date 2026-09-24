// 本地存档：台账状态的 localStorage 读写与示例数据。
// 这一层只管持久化，不含任何判断逻辑。

import type { Order, Shipment } from "../domain/ledger";

export interface LedgerState {
  orders: Order[];
  shipments: Shipment[];
}

const STORAGE_KEY = "hxyfront-62012:ledger:v1";

/** 首次打开或数据损坏时的示例台账（覆盖四种状态，方便演示） */
export function seedState(): LedgerState {
  const orders: Order[] = [
    {
      orderNo: "SO-2609-101",
      customer: "华纺服饰",
      fabric: "棉府绸",
      process: { dyePercent: 2.5, weight: 120, liquorRatio: "1:10" },
      revisedAt: "2026-09-18",
    },
    {
      orderNo: "SO-2609-102",
      customer: "晨曦户外",
      fabric: "涤纶针织",
      process: { dyePercent: 1.8, weight: 180, liquorRatio: "1:12" },
      revisedAt: "2026-09-20",
    },
    {
      orderNo: "SO-2609-103",
      customer: "蓝帛家纺",
      fabric: "棉涤混纺斜纹",
      process: { dyePercent: 3.2, weight: 150, liquorRatio: "1:8" },
      revisedAt: "2026-09-22",
    },
  ];

  const shipments: Shipment[] = [
    {
      id: "SH-2609-06",
      orderNo: "SO-2609-103",
      customer: "蓝帛家纺",
      fabric: "棉涤混纺斜纹",
      dyePercent: 3.2,
      weight: 150,
      liquorRatio: "1:8",
      deltaE: 0.8,
      shippedAt: "2026-09-23",
      feedback: null,
      signedBack: false,
    },
    {
      id: "SH-2609-05",
      orderNo: "SO-2609-101",
      customer: "华纺服饰",
      fabric: "棉府绸",
      dyePercent: 2.5,
      weight: 120,
      liquorRatio: "1:10",
      deltaE: 1.12,
      shippedAt: "2026-09-23",
      feedback: null,
      signedBack: false,
    },
    {
      id: "SH-2609-04",
      orderNo: "SO-2609-101",
      customer: "华纺服饰",
      fabric: "棉府绸",
      dyePercent: 2.5,
      weight: 120,
      liquorRatio: "1:10",
      deltaE: 0.62,
      shippedAt: "2026-09-19",
      feedback: "色差可接受，等客户盖章确认",
      signedBack: false,
    },
    {
      id: "SH-2609-03",
      orderNo: "SO-2609-102",
      customer: "晨曦户外",
      fabric: "涤纶针织",
      dyePercent: 1.8,
      weight: 180,
      liquorRatio: "1:12",
      deltaE: 0.45,
      shippedAt: "2026-09-21",
      feedback: "客户确认手感与颜色",
      signedBack: true,
    },
    {
      id: "SH-2609-02",
      orderNo: "SO-2609-102",
      customer: "晨曦户外",
      fabric: "涤纶针织",
      dyePercent: 1.5,
      weight: 180,
      liquorRatio: "1:12",
      deltaE: 1.64,
      shippedAt: "2026-09-16",
      feedback: "偏浅，要求加深",
      signedBack: false,
    },
    {
      id: "SH-2609-01",
      orderNo: "SO-2609-101",
      customer: "华纺服饰",
      fabric: "棉府绸",
      dyePercent: 2.0,
      weight: 120,
      liquorRatio: "1:12",
      deltaE: 0.9,
      shippedAt: "2026-09-12",
      feedback: null,
      signedBack: false,
    },
  ];

  return { orders, shipments };
}

/** 读取本地台账；没有或格式损坏时退回示例数据 */
export function loadState(): LedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as LedgerState;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.shipments)) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

/** 每次变更后整包落盘，重开页面接着处理 */
export function saveState(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败，页面内状态仍可用
  }
}

/** 清空本地修改并恢复示例数据 */
export function resetState(): LedgerState {
  const fresh = seedState();
  saveState(fresh);
  return fresh;
}
