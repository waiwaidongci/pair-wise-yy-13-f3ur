// 寄样判断：样布状态机、工艺改版规则、筛选与导出均为纯逻辑，不接触浏览器 API。

export type SampleStatus = "shipped" | "approvable" | "signed" | "void";
export type FeedbackResult = "ok" | "resample" | "reject";
export type StatusFilter = "all" | SampleStatus;

export interface SampleRecord {
  id: string; // 样布编号 SM-0001
  orderNo: string; // 客户订单号
  customer: string; // 客户
  fabric: string; // 面料成分
  weight: string; // 克重 g/m²
  dyePercent: string; // 染料百分比（配方）
  liquorRatio: string; // 浴比
  deltaE: string; // 色差 ΔE
  processVersion: number; // 寄出时锁定的工艺版本
  sentAt: string; // 寄出日期
  status: SampleStatus;
  feedback: string; // 客户反馈文字
  feedbackResult?: FeedbackResult;
  feedbackAt?: string;
  signedAt?: string; // 回签日期
  voidReason?: string;
  voidAt?: string;
}

export interface OrderInfo {
  customer: string;
  version: number; // 该订单当前工艺版本
}

export interface AppState {
  seq: number;
  orders: Record<string, OrderInfo>;
  samples: SampleRecord[];
}

export interface SampleDraft {
  orderNo: string;
  customer: string;
  fabric: string;
  weight: string;
  dyePercent: string;
  liquorRatio: string;
  deltaE: string;
}

type Tone = "blue" | "amber" | "green" | "gray";

export const STATUS_META: Record<SampleStatus, { label: string; tone: Tone }> = {
  shipped: { label: "在寄", tone: "blue" },
  approvable: { label: "可回签", tone: "amber" },
  signed: { label: "已回签", tone: "green" },
  void: { label: "已作废", tone: "gray" },
};

export const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "shipped", label: "在寄" },
  { key: "approvable", label: "可回签" },
  { key: "signed", label: "已回签" },
  { key: "void", label: "已作废" },
];

export const FEEDBACK_META: Record<FeedbackResult, string> = {
  ok: "客户确认合格",
  resample: "要求重新寄样",
  reject: "客户不通过",
};

// ---------- 状态判断 ----------

/** 在寄样才能登记客户反馈 */
export function canFeedback(sample: SampleRecord): boolean {
  return sample.status === "shipped";
}

/** 客户确认合格、等待实验室回签的样布才能回签 */
export function canSign(sample: SampleRecord): boolean {
  return sample.status === "approvable";
}

/** 未终态（在寄 / 可回签）的样布可以作废；已回签和已作废永久留档 */
export function canVoid(sample: SampleRecord): boolean {
  return sample.status === "shipped" || sample.status === "approvable";
}

export function currentVersion(orders: Record<string, OrderInfo>, orderNo: string): number {
  return orders[orderNo]?.version ?? 0;
}

// ---------- 状态变更（全部不可变更新） ----------

export function nextSampleId(state: AppState): string {
  return "SM-" + String(state.seq + 1).padStart(4, "0");
}

/** 补录新寄样：自动锁定订单当前工艺版本；新订单从 V1 起 */
export function addSample(state: AppState, draft: SampleDraft, today: string): AppState {
  const existing = state.orders[draft.orderNo];
  const version = existing ? existing.version : 1;
  const orders: Record<string, OrderInfo> = {
    ...state.orders,
    [draft.orderNo]: { customer: existing?.customer ?? draft.customer, version },
  };
  const record: SampleRecord = {
    id: nextSampleId(state),
    orderNo: draft.orderNo,
    customer: existing?.customer ?? draft.customer,
    fabric: draft.fabric,
    weight: draft.weight,
    dyePercent: draft.dyePercent,
    liquorRatio: draft.liquorRatio,
    deltaE: draft.deltaE,
    processVersion: version,
    sentAt: today,
    status: "shipped",
    feedback: "",
  };
  return { seq: state.seq + 1, orders, samples: [record, ...state.samples] };
}

/**
 * 登记客户反馈：
 * 合格 → 可回签；要求重寄 / 不通过 → 直接作废留档，不能再回签。
 */
export function applyFeedback(
  state: AppState,
  id: string,
  result: FeedbackResult,
  feedback: string,
  today: string
): AppState {
  const samples = state.samples.map((s) => {
    if (s.id !== id || !canFeedback(s)) return s;
    const next: SampleRecord = {
      ...s,
      feedback,
      feedbackResult: result,
      feedbackAt: today,
    };
    if (result === "ok") {
      next.status = "approvable";
    } else {
      next.status = "void";
      next.voidReason = FEEDBACK_META[result];
      next.voidAt = today;
    }
    return next;
  });
  return { ...state, samples };
}

/** 回签：可回签 → 已回签（终态） */
export function signBack(state: AppState, id: string, today: string): AppState {
  const samples = state.samples.map((s) =>
    s.id === id && canSign(s) ? { ...s, status: "signed" as SampleStatus, signedAt: today } : s
  );
  return { ...state, samples };
}

