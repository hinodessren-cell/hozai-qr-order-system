"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Status = "発注待ち" | "入荷待ち" | "完了";
type Item = { id: string; code: string; name: string; category: string; unit: string; qty: number; location: string; memo: string };
type Order = Item & { orderId: string; status: Status; orderedAt: string; purchaser: string };

const initialItems: Item[] = [
  { id: "HZ-2CE1D46BD51220", code: "712-30", name: "カッターマット", category: "ホットマーカ", unit: "set", qty: 5, location: "工具棚 A-2", memo: "1set / 5組10個入" },
  { id: "HZ-80C1257B60B683", code: "LW-104", name: "マーカーラベル 幅4mm", category: "ホットマーカ", unit: "巻", qty: 10, location: "資材棚 B-1", memo: "後継品 PVCW0499" },
  { id: "HZ-913C12C91D4516", code: "LW-106", name: "マーカーラベル 幅6mm", category: "ホットマーカ", unit: "巻", qty: 10, location: "資材棚 B-1", memo: "10巻 / ロット" },
  { id: "HZ-A9FCE5E4BF7295", code: "LW-108", name: "マーカーラベル 幅8mm", category: "ホットマーカ", unit: "巻", qty: 10, location: "資材棚 B-2", memo: "10巻 / ロット" },
];

const initialOrders: Order[] = [
  { ...initialItems[0], orderId: "O-7252F6DE03", status: "入荷待ち", orderedAt: "2026/07/22 09:15", purchaser: "古閑" },
  { ...initialItems[1], orderId: "O-588C5D3C9B", status: "発注待ち", orderedAt: "2026/07/22 10:05", purchaser: "吉川" },
  { ...initialItems[3], orderId: "O-6A802335B5", status: "完了", orderedAt: "2026/07/21 16:40", purchaser: "長谷" },
];

