// 本地存档：唯一负责 localStorage 读写的模块，重开页面后接着处理。

import type { AppState, SampleRecord } from "./domain";

const STORAGE_KEY = "dye-sample-ledger-v1";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return daysAgo(0);
}

function seedState(): AppState {
  const samples: SampleRecord[] = [
    {
      id: "SM-0001",
      orderNo: "PO-240901",
      customer: "华纺服饰",
      fabric: "棉府绸",
      weight: "120",
      dyePercent: "活性红3BS 2.1% / 活性黄3RS 0.8%",
      liquorRatio: "1:10",
      deltaE: "0.84",
      processVersion: 1,
      sentAt: daysAgo(12),
      status: "signed",
      feedback: "色光一致，确认大货",
      feedbackResult: "ok",
      feedbackAt: daysAgo(9),
      signedAt: daysAgo(8),
    },
    {
      id: "SM-0002",
      orderNo: "PO-240901",
      customer: "华纺服饰",
      fabric: "棉府绸",
      weight: "120",
      dyePercent: "活性红3BS 2.4% / 活性黄3RS 0.6%",
      liquorRatio: "1:10",
      deltaE: "1.62",
      processVersion: 1,
      sentAt: daysAgo(6),
      status: "void",
      feedback: "偏深，要求调整后再寄",
      feedbackResult: "resample",
      feedbackAt: daysAgo(3),
      voidReason: "要求重新寄样",
      voidAt: daysAgo(3),
    },
    {
      id: "SM-0003",
      orderNo: "PO-240901",
      customer: "华纺服饰",
      fabric: "棉府绸",
      weight: "120",
      dyePercent: "活性红3BS 2.3% / 活性黄3RS 0.7%",
      liquorRatio: "1:10",
      deltaE: "0.95",
      processVersion: 2,
      sentAt: daysAgo(2),
      status: "shipped",
      feedback: "",
    },
    {
      id: "SM-0004",
      orderNo: "PO-240915",
      customer: "云裳户外",
      fabric: "涤纶针织",
      weight: "180",
      dyePercent: "分散蓝2BLN 1.6% / 分散红玉S-5BL 0.4%",
      liquorRatio: "1:12",
      deltaE: "0.72",
      processVersion: 1,
      sentAt: daysAgo(5),
      status: "approvable",
      feedback: "色差可接受，同意走回签流程",
      feedbackResult: "ok",
      feedbackAt: daysAgo(1),
    },
    {
      id: "SM-0005",
      orderNo: "PO-240915",
      customer: "云裳户外",
      fabric: "涤纶针织",
      weight: "180",
      dyePercent: "分散蓝2BLN 1.9%",
      liquorRatio: "1:12",
      deltaE: "2.18",
      processVersion: 1,
      sentAt: daysAgo(8),
      status: "void",
      feedback: "偏蓝不通过",
      feedbackResult: "reject",
      feedbackAt: daysAgo(6),
      voidReason: "客户不通过",
      voidAt: daysAgo(6),
    },
    {
      id: "SM-0006",
      orderNo: "PO-240927",
      customer: "澜栖家纺",
      fabric: "锦棉混纺斜纹",
      weight: "240",
      dyePercent: "中性黄GL 1.1% / 活性红3BS 0.9%",
      liquorRatio: "1:8",
      deltaE: "1.15",
      processVersion: 1,
      sentAt: daysAgo(1),
      status: "shipped",
      feedback: "",
    },
  ];
  return {
    seq: samples.length,
    orders: {
      "PO-240901": { customer: "华纺服饰", version: 2 },
      "PO-240915": { customer: "云裳户外", version: 1 },
      "PO-240927": { customer: "澜栖家纺", version: 1 },
    },
    samples,
  };
}

function isValidState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.seq === "number" &&
    typeof v.orders === "object" &&
    Array.isArray(v.samples) &&
    v.samples.every((s) => s && typeof (s as SampleRecord).id === "string")
  );
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    // 存档损坏时回退到种子数据
  }
  return seedState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额不足时静默失败，不影响当前页面操作
  }
}
