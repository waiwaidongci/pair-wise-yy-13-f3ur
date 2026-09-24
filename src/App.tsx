import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  addSample,
  applyFeedback,
  canFeedback,
  canSign,
  canVoid,
  currentVersion,
  FEEDBACK_META,
  orderSummaries,
  reviseProcess,
  selectSamples,
  signBack,
  STATUS_META,
  STATUS_TABS,
  toCSV,
  validateDraft,
  voidSample,
  type FeedbackResult,
  type SampleDraft,
  type SampleRecord,
  type StatusFilter,
} from "./domain";
import { loadState, saveState, today } from "./storage";

const EMPTY_DRAFT: SampleDraft = {
  orderNo: "",
  customer: "",
  fabric: "",
  weight: "",
  dyePercent: "",
  liquorRatio: "",
  deltaE: "",
};

function App() {
  const [state, setState] = useState(loadState);

  // 每次台账变更都落本地存档，重开页面接着处理
  useEffect(() => saveState(state), [state]);

  const [orderFilter, setOrderFilter] = useState(""); // "" = 全部订单
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [draft, setDraft] = useState<SampleDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");

  const [feedbackId, setFeedbackId] = useState("");
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult>("ok");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const orders = useMemo(() => orderSummaries(state), [state]);
  const visible = useMemo(
    () => selectSamples(state.samples, orderFilter, statusFilter),
    [state.samples, orderFilter, statusFilter]
  );
  const activeOrder = orderFilter ? state.orders[orderFilter] : undefined;

  const counts = useMemo(() => {
    const c = { total: state.samples.length, shipped: 0, approvable: 0, signed: 0, void: 0 };
    for (const s of state.samples) c[s.status] += 1;
    return c;
  }, [state.samples]);

  function pickOrder(orderNo: string) {
    setOrderFilter(orderNo);
    setStatusFilter("all");
    if (orderNo) {
      const info = state.orders[orderNo];
      setDraft((d) => ({
        ...d,
        orderNo,
        customer: info?.customer ?? d.customer,
      }));
    }
  }

  function setField<K extends keyof SampleDraft>(key: K, value: string) {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "orderNo") {
        const info = state.orders[value.trim()];
        if (info) next.customer = info.customer;
      }
      return next;
    });
  }

  function submitDraft() {
    const trimmed: SampleDraft = {
      orderNo: draft.orderNo.trim(),
      customer: draft.customer.trim(),
      fabric: draft.fabric.trim(),
      weight: draft.weight.trim(),
      dyePercent: draft.dyePercent.trim(),
      liquorRatio: draft.liquorRatio.trim(),
      deltaE: draft.deltaE.trim(),
    };
    const error = validateDraft(trimmed);
    if (error) {
      setFormError(error);
      return;
    }
    const isNewOrder = !state.orders[trimmed.orderNo];
    setState((prev) => addSample(prev, trimmed, today()));
    setDraft({ ...EMPTY_DRAFT, orderNo: isNewOrder ? "" : trimmed.orderNo, customer: trimmed.customer });
    setFormError("");
    setOrderFilter(trimmed.orderNo);
    setStatusFilter("all");
  }

  function openFeedback(sample: SampleRecord) {
    setFeedbackId(sample.id);
    setFeedbackResult("ok");
    setFeedbackText(sample.feedback);
    setFeedbackError("");
  }

  function submitFeedback() {
    if (!feedbackText.trim()) {
      setFeedbackError("请填写客户反馈内容");
      return;
    }
    setState((prev) => applyFeedback(prev, feedbackId, feedbackResult, feedbackText.trim(), today()));
    setFeedbackId("");
  }

  function doSign(sample: SampleRecord) {
    if (window.confirm(`确认样布 ${sample.id} 已回签？回签后永久留档，不可再变更。`)) {
      setState((prev) => signBack(prev, sample.id, today()));
    }
  }

  function doVoid(sample: SampleRecord) {
    const reason = window.prompt(`作废样布 ${sample.id}（旧版寄样留档但不能回签），请填写作废原因：`, "");
    if (reason !== null) setState((prev) => voidSample(prev, sample.id, reason.trim(), today()));
  }

  function doRevise() {
    if (!orderFilter || !activeOrder) return;
    const reason = window.prompt(
      `订单 ${orderFilter} 工艺改版（当前 V${activeOrder.version}）：在寄 / 可回签的旧版样布将作废留档，原因可填写新工艺要点：`,
      "业务员变更工艺"
    );
    if (reason !== null) {
      setState((prev) => reviseProcess(prev, orderFilter, reason.trim(), today()));
    }
  }

  function exportCSV() {
    const csv = "\uFEFF" + toCSV(visible);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const scope = orderFilter ? orderFilter : "全部订单";
    a.href = url;
    a.download = `寄样台账_${scope}_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 源提示词7 · Port 62012</p>
        <h1>纺织染整寄样台账</h1>
        <span>
          每次寄出留下面料、染料百分比、克重、浴比和色差及对应工艺版本；工艺改版后旧寄样自动作废留档、不可回签。
          台账保存在本机浏览器，重开页面可继续处理。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>寄样总数</small>
          <strong>{counts.total}</strong>
        </article>
        <article>
          <small>在寄</small>
          <strong className="tone-blue">{counts.shipped}</strong>
        </article>
        <article>
          <small>可回签</small>
          <strong className="tone-amber">{counts.approvable}</strong>
        </article>
        <article>
          <small>已作废样布</small>
          <strong className="tone-gray">{counts.void}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>客户订单</h2>
          <div className="order-list">
            <button
              className={"order-row" + (!orderFilter ? " active" : "")}
              onClick={() => {
                setOrderFilter("");
                setStatusFilter("all");
              }}
            >
              <span className="order-name">全部订单</span>
              <span className="order-meta">{state.samples.length} 块样布</span>
            </button>
            {orders.map((o) => (
              <button
                key={o.orderNo}
                className={"order-row" + (orderFilter === o.orderNo ? " active" : "")}
                onClick={() => pickOrder(o.orderNo)}
              >
                <span className="order-name">
                  {o.orderNo}
                  <em className="version">V{o.version}</em>
                </span>
                <span className="order-meta">{o.customer}</span>
                <span className="order-dots">
                  <i className="dot blue" title={`在寄 ${o.shipped}`}>{o.shipped}</i>
                  <i className="dot amber" title={`可回签 ${o.approvable}`}>{o.approvable}</i>
                  <i className="dot green" title={`已回签 ${o.signed}`}>{o.signed}</i>
                  <i className="dot gray" title={`已作废 ${o.void}`}>{o.void}</i>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>补录新寄样</p>
              <h2>
                寄出登记
                {draft.orderNo && state.orders[draft.orderNo.trim()] && (
                  <em className="version-lock">
                    将锁定 V{currentVersion(state.orders, draft.orderNo.trim())} 工艺
                  </em>
                )}
              </h2>
            </div>
            <button className="primary" onClick={submitDraft}>
              保存寄样
            </button>
          </div>
          <div className="field-grid">
            <label>
              <span>客户订单号</span>
              <input
                list="order-options"
                placeholder="如 PO-240901"
                value={draft.orderNo}
                onChange={(e) => setField("orderNo", e.target.value)}
              />
              <datalist id="order-options">
                {orders.map((o) => (
                  <option key={o.orderNo} value={o.orderNo}>
                    {o.customer}
                  </option>
                ))}
              </datalist>
            </label>
            <label>
              <span>客户名称</span>
              <input
                placeholder="客户"
                value={draft.customer}
                onChange={(e) => setField("customer", e.target.value)}
              />
            </label>
            <label>
              <span>面料成分</span>
              <input
                placeholder="如 棉府绸 / 涤纶针织"
                value={draft.fabric}
                onChange={(e) => setField("fabric", e.target.value)}
              />
            </label>
            <label>
              <span>克重 (g/m²)</span>
              <input
                placeholder="如 120"
                value={draft.weight}
                onChange={(e) => setField("weight", e.target.value)}
              />
            </label>
            <label className="wide">
              <span>染料百分比（配方）</span>
              <input
                placeholder="如 活性红3BS 2.1% / 活性黄3RS 0.8%"
                value={draft.dyePercent}
                onChange={(e) => setField("dyePercent", e.target.value)}
              />
            </label>
            <label>
              <span>浴比</span>
              <input
                placeholder="如 1:10"
                value={draft.liquorRatio}
                onChange={(e) => setField("liquorRatio", e.target.value)}
              />
            </label>
            <label>
              <span>色差 ΔE</span>
              <input
                placeholder="如 0.84"
                value={draft.deltaE}
                onChange={(e) => setField("deltaE", e.target.value)}
              />
            </label>
          </div>
          {formError && <p className="error">{formError}</p>}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>寄样台账</p>
            <h2>
              {orderFilter ? `订单 ${orderFilter}` : "全部订单"} · 当前 {visible.length} 块样布
            </h2>
          </div>
          <div className="toolbar">
            {orderFilter && activeOrder && (
              <button className="warn" onClick={doRevise}>
                工艺改版（当前 V{activeOrder.version}）
              </button>
            )}
            <button onClick={exportCSV} disabled={visible.length === 0}>
              导出当前结果 CSV
            </button>
          </div>
        </div>

        <div className="status-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={statusFilter === tab.key ? "active" : ""}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
              <em>{tab.key === "all" ? state.samples.length : counts[tab.key]}</em>
            </button>
          ))}
        </div>

        <div className="records ledger">
          {visible.length === 0 && <p className="empty">当前筛选下没有寄样记录。</p>}
          {visible.map((s) => {
            const meta = STATUS_META[s.status];
            const editing = feedbackId === s.id;
            const outdated = s.status !== "signed" && s.status !== "void"
              && currentVersion(state.orders, s.orderNo) > s.processVersion;
            return (
              <article key={s.id} className={"ledger-card tone-" + meta.tone}>
                <div className="ledger-head">
                  <div>
                    <h3>
                      {s.id}
                      <span className={"badge tone-" + meta.tone}>{meta.label}</span>
                      {outdated && <span className="badge tone-gray">旧版未回签</span>}
                    </h3>
                    <p className="ledger-sub">
                      {s.orderNo} · {s.customer} · {s.sentAt} 寄出 · 工艺 V{s.processVersion}
                      {currentVersion(state.orders, s.orderNo) > s.processVersion && (
                        <em>（订单已升至 V{currentVersion(state.orders, s.orderNo)}）</em>
                      )}
                    </p>
                  </div>
                  <div className="actions">
                    {canFeedback(s) && !editing && (
                      <button className="primary" onClick={() => openFeedback(s)}>
                        填写反馈
                      </button>
                    )}
                    {canSign(s) && (
                      <button className="ok" onClick={() => doSign(s)}>
                        回签
                      </button>
                    )}
                    {canVoid(s) && (
                      <button className="ghost" onClick={() => doVoid(s)}>
                        作废
                      </button>
                    )}
                    {(s.status === "signed" || s.status === "void") && (
                      <span className="archived">已留档</span>
                    )}
                  </div>
                </div>

                <dl className="spec-grid">
                  <div>
                    <dt>面料</dt>
                    <dd>{s.fabric}</dd>
                  </div>
                  <div>
                    <dt>克重</dt>
                    <dd>{s.weight} g/m²</dd>
                  </div>
                  <div>
                    <dt>浴比</dt>
                    <dd>{s.liquorRatio}</dd>
                  </div>
                  <div>
                    <dt>色差 ΔE</dt>
                    <dd>{s.deltaE}</dd>
                  </div>
                  <div className="wide">
                    <dt>染料百分比</dt>
                    <dd>{s.dyePercent}</dd>
                  </div>
                </dl>

                {s.feedback && !editing && (
                  <p className="feedback">
                    {s.feedbackResult && <b>{FEEDBACK_META[s.feedbackResult]}：</b>}
                    {s.feedback}
                    <span className="dates">
                      {s.feedbackAt && `反馈 ${s.feedbackAt}`}
                      {s.signedAt && ` · 回签 ${s.signedAt}`}
                      {s.voidAt && ` · 作废 ${s.voidAt}${s.voidReason ? `（${s.voidReason}）` : ""}`}
                    </span>
                  </p>
                )}

                {editing && (
                  <div className="feedback-box">
                    <div className="feedback-options">
                      {(Object.keys(FEEDBACK_META) as FeedbackResult[]).map((r) => (
                        <label key={r} className="radio">
                          <input
                            type="radio"
                            name={"result-" + s.id}
                            checked={feedbackResult === r}
                            onChange={() => setFeedbackResult(r)}
                          />
                          {FEEDBACK_META[r]}
                        </label>
                      ))}
                    </div>
                    <textarea
                      rows={2}
                      placeholder="填写客户反馈：色光、手感、是否接受……"
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                    />
                    <p className="hint">
                      {feedbackResult === "ok"
                        ? "登记后样布进入「可回签」，由实验员完成回签。"
                        : "重寄 / 不通过将直接作废留档，不能再回签。"}
                    </p>
                    {feedbackError && <p className="error">{feedbackError}</p>}
                    <div className="actions">
                      <button className="primary" onClick={submitFeedback}>
                        提交反馈
                      </button>
                      <button className="ghost" onClick={() => setFeedbackId("")}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default App;