const defaultSettings = {
  accent: "#176b57", density: "comfortable", cardColumns: 3, showMemo: true, showLocation: true,
  defaultQty: 1, boardColumns: 3, boardRows: 4, boardWidth: 60, boardHeight: 40,
  orderLabel: "発注待ち", arrivalLabel: "入荷待ち", doneLabel: "完了",
  notifyNew: true, notifyArrival: true, siteName: "補材 QR 発注管理",
};

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [orders, setOrders] = useState(initialOrders);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    fetch("/api/state").then((r) => r.ok ? r.json() : null).then((data) => {
      if (data?.items?.length) setItems(data.items);
      if (data?.orders?.length) setOrders(data.orders);
      if (data?.settings) setSettings((s) => ({ ...s, ...data.settings }));
      const requested = new URLSearchParams(window.location.search).get("item");
      if (requested) setSelectedItem((data?.items ?? initialItems).find((item: Item) => item.id === requested) ?? null);
    }).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => orders.filter((o) => `${o.code} ${o.name} ${o.category} ${o.purchaser}`.toLowerCase().includes(query.toLowerCase())), [orders, query]);
  const counts = (status: Status) => orders.filter((o) => o.status === status).length;

  async function advance(orderId: string) {
    const current = orders.find((o) => o.orderId === orderId);
    if (!current) return;
    const status = current?.status === "発注待ち" ? "入荷待ち" : "完了";
    setOrders((rows) => rows.map((o) => o.orderId === orderId ? { ...o, status } : o));
    try {
      await postState({ action: "status", orderId, status });
    } catch (error) {
      setOrders((rows) => rows.map((o) => o.orderId === orderId ? { ...o, status: current.status } : o));
      showRequestError(error);
    }
  }
  async function placeOrder(item: Item, quantity: number) {
    const qty = Math.max(1, quantity);
    const order = { ...item, qty, orderId: `O-${Date.now()}`, status: "発注待ち" as Status, orderedAt: new Date().toISOString(), purchaser: "担当者" };
    setOrders((current) => [order, ...current]);
    setSelectedItem(null); setTab("orders");
    try {
      await postState({ action: "order", itemId: item.id, orderId: order.orderId, quantity: qty, purchaser: order.purchaser });
    } catch (error) {
      setOrders((current) => current.filter((row) => row.orderId !== order.orderId));
      showRequestError(error);
    }
  }

  const nav = [
    ["dashboard", "概要", "▦"], ["scan", "QR読取", "⌗"], ["orders", "発注管理", "⇄"],
    ["history", "履歴", "◷"], ["boards", "QR看板", "▤"], ["items", "品目", "□"],
  ];

  return (
    <div className={`app density-${settings.density}`} style={{ "--accent": settings.accent } as React.CSSProperties}>
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">補</span><div><strong>{settings.siteName}</strong><small>ORDER CONTROL</small></div></div>
        <nav>{nav.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => id === "scan" ? setScanOpen(true) : setTab(id)}><span>{icon}</span>{label}</button>)}</nav>
        <button className="settingsButton" onClick={() => setSettingsOpen(true)}>⚙ 詳細設定</button>
      </aside>

      <main>
        <header><div><p className="eyebrow">MATERIALS / LIVE</p><h1>{nav.find((n) => n[0] === tab)?.[1] ?? "概要"}</h1></div><div className="headerActions"><label className="search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="品番・品名・担当者で検索" /></label><button className="scanButton" onClick={() => setScanOpen(true)}>⌗ QRを読む</button></div></header>

        {tab === "dashboard" && <>
          <section className="hero"><div><p>本日の発注フロー</p><h2>不足に気づいた、その場で発注。</h2><span>QR看板を読み取り、入荷から完了まで全員で共有できます。</span></div><button onClick={() => setScanOpen(true)}>QRコードを読み取る <b>→</b></button></section>
          <section className="stats">
            <article className="stat red"><small>発注待ち</small><strong>{counts("発注待ち")}</strong><span>件</span></article>
            <article className="stat blue"><small>入荷待ち</small><strong>{counts("入荷待ち")}</strong><span>件</span></article>
            <article className="stat gray"><small>本日完了</small><strong>{counts("完了")}</strong><span>件</span></article>
            <article className="stat total"><small>登録品目</small><strong>{items.length.toLocaleString("ja-JP")}</strong><span>品</span></article>
          </section>
          <OrderList orders={orders.filter((o) => o.status !== "完了").slice(0, 5)} onAdvance={advance} showMemo={settings.showMemo} title="進行中の発注" />
        </>}

        {(tab === "orders" || tab === "history") && <OrderList orders={tab === "history" ? filtered : filtered.filter((o) => o.status !== "完了")} onAdvance={advance} showMemo={settings.showMemo} title={tab === "history" ? "すべての履歴" : "発注・入荷状況"} />}

        {tab === "items" && <section><div className="sectionTitle"><div><p className="eyebrow">MASTER ITEMS</p><h2>品目マスター</h2></div><button className="outline">＋ 新規品目</button></div><div className="itemGrid" style={{ gridTemplateColumns: `repeat(${settings.cardColumns}, minmax(0, 1fr))` }}>{items.map((item) => <button className="itemCard" key={item.id} onClick={() => setSelectedItem(item)}><small>{item.category}</small><b>{item.code}</b><h3>{item.name}</h3>{settings.showLocation && <span>⌖ {item.location}</span>}<em>発注数量 {item.qty}{item.unit}</em></button>)}</div></section>}

        {tab === "boards" && <section><div className="sectionTitle"><div><p className="eyebrow">QR KANBAN</p><h2>QR読み取り用看板</h2></div><button className="primary" onClick={() => window.print()}>印刷プレビュー</button></div><div className="boardOptions">A4縦 ・ {settings.boardColumns}列 × {settings.boardRows}行 ・ {settings.boardWidth}×{settings.boardHeight}mm</div><div className="boards" style={{ gridTemplateColumns: `repeat(${settings.boardColumns}, 1fr)` }}>{items.map((item) => <article className="board" key={item.id}><FakeQr value={item.id}/><div><small>No.{item.code}</small><h3>{item.name}</h3><p>{item.memo}</p><b>在庫が少なくなりましたら発注してください。</b></div></article>)}</div></section>}
      </main>

      {scanOpen && <QrScanner items={items} close={() => setScanOpen(false)} found={(item) => { setScanOpen(false); setSelectedItem(item); }} />}

      {selectedItem && <OrderModal item={selectedItem} close={() => setSelectedItem(null)} submit={placeOrder} />}

      {settingsOpen && <SettingsPanel settings={settings} setSettings={setSettings} close={() => setSettingsOpen(false)} save={async () => { try { await postState({ action: "settings", settings }); setSettingsOpen(false); } catch (error) { showRequestError(error); } }} />}
    </div>
  );
}

