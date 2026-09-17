"use client";

import type { FollowupRow as Follow, Page } from "../lib/types";
import type { Analysis, Data, OrderDetail, Performance, Route } from "./types";
import { RecentTable } from "./recent-table";
import { Empty, Modal, Pager, money, yoySpan } from "./ui";

/** 交易明细弹窗：精斗云原始单据行项目。 */
export function OrderDetailModal({ orderDetail, onClose }: { orderDetail: Data<OrderDetail>; onClose: () => void }) {
  return (
    <Modal title="交易明细" close={onClose}>
      <div className="sales-order-detail">
        {orderDetail.loading && <Empty>正在加载明细…</Empty>}
        {orderDetail.error && <p role="alert">{orderDetail.error}</p>}
        {orderDetail.data && <><h3>{orderDetail.data.order_no}</h3><p>{orderDetail.data.customer} · 原始金额 {money(orderDetail.data.amount)}</p><table className="sales-table"><thead><tr><th>行号</th><th>数量</th><th>原始金额</th></tr></thead><tbody>{orderDetail.data.lines.map(l => <tr key={l.line_no}><td>{l.line_no}</td><td>{l.quantity}</td><td>{money(l.amount)}</td></tr>)}</tbody></table></>}
      </div>
    </Modal>
  );
}

/** 我的跟进记录弹窗（全量分页）。 */
export function RecentModal({ recent, recentOffset, onOffsetChange, onClose, go }: { recent: Data<Page<Follow>>; recentOffset: number; onOffsetChange: (n: number) => void; onClose: () => void; go: (r: Route) => void }) {
  return (
    <Modal title="我的跟进记录" close={onClose}>
      {recent.error && <p role="alert">{recent.error}</p>}
      <RecentTable recent={recent} go={go} />
      <Pager offset={recentOffset} total={recent.data?.total || 0} onChange={onOffsetChange} />
    </Modal>
  );
}

/** 全部成交客户弹窗（已核实口径）。 */
export function AllCustomersModal({ allCustomers, perfRangeValue, allCustomerOffset, onOffsetChange, onClose, go }: { allCustomers: Data<Analysis>; perfRangeValue: { from: string; to: string; label: string }; allCustomerOffset: number; onOffsetChange: (n: number) => void; onClose: () => void; go: (r: Route) => void }) {
  return (
    <Modal title="全部成交客户" close={onClose}>
      <p className="sales-note">按已核实销售单口径统计，与 TOP 5 客户同一数据来源。</p>
      {allCustomers.error && <p role="alert">{allCustomers.error}</p>}
      {allCustomers.loading ? <Empty>正在加载客户…</Empty> : allCustomers.data?.rows.length ? <div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>#</th><th>客户名称</th><th>{perfRangeValue.label}销售额</th></tr></thead><tbody>{allCustomers.data.rows.map((r, i) => <tr key={r.id}><td>{allCustomerOffset + i + 1}</td><td><button className="sales-customer-link" onClick={() => { onClose(); go({ screen: "customers", customerId: r.id }); }}>{r.name}</button></td><td>{money(r.current)}</td></tr>)}</tbody></table></div> : <Empty>暂无已核实成交数据。不会用示例数字补齐。</Empty>}
      <Pager offset={allCustomerOffset} total={allCustomers.data?.total_rows || 0} onChange={onOffsetChange} />
    </Modal>
  );
}

/** 商品销售排行弹窗（接口仅返回前 5）。 */
export function AllProductsModal({ perf, perfRangeValue, onClose }: { perf: Data<Performance>; perfRangeValue: { from: string; to: string; label: string }; onClose: () => void }) {
  return (
    <Modal title="商品销售排行" close={onClose}>
      <p className="sales-note">业绩接口仅返回前 5，此处仅展示前 5，不做数据补齐。</p>
      {perf.data?.products.length ? <table className="sales-table"><thead><tr><th>#</th><th>商品</th><th>{perfRangeValue.label}销售额</th><th>同比</th><th>成交客户数</th></tr></thead><tbody>{perf.data.products.map((pr, i) => <tr key={pr.name}><td>{i + 1}</td><td>{pr.name}</td><td>{money(pr.amount)}</td><td>{yoySpan(pr.yoy)}</td><td>{pr.customers ?? "—"}</td></tr>)}</tbody></table> : <Empty>暂无商品销售数据。</Empty>}
    </Modal>
  );
}
