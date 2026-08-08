"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";

export type TepraItem = { id: string; code: string; name: string; category: string; unit: string; qty: number; orderPoint: string; memo: string; createdAt?: string };
type PrintFormat = "a4" | "tepra";
type PrintRecord = { signature: string; printedAt: string };
type PrintLedger = Record<string, Partial<Record<PrintFormat, PrintRecord>>>;
type FieldKey = "name" | "code" | "orderPointLot" | "unit" | "memo";
type TepraSettings = { tapeWidth: 18 | 24 | 36; labelLength: number; qrSize: number; nameSize: number; detailSize: number; margin: number; qrSide: "left" | "right"; fields: Record<FieldKey, boolean>; order: FieldKey[] };

const LEDGER_KEY = "item-print-ledger-v1";
const SETTINGS_KEY = "tepra-layout-settings-v1";
const defaultSettings: TepraSettings = { tapeWidth: 36, labelLength: 100, qrSize: 25, nameSize: 13, detailSize: 9, margin: 3, qrSide: "left", fields: { name: true, code: true, orderPointLot: true, unit: true, memo: true }, order: ["name", "code", "orderPointLot", "unit", "memo"] };
const fieldLabels: Record<FieldKey, string> = { name: "品名", code: "品番", orderPointLot: "発注点・ロット", unit: "単位", memo: "備考" };

function readLedger(): PrintLedger {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(LEDGER_KEY) ?? "{}"); } catch { return {}; }
}

function signature(item: TepraItem) {
  return JSON.stringify([item.code, item.name, item.orderPoint, item.qty, item.unit, item.memo]);
}

export function markItemsPrinted(items: TepraItem[], format: PrintFormat) {
  const ledger = readLedger();
  const printedAt = new Date().toISOString();
  items.forEach((item) => { ledger[item.id] = { ...ledger[item.id], [format]: { signature: signature(item), printedAt } }; });
  window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  window.dispatchEvent(new Event("print-ledger-change"));
}