function OrderList({ orders, onAdvance, showMemo, title }: { orders: Order[]; onAdvance: (id: string) => void; showMemo: boolean; title: string }) {
  return <section className="orderSection"><div className="sectionTitle"><div><p className="eyebrow">ORDER PIPELINE</p><h2>{title}</h2></div><button className="outline">絞り込み</button></div><div className="orderList">{orders.map((o) => <article className="orderRow" key={o.orderId}><span className={`status s-${o.status}`}>{o.status}</span><div className="orderMain"><small>{o.code} ・ {o.category}</small><h3>{o.name}</h3>{showMemo && <p>{o.memo}</p>}</div><div className="orderMeta"><small>数量</small><strong>{o.qty}<i>{o.unit}</i></strong></div><div className="orderMeta"><small>発注者</small><b>{o.purchaser}</b><span>{o.orderedAt}</span></div>{o.status !== "完了" ? <button className="next" onClick={() => onAdvance(o.orderId)}>{o.status === "発注待ち" ? "発注済みにする" : "完了にする"} →</button> : <span className="done">✓ 完了</span>}</article>)}</div></section>;
}

function FakeQr({ value }: { value: string }) {
  // QR assets are generated SVG files and should be served directly without image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="fakeQr" src={`/qr/${encodeURIComponent(value)}.svg`} alt={`品目 ${value} の発注用QRコード`} />;
}

function QrScanner({ items, close, found }: { items: Item[]; close: () => void; found: (item: Item) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("カメラをQRコードへ向けてください");

  const resolve = useCallback((raw: string) => {
    let id = raw.trim();
    try { id = new URL(id).searchParams.get("item") ?? id; } catch { /* 管理番号を直接入力した場合 */ }
    const item = items.find((row) => row.id.toLowerCase() === id.toLowerCase());
    if (item) found(item); else setMessage("該当する品目が見つかりません。管理番号をご確認ください。");
  }, [found, items]);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    let timer = 0;
    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setMessage("この端末では自動読取を利用できません。管理番号を入力してください。");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ["qr_code"] });
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results[0]?.rawValue) { resolve(results[0].rawValue); return; }
          } catch { /* 次のフレームで再試行 */ }
          timer = window.setTimeout(scan, 250);
        };
        void scan();
      } catch { setMessage("カメラを開始できません。許可を確認するか、管理番号を入力してください。"); }
    };
    void start();
    return () => { active = false; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [resolve]);

  return <div className="modalBackdrop" onClick={close}><section className="scanModal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">QR SCANNER</p><h2>QR看板を読み取る</h2><div className="camera"><video ref={videoRef} muted playsInline/><div className="scanFrame"/><span>{message}</span></div><label>または管理番号を入力<input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") resolve(code); }} placeholder="例：HZ-2CE1D46BD51220" /></label><button className="primary wide" onClick={() => resolve(code)} disabled={!code.trim()}>品目を開く</button></section></div>;
}

function OrderModal({ item, close, submit }: { item: Item; close: () => void; submit: (item: Item, quantity: number) => void }) {
  const [quantity, setQuantity] = useState(Math.max(1, item.qty));
  return <div className="modalBackdrop" onClick={close}><section className="orderModal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">ORDER ITEM</p><h2>{item.name}</h2><div className="orderCode">{item.code}<span>{item.category}</span></div><dl><div><dt>保管場所</dt><dd>{item.location}</dd></div><div><dt>備考</dt><dd>{item.memo}</dd></div></dl><label>発注数量<div className="quantity"><button aria-label="数量を減らす" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}/><span>{item.unit}</span><button aria-label="数量を増やす" onClick={() => setQuantity((value) => value + 1)}>＋</button></div></label><button className="primary wide" onClick={() => submit(item, quantity)}>この内容で発注する</button></section></div>;
}

