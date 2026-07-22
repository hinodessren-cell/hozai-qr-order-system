"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QrScannerEngine from "qr-scanner";
import QRCode from "qrcode";

type Status = "発注待ち" | "入荷待ち" | "入荷済み" | "取消";
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
  { ...initialItems[3], orderId: "O-6A802335B5", status: "入荷済み", orderedAt: "2026/07/21 16:40", purchaser: "長谷" },
];

const defaultSettings = {
  accent: "#d61f2c", density: "comfortable", cardColumns: 3, showMemo: true, showLocation: true,
  defaultQty: 1, boardColumns: 3, boardRows: 4, boardWidth: 60, boardHeight: 40,
  orderLabel: "発注待ち", arrivalLabel: "入荷待ち", doneLabel: "入荷済み",
  notifyNew: true, notifyArrival: true, siteName: "日の出製作所",
};

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [orders, setOrders] = useState(initialOrders);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editingItem, setEditingItem] = useState<Item | "new" | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState("");
  const [pushStatus, setPushStatus] = useState("親機通知");
  const [unreadOrders, setUnreadOrders] = useState(0);
  const [statusAlerts, setStatusAlerts] = useState<Record<"発注待ち" | "入荷待ち" | "入荷済み", number>>({ "発注待ち": 0, "入荷待ち": 0, "入荷済み": 0 });
  const notificationEnabled = useRef(false);
  const seenOrderIds = useRef<Set<string> | null>(null);
  const acknowledgedOrderIds = useRef<Set<string>>(new Set());
  const acknowledgedStatusEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const refresh = async (initial = false) => {
      const data = await fetch("/api/state", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null);
      if (!active || !data) return;
      if (data?.items?.length) setItems(data.items);
      if (Array.isArray(data?.orders)) {
        const incoming = data.orders as Order[];
        if (seenOrderIds.current && notificationEnabled.current && "Notification" in window && Notification.permission === "granted") {
          const fresh = incoming.filter((order) => order.status === "発注待ち" && !seenOrderIds.current!.has(order.orderId));
          fresh.forEach((order) => new Notification("新しい補材発注", { body: `${order.purchaser}：${order.code} ${order.name} ${order.qty}${order.unit}`, icon: "/icon-192.png", tag: `order-${order.orderId}` }));
        }
        seenOrderIds.current = new Set(incoming.map((order) => order.orderId));
        setUnreadOrders(incoming.filter((order) => order.status === "発注待ち" && !acknowledgedOrderIds.current.has(order.orderId)).length);
        setStatusAlerts({
          "発注待ち": incoming.filter((order) => order.status === "発注待ち" && !acknowledgedStatusEvents.current.has(`${order.orderId}:発注待ち`)).length,
          "入荷待ち": incoming.filter((order) => order.status === "入荷待ち" && !acknowledgedStatusEvents.current.has(`${order.orderId}:入荷待ち`)).length,
          "入荷済み": incoming.filter((order) => order.status === "入荷済み" && !acknowledgedStatusEvents.current.has(`${order.orderId}:入荷済み`)).length,
        });
        setOrders(incoming);
      }
      if (data?.settings) setSettings((s) => ({ ...s, ...data.settings }));
      if (data?.pushPublicKey) setPushPublicKey(data.pushPublicKey);
      if (initial) {
        const search = new URLSearchParams(window.location.search);
        const requested = search.get("item");
        if (search.get("tab") === "orders") {
          setTab("orders");
          (data.orders as Order[]).forEach((order) => acknowledgedOrderIds.current.add(order.orderId));
          window.localStorage.setItem("acknowledged-orders", JSON.stringify([...acknowledgedOrderIds.current].slice(-500)));
          setUnreadOrders(0);
        }
        if (requested) {
          setSelectedItem((data.items ?? initialItems).find((item: Item) => item.id === requested) ?? null);
          search.delete("item");
          const cleanQuery = search.toString();
          window.history.replaceState({}, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`);
        }
      }
    };
    try { acknowledgedOrderIds.current = new Set(JSON.parse(window.localStorage.getItem("acknowledged-orders") ?? "[]")); } catch { acknowledgedOrderIds.current = new Set(); }
    try { acknowledgedStatusEvents.current = new Set(JSON.parse(window.localStorage.getItem("acknowledged-status-events") ?? "[]")); } catch { acknowledgedStatusEvents.current = new Set(); }
    notificationEnabled.current = window.localStorage.getItem("parent-notifications") === "enabled";
    if (notificationEnabled.current && "Notification" in window && Notification.permission === "granted") setPushStatus("通知登録済み");
    void refresh(true);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);

  const filtered = useMemo(() => orders.filter((o) => `${o.code} ${o.name} ${o.category} ${o.purchaser}`.toLowerCase().includes(query.toLowerCase())), [orders, query]);
  const counts = (status: Status) => orders.filter((o) => o.status === status).length;
  const openTab = (id: string) => {
    if (id === "scan") { setScanOpen(true); return; }
    setTab(id);
    if (id === "orders") {
      orders.forEach((order) => acknowledgedOrderIds.current.add(order.orderId));
      window.localStorage.setItem("acknowledged-orders", JSON.stringify([...acknowledgedOrderIds.current].slice(-500)));
      setUnreadOrders(0);
    }
  };
  const openStatus = (status: "発注待ち" | "入荷待ち" | "入荷済み") => {
    orders.filter((order) => order.status === status).forEach((order) => acknowledgedStatusEvents.current.add(`${order.orderId}:${status}`));
    window.localStorage.setItem("acknowledged-status-events", JSON.stringify([...acknowledgedStatusEvents.current].slice(-1500)));
    setStatusAlerts((current) => ({ ...current, [status]: 0 }));
    setTab("orders");
  };

  async function advance(orderId: string) {
    const current = orders.find((o) => o.orderId === orderId);
    if (!current) return;
    const status = current?.status === "発注待ち" ? "入荷待ち" : "入荷済み";
    setOrders((rows) => rows.map((o) => o.orderId === orderId ? { ...o, status } : o));
    try {
      await postState({ action: "status", orderId, status });
    } catch (error) {
      setOrders((rows) => rows.map((o) => o.orderId === orderId ? { ...o, status: current.status } : o));
      showRequestError(error);
    }
  }
  async function placeOrder(item: Item, quantity: number, purchaser: string) {
    const existing = orders.find((order) => order.id === item.id && (order.status === "発注待ち" || order.status === "入荷待ち"));
    if (existing) {
      setSelectedItem(null);
      openTab("orders");
      window.alert(`この品目はすでに${existing.status}です。二重発注を防止しました。`);
      return;
    }
    const qty = Math.max(1, quantity);
    // This timestamp is created only after the user confirms an order.
    // eslint-disable-next-line react-hooks/purity
    const order = { ...item, qty, orderId: `O-${Date.now()}`, status: "発注待ち" as Status, orderedAt: new Date().toISOString(), purchaser: purchaser.trim() };
    setOrders((current) => [order, ...current]);
    setSelectedItem(null); openTab("orders");
    try {
      await postState({ action: "order", itemId: item.id, orderId: order.orderId, quantity: qty, purchaser: order.purchaser });
    } catch (error) {
      setOrders((current) => current.filter((row) => row.orderId !== order.orderId));
      showRequestError(error);
    }
  }
  async function cancelOrder(orderId: string) {
    const current = orders.find((order) => order.orderId === orderId);
    if (!current || current.status === "取消" || current.status === "入荷済み") return;
    if (!window.confirm(`${current.code} ${current.name} の発注を取り消しますか？`)) return;
    setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: "取消" } : order));
    try {
      await postState({ action: "status", orderId, status: "取消" });
    } catch (error) {
      setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: current.status } : order));
      showRequestError(error);
    }
  }
  async function updateBoardItem(updated: Item) {
    const previous = items.find((item) => item.id === updated.id);
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    try {
      await postState({ action: "item", itemId: updated.id, settings: updated });
    } catch (error) {
      if (previous) setItems((current) => current.map((item) => item.id === updated.id ? previous : item));
      showRequestError(error);
      throw error;
    }
  }
  async function saveItem(updated: Item, isNew: boolean) {
    if (isNew) {
      const created = await postState({ action: "item-create", settings: updated }) as { item: Item };
      setItems((current) => [created.item, ...current]);
    } else {
      await updateBoardItem(updated);
    }
    setEditingItem(null);
  }
  async function enableParentNotifications() {
    if (!("Notification" in window)) {
      window.alert("この端末では通知を利用できません。");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        window.alert("通知が許可されていません。端末の設定をご確認ください。");
        return;
      }
      setPushStatus("登録中…");
      window.localStorage.setItem("parent-notifications", "enabled");
      notificationEnabled.current = true;
      setPushStatus("通知登録済み");
      if (!pushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      const subscription = current ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(pushPublicKey),
      });
      await postState({ action: "push-subscribe", subscription: subscription.toJSON() });
    } catch (error) {
      if (notificationEnabled.current) setPushStatus("アプリ内通知済み");
      else { setPushStatus("親機通知"); showRequestError(error); }
    }
  }

  const nav = [
    ["dashboard", "概要", "▦"], ["scan", "QR読取", "⌗"], ["orders", "発注管理", "⇄"],
    ["history", "履歴", "◷"], ["boards", "QR看板", "▤"], ["items", "品目", "□"],
  ];

  return (
    <div className={`app density-${settings.density}`} style={{ "--accent": settings.accent } as React.CSSProperties}>
      <aside className="sidebar">
        <div className="brand"><span className="brandLogo"/><div><strong>{settings.siteName}</strong><small>MATERIAL ORDER CONTROL</small></div></div>
        <nav>{nav.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => openTab(id)}><span>{icon}</span><span className="navLabel">{label}</span>{id === "orders" && unreadOrders > 0 && <b className="notificationBadge" aria-label={`未確認 ${unreadOrders}件`}>{unreadOrders > 99 ? "99+" : unreadOrders}</b>}</button>)}</nav>
        <button className="settingsButton" onClick={() => setSettingsOpen(true)}>⚙ 詳細設定</button>
      </aside>

      <main>
        <header><div><p className="eyebrow">MATERIALS / LIVE</p><h1>{nav.find((n) => n[0] === tab)?.[1] ?? "概要"}</h1></div><div className="headerActions"><label className="search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="品番・品名・担当者で検索" /></label><button className="notifyButton" onClick={enableParentNotifications}>● {pushStatus}</button><button className="scanButton" onClick={() => setScanOpen(true)}>⌗ QRを読む</button></div></header>

        {tab === "dashboard" && <>
          <section className="stats">
            <button className="stat red" onClick={() => openStatus("発注待ち")}><small>発注待ち</small>{statusAlerts["発注待ち"] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<strong>{counts("発注待ち")}</strong><span>件</span></button>
            <button className="stat blue" onClick={() => openStatus("入荷待ち")}><small>入荷待ち</small>{statusAlerts["入荷待ち"] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<strong>{counts("入荷待ち")}</strong><span>件</span></button>
            <button className="stat gray" onClick={() => openStatus("入荷済み")}><small>入荷済み</small>{statusAlerts["入荷済み"] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<strong>{counts("入荷済み")}</strong><span>件</span></button>
            <article className="stat total"><small>登録品目</small><strong>{items.length.toLocaleString("ja-JP")}</strong><span>品</span></article>
          </section>
          <OrderList orders={orders.filter((o) => o.status === "発注待ち" || o.status === "入荷待ち").slice(0, 5)} onAdvance={advance} onCancel={cancelOrder} showMemo={settings.showMemo} title="進行中の発注" />
        </>}

        {tab === "orders" && <OrderBoard orders={filtered} onAdvance={advance} onCancel={cancelOrder} onViewStatus={openStatus} statusAlerts={statusAlerts} showMemo={settings.showMemo} />}
        {tab === "history" && <OrderList orders={filtered} onAdvance={advance} onCancel={cancelOrder} showMemo={settings.showMemo} title="すべての履歴" />}

        {tab === "items" && <section><div className="sectionTitle"><div><p className="eyebrow">MASTER ITEMS</p><h2>品目マスター</h2></div><button className="primary addItemButton" onClick={() => setEditingItem("new")}>＋ 新規品目</button></div><div className="itemGrid" style={{ gridTemplateColumns: `repeat(${settings.cardColumns}, minmax(0, 1fr))` }}>{items.map((item) => <article className="itemCard" key={item.id}><small>{item.category}</small><b>{item.code}</b><h3>{item.name}</h3>{settings.showLocation && <span>⌖ {item.location}</span>}<em>発注数量 {item.qty}{item.unit}</em><div className="itemActions"><button className="outline" onClick={() => setEditingItem(item)}>品目を編集</button><button className="primary" onClick={() => setSelectedItem(item)}>発注する</button></div></article>)}</div></section>}

        {tab === "boards" && <QrBoards items={items} columns={settings.boardColumns} width={settings.boardWidth} height={settings.boardHeight} save={updateBoardItem} />}
      </main>

      {scanOpen && <QrScanner items={items} close={() => setScanOpen(false)} found={(item) => { setScanOpen(false); setSelectedItem(item); }} />}

      {selectedItem && <OrderModal item={selectedItem} history={orders.filter((order) => order.id === selectedItem.id)} close={() => setSelectedItem(null)} submit={placeOrder} />}

      {editingItem && <ItemEditor item={editingItem === "new" ? null : editingItem} close={() => setEditingItem(null)} save={saveItem} />}

      {settingsOpen && <SettingsPanel settings={settings} setSettings={setSettings} close={() => setSettingsOpen(false)} save={async () => { try { await postState({ action: "settings", settings }); setSettingsOpen(false); } catch (error) { showRequestError(error); } }} />}
    </div>
  );
}

function OrderList({ orders, onAdvance, onCancel, showMemo, title }: { orders: Order[]; onAdvance: (id: string) => void; onCancel: (id: string) => void; showMemo: boolean; title: string }) {
  return <section className="orderSection"><div className="sectionTitle"><div><p className="eyebrow">ORDER PIPELINE</p><h2>{title}</h2></div></div><div className="orderList">{orders.map((o) => <article className="orderRow" key={o.orderId}><span className={`status s-${o.status}`}>{o.status}</span><div className="orderMain"><small>{o.code} ・ {o.category}</small><h3>{o.name}</h3>{showMemo && <p>{o.memo}</p>}</div><div className="orderMeta"><small>数量</small><strong>{o.qty}<i>{o.unit}</i></strong></div><div className="orderMeta"><small>発注者</small><b>{o.purchaser}</b><span>{o.orderedAt}</span></div>{o.status === "発注待ち" || o.status === "入荷待ち" ? <div className="orderActions"><button className="next" onClick={() => onAdvance(o.orderId)}>{o.status === "発注待ち" ? "入荷待ちへ" : "入荷済みにする"} →</button><button className="cancelOrder" onClick={() => onCancel(o.orderId)}>発注取消</button></div> : <span className={`done ${o.status === "取消" ? "cancelled" : ""}`}>{o.status === "取消" ? "× 取消" : "✓ 入荷済み"}</span>}</article>)}</div></section>;
}

function OrderBoard({ orders, onAdvance, onCancel, onViewStatus, statusAlerts, showMemo }: { orders: Order[]; onAdvance: (id: string) => void; onCancel: (id: string) => void; onViewStatus: (status: "発注待ち" | "入荷待ち" | "入荷済み") => void; statusAlerts: Record<"発注待ち" | "入荷待ち" | "入荷済み", number>; showMemo: boolean }) {
  const statuses: Exclude<Status, "取消">[] = ["発注待ち", "入荷待ち", "入荷済み"];
  return <section><div className="sectionTitle"><div><p className="eyebrow">ORDER PIPELINE</p><h2>発注・入荷状況</h2></div></div><div className="pipelineBoard">{statuses.map((status) => {
    const statusOrders = orders.filter((order) => order.status === status);
    return <section className="pipelineColumn" key={status}><header onClick={() => onViewStatus(status)}><h3>{status}</h3>{statusAlerts[status] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<span>{statusOrders.length}</span></header><div>{statusOrders.map((order) => <article className="pipelineCard" key={order.orderId}><small>{order.code} ・ {order.category}</small><h4>{order.name}</h4>{showMemo && <p>{order.memo}</p>}<dl><div><dt>数量</dt><dd>{order.qty}{order.unit}</dd></div><div><dt>発注者</dt><dd>{order.purchaser}</dd></div></dl>{status !== "入荷済み" && <div className="orderActions"><button className="next" onClick={() => onAdvance(order.orderId)}>{status === "発注待ち" ? "入荷待ちへ" : "入荷済みにする"} →</button><button className="cancelOrder" onClick={() => onCancel(order.orderId)}>発注取消</button></div>}</article>)}</div></section>;
  })}</div></section>;
}

function QrBoards({ items, columns, width, height, save }: { items: Item[]; columns: number; width: number; height: number; save: (item: Item) => Promise<void> }) {
  const boardStyle = { "--board-width": `${width}mm`, "--board-height": `${height}mm`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } as React.CSSProperties;
  return <section><div className="sectionTitle"><div><p className="eyebrow">QR KANBAN</p><h2>QR読み取り用看板</h2><span className="editHint">文字をクリックすると、その場で入力できます。Enterまたは枠外のクリックで保存します。印刷サイズ：{width}×{height}mm</span></div><button className="primary" onClick={() => window.print()}>印刷プレビュー</button></div><div className="boards" style={boardStyle}>{items.map((item) => <InlineBoard key={`${item.id}:${item.code}:${item.name}:${item.qty}:${item.location}:${item.memo}`} item={item} save={save} />)}</div></section>;
}

function InlineBoard({ item, save }: { item: Item; save: (item: Item) => Promise<void> }) {
  const [draft, setDraft] = useState(item);
  const commit = async () => {
    if (JSON.stringify(draft) === JSON.stringify(item)) return;
    try { await save(draft); } catch { setDraft(item); }
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") event.currentTarget.blur(); };
  return <article className="board"><FakeQr value={item.id}/><div className="inlineBoardFields">
    <label>No.<input aria-label="品番" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label>
    <input className="inlineName" aria-label="品名" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/>
    <input aria-label="備考" value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/>
    <div className="inlineMeta"><label>⌖ <input aria-label="保管場所" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label><label>発注数量 <input className="inlineQty" aria-label="発注数量" type="number" min="1" value={draft.qty} onChange={(event) => setDraft({ ...draft, qty: Math.max(1, Number(event.target.value) || 1) })} onBlur={() => void commit()} onKeyDown={keyDown}/><input className="inlineUnit" aria-label="単位" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label></div>
    <b>在庫が少なくなりましたら発注してください。</b>
  </div></article>;
}

function FakeQr({ value }: { value: string }) {
  const [source, setSource] = useState(`/qr/${encodeURIComponent(value)}.svg`);
  const generate = async () => {
    const url = `${window.location.origin}/?item=${encodeURIComponent(value)}`;
    setSource(await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 320 }));
  };
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="fakeQr" src={source} onError={() => void generate()} alt={`品目 ${value} の発注用QRコード`} />;
}

function QrScanner({ items, close, found }: { items: Item[]; close: () => void; found: (item: Item) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("カメラをQRコードへ向けてください");
  const [cameraFailed, setCameraFailed] = useState(false);
  const [retryCamera, setRetryCamera] = useState(0);

  const resolve = useCallback((raw: string) => {
    let id = raw.trim();
    try { id = new URL(id).searchParams.get("item") ?? id; } catch { /* 管理番号を直接入力した場合 */ }
    const item = items.find((row) => row.id.toLowerCase() === id.toLowerCase());
    if (item) found(item); else setMessage("該当する品目が見つかりません。管理番号をご確認ください。");
  }, [found, items]);

  useEffect(() => {
    let scanner: QrScannerEngine | undefined;
    const start = async () => {
      if (!videoRef.current) return;
      try {
        setCameraFailed(false);
        videoRef.current.setAttribute("webkit-playsinline", "true");
        // iOS hides camera devices until permission has been requested. Calling
        // hasCamera() first can therefore report a false negative and prevents
        // Safari from ever showing the permission prompt.
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera-unavailable");
        scanner = new QrScannerEngine(
          videoRef.current,
          (result) => resolve(result.data),
          { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
        );
        await scanner.start();
        setMessage("QRコードを枠内に合わせてください");
      } catch (error) {
        setCameraFailed(true);
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
        setMessage(denied ? "カメラが許可されていません。iPhoneの設定でSafari（またはこのアプリ）のカメラを許可してください。" : "ライブカメラを開始できません。下の「カメラで撮影して読み取る」をお使いください。");
      }
    };
    void start();
    return () => { scanner?.stop(); scanner?.destroy(); };
  }, [resolve, retryCamera]);

  const scanFile = async (file?: File) => {
    if (!file) return;
    try {
      const result = await QrScannerEngine.scanImage(file, { returnDetailedScanResult: true });
      resolve(result.data);
    } catch {
      setMessage("画像からQRコードを読み取れませんでした。");
    }
  };

  return <div className="modalBackdrop scannerBackdrop" onClick={close}><section className="scanModal iphoneScanner" onClick={(event) => event.stopPropagation()}>
    <header className="scannerHeader"><div><p>HINODE QR SCANNER</p><h2>QR看板を読み取る</h2></div><button className="scannerClose" onClick={close} aria-label="QR読み取りを閉じる">×</button></header>
    <div className={`camera scannerViewport ${cameraFailed ? "cameraError" : ""}`}><video ref={videoRef} muted playsInline/><div className="scannerShade"/><div className="scanTarget"><i/><i/><i/><i/></div><span className="scannerMessage">{message}</span></div>
    <section className="scannerControls">
      <p className="scannerTip">看板のQRコードを四角い枠の中に合わせてください</p>
      {cameraFailed && <button className="cameraRetry" onClick={() => setRetryCamera((value) => value + 1)}>↻ ライブカメラを再試行</button>}
      <label className="qrFileButton cameraCapture"><span className="captureIcon">◎</span><span><b>カメラで撮影して読み取る</b><small>iPhone標準カメラを使用</small></span><input type="file" accept="image/*" capture="environment" onChange={(event) => void scanFile(event.target.files?.[0])} /></label>
      {cameraFailed && <p className="iosCameraHelp">設定 → Safari（または使用中のアプリ）→ カメラ → 許可後、「再試行」を押してください。</p>}
      <details className="manualScan"><summary>管理番号を手入力する</summary><div><input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") resolve(code); }} placeholder="例：HZ-2CE1D46BD51220" inputMode="text" autoCapitalize="characters"/><button className="primary" onClick={() => resolve(code)} disabled={!code.trim()}>品目を開く</button></div></details>
    </section>
  </section></div>;
}

function OrderModal({ item, history, close, submit }: { item: Item; history: Order[]; close: () => void; submit: (item: Item, quantity: number, purchaser: string) => void }) {
  const [quantity, setQuantity] = useState(Math.max(1, item.qty));
  const [purchaser, setPurchaser] = useState("");
  return <div className="modalBackdrop" onClick={close}><section className="orderModal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">ORDER ITEM</p><h2>{item.name}</h2><div className="orderCode">{item.code}<span>{item.category}</span></div><dl><div><dt>保管場所</dt><dd>{item.location}</dd></div><div><dt>備考</dt><dd>{item.memo}</dd></div></dl>{history.length > 0 && <section className="previousOrders"><h3>前回までの発注履歴</h3>{history.slice(0, 3).map((order, index) => <article key={order.orderId}><div><b>{index === 0 ? "前回" : `${index + 1}回前`}</b><span>{formatOrderDate(order.orderedAt)}</span></div><strong>{order.qty}{order.unit}</strong><small>{order.purchaser} ・ {order.status}</small></article>)}</section>}<label>発注者名（必須）<input autoFocus value={purchaser} onChange={(event) => setPurchaser(event.target.value)} placeholder="氏名を入力" maxLength={100}/></label><label>発注数量<div className="quantity"><button aria-label="数量を減らす" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}/><span>{item.unit}</span><button aria-label="数量を増やす" onClick={() => setQuantity((value) => value + 1)}>＋</button></div></label><button className="primary wide" disabled={!purchaser.trim()} onClick={() => submit(item, quantity, purchaser)}>この内容で発注する</button></section></div>;
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ItemEditor({ item, close, save }: { item: Item | null; close: () => void; save: (item: Item, isNew: boolean) => Promise<void> }) {
  const isNew = !item;
  const [draft, setDraft] = useState<Item>(item ?? { id: "", code: "", name: "", category: "", unit: "個", qty: 1, location: "", memo: "" });
  const [saving, setSaving] = useState(false);
  const update = (key: keyof Item, value: string | number) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!draft.code.trim() || !draft.name.trim()) return;
    setSaving(true);
    try { await save(draft, isNew); } catch (error) { showRequestError(error); setSaving(false); }
  };
  return <div className="modalBackdrop" onClick={close}><section className="orderModal itemEditor" onClick={(event) => event.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">MASTER ITEM</p><h2>{isNew ? "新規品目登録" : "品目を編集"}</h2><label>品番（必須）<input autoFocus value={draft.code} onChange={(event) => update("code", event.target.value)} /></label><label>品名（必須）<input value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><div className="editorTwo"><label>カテゴリ<input value={draft.category} onChange={(event) => update("category", event.target.value)} /></label><label>保管場所<input value={draft.location} onChange={(event) => update("location", event.target.value)} /></label></div><div className="editorTwo"><label>発注数量<input type="number" min="1" max="10000" value={draft.qty} onChange={(event) => update("qty", Math.max(1, Number(event.target.value) || 1))} /></label><label>単位<input value={draft.unit} onChange={(event) => update("unit", event.target.value)} /></label></div><label>備考<textarea value={draft.memo} onChange={(event) => update("memo", event.target.value)} /></label><button className="primary wide" disabled={saving || !draft.code.trim() || !draft.name.trim()} onClick={() => void submit()}>{saving ? "保存中…" : isNew ? "この品目を登録" : "変更を保存"}</button></section></div>;
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
  return response.json().catch(() => ({ ok: true }));
}

function showRequestError(error: unknown) {
  if (error instanceof Error && error.message === "ログイン画面へ移動します。") return;
  window.alert(error instanceof Error ? error.message : "操作を完了できませんでした。");
}

function urlBase64ToArrayBuffer(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return bytes.buffer;
}