export function getItemPrintFlag(item: TepraItem) {
  const record = readLedger()[item.id];
  if (!record?.a4 && !record?.tepra) return "未印刷";
  const current = signature(item);
  if ((record.a4 && record.a4.signature !== current) || (record.tepra && record.tepra.signature !== current)) return "更新あり";
  return "印刷済み";
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

export function TepraPrintManager({ allItems, queuedItems, onSelectedPrinted }: { allItems: TepraItem[]; queuedItems: TepraItem[]; onSelectedPrinted: (id: string) => void }) {
  const [scope, setScope] = useState<"all" | "selected" | "new" | "updated">("selected");
  const [settings, setSettings] = useState<TepraSettings>(defaultSettings);
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [printJob, setPrintJob] = useState<{ items: TepraItem[]; qr: Record<string, string> } | null>(null);
  useEffect(() => {
    try { setSettings({ ...defaultSettings, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") }); } catch { setSettings(defaultSettings); }
  }, []);
  useEffect(() => { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  const ledger = useMemo(() => readLedger(), [ledgerVersion]);
  const newItems = useMemo(() => allItems.filter((item) => !ledger[item.id]?.tepra), [allItems, ledger]);
  const updatedItems = useMemo(() => allItems.filter((item) => ledger[item.id]?.tepra && ledger[item.id]?.tepra?.signature !== signature(item)), [allItems, ledger]);
  const targets = scope === "all" ? allItems : scope === "selected" ? queuedItems : scope === "new" ? newItems : updatedItems;
  const safeIndex = Math.min(currentIndex, Math.max(0, targets.length - 1));
  const currentTarget = targets[safeIndex];
  useEffect(() => { setCurrentIndex(0); }, [scope]);
  const saveSettings = (next: TepraSettings) => setSettings(next);
  const updateOrder = (key: FieldKey, direction: -1 | 1) => {
    const order = [...settings.order]; const index = order.indexOf(key); const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]]; saveSettings({ ...settings, order });
  };
  const preparePrint = async () => {
    if (!currentTarget) { window.alert("この条件で印刷する商品がありません。"); return; }
    const qr = await QRCode.toDataURL(currentTarget.id, { errorCorrectionLevel: "H", margin: 1, width: 512 });
    setPrintJob({ items: [currentTarget], qr: { [currentTarget.id]: qr } });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const pageStyle = document.createElement("style"); pageStyle.id = "tepra-page-style";
    pageStyle.textContent = `@media print{@page{size:${settings.labelLength}mm ${settings.tapeWidth}mm;margin:0}}`;
    document.head.appendChild(pageStyle); document.body.classList.add("tepraPrinting");
    await document.fonts?.ready; window.print(); document.body.classList.remove("tepraPrinting"); pageStyle.remove();
    const completed = window.confirm("テプラ印刷は完了しましたか？\n\n［OK］印刷済みフラグを付ける\n［キャンセル］未印刷のまま残す");
    if (completed) {
      markItemsPrinted([currentTarget], "tepra"); setLedgerVersion((value) => value + 1);
      if (scope === "selected") onSelectedPrinted(currentTarget.id); else setCurrentIndex((value) => Math.min(value + 1, Math.max(0, targets.length - 1)));
    }
    setPrintJob(null);
  };
  const exportCsv = () => {
    if (targets.length === 0) { window.alert("この条件で出力する商品がありません。"); return; }
    const header = ["QRコード", "品名", "品番", "発注点", "ロット", "単位", "備考"];
    const rows = targets.map((item) => [item.id, item.name, item.code, item.orderPoint, item.qty, item.unit, item.memo]);
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `tepra-sr970-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className="tepraManager">
    <div className="tepraIntro"><div><b>テプラ印刷（KING JIM SR970）</b><span>36mmテープの印字可能範囲（約27mm）の中央に看板を配置します。自動カットONにしてください。</span></div><strong>{targets.length}<small>品</small></strong></div>
    <div className="tepraScopes" role="radiogroup" aria-label="テプラ印刷対象">
      <label><input type="radio" checked={scope === "all"} onChange={() => setScope("all")}/>全商品 <b>{allItems.length}</b></label>
      <label><input type="radio" checked={scope === "selected"} onChange={() => setScope("selected")}/>選択商品のみ <b>{queuedItems.length}</b></label>
      <label><input type="radio" checked={scope === "new"} onChange={() => setScope("new")}/>新規登録のみ <b>{newItems.length}</b></label>
      <label><input type="radio" checked={scope === "updated"} onChange={() => setScope("updated")}/>更新分のみ <b>{updatedItems.length}</b></label>
    </div>
    <details className="tepraSettings"><summary>レイアウト設定</summary><div className="tepraSettingGrid">
      <label>テープ幅<select value={settings.tapeWidth} onChange={(event) => saveSettings({ ...settings, tapeWidth: Number(event.target.value) as TepraSettings["tapeWidth"] })}><option value="36">36mm（SR970）</option><option value="24">24mm</option><option value="18">18mm</option></select></label>
      <label>ラベル長さ<input type="number" min="45" max="200" value={settings.labelLength} onChange={(event) => saveSettings({ ...settings, labelLength: Number(event.target.value) || 100 })}/><span>mm</span></label>
      <label>QRサイズ<input type="number" min="12" max="26" value={Math.min(settings.qrSize, 26)} onChange={(event) => saveSettings({ ...settings, qrSize: Number(event.target.value) || 25 })}/><span>mm</span></label>
      <label>品名サイズ<input type="number" min="7" max="22" value={settings.nameSize} onChange={(event) => saveSettings({ ...settings, nameSize: Number(event.target.value) || 13 })}/><span>pt</span></label>
      <label>詳細サイズ<input type="number" min="6" max="16" value={settings.detailSize} onChange={(event) => saveSettings({ ...settings, detailSize: Number(event.target.value) || 9 })}/><span>pt</span></label>
      <label>余白<input type="number" min="0" max="5" step=".5" value={settings.margin} onChange={(event) => saveSettings({ ...settings, margin: Number(event.target.value) })}/><span>mm</span></label>
      <label>QR配置<select value={settings.qrSide} onChange={(event) => saveSettings({ ...settings, qrSide: event.target.value as "left" | "right" })}><option value="left">左</option><option value="right">右</option></select></label>
    </div><div className="tepraFieldSettings">{settings.order.map((key, index) => <div key={key}><label><input type="checkbox" checked={settings.fields[key]} onChange={(event) => saveSettings({ ...settings, fields: { ...settings.fields, [key]: event.target.checked } })}/>{fieldLabels[key]}</label><button disabled={index === 0} onClick={() => updateOrder(key, -1)}>↑</button><button disabled={index === settings.order.length - 1} onClick={() => updateOrder(key, 1)}>↓</button></div>)}</div></details>
    {currentTarget && <div className="tepraCurrentItem"><button className="outline" disabled={safeIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>← 前の商品</button><div><small>今回印刷する看板　{safeIndex + 1} / {targets.length}</small><b>{currentTarget.name}</b><span>{currentTarget.code}</span></div><button className="outline" disabled={safeIndex >= targets.length - 1} onClick={() => setCurrentIndex((value) => Math.min(targets.length - 1, value + 1))}>次の商品 →</button></div>}
    <div className="tepraActions"><button className="outline" onClick={exportCsv}>TEPRA Creator用CSV</button><button className="primary" disabled={!currentTarget} onClick={() => void preparePrint()}>現在の1品をSR970で印刷</button></div>
    <div className="tepraTargetList">{targets.slice(0, 100).map((item, index) => <button type="button" key={item.id} className={index === safeIndex ? "current" : ""} onClick={() => setCurrentIndex(index)}><span className={`printFlag flag-${getItemPrintFlag(item)}`}>{getItemPrintFlag(item)}</span><b>{item.name}</b><small>{item.code}</small></button>)}{targets.length > 100 && <p>ほか{targets.length - 100}品</p>}</div>
    {printJob && createPortal(<div className="tepraPrintOutput">{printJob.items.map((item) => <TepraLabel key={item.id} item={item} qr={printJob.qr[item.id]} settings={settings}/>)}</div>, document.body)}
  </div>;
}

function TepraLabel({ item, qr, settings }: { item: TepraItem; qr: string; settings: TepraSettings }) {
  const verticalMargin = settings.tapeWidth === 36 ? 4.7 : settings.tapeWidth === 24 ? 2.1 : 1.6;
  const printableHeight = settings.tapeWidth - verticalMargin * 2;
  const qrSize = Math.min(settings.qrSize, printableHeight - 1);
  return <article className={`tepraLabel qr-${settings.qrSide}`} style={{ "--tepra-width": `${settings.labelLength}mm`, "--tepra-height": `${settings.tapeWidth}mm`, "--tepra-qr": `${qrSize}mm`, "--tepra-name": `${settings.nameSize}pt`, "--tepra-detail": `${settings.detailSize}pt`, "--tepra-margin": `${Math.max(3, settings.margin)}mm`, "--tepra-vmargin": `${verticalMargin}mm` } as React.CSSProperties}>
    <img src={qr} alt=""/><div className="tepraFields">{settings.order.map((key) => settings.fields[key] ? <TepraField key={key} item={item} field={key}/> : null)}</div>
  </article>;
}

function TepraField({ item, field }: { item: TepraItem; field: FieldKey }) {
  if (field === "name") return <h3>{item.name}</h3>;
  if (field === "code") return <p className="tepraCode"><b>品番</b>{item.code}</p>;
  if (field === "orderPointLot") return <p><b>発注点</b>{item.orderPoint}{/^\d+$/.test(item.orderPoint) ? item.unit : ""}<i/><b>ロット</b>{item.qty}{item.unit}</p>;
  if (field === "unit") return <p><b>単位</b>{item.unit}</p>;
  return <p className="tepraMemo"><b>備考</b><span>{item.memo || "－"}</span></p>;
}