function SettingsPanel({ settings, setSettings, close, save }: { settings: typeof defaultSettings; setSettings: React.Dispatch<React.SetStateAction<typeof defaultSettings>>; close: () => void; save: () => void }) {
  const update = (key: keyof typeof defaultSettings, value: string | number | boolean) => setSettings((s) => ({ ...s, [key]: value }));
  return <div className="drawerBackdrop" onClick={close}><aside className="settingsDrawer" onClick={(e) => e.stopPropagation()}><div className="drawerHead"><div><p className="eyebrow">CUSTOMIZE</p><h2>詳細設定</h2></div><button className="close" onClick={close}>×</button></div>
    <fieldset><legend>表示とレイアウト</legend><label>システム名<input value={settings.siteName} onChange={(e) => update("siteName", e.target.value)} /></label><label>アクセントカラー<input type="color" value={settings.accent} onChange={(e) => update("accent", e.target.value)} /></label><label>表示密度<select value={settings.density} onChange={(e) => update("density", e.target.value)}><option value="comfortable">ゆったり</option><option value="compact">コンパクト</option></select></label><label>カード列数<input type="range" min="1" max="4" value={settings.cardColumns} onChange={(e) => update("cardColumns", Number(e.target.value))}/><b>{settings.cardColumns}列</b></label><Check label="備考を表示" value={settings.showMemo} change={(v) => update("showMemo", v)}/><Check label="保管場所を表示" value={settings.showLocation} change={(v) => update("showLocation", v)}/></fieldset>
    <fieldset><legend>発注フロー</legend><label>発注待ちの表示名<input value={settings.orderLabel} onChange={(e) => update("orderLabel", e.target.value)} /></label><label>入荷待ちの表示名<input value={settings.arrivalLabel} onChange={(e) => update("arrivalLabel", e.target.value)} /></label><label>完了の表示名<input value={settings.doneLabel} onChange={(e) => update("doneLabel", e.target.value)} /></label><label>初期発注数量<input type="number" min="1" value={settings.defaultQty} onChange={(e) => update("defaultQty", Number(e.target.value))}/></label><Check label="新規発注を通知" value={settings.notifyNew} change={(v) => update("notifyNew", v)}/><Check label="入荷を通知" value={settings.notifyArrival} change={(v) => update("notifyArrival", v)}/></fieldset>
    <fieldset><legend>QR看板・印刷</legend><label>列数<input type="number" min="1" max="4" value={settings.boardColumns} onChange={(e) => update("boardColumns", Number(e.target.value))}/></label><label>行数<input type="number" min="1" max="8" value={settings.boardRows} onChange={(e) => update("boardRows", Number(e.target.value))}/></label><div className="two"><label>幅 mm<input type="number" value={settings.boardWidth} onChange={(e) => update("boardWidth", Number(e.target.value))}/></label><label>高さ mm<input type="number" value={settings.boardHeight} onChange={(e) => update("boardHeight", Number(e.target.value))}/></label></div></fieldset>
    <div className="drawerActions"><button className="outline" onClick={() => setSettings(defaultSettings)}>初期値に戻す</button><button className="primary" onClick={save}>設定を保存</button></div>
  </aside></div>;
}

function Check({ label, value, change }: { label: string; value: boolean; change: (v: boolean) => void }) { return <label className="check"><input type="checkbox" checked={value} onChange={(e) => change(e.target.checked)}/><span/>{label}</label>; }

async function postState(payload: Record<string, unknown>) {
  const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (response.status === 401) {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
    throw new Error("ログイン画面へ移動します。");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? "操作を完了できませんでした。");
  }
}

function showRequestError(error: unknown) {
  if (error instanceof Error && error.message === "ログイン画面へ移動します。") return;
  window.alert(error instanceof Error ? error.message : "操作を完了できませんでした。");
}
