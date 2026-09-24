// 页面交互：筛选、补录、反馈、回签、变更工艺与导出。
// 判断规则全部来自 domain/ledger，持久化全部走 storage/ledgerStore。

import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  STATUS_ORDER,
  buildCsv,
  canLeaveFeedback,
  canSignBack,
  enrich,
  nextShipmentId,
  type LedgerRow,
  type Order,
  type ProcessSnapshot,
  type Shipment,
  type ShipmentStatus,
} from "./domain/ledger";
import { loadState, resetState, saveState } from "./storage/ledgerStore";

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_TONE: Record<ShipmentStatus, string> = {
  在寄: "tone-shipping",
  可回签: "tone-signable",
  已回签: "tone-signed",
  已作废: "tone-void",
};

/** 订单工艺卡：展示现行工艺，支持变更（变更后旧寄样自动作废留档） */
function OrderCard({
  order,
  onRevise,
}: {
  order: Order;
  onRevise: (orderNo: string, process: ProcessSnapshot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dye, setDye] = useState("");
  const [wt, setWt] = useState("");
  const [lr, setLr] = useState("");

  const startEdit = () => {
    setDye(String(order.process.dyePercent));
    setWt(String(order.process.weight));
    setLr(order.process.liquorRatio);
    setEditing(true);
  };

  const save = () => {
    const d = Number(dye);
    const w = Number(wt);
    if (!Number.isFinite(d) || !Number.isFinite(w) || !lr.trim()) {
      window.alert("请完整填写染料百分比、克重和浴比");
      return;
    }
    onRevise(order.orderNo, { dyePercent: d, weight: w, liquorRatio: lr.trim() });
    setEditing(false);
  };

  return (
    <article className="order-card">
      <h3>{order.orderNo}</h3>
      <p className="meta">
        {order.customer} · {order.fabric} · 工艺更新于 {order.revisedAt}
      </p>
      <div className="specs">
        <span>染料 {order.process.dyePercent}%</span>
        <span>克重 {order.process.weight}g/m²</span>
        <span>浴比 {order.process.liquorRatio}</span>
      </div>
      {editing ? (
        <>
          <div className="revise-form">
            <label>
              <span>染料百分比(%)</span>
              <input type="number" step="0.1" min="0" value={dye} onChange={(e) => setDye(e.target.value)} />
            </label>
            <label>
              <span>克重(g/m²)</span>
              <input type="number" step="1" min="0" value={wt} onChange={(e) => setWt(e.target.value)} />
            </label>
            <label>
              <span>浴比</span>
              <input value={lr} onChange={(e) => setLr(e.target.value)} placeholder="如 1:10" />
            </label>
          </div>
          <div className="revise-actions">
            <button className="primary" onClick={save}>保存变更</button>
            <button onClick={() => setEditing(false)}>取消</button>
          </div>
          <p className="hint">变更后，此前按旧工艺寄出的样布将自动判为「已作废」，仅留档、不可回签。</p>
        </>
      ) : (
        <div className="revise-actions">
          <button onClick={startEdit}>变更工艺</button>
        </div>
      )}
    </article>
  );
}

/** 补录新样：工艺字段默认取订单现行工艺，寄出即留快照 */
function NewShipmentForm({
  orders,
  shipments,
  onAdd,
}: {
  orders: Order[];
  shipments: Shipment[];
  onAdd: (s: Shipment) => void;
}) {
  const first = orders[0];
  const [orderNo, setOrderNo] = useState(first?.orderNo ?? "");
  const [fabric, setFabric] = useState(first?.fabric ?? "");
  const [dyePercent, setDyePercent] = useState(String(first?.process.dyePercent ?? ""));
  const [weight, setWeight] = useState(String(first?.process.weight ?? ""));
  const [liquorRatio, setLiquorRatio] = useState(first?.process.liquorRatio ?? "");
  const [deltaE, setDeltaE] = useState("");
  const [shippedAt, setShippedAt] = useState(today());
  const [addedId, setAddedId] = useState<string | null>(null);

  const order = orders.find((o) => o.orderNo === orderNo);

  const pickOrder = (no: string) => {
    const o = orders.find((x) => x.orderNo === no);
    setOrderNo(no);
    if (o) {
      setFabric(o.fabric);
      setDyePercent(String(o.process.dyePercent));
      setWeight(String(o.process.weight));
      setLiquorRatio(o.process.liquorRatio);
    }
  };

  const submit = () => {
    const dye = Number(dyePercent);
    const w = Number(weight);
    const de = Number(deltaE);
    if (!order || !fabric.trim() || !liquorRatio.trim() || ![dye, w, de].every(Number.isFinite)) {
      window.alert("请完整填写面料、染料百分比、克重、浴比和色差");
      return;
    }
    const id = nextShipmentId(shipments);
    onAdd({
      id,
      orderNo: order.orderNo,
      customer: order.customer,
      fabric: fabric.trim(),
      dyePercent: dye,
      weight: w,
      liquorRatio: liquorRatio.trim(),
      deltaE: de,
      shippedAt,
      feedback: null,
      signedBack: false,
    });
    setAddedId(id);
    setDeltaE("");
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>补录新样</p>
          <h2>寄样登记</h2>
        </div>
        <button className="primary" onClick={submit}>保存寄样</button>
      </div>
      <div className="field-grid">
        <label>
          <span>客户订单</span>
          <select value={orderNo} onChange={(e) => pickOrder(e.target.value)}>
            {orders.map((o) => (
              <option key={o.orderNo} value={o.orderNo}>
                {o.orderNo} · {o.customer}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>面料</span>
          <input value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="如 棉府绸" />
        </label>
        <label>
          <span>染料百分比(%)</span>
          <input type="number" step="0.1" min="0" value={dyePercent} onChange={(e) => setDyePercent(e.target.value)} />
        </label>
        <label>
          <span>克重(g/m²)</span>
          <input type="number" step="1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label>
          <span>浴比</span>
          <input value={liquorRatio} onChange={(e) => setLiquorRatio(e.target.value)} placeholder="如 1:10" />
        </label>
        <label>
          <span>色差 ΔE</span>
          <input type="number" step="0.01" min="0" value={deltaE} onChange={(e) => setDeltaE(e.target.value)} placeholder="如 0.85" />
        </label>
        <label>
          <span>寄出日期</span>
          <input type="date" value={shippedAt} onChange={(e) => setShippedAt(e.target.value)} />
        </label>
      </div>
      <p className="hint">工艺字段默认取订单现行工艺；与现行工艺不一致的寄样会被判为「已作废」。</p>
      {addedId && <p className="added-ok">已补录 {addedId}，并保存到本地。</p>}
    </section>
  );
}

/** 单条寄样：快照信息、状态徽标、反馈登记与回签 */
function ShipmentCard({
  row,
  order,
  onFeedback,
  onSignBack,
}: {
  row: LedgerRow;
  order: Order | undefined;
  onFeedback: (id: string, feedback: string) => void;
  onSignBack: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const s = row.shipment;

  const saveFeedback = () => {
    if (!draft.trim()) return;
    onFeedback(s.id, draft.trim());
    setDraft("");
  };

  return (
    <article className="shipment">
      <div className="shipment-head">
        <div>
          <h3>{s.id}</h3>
          <p>
            {s.orderNo} · {s.customer} · {s.fabric}
          </p>
        </div>
        <span className={`badge ${STATUS_TONE[row.status]}`}>{row.status}</span>
      </div>
      <div className="specs">
        <span>染料 {s.dyePercent}%</span>
        <span>克重 {s.weight}g/m²</span>
        <span>浴比 {s.liquorRatio}</span>
        <span className={s.deltaE > 1 ? "warn" : ""}>ΔE {s.deltaE}</span>
        <span>寄出 {s.shippedAt}</span>
      </div>
      {s.feedback && <p className="feedback-line">客户反馈：{s.feedback}</p>}
      <div className="actions">
        {canLeaveFeedback(s, order) && (
          <>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="填写客户反馈，保存后转为「可回签」"
            />
            <button onClick={saveFeedback}>保存反馈</button>
          </>
        )}
        {canSignBack(s, order) && (
          <button className="primary" onClick={() => onSignBack(s.id)}>回签确认</button>
        )}
        {row.status === "已作废" && <span className="void-note">工艺已变更，仅留档，不可回签</span>}
        {row.status === "已回签" && <span className="signed-note">已完成回签</span>}
      </div>
    </article>
  );
}

function App() {
  const [state, setState] = useState(loadState);
  const [orderFilter, setOrderFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ShipmentStatus>("ALL");

  // 每次变更整包落盘，重开页面接着处理
  useEffect(() => {
    saveState(state);
  }, [state]);

  const rows = useMemo(() => enrich(state.shipments, state.orders), [state]);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (orderFilter === "ALL" || r.shipment.orderNo === orderFilter) &&
          (statusFilter === "ALL" || r.status === statusFilter)
      ),
    [rows, orderFilter, statusFilter]
  );

  const countOf = (st: ShipmentStatus) => visible.filter((r) => r.status === st).length;
  const metrics: Array<[string, number]> = [
    ["当前寄样", visible.length],
    ["在寄", countOf("在寄")],
    ["可回签", countOf("可回签")],
    ["已作废", countOf("已作废")],
  ];

  const addShipment = (s: Shipment) =>
    setState((prev) => ({ ...prev, shipments: [s, ...prev.shipments] }));

  const reviseProcess = (orderNo: string, process: ProcessSnapshot) =>
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.orderNo === orderNo ? { ...o, process, revisedAt: today() } : o
      ),
    }));

  const saveFeedback = (id: string, feedback: string) =>
    setState((prev) => ({
      ...prev,
      shipments: prev.shipments.map((s) => (s.id === id ? { ...s, feedback } : s)),
    }));

  const signBack = (id: string) =>
    setState((prev) => ({
      ...prev,
      shipments: prev.shipments.map((s) => {
        if (s.id !== id) return s;
        const order = prev.orders.find((o) => o.orderNo === s.orderNo);
        return canSignBack(s, order) ? { ...s, signedBack: true } : s;
      }),
    }));

  const exportCsv = () => {
    const blob = new Blob([buildCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `寄样台账-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    if (window.confirm("确定恢复示例数据？当前所有修改将被覆盖。")) {
      setState(resetState());
      setOrderFilter("ALL");
      setStatusFilter("ALL");
    }
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 染整实验室 · 本地自动存档</p>
        <h1>染整寄样台账</h1>
        <span>
          每次寄样留存面料、染料百分比、克重、浴比与色差快照；业务员改单后，旧寄样自动作废留档、不可回签。
          按客户订单收窄列表，区分在寄 / 可回签 / 已作废，支持补录新样、登记反馈并导出当前结果。
        </span>
      </section>

      <section className="metrics">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="panel filter-bar">
        <label>
          <span>客户订单</span>
          <select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
            <option value="ALL">全部订单</option>
            {state.orders.map((o) => (
              <option key={o.orderNo} value={o.orderNo}>
                {o.orderNo} · {o.customer}
              </option>
            ))}
          </select>
        </label>
        <div className="chips">
          <button
            className={statusFilter === "ALL" ? "chip active" : "chip"}
            onClick={() => setStatusFilter("ALL")}
          >
            全部
          </button>
          {STATUS_ORDER.map((st) => (
            <button
              key={st}
              className={statusFilter === st ? "chip active" : "chip"}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="filter-actions">
          <button className="primary" onClick={exportCsv}>导出当前结果 CSV</button>
          <button onClick={resetAll}>重置示例数据</button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>订单现行工艺</h2>
          <div className="order-list">
            {state.orders.map((o) => (
              <OrderCard key={o.orderNo} order={o} onRevise={reviseProcess} />
            ))}
          </div>
        </aside>

        <NewShipmentForm orders={state.orders} shipments={state.shipments} onAdd={addShipment} />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>寄样台账</p>
            <h2>样布列表（{visible.length} 条）</h2>
          </div>
        </div>
        <div className="shipment-list">
          {visible.length === 0 && <p className="empty">当前筛选下没有寄样记录</p>}
          {visible.map((row) => (
            <ShipmentCard
              key={row.shipment.id}
              row={row}
              order={state.orders.find((o) => o.orderNo === row.shipment.orderNo)}
              onFeedback={saveFeedback}
              onSignBack={signBack}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
