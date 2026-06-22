"use client";

import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FolderOpen,
  HandCoins,
  Landmark,
  ListFilter,
  Loader2,
  ReceiptText,
  Trash2,
  Upload,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { RealizedTrade, SymbolSummary, TaxAnalysis, TradeActivity } from "@/lib/tax/types";

type TabKey = "symbols" | "scenarios" | "dividends" | "positions" | "issues" | "excluded";
type BrokerId = "futu" | "longbridge";

interface UploadEntry {
  id: string;
  file: File;
  broker: BrokerId;
}

interface ExclusionOption {
  key: string;
  broker: string;
  currency: string;
  symbol: string;
  securityName: string;
}

interface QuarterGroup {
  label: string;
  sortKey: number;
  buyCount: number;
  sellCount: number;
  transferOutCount: number;
  quantitySold: number;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
  gainLossRmb: number;
  trades: RealizedTrade[];
  activities: TradeActivity[];
}

const formatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: number, currency = "RMB") {
  return `${currency} ${formatter.format(value)}`;
}

function signedClass(value: number) {
  if (value > 0.005) return "positive";
  if (value < -0.005) return "negative";
  return "";
}

function inferBroker(file: File): BrokerId {
  return file.name.toLowerCase().endsWith(".pdf") ? "longbridge" : "futu";
}

function exclusionKey(broker: string, currency: string, symbol: string) {
  return `${broker}::${currency}::${symbol}`;
}

function symbolKey(row: Pick<SymbolSummary, "broker" | "currency" | "symbol">) {
  return `${row.broker}::${row.currency}::${row.symbol}`;
}

function sameSymbol(
  item: Pick<SymbolSummary, "broker" | "currency" | "symbol">,
  row: Pick<SymbolSummary, "broker" | "currency" | "symbol">,
) {
  return item.broker === row.broker && item.currency === row.currency && item.symbol === row.symbol;
}

function quarterFor(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { label: "未知月份", sortKey: 99 };
  }
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  return {
    label: Number.isFinite(year) ? `${year}年${start}-${start + 2}月` : `${start}-${start + 2}月`,
    sortKey: (Number.isFinite(year) ? year : 0) * 100 + start,
  };
}

function quarterGroup(groups: Map<string, QuarterGroup>, date: string) {
  const quarter = quarterFor(date);
  const existing = groups.get(quarter.label);
  if (existing) return existing;
  const created: QuarterGroup = {
    label: quarter.label,
    sortKey: quarter.sortKey,
    buyCount: 0,
    sellCount: 0,
    transferOutCount: 0,
    quantitySold: 0,
    proceeds: 0,
    costBasis: 0,
    gainLoss: 0,
    gainLossRmb: 0,
    trades: [],
    activities: [],
  };
  groups.set(quarter.label, created);
  return created;
}

function buildSymbolDetails(analysis: TaxAnalysis, row: SymbolSummary) {
  const fxRate = analysis.config.fxRates[row.currency];
  const trades = analysis.realizedTrades
    .filter((trade) => sameSymbol(trade, row))
    .sort((a, b) => a.sellDate.localeCompare(b.sellDate));
  const activities = (analysis.tradeActivities ?? [])
    .filter((activity) => sameSymbol(activity, row))
    .sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map<string, QuarterGroup>();

  for (const activity of activities) {
    const group = quarterGroup(groups, activity.date);
    group.activities.push(activity);
    if (activity.side === "sell") {
      group.sellCount += 1;
    } else if (activity.side === "transfer_out") {
      group.transferOutCount += 1;
    } else {
      group.buyCount += 1;
    }
  }

  for (const trade of trades) {
    const group = quarterGroup(groups, trade.sellDate);
    group.trades.push(trade);
    group.quantitySold += trade.quantity;
    group.proceeds += trade.proceeds;
    group.costBasis += trade.costBasis;
    group.gainLoss += trade.gainLoss;
    group.gainLossRmb += trade.gainLoss * fxRate;
  }

  const quarters = Array.from(groups.values())
    .map((group) => ({
      ...group,
      sellCount: Math.max(group.sellCount, group.trades.length),
    }))
    .sort((a, b) => a.sortKey - b.sortKey);

  return { activities, fxRate, quarters, trades };
}