/** 手工作废（如快递丢件、客户口头取消） */
export function voidSample(state: AppState, id: string, reason: string, today: string): AppState {
  const samples = state.samples.map((s) =>
    s.id === id && canVoid(s)
      ? { ...s, status: "void" as SampleStatus, voidReason: reason || "手工作废", voidAt: today }
      : s
  );
  return { ...state, samples };
}

/**
 * 工艺改版（业务员改订单后调用）：
 * 订单版本 +1，所有仍在寄 / 可回签的旧版样布一律作废留档、不可回签；
 * 已回签的旧版样布作为历史档案保留。之后补录的新样自动锁定新版本。
 */
export function reviseProcess(state: AppState, orderNo: string, reason: string, today: string): AppState {
  const old = state.orders[orderNo];
  if (!old) return state;
  const newVersion = old.version + 1;
  const samples = state.samples.map((s) => {
    if (s.orderNo !== orderNo || s.processVersion >= newVersion || !canVoid(s)) return s;
    return {
      ...s,
      status: "void" as SampleStatus,
      voidReason: reason || `工艺改版 V${s.processVersion}→V${newVersion}`,
      voidAt: today,
    };
  });
  const orders = { ...state.orders, [orderNo]: { ...old, version: newVersion } };
  return { ...state, orders, samples };
}

// ---------- 查询与校验 ----------

export function selectSamples(
  samples: SampleRecord[],
  orderNo: string,
  status: StatusFilter
): SampleRecord[] {
  return samples
    .filter((s) => (!orderNo || s.orderNo === orderNo) && (status === "all" || s.status === status))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id.localeCompare(a.id));
}

export interface OrderSummary extends OrderInfo {
  orderNo: string;
  total: number;
  shipped: number;
  approvable: number;
  signed: number;
  void: number;
}

export function orderSummaries(state: AppState): OrderSummary[] {
  const rows = new Map<string, OrderSummary>();
  for (const [orderNo, info] of Object.entries(state.orders)) {
    rows.set(orderNo, {
      orderNo,
      customer: info.customer,
      version: info.version,
      total: 0,
      shipped: 0,
      approvable: 0,
      signed: 0,
      void: 0,
    });
  }
  for (const s of state.samples) {
    let row = rows.get(s.orderNo);
    if (!row) {
      row = {
        orderNo: s.orderNo,
        customer: s.customer,
        version: s.processVersion,
        total: 0,
        shipped: 0,
        approvable: 0,
        signed: 0,
        void: 0,
      };
      rows.set(s.orderNo, row);
    }
    row.total += 1;
    row[s.status] += 1;
    row.version = Math.max(row.version, s.processVersion);
  }
  return [...rows.values()].sort((a, b) => a.orderNo.localeCompare(b.orderNo));
}

const REQUIRED_FIELDS: [keyof SampleDraft, string][] = [
  ["orderNo", "客户订单号"],
  ["customer", "客户名称"],
  ["fabric", "面料成分"],
  ["weight", "克重"],
  ["dyePercent", "染料百分比"],
  ["liquorRatio", "浴比"],
  ["deltaE", "色差"],
];

export function validateDraft(draft: SampleDraft): string {
  for (const [key, label] of REQUIRED_FIELDS) {
    if (!String(draft[key]).trim()) return `请填写${label}`;
  }
  return "";
}

// ---------- CSV 导出（只负责把当前结果转成文本） ----------

const CSV_COLUMNS: { key: string; header: string }[] = [
  { key: "id", header: "样布编号" },
  { key: "orderNo", header: "客户订单" },
  { key: "customer", header: "客户" },
  { key: "fabric", header: "面料成分" },
  { key: "weight", header: "克重(g/m²)" },
  { key: "dyePercent", header: "染料百分比" },
  { key: "liquorRatio", header: "浴比" },
  { key: "deltaE", header: "色差ΔE" },
  { key: "processVersion", header: "工艺版本" },
  { key: "sentAt", header: "寄出日期" },
  { key: "statusLabel", header: "状态" },
  { key: "resultLabel", header: "客户结论" },
  { key: "feedback", header: "客户反馈" },
  { key: "feedbackAt", header: "反馈日期" },
  { key: "signedAt", header: "回签日期" },
  { key: "voidReason", header: "作废原因" },
  { key: "voidAt", header: "作废日期" },
];

function escapeCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(samples: SampleRecord[]): string {
  const rows = samples.map((s) => {
    const view: Record<string, string | number> = {
      ...s,
      processVersion: `V${s.processVersion}`,
      statusLabel: STATUS_META[s.status].label,
      resultLabel: s.feedbackResult ? FEEDBACK_META[s.feedbackResult] : "",
    };
    return CSV_COLUMNS.map((c) => escapeCell(view[c.key])).join(",");
  });
  return [CSV_COLUMNS.map((c) => escapeCell(c.header)).join(","), ...rows].join("\r\n");
}