function activitySideLabel(side: TradeActivity["side"]) {
  const labels: Record<TradeActivity["side"], string> = {
    buy: "买入",
    sell: "卖出",
    acquire: "中签/入账",
    transfer_in: "转入",
    transfer_out: "转出",
  };
  return labels[side];
}

function exclusionOptions(analysis: TaxAnalysis): ExclusionOption[] {
  const options = new Map<string, ExclusionOption>();
  for (const row of analysis.symbols) {
    const key = exclusionKey(row.broker, row.currency, row.symbol);
    options.set(key, {
      key,
      broker: row.broker,
      currency: row.currency,
      symbol: row.symbol,
      securityName: row.securityName,
    });
  }
  for (const row of analysis.excludedTrades) {
    const key = exclusionKey(row.broker, row.currency, row.symbol);
    options.set(key, {
      key,
      broker: row.broker,
      currency: row.currency,
      symbol: row.symbol,
      securityName: row.securityName,
    });
  }
  return Array.from(options.values()).sort((a, b) => {
    return a.broker.localeCompare(b.broker) || a.symbol.localeCompare(b.symbol);
  });
}

function downloadCsv(analysis: TaxAnalysis) {
  const rows = [
    ["券商", "币种", "代码", "名称", "卖出数量", "卖出净收款", "成本基础", "净盈亏", "净盈亏RMB"],
    ...analysis.symbols.map((row) => [
      row.broker,
      row.currency,
      row.symbol,
      row.securityName,
      row.quantity,
      row.proceeds,
      row.costBasis,
      row.gainLoss,
      row.gainLossRmb,
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tax-check-symbol-summary.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [files, setFiles] = useState<UploadEntry[]>([]);
  const [password, setPassword] = useState("");
  const [analysis, setAnalysis] = useState<TaxAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("symbols");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [manualCosts, setManualCosts] = useState<Record<string, string>>({});
  const [expandedSymbolKey, setExpandedSymbolKey] = useState<string | null>(null);

  const totalFilesSize = useMemo(() => {
    return files.reduce((sum, entry) => sum + entry.file.size, 0);
  }, [files]);
  const symbolExclusionOptions = useMemo(() => {
    return analysis ? exclusionOptions(analysis) : [];
  }, [analysis]);

  async function loadDemo(nextExcludedKeys = new Set<string>()) {
    setError(null);
    setIsLoading(true);
    setExcludedKeys(nextExcludedKeys);
    setManualCosts({});
    setExpandedSymbolKey(null);
    try {
      const query =
        nextExcludedKeys.size > 0
          ? `?excludedSymbols=${encodeURIComponent(JSON.stringify(Array.from(nextExcludedKeys)))}`
          : "";
      const response = await fetch(`/api/analyze${query}`);
      const payload = (await response.json()) as TaxAnalysis;
      setAnalysis(payload);
      setActiveTab("symbols");
      setExpandedSymbolKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取样例失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function analyzeFiles(nextExcludedKeys = excludedKeys, nextManualCosts = manualCosts) {
    setError(null);
    setIsLoading(true);
    try {
      const formData = new FormData();
      for (const entry of files) {
        formData.append("files", entry.file);
        formData.append("brokers", entry.broker);
      }
      formData.append("password", password);
      formData.append("excludedSymbols", JSON.stringify(Array.from(nextExcludedKeys)));
      formData.append(
        "manualCosts",
        JSON.stringify(
          Object.entries(nextManualCosts)
            .filter(([, value]) => value.trim() !== "")
            .map(([id, value]) => ({ id, costBasis: Number(value) }))
            .filter((item) => Number.isFinite(item.costBasis) && item.costBasis >= 0),
        ),
      );
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "分析失败");
      }
      const payload = (await response.json()) as TaxAnalysis;
      setAnalysis(payload);
      setActiveTab("symbols");
      setExpandedSymbolKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setIsLoading(false);
    }
  }

  function updateBroker(id: string, broker: BrokerId) {
    setFiles((current) => current.map((entry) => (entry.id === id ? { ...entry, broker } : entry)));
    setAnalysis(null);
    setExcludedKeys(new Set());
    setManualCosts({});
    setExpandedSymbolKey(null);
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((entry) => entry.id !== id));
    setAnalysis(null);
    setExcludedKeys(new Set());
    setManualCosts({});
    setExpandedSymbolKey(null);
  }

  function updateManualCost(id: string, value: string) {
    setManualCosts((current) => ({ ...current, [id]: value }));
  }

  function toggleExclusion(key: string) {
    const next = new Set(excludedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExcludedKeys(next);
    setExpandedSymbolKey(null);
    if (files.length > 0) {
      void analyzeFiles(next);
    } else if (analysis) {
      void loadDemo(next);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Landmark size={19} />
          </div>
          <div>
            <div className="brand-title">Tax Check</div>
            <div className="brand-subtitle">海外证券所得盘点</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="button" onClick={() => loadDemo()} disabled={isLoading} type="button">
            <FileSpreadsheet size={17} />
            样例盘点
          </button>
          <button
            className="button primary"
            onClick={() => analysis && downloadCsv(analysis)}
            disabled={!analysis}
            type="button"
          >
            <ReceiptText size={17} />
            导出CSV
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <Upload size={17} />
                文件
              </div>
            </div>
            <div className="panel-body">
              <label className="file-drop">
                <input
                  className="file-input"
                  multiple
                  type="file"
                  accept=".xlsx,.xls,.pdf,.csv"
                  onChange={(event) => {
                    const selected = Array.from(event.currentTarget.files ?? []);
                    setFiles(
                      selected.map((file, index) => ({
                        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
                        file,
                        broker: inferBroker(file),
                      })),
                    );
                    setAnalysis(null);
                    setExcludedKeys(new Set());
                    setManualCosts({});
                    setExpandedSymbolKey(null);
                    event.currentTarget.value = "";
                  }}
                />
                <FolderOpen size={22} />
                <span>选择年度清单或月结单</span>
              </label>

              {files.length > 0 ? (
                <div className="file-list">
                  {files.map((entry) => (
                    <div className="file-row" key={entry.id}>
                      <FileSpreadsheet size={16} />
                      <div>
                        <div className="file-name">{entry.file.name}</div>
                        <div className="file-size">{formatter.format(entry.file.size / 1024)} KB</div>
                      </div>
                      <select
                        aria-label={`${entry.file.name} 券商`}
                        className="select compact"
                        value={entry.broker}
                        onChange={(event) => updateBroker(entry.id, event.target.value as BrokerId)}
                      >
                        <option value="futu">富途</option>
                        <option value="longbridge">长桥</option>
                      </select>
                      <button
                        aria-label={`删除 ${entry.file.name}`}
                        className="icon-button"
                        onClick={() => removeFile(entry.id)}
                        title="删除"
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <div className="small-note">总大小 {formatter.format(totalFilesSize / 1024)} KB</div>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="password">PDF密码</label>
                <input
                  className="input"
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="长桥月结单密码"
                  type="password"
                />
              </div>

              <div className="field">
                <button
                  className="button primary"
                  disabled={isLoading || files.length === 0}
                  onClick={() => analyzeFiles()}
                  type="button"
                >
                  {isLoading ? <Loader2 size={17} /> : <Calculator size={17} />}
                  开始分析
                </button>
              </div>

              {error ? (
                <div className="issue" style={{ marginTop: 12 }}>
                  <div className="issue-title">{error}</div>
                </div>
              ) : null}
            </div>
          </section>

          {analysis && analysis.costBasisRequests.length > 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <HandCoins size={17} />
                  成本补录
                </div>
              </div>
              <div className="panel-body">
                <div className="cost-list">
                  {analysis.costBasisRequests.map((request) => (
                    <div className="cost-row" key={request.id}>
                      <div>
                        <div className="cost-title">
                          {request.broker} {request.currency} {request.symbol}
                        </div>
                        <div className="cost-subtitle">{request.securityName}</div>
                        <div className="cost-meta">
                          卖出 {formatter.format(request.quantity)} 股 · 净收款{" "}
                          {formatter.format(request.proceeds)}
                        </div>
                      </div>
                      <input
                        aria-label={`${request.symbol} 总成本`}
                        className="input cost-input"
                        min="0"
                        onChange={(event) => updateManualCost(request.id, event.target.value)}
                        placeholder="总成本"
                        step="0.01"
                        type="number"
                        value={manualCosts[request.id] ?? ""}
                      />
                    </div>
                  ))}
                </div>
                <button
                  className="button primary full-width"
                  disabled={isLoading || files.length === 0}
                  onClick={() => analyzeFiles()}
                  type="button"
                >
                  {isLoading ? <Loader2 size={17} /> : <Calculator size={17} />}
                  应用成本
                </button>
              </div>
            </section>
          ) : null}

          {analysis && symbolExclusionOptions.length > 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <ListFilter size={17} />
                  剔除标的
                </div>
              </div>
              <div className="panel-body">
                <div className="check-list">
                  {symbolExclusionOptions.map((option) => (
                    <label className="check-row" key={option.key}>
                      <input
                        checked={excludedKeys.has(option.key)}
                        disabled={isLoading}
                        type="checkbox"
                        onChange={() => toggleExclusion(option.key)}
                      />
                      <span>
                        <span className="check-title">
                          {option.broker} {option.currency} {option.symbol}
                        </span>
                        <span className="check-subtitle">{option.securityName}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <AlertTriangle size={17} />
                口径
              </div>
            </div>
            <div className="panel-body small-note">
              股票资本利得按全年已实现股票净盈亏估算。当前使用固定估算汇率：HKD × 0.90322、USD × 7.0288、CNY ×
              1。分红单独计算，境外已扣税额作为抵免参考。转仓和未卖出持仓不进入资本利得。
            </div>
          </section>
        </aside>

        <section className="content">
          {analysis ? (
            <>
              <section className="summary-grid">
                <div className="metric">
                  <div className="metric-label">股票净盈亏</div>
                  <div className={`metric-value ${signedClass(analysis.summary.capitalGainRmb)}`}>
                    {money(analysis.summary.capitalGainRmb)}
                  </div>
                  <div className="metric-foot">全年已实现净额</div>
                </div>
                <div className="metric">
                  <div className="metric-label">资本利得税</div>
                  <div className="metric-value">{money(analysis.summary.capitalEstimatedTaxRmb)}</div>
                  <div className="metric-foot">净额应税基数 × 20%</div>
                </div>
                <div className="metric">
                  <div className="metric-label">分红补税</div>
                  <div className="metric-value">{money(analysis.summary.dividend.estimatedTaxRmb)}</div>
                  <div className="metric-foot">
                    已抵免 {money(analysis.summary.dividend.withholdingCreditRmb)}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">估算合计</div>
                  <div className="metric-value">{money(analysis.summary.totalEstimatedTaxRmb)}</div>
                  <div className="metric-foot">资本利得 + 分红</div>
                </div>
              </section>

              <section className="panel">
                <div className="tabs">
                  {[
                    ["symbols", "股票盈亏"],
                    ["scenarios", "税费口径"],
                    ["dividends", "分红"],
                    ["positions", "未实现/转仓"],
                    ["issues", "待确认"],
                    ["excluded", "排除项"],
                  ].map(([key, label]) => (
                    <button
                      className={`tab ${activeTab === key ? "active" : ""}`}
                      key={key}
                      onClick={() => setActiveTab(key as TabKey)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="table-wrap">
                  {renderTab(activeTab, analysis, expandedSymbolKey, setExpandedSymbolKey)}
                </div>
              </section>
            </>
          ) : (
            <section className="panel">
              <div className="empty-state">
                <Calculator size={28} />
                <div>上传文件或打开样例盘点</div>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function renderSymbolDetails(analysis: TaxAnalysis, row: SymbolSummary) {
  const detail = buildSymbolDetails(analysis, row);

  return (
    <div className="detail-panel">
      <div className="detail-heading">
        <div>
          <div className="detail-title">
            {row.broker} {row.currency} {row.symbol}
          </div>
          <div className="detail-subtitle">{row.securityName}</div>
        </div>
        <div className="detail-rate">RMB换算：{row.currency} × {formatter.format(detail.fxRate)}</div>
      </div>

      <div className="nested-table-wrap">
        <table className="nested-table">
          <thead>
            <tr>
              <th>期间</th>
              <th className="number">买入/转入</th>
              <th className="number">卖出</th>
              <th className="number">转出</th>
              <th className="number">卖出数量</th>
              <th className="number">卖出净收款</th>
              <th className="number">匹配成本</th>
              <th className="number">净盈亏</th>
              <th className="number">净盈亏 RMB</th>
            </tr>
          </thead>
          <tbody>
            {detail.quarters.map((quarter) => (
              <tr key={quarter.label}>
                <td>{quarter.label}</td>
                <td className="number">{quarter.buyCount}</td>
                <td className="number">{quarter.sellCount}</td>
                <td className="number">{quarter.transferOutCount}</td>
                <td className="number">{formatter.format(quarter.quantitySold)}</td>
                <td className="number">{formatter.format(quarter.proceeds)}</td>
                <td className="number">{formatter.format(quarter.costBasis)}</td>
                <td className={`number ${signedClass(quarter.gainLoss)}`}>{formatter.format(quarter.gainLoss)}</td>
                <td className={`number ${signedClass(quarter.gainLossRmb)}`}>
                  {formatter.format(quarter.gainLossRmb)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="detail-section-title">已实现卖出明细</div>
      {detail.trades.length > 0 ? (
        <div className="nested-table-wrap">
          <table className="nested-table">
            <thead>
              <tr>
                <th>日期</th>
                <th className="number">数量</th>
                <th className="number">卖出净收款</th>
                <th className="number">匹配成本</th>
                <th className="number">净盈亏</th>
                <th>来源/备注</th>
              </tr>
            </thead>
            <tbody>
              {detail.trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.sellDate}</td>
                  <td className="number">{formatter.format(trade.quantity)}</td>
                  <td className="number">{formatter.format(trade.proceeds)}</td>
                  <td className="number">{formatter.format(trade.costBasis)}</td>
                  <td className={`number ${signedClass(trade.gainLoss)}`}>{formatter.format(trade.gainLoss)}</td>
                  <td className="text-wrap">{trade.note ? `${trade.source} · ${trade.note}` : trade.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="detail-empty">暂无已实现卖出明细。</div>
      )}

      <div className="detail-section-title">原始交易活动</div>
      {detail.activities.length > 0 ? (
        <div className="nested-table-wrap">
          <table className="nested-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>方向</th>
                <th className="number">数量</th>
                <th className="number">金额</th>
                <th>来源/备注</th>
              </tr>
            </thead>
            <tbody>
              {detail.activities.map((activity) => (
                <tr key={activity.id}>
                  <td>{activity.date}</td>
                  <td>{activitySideLabel(activity.side)}</td>
                  <td className="number">{formatter.format(activity.quantity)}</td>
                  <td className="number">{formatter.format(activity.amount)}</td>
                  <td className="text-wrap">
                    {activity.note ? `${activity.source} · ${activity.note}` : activity.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="detail-empty">暂无原始买入/卖出活动，只展示已实现卖出明细。</div>
      )}
    </div>
  );
}

function renderTab(
  tab: TabKey,
  analysis: TaxAnalysis,
  expandedSymbolKey: string | null,
  onToggleSymbol: (key: string | null) => void,
) {
  if (tab === "symbols") {
    return (
      <table>
        <thead>
          <tr>
            <th>券商</th>
            <th>代码</th>
            <th>名称</th>
            <th>币种</th>
            <th className="number">净盈亏</th>
            <th className="number">净盈亏 RMB</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {analysis.symbols.map((row) => {
            const key = symbolKey(row);
            const isExpanded = expandedSymbolKey === key;
            const toggle = () => onToggleSymbol(isExpanded ? null : key);
            return (
              <Fragment key={key}>
                <tr
                  className={`symbol-row ${isExpanded ? "expanded" : ""}`}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle();
                    }
                  }}
                  tabIndex={0}
                >
                  <td>
                    <span className="symbol-cell">
                      <button
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "收起" : "展开"} ${row.symbol}`}
                        className="row-expander"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle();
                        }}
                        type="button"
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      {row.broker}
                    </span>
                  </td>
                  <td>{row.symbol}</td>
                  <td>{row.securityName}</td>
                  <td>{row.currency}</td>
                  <td className={`number ${signedClass(row.gainLoss)}`}>{formatter.format(row.gainLoss)}</td>
                  <td className={`number ${signedClass(row.gainLossRmb)}`}>{formatter.format(row.gainLossRmb)}</td>
                  <td>
                    <span className={`tag ${row.status === "gain" ? "good" : row.status === "loss" ? "warn" : ""}`}>
                      {row.status === "gain" ? "盈利" : row.status === "loss" ? "亏损" : "持平"}
                    </span>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="detail-row">
                    <td colSpan={7}>{renderSymbolDetails(analysis, row)}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (tab === "scenarios") {
    return (
      <table>
        <thead>
          <tr>
            <th>口径</th>
            <th>期间</th>
            <th>成本法</th>
            <th className="number">股票净盈亏 RMB</th>
            <th className="number">应税基数 RMB</th>
            <th className="number">估算税额 RMB</th>
            <th className="number">卖出笔数</th>
            <th className="number">缺成本</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {(analysis.taxScenarios ?? []).map((scenario) => (
            <tr className={scenario.isDefault ? "default-scenario-row" : ""} key={scenario.id}>
              <td>
                <span className="scenario-name">
                  {scenario.label}
                  {scenario.isDefault ? <span className="tag good">当前默认</span> : null}
                </span>
              </td>
              <td>
                {scenario.yearLabel}
                <div className="muted-line">
                  {scenario.yearStart} 至 {scenario.yearEnd}
                </div>
              </td>
              <td>{scenario.costBasisMethod === "fifo" ? "FIFO 先进先出" : "ACB 平均成本"}</td>
              <td className={`number ${signedClass(scenario.capitalGainRmb)}`}>
                {formatter.format(scenario.capitalGainRmb)}
              </td>
              <td className="number">{formatter.format(scenario.capitalTaxBaseRmb)}</td>
              <td className="number">{formatter.format(scenario.capitalEstimatedTaxRmb)}</td>
              <td className="number">{scenario.realizedTradeCount}</td>
              <td className={`number ${scenario.missingCostIssueCount > 0 ? "negative" : ""}`}>
                {scenario.missingCostIssueCount}
              </td>
              <td className="text-wrap">中国大陆居民个税口径，按自然年1月1日至12月31日切分。</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === "dividends") {
    return (
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>券商</th>
            <th>代码</th>
            <th>名称</th>
            <th>币种</th>
            <th className="number">分红总额</th>
            <th className="number">已扣税</th>
            <th className="number">手续费</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {analysis.dividends.map((row) => (
            <tr key={row.id}>
              <td>{row.date}</td>
              <td>{row.broker}</td>
              <td>{row.symbol}</td>
              <td>{row.securityName}</td>
              <td>{row.currency}</td>
              <td className="number">{formatter.format(row.grossAmount)}</td>
              <td className="number">{formatter.format(row.taxWithheld)}</td>
              <td className="number">{formatter.format(row.fee)}</td>
              <td className="text-wrap">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === "positions") {
    return (
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>券商</th>
            <th>代码</th>
            <th>名称</th>
            <th>币种</th>
            <th className="number">数量</th>
            <th className="number">市值</th>
            <th className="number">未实现盈亏</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {analysis.openPositions.map((row) => (
            <tr key={row.id}>
              <td>{row.asOf}</td>
              <td>{row.broker}</td>
              <td>{row.symbol}</td>
              <td>{row.securityName}</td>
              <td>{row.currency}</td>
              <td className="number">{formatter.format(row.quantity)}</td>
              <td className="number">{formatter.format(row.marketValue)}</td>
              <td className={`number ${signedClass(row.unrealizedGainLoss ?? 0)}`}>
                {formatter.format(row.unrealizedGainLoss ?? 0)}
              </td>
              <td className="text-wrap">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === "excluded") {
    return (
      <table>
        <thead>
          <tr>
            <th>券商</th>
            <th>代码</th>
            <th>名称</th>
            <th>币种</th>
            <th className="number">净盈亏</th>
            <th>排除原因</th>
          </tr>
        </thead>
        <tbody>
          {analysis.excludedTrades.map((row) => (
            <tr key={row.id}>
              <td>{row.broker}</td>
              <td>{row.symbol}</td>
              <td>{row.securityName}</td>
              <td>{row.currency}</td>
              <td className={`number ${signedClass(row.gainLoss)}`}>{formatter.format(row.gainLoss)}</td>
              <td className="text-wrap">{row.exclusionReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="panel-body">
      <div className="issue-list">
        {analysis.issues.map((issue) => (
          <div className="issue" key={issue.id}>
            <div className="issue-title">{issue.title}</div>
            <div className="issue-detail">{issue.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
