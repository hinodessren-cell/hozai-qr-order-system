"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QrScannerEngine from "qr-scanner";
import QRCode from "qrcode";
import { getItemPrintFlag, markItemsPrinted, TepraPrintManager } from "./tepra-print";

type Status = "発注待ち" | "入荷待ち" | "入荷済み" | "取消";
type Item = { id: string; code: string; name: string; category: string; unit: string; qty: number; orderPoint: string; boardNumber: number; location: string; memo: string; createdAt?: string };
type Order = Item & { orderId: string; status: Status; orderedAt: string; purchaser: string; orderNote: string };
type AccessAccount = { email: string; name: string; status: "pending" | "approved" | "rejected"; requestedAt: string; updatedAt: string; lastSeenAt: string };
type AccessState = { status: "loading" | "signed_out" | "pending" | "approved" | "rejected"; isOwner: boolean; user?: { email: string; name: string }; accounts: AccessAccount[] };

const initialItems: Item[] = [
  { id: "HZ-2CE1D46BD51220", code: "712-30", name: "カッターマット", category: "ホットマーカ", unit: "set", qty: 5, orderPoint: "1", boardNumber: 1, location: "工具棚 A-2", memo: "1set / 5組10個入" },
  { id: "HZ-80C1257B60B683", code: "LW-104", name: "マーカーラベル 幅4mm", category: "ホットマーカ", unit: "巻", qty: 10, orderPoint: "2", boardNumber: 2, location: "資材棚 B-1", memo: "後継品 PVCW0499" },
  { id: "HZ-913C12C91D4516", code: "LW-106", name: "マーカーラベル 幅6mm", category: "ホットマーカ", unit: "巻", qty: 10, orderPoint: "2", boardNumber: 3, location: "資材棚 B-1", memo: "10巻 / ロット" },
  { id: "HZ-A9FCE5E4BF7295", code: "LW-108", name: "マーカーラベル 幅8mm", category: "ホットマーカ", unit: "巻", qty: 10, orderPoint: "2", boardNumber: 4, location: "資材棚 B-2", memo: "10巻 / ロット" },
];

const initialOrders: Order[] = [
  { ...initialItems[0], orderId: "O-7252F6DE03", status: "入荷待ち", orderedAt: "2026/07/22 09:15", purchaser: "古閑", orderNote: "" },
  { ...initialItems[1], orderId: "O-588C5D3C9B", status: "発注待ち", orderedAt: "2026/07/22 10:05", purchaser: "吉川", orderNote: "" },
  { ...initialItems[3], orderId: "O-6A802335B5", status: "入荷済み", orderedAt: "2026/07/21 16:40", purchaser: "長谷", orderNote: "" },
];

const defaultSettings = {
  accent: "#d61f2c", density: "comfortable", cardColumns: 3, showMemo: true, showLocation: true,
  defaultQty: 1, boardColumns: 3, boardRows: 4, boardWidth: 60, boardHeight: 40,
  orderLabel: "発注待ち", arrivalLabel: "入荷待ち", doneLabel: "入荷済み",
  notifyNew: true, notifyArrival: true, siteName: "日の出製作所", ipadFullscreen: false,
};
const generatedQrCache = new Map<string, string>();

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [orders, setOrders] = useState(initialOrders);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [itemCategory, setItemCategory] = useState("all");
  const [itemSort, setItemSort] = useState<"newest" | "oldest" | "code" | "name">("newest");
  const [itemPage, setItemPage] = useState(1);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [orderNotice, setOrderNotice] = useState("");
  const [printRequested, setPrintRequested] = useState(false);
  const [printItems, setPrintItems] = useState<Item[]>([]);
  const [printQrSources, setPrintQrSources] = useState<Record<string, string>>({});
  const [printQueueIds, setPrintQueueIds] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editingItem, setEditingItem] = useState<Item | "new" | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [ipadDevice, setIpadDevice] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState("");
  const [pushStatus, setPushStatus] = useState("親機通知");
  const [unreadOrders, setUnreadOrders] = useState(0);
  const [statusAlerts, setStatusAlerts] = useState<Record<"発注待ち" | "入荷待ち" | "入荷済み", number>>({ "発注待ち": 0, "入荷待ち": 0, "入荷済み": 0 });
  const [access, setAccess] = useState<AccessState>({ status: "loading", isOwner: false, accounts: [] });
  const notificationEnabled = useRef(false);
  const seenOrderIds = useRef<Set<string> | null>(null);
  const acknowledgedOrderIds = useRef<Set<string>>(new Set());
  const acknowledgedStatusEvents = useRef<Set<string>>(new Set());

  const refreshAccess = useCallback(async () => {
    const response = await fetch("/api/access", { cache: "no-store" });
    if (response.status === 401) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
      return;
    }
    const data = await response.json() as Omit<AccessState, "status"> & { status: AccessState["status"] };
    setAccess({ status: data.status, isOwner: data.isOwner, user: data.user, accounts: data.accounts ?? [] });
  }, []);

  useEffect(() => { void refreshAccess(); }, [refreshAccess]);
  useEffect(() => {
    const refreshQueue = () => setPrintQueueIds(readPrintQueue());
    refreshQueue();
    window.addEventListener("print-queue-change", refreshQueue);
    return () => window.removeEventListener("print-queue-change", refreshQueue);
  }, []);
  useEffect(() => {
    let frame = 0;
    const refitAll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => document.querySelectorAll<HTMLInputElement>("input").forEach(fitSingleLineInput));
    };
    const onInput = (event: Event) => { if (event.target instanceof HTMLInputElement) window.requestAnimationFrame(() => fitSingleLineInput(event.target as HTMLInputElement)); };
    const observer = new MutationObserver(refitAll);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", onInput, true);
    window.addEventListener("resize", refitAll);
    refitAll();
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("input", onInput, true); window.removeEventListener("resize", refitAll); };
  }, []);
  useEffect(() => { if (settingsOpen && access.isOwner) void refreshAccess(); }, [settingsOpen, access.isOwner, refreshAccess]);
  useEffect(() => {
    if (access.status !== "approved" || !access.isOwner) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshAccess(); }, 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshAccess(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [access.status, access.isOwner, refreshAccess]);

  useEffect(() => {
    if (access.status !== "approved") return;
    setIpadDevice(isIPad());
    let active = true;
    const refresh = async (initial = false) => {
      const data = await fetch("/api/state", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null);
      if (!active || !data) return;
      if (data?.items?.length) setItems(data.items);
      if (Array.isArray(data?.orders)) {
        const incoming = (data.orders as Order[]).map((order) => ({ ...order, orderedAt: formatOrderDate(order.orderedAt) }));
        if (seenOrderIds.current && notificationEnabled.current) {
          const fresh = incoming.filter((order) => order.status === "発注待ち" && !seenOrderIds.current!.has(order.orderId));
          if ("Notification" in window && Notification.permission === "granted") {
            fresh.forEach((order) => new Notification("新しい補材発注", { body: `${order.purchaser}：${order.code} ${order.name} ${order.qty}${order.unit}`, icon: "/icon-192.png", tag: `order-${order.orderId}`, requireInteraction: true }));
          } else if (fresh.length > 0) {
            const order = fresh[0];
            const message = `● 新しい発注：${order.code} ${order.name}${fresh.length > 1 ? ` ほか${fresh.length - 1}件` : ""}`;
            setOrderNotice(message);
            window.localStorage.setItem("pending-order-notice", message);
          }
        }
        seenOrderIds.current = new Set(incoming.map((order) => order.orderId));
        setUnreadOrders(incoming.filter((order) => order.status === "発注待ち" && !acknowledgedOrderIds.current.has(order.orderId)).length);
        const nextStatusAlerts = {
          "発注待ち": incoming.filter((order) => order.status === "発注待ち" && !acknowledgedStatusEvents.current.has(`${order.orderId}:発注待ち`)).length,
          "入荷待ち": incoming.filter((order) => order.status === "入荷待ち" && !acknowledgedStatusEvents.current.has(`${order.orderId}:入荷待ち`)).length,
          "入荷済み": incoming.filter((order) => order.status === "入荷済み" && !acknowledgedStatusEvents.current.has(`${order.orderId}:入荷済み`)).length,
        };
        setStatusAlerts(nextStatusAlerts);
        setOrders(incoming);
        if (initial && !isIPhone() && Object.values(nextStatusAlerts).some((count) => count > 0)) {
          setTab("orders");
          incoming.forEach((order) => acknowledgedStatusEvents.current.add(`${order.orderId}:${order.status}`));
          window.localStorage.setItem("acknowledged-status-events", JSON.stringify([...acknowledgedStatusEvents.current].slice(-1500)));
          setStatusAlerts({ "発注待ち": 0, "入荷待ち": 0, "入荷済み": 0 });
        }
      }
      if (data?.settings) {
        let deviceSettings = {};
        try { deviceSettings = JSON.parse(window.localStorage.getItem("device-settings") ?? "{}"); } catch { deviceSettings = {}; }
        setSettings((s) => ({ ...s, ...data.settings, ...deviceSettings }));
      }
      if (data?.pushPublicKey) setPushPublicKey(data.pushPublicKey);
      if (initial) {
        const search = new URLSearchParams(window.location.search);
        const requested = search.get("item");
        const requestedTab = search.get("tab");
        if (requestedTab === "items") setTab("items");
        if (requestedTab === "orders") {
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
        } else if (!requestedTab && isIPad()) {
          setTab("orders");
        } else if (!requestedTab && isIPhone()) {
          setScanOpen(true);
        }
      }
    };
    try { acknowledgedOrderIds.current = new Set(JSON.parse(window.localStorage.getItem("acknowledged-orders") ?? "[]")); } catch { acknowledgedOrderIds.current = new Set(); }
    try { acknowledgedStatusEvents.current = new Set(JSON.parse(window.localStorage.getItem("acknowledged-status-events") ?? "[]")); } catch { acknowledgedStatusEvents.current = new Set(); }
    notificationEnabled.current = window.localStorage.getItem("parent-notifications") === "enabled";
    setOrderNotice(window.localStorage.getItem("pending-order-notice") ?? "");
    if (notificationEnabled.current) setPushStatus("Notification" in window && Notification.permission === "granted" ? "通知登録済み" : "アプリ内通知 ON");
    void refresh(true);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [access.status]);

  useEffect(() => {
    if (ipadDevice && settings.ipadFullscreen) setTab("orders");
  }, [ipadDevice, settings.ipadFullscreen]);

  const filtered = useMemo(() => orders.filter((order) => matchesSearch(query, [order.id, order.orderId, order.code, order.name, order.category, order.purchaser, order.memo, order.orderNote, order.status])), [orders, query]);
  const itemCategories = useMemo(() => [...new Set(items.map((item) => item.category.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" })), [items]);
  const filteredItems = useMemo(() => items
    .filter((item) => itemCategory === "all" || item.category.trim() === itemCategory)
    .filter((item) => matchesSearch(query, [item.id, item.code, item.name, item.category, item.memo, item.unit]))
    .sort((a, b) => compareItems(a, b, itemSort)), [items, query, itemCategory, itemSort]);
  const itemPageSize = 30;
  const itemPageCount = Math.max(1, Math.ceil(filteredItems.length / itemPageSize));
  const currentItemPage = Math.min(itemPage, itemPageCount);
  const paginatedItems = filteredItems.slice((currentItemPage - 1) * itemPageSize, currentItemPage * itemPageSize);
  const printQueueItems = printQueueIds.map((id) => items.find((item) => item.id === id)).filter((item): item is Item => Boolean(item));
  useEffect(() => { setItemPage(1); }, [query, itemCategory, itemSort]);
  useEffect(() => { if (itemPage > itemPageCount) setItemPage(itemPageCount); }, [itemPage, itemPageCount]);
  const counts = (status: Status) => filtered.filter((o) => o.status === status).length;
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
  async function placeOrder(item: Item, quantity: number, purchaser: string, orderNote: string) {
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
    const order = { ...item, qty, orderId: `O-${Date.now()}`, status: "発注待ち" as Status, orderedAt: new Date().toISOString(), purchaser: purchaser.trim(), orderNote: orderNote.trim() };
    order.orderedAt = formatOrderDate(order.orderedAt);
    setOrders((current) => [order, ...current]);
    setSelectedItem(null); openTab("orders");
    try {
      await postState({ action: "order", itemId: item.id, orderId: order.orderId, quantity: qty, purchaser: order.purchaser, orderNote: order.orderNote });
      if (isIPhone()) window.setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setScanOpen(true);
      }, 150);
    } catch (error) {
      setOrders((current) => current.filter((row) => row.orderId !== order.orderId));
      showRequestError(error);
    }
  }
  async function cancelOrder(orderId: string) {
    const current = orders.find((order) => order.orderId === orderId);
    if (!current || current.status === "取消") return;
    if (!window.confirm(`${current.code} ${current.name} の発注を取り消しますか？`)) return;
    setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: "取消" } : order));
    try {
      await postState({ action: "status", orderId, status: "取消" });
    } catch (error) {
      setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: current.status } : order));
      showRequestError(error);
    }
  }
  async function returnToWaiting(orderId: string) {
    const current = orders.find((order) => order.orderId === orderId);
    if (!current || current.status !== "入荷済み") return;
    setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: "入荷待ち" } : order));
    try {
      await postState({ action: "status", orderId, status: "入荷待ち" });
    } catch (error) {
      setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: current.status } : order));
      showRequestError(error);
    }
  }
  async function deleteOrderHistory(orderId: string) {
    const current = orders.find((order) => order.orderId === orderId);
    if (!current) return;
    if (!window.confirm(`${current.code} ${current.name} の発注履歴を完全に削除しますか？\n\nこの操作は元に戻せません。`)) return;
    setOrders((rows) => rows.filter((order) => order.orderId !== orderId));
    try {
      await postState({ action: "order-delete", orderId });
      setSettingsNotice("✓ 発注履歴を完全に削除しました");
      window.setTimeout(() => setSettingsNotice(""), 2400);
    } catch (error) {
      setOrders((rows) => [...rows, current].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()));
      showRequestError(error);
    }
  }
  async function deleteOrderHistories(orderIds: string[]) {
    const uniqueIds = [...new Set(orderIds)];
    if (uniqueIds.length === 0) return false;
    if (!window.confirm(`選択した${uniqueIds.length}件の発注履歴を完全に削除しますか？\n\nこの操作は元に戻せません。`)) return false;
    const removed = orders.filter((order) => uniqueIds.includes(order.orderId));
    setOrders((rows) => rows.filter((order) => !uniqueIds.includes(order.orderId)));
    try {
      await postState({ action: "orders-delete", orderIds: uniqueIds });
      setSettingsNotice(`✓ ${uniqueIds.length}件の発注履歴を完全に削除しました`);
      window.setTimeout(() => setSettingsNotice(""), 2400);
      return true;
    } catch (error) {
      setOrders((rows) => [...rows, ...removed].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()));
      showRequestError(error);
      throw error;
    }
  }
  async function returnToOrdered(orderId: string) {
    const current = orders.find((order) => order.orderId === orderId);
    if (!current || current.status !== "入荷待ち") return;
    setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: "発注待ち" } : order));
    try {
      await postState({ action: "status", orderId, status: "発注待ち" });
    } catch (error) {
      setOrders((rows) => rows.map((order) => order.orderId === orderId ? { ...order, status: current.status } : order));
      showRequestError(error);
    }
  }

  async function updateExistingOrder(updated: Order) {
    const current = orders.find((order) => order.orderId === updated.orderId);
    if (!current) return;
    const item = items.find((row) => row.id === updated.id);
    const itemChanged = item && ["code", "name", "category", "unit", "orderPoint", "memo"].some((key) => String(item[key as keyof Item]) !== String(updated[key as keyof Item]));
    setOrders((rows) => rows.map((order) => order.orderId === updated.orderId ? updated : order));
    try {
      if (itemChanged) await updateBoardItem({ ...item!, code: updated.code, name: updated.name, category: updated.category, unit: updated.unit, orderPoint: updated.orderPoint, memo: updated.memo });
      await postState({ action: "order-update", orderId: updated.orderId, quantity: updated.qty, purchaser: updated.purchaser, orderNote: updated.orderNote });
      setEditingOrder(null);
      setSettingsNotice("✓ 発注内容を保存しました");
      window.setTimeout(() => setSettingsNotice(""), 2400);
    } catch (error) {
      setOrders((rows) => rows.map((order) => order.orderId === current.orderId ? current : order));
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
      window.localStorage.setItem("parent-notifications", "enabled");
      notificationEnabled.current = true;
      setPushStatus("アプリ内通知 ON");
      setSettingsNotice("✓ アプリを開いている間の通知を有効にしました");
      window.setTimeout(() => setSettingsNotice(""), 3000);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        window.localStorage.setItem("parent-notifications", "enabled");
        notificationEnabled.current = true;
        setPushStatus("アプリ内通知 ON");
        setSettingsNotice("✓ アプリ内通知を有効にしました");
        window.setTimeout(() => setSettingsNotice(""), 3000);
        window.alert("端末通知はブラウザでブロックされています。アプリを開いている間は画面内で通知します。端末通知も使う場合は、ブラウザのサイト設定から「通知」を許可してください。");
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

  async function startQrBoardPrint() {
    const targetItems = normalizeSearch(query) || itemCategory !== "all" ? filteredItems : items;
    if (targetItems.length === 0) {
      window.alert("印刷できる品目がありません。検索条件をご確認ください。");
      return;
    }
    await printSelectedBoards(targetItems);
  }

  async function printSelectedBoards(targetItems: Item[], resetQueue = false) {
    setPrintItems(targetItems);
    setPrintQrSources(Object.fromEntries(targetItems.map((item) => [item.id, `/qr/${encodeURIComponent(item.id)}.svg`] as const)));
    setPrintRequested(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
    const printed = await printQrBoards();
    setPrintRequested(false);
    if (printed && resetQueue) {
      const completed = window.confirm("印刷は完了しましたか？\n\n［OK］印刷完了：キューを空にする\n［キャンセル］未印刷：キューを残す");
      if (completed) {
        markItemsPrinted(targetItems, "a4");
        writePrintQueue([]);
        setSettingsNotice("✓ 印刷完了を確認し、部分印刷キューをリセットしました");
        window.setTimeout(() => setSettingsNotice(""), 3000);
      } else {
        setSettingsNotice("印刷キューをそのまま保持しました");
        window.setTimeout(() => setSettingsNotice(""), 2400);
      }
    } else if (printed) {
      const completed = window.confirm("A4看板の印刷は完了しましたか？\n\n［OK］印刷済みフラグを付ける\n［キャンセル］未印刷のまま残す");
      if (completed) {
        markItemsPrinted(targetItems, "a4");
        setSettingsNotice("✓ A4看板を印刷済みにしました");
        window.setTimeout(() => setSettingsNotice(""), 2400);
      }
    }
  }

  async function updateAccountAccess(email: string, action: "approve" | "reject" | "revoke") {
    const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, action }) });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(data?.error ?? "アクセス設定を変更できませんでした。");
    }
    await refreshAccess();
  }

  const nav = [
    ["dashboard", "概要", "▦"], ["scan", "カメラ", "◎"], ["orders", "発注管理", "⇄"],
    ["history", "履歴", "◷"], ["items", "品目・看板", "▤"], ["partialPrint", "部分印刷", "☑"],
  ];
  const pendingAccessCount = access.isOwner ? access.accounts.filter((account) => account.status === "pending").length : 0;

  if (access.status !== "approved") return <AccessGate access={access} refresh={refreshAccess} />;

  return (
    <div className={`app density-${settings.density}${ipadDevice && settings.ipadFullscreen ? " ipadFullscreen" : ""}`} style={{ "--accent": settings.accent } as React.CSSProperties}>
      <aside className="sidebar">
        <div className="brand" aria-label="MATERIAL ORDER CONTROL"><span className="brandLogo"/><div className="brandControl"><span>MATERIAL ORDER CONTROL</span><strong>{settings.siteName}</strong></div></div>
        <nav>{nav.map(([id, label, icon]) => <button key={id} className={`${tab === id ? "active " : ""}nav-${id}`} onClick={() => openTab(id)}><span>{icon}</span><span className="navLabel">{label}</span>{id === "orders" && unreadOrders > 0 && <b className="notificationBadge" aria-label={`未確認 ${unreadOrders}件`}>{unreadOrders > 99 ? "99+" : unreadOrders}</b>}{id === "partialPrint" && printQueueIds.length > 0 && <b className="notificationBadge printQueueBadge" aria-label={`印刷キュー ${printQueueIds.length}品`}>{printQueueIds.length > 99 ? "99+" : printQueueIds.length}</b>}</button>)}</nav>
        <button className="settingsButton" onClick={() => setSettingsOpen(true)}>⚙ 詳細設定{pendingAccessCount > 0 && <b className="notificationBadge settingsNotificationBadge" aria-label={`アクセス許可申請 ${pendingAccessCount}件`}>{pendingAccessCount > 99 ? "99+" : pendingAccessCount}</b>}</button>
      </aside>

      <main>
        <header><div><p className="eyebrow">MATERIALS / LIVE</p><h1>{nav.find((n) => n[0] === tab)?.[1] ?? "概要"}</h1></div><div className="headerActions">{tab !== "items" && tab !== "partialPrint" && <label className="search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="品番・品名・担当者で検索" /></label>}</div></header>

        {tab === "dashboard" && <>
          <section className="stats">
            <button className="stat red" onClick={() => openStatus("発注待ち")}><small>発注待ち</small>{statusAlerts["発注待ち"] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<strong>{counts("発注待ち")}</strong><span>件</span></button>
            <button className="stat blue" onClick={() => openStatus("入荷待ち")}><small>入荷待ち</small>{statusAlerts["入荷待ち"] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<strong>{counts("入荷待ち")}</strong><span>件</span></button>
            <button className="stat gray" onClick={() => openStatus("入荷済み")}><small>入荷済み</small>{statusAlerts["入荷済み"] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<strong>{counts("入荷済み")}</strong><span>件</span></button>
            <article className="stat total"><small>登録品目</small><strong>{items.length.toLocaleString("ja-JP")}</strong><span>品</span></article>
          </section>
          <OrderList orders={filtered.filter((o) => o.status === "発注待ち" || o.status === "入荷待ち").slice(0, 5)} onEdit={setEditingOrder} onAdvance={advance} onCancel={cancelOrder} onReturn={returnToWaiting} onReturnToOrdered={returnToOrdered} showMemo={settings.showMemo} title="進行中の発注" />
        </>}

        {tab === "orders" && <OrderBoard orders={filtered} onEdit={setEditingOrder} onAdvance={advance} onCancel={cancelOrder} onReturn={returnToWaiting} onReturnToOrdered={returnToOrdered} onViewStatus={openStatus} statusAlerts={statusAlerts} showMemo={settings.showMemo} />}
        {tab === "history" && <HistoryOrderList key={query} orders={filtered} onEdit={setEditingOrder} onAdvance={advance} onCancel={cancelOrder} onDelete={deleteOrderHistory} onDeleteMany={deleteOrderHistories} onReturn={returnToWaiting} onReturnToOrdered={returnToOrdered} showMemo={settings.showMemo} />}
        {tab === "partialPrint" && <PartialPrintQueue items={printQueueItems} allItems={items} updateQueue={writePrintQueue} print={() => void printSelectedBoards(printQueueItems, true)} save={updateBoardItem} edit={setEditingItem} order={setSelectedItem} columns={settings.cardColumns} />}

        {tab === "items" && <section className="itemsWorkspace"><div className="sectionTitle"><div><p className="eyebrow">MASTER ITEMS / QR KANBAN</p><h2>品目・QR看板</h2><span className="editHint">文字をタップすると、その場で入力できます。同じ品目情報からQR看板を印刷できます。</span></div></div><div className="sectionTitleActions stickyItemActions"><label className="search stickyItemSearch">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="品番・品名・カテゴリで検索" aria-label="品番・品名・カテゴリで検索" /></label><label className="itemCategoryControl"><span>カテゴリ</span><select value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} aria-label="カテゴリで絞り込み"><option value="all">すべて</option>{itemCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><output className="itemResultCount" aria-live="polite">検索結果 <strong>{filteredItems.length.toLocaleString("ja-JP")}</strong>品 ／ 全{items.length.toLocaleString("ja-JP")}品</output><label className="itemSortControl"><span>並び順</span><select value={itemSort} onChange={(event) => setItemSort(event.target.value as typeof itemSort)} aria-label="品目の並び順"><option value="newest">新着順</option><option value="oldest">登録が古い順</option><option value="code">品番順</option><option value="name">品名順</option></select></label><button className="outline" onClick={() => void startQrBoardPrint()}>QR看板を印刷</button><button className="primary addItemButton" onClick={() => setEditingItem("new")}>＋ 新規品目</button></div><div className="itemGrid" style={{ gridTemplateColumns: `repeat(${settings.cardColumns}, minmax(0, 1fr))` }}>{paginatedItems.map((item) => <InlineItemCard key={`${item.id}:${item.code}:${item.name}:${item.category}:${item.qty}:${item.orderPoint}:${item.unit}:${item.memo}`} item={item} save={updateBoardItem} edit={() => setEditingItem(item)} order={() => setSelectedItem(item)} />)}</div><nav className="itemPagination" aria-label="品目一覧のページ"><button className="outline" disabled={currentItemPage <= 1} onClick={() => { setItemPage((page) => Math.max(1, page - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>← 前へ</button><label><span>ページ</span><select value={currentItemPage} onChange={(event) => { setItemPage(Number(event.target.value)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{Array.from({ length: itemPageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / {itemPageCount}</option>)}</select></label><span>{filteredItems.length === 0 ? "0品" : `${((currentItemPage - 1) * itemPageSize + 1).toLocaleString("ja-JP")}～${Math.min(currentItemPage * itemPageSize, filteredItems.length).toLocaleString("ja-JP")}品を表示`}</span><button className="outline" disabled={currentItemPage >= itemPageCount} onClick={() => { setItemPage((page) => Math.min(itemPageCount, page + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>次へ →</button></nav>{printRequested && <div className="integratedPrintBoards"><QrBoards items={printItems} columns={settings.boardColumns} rows={settings.boardRows} width={settings.boardWidth} height={settings.boardHeight} save={updateBoardItem} qrSources={printQrSources} /></div>}</section>}
      </main>
      {tab === "partialPrint" && printRequested && <div className="integratedPrintBoards"><QrBoards items={printItems} columns={settings.boardColumns} rows={settings.boardRows} width={settings.boardWidth} height={settings.boardHeight} save={updateBoardItem} qrSources={printQrSources} /></div>}
      {ipadDevice && settings.ipadFullscreen && <div className="ipadFullscreenControls"><button className="fullscreenSettingsButton" onClick={() => setSettingsOpen(true)}>⚙ 詳細設定{pendingAccessCount > 0 && <b className="notificationBadge settingsNotificationBadge">{pendingAccessCount > 99 ? "99+" : pendingAccessCount}</b>}</button><button onClick={() => { const next = { ...settings, ipadFullscreen: false }; setSettings(next); void persistSettings(next).then(() => { setSettingsNotice("✓ 設定を保存しました"); window.setTimeout(() => setSettingsNotice(""), 2400); }).catch(showRequestError); }}>全画面を解除</button></div>}
      {settingsNotice && <div className="settingsToast" role="status">{settingsNotice}</div>}
      {orderNotice && <div className="orderNotification" role="alert"><span>{orderNotice}</span><button onClick={() => { setOrderNotice(""); window.localStorage.removeItem("pending-order-notice"); }}>確認</button></div>}

      {scanOpen && <QrScanner items={items} close={() => setScanOpen(false)} found={(item) => { setScanOpen(false); setSelectedItem(item); }} />}

      {selectedItem && <OrderModal item={selectedItem} history={orders.filter((order) => order.id === selectedItem.id)} close={() => setSelectedItem(null)} save={async (updatedItem) => {
        await updateBoardItem(updatedItem);
        setSelectedItem(null);
        setSettingsNotice("✓ 品目情報を保存しました");
        window.setTimeout(() => setSettingsNotice(""), 2400);
      }} submit={async (updatedItem, quantity, purchaser, orderNote) => {
        if (updatedItem.code !== selectedItem.code || updatedItem.name !== selectedItem.name || updatedItem.orderPoint !== selectedItem.orderPoint || updatedItem.qty !== selectedItem.qty) await updateBoardItem(updatedItem);
        await placeOrder(updatedItem, quantity, purchaser, orderNote);
      }} />}

      {editingItem && <ItemEditor item={editingItem === "new" ? null : editingItem} close={() => setEditingItem(null)} save={saveItem} />}
      {editingOrder && <OrderEditModal order={editingOrder} close={() => setEditingOrder(null)} save={updateExistingOrder} />}

      {settingsOpen && <SettingsPanel settings={settings} setSettings={setSettings} pushStatus={pushStatus} enableNotifications={enableParentNotifications} access={access} updateAccountAccess={updateAccountAccess} close={() => setSettingsOpen(false)} save={async () => { await persistSettings(settings); setSettingsNotice("✓ 設定を保存しました"); window.setTimeout(() => setSettingsNotice(""), 2400); setSettingsOpen(false); }} />}
    </div>
  );
}

function PartialPrintQueue({ items, allItems, updateQueue, print, save, edit, order, columns }: { items: Item[]; allItems: Item[]; updateQueue: (ids: string[]) => void; print: () => void; save: (item: Item) => Promise<void>; edit: (item: Item) => void; order: (item: Item) => void; columns: number }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"a4" | "tepra">("a4");
  const [, refreshPrintFlags] = useState(0);
  useEffect(() => { const refresh = () => refreshPrintFlags((value) => value + 1); window.addEventListener("print-ledger-change", refresh); return () => window.removeEventListener("print-ledger-change", refresh); }, []);
  const toggle = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const removeSelected = () => { updateQueue(items.filter((item) => !selectedIds.has(item.id)).map((item) => item.id)); setSelectedIds(new Set()); };
  return <section className="partialPrintPage"><div className="queueSummary"><div><p className="eyebrow">PRINT CENTER</p><h2>印刷</h2><p>A4看板印刷とテプラ印刷（SR970）を選択できます。</p></div><strong>{items.length}<span>品を選択中</span></strong></div><div className="printFormatSelector" role="radiogroup" aria-label="印刷形式"><label className={format === "a4" ? "active" : ""}><input type="radio" checked={format === "a4"} onChange={() => setFormat("a4")}/><b>A4看板印刷</b><span>現在の60×40mm看板</span></label><label className={format === "tepra" ? "active" : ""}><input type="radio" checked={format === "tepra"} onChange={() => setFormat("tepra")}/><b>テプラ印刷（SR970）</b><span>36mmテープ・CSV対応</span></label></div>{format === "tepra" ? <TepraPrintManager allItems={allItems} queuedItems={items} onSelectedPrinted={(printedId) => updateQueue(items.filter((item) => item.id !== printedId).map((item) => item.id))}/> : items.length === 0 ? <div className="emptyPrintQueue"><b>印刷キューは空です</b><p>品目・看板ページで必要な看板にチェックを入れてください。</p></div> : <><div className="queueActions"><button className="outline" onClick={() => setSelectedIds(new Set(items.map((item) => item.id)))}>すべて選択</button><button className="outline" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())}>選択解除</button><button className="queueDelete" disabled={selectedIds.size === 0} onClick={removeSelected}>選択した{selectedIds.size}品を削除</button><button className="queueClear" onClick={() => { if (window.confirm("部分印刷キューをすべて空にしますか？")) { updateQueue([]); setSelectedIds(new Set()); } }}>キューを空にする</button><button className="primary queuePrint" onClick={print}>この{items.length}品をA4印刷</button></div><div className="itemGrid partialPrintCards" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{items.map((item) => <div key={`${item.id}:${item.code}:${item.name}:${item.category}:${item.qty}:${item.orderPoint}:${item.unit}:${item.memo}`} className={`queueCardWrap${selectedIds.has(item.id) ? " selected" : ""}`}><div className="queueCardControls"><label><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggle(item.id)}/><span>削除対象に選択</span></label><span className={`printFlag flag-${getItemPrintFlag(item)}`}>{getItemPrintFlag(item)}</span><button aria-label={`${item.name}を印刷キューから削除`} onClick={() => updateQueue(items.filter((row) => row.id !== item.id).map((row) => row.id))}>×</button></div><InlineItemCard item={item} save={save} edit={() => edit(item)} order={() => order(item)} showQueueControl={false}/></div>)}</div></>}</section>;
}

function HistoryOrderList(props: Omit<React.ComponentProps<typeof OrderList>, "title" | "onDelete" | "selectedIds" | "onToggleSelect"> & { onDelete: (id: string) => void; onDeleteMany: (ids: string[]) => Promise<boolean> }) {
  const pageSize = 30;
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const pageCount = Math.max(1, Math.ceil(props.orders.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = props.orders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageIds = pageOrders.map((order) => order.orderId);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [props.orders.length]);
  const toggle = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const deleteSelected = async () => {
    if (selectedIds.size === 0 || deleting) return;
    setDeleting(true);
    try { if (await props.onDeleteMany([...selectedIds])) setSelectedIds(new Set()); }
    catch { /* The parent restores the rows and shows the error. */ }
    finally { setDeleting(false); }
  };
  return <><div className="historySelectionBar"><button className={selectionMode ? "primary" : "outline"} onClick={() => { setSelectionMode((value) => !value); setSelectedIds(new Set()); }}>{selectionMode ? "選択モードを終了" : "✓ 選択モード"}</button>{selectionMode && <><button className="outline" disabled={pageIds.length === 0} onClick={() => setSelectedIds((current) => new Set([...current, ...pageIds]))}>このページをすべて選択</button><button className="outline" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())}>選択解除</button><span><strong>{selectedIds.size}</strong>件選択中</span><button className="deleteSelectedButton" disabled={selectedIds.size === 0 || deleting} onClick={() => void deleteSelected()}>{deleting ? "削除中…" : `選択した${selectedIds.size}件を削除`}</button></>}</div><OrderList {...props} orders={pageOrders} title="すべての履歴" selectedIds={selectionMode ? selectedIds : undefined} onToggleSelect={selectionMode ? toggle : undefined}/><nav className="itemPagination historyPagination" aria-label="発注履歴のページ"><button className="outline" disabled={currentPage <= 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>← 前へ</button><label><span>ページ</span><select value={currentPage} onChange={(event) => { setPage(Number(event.target.value)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / {pageCount}</option>)}</select></label><span>{props.orders.length === 0 ? "0件" : `${((currentPage - 1) * pageSize + 1).toLocaleString("ja-JP")}～${Math.min(currentPage * pageSize, props.orders.length).toLocaleString("ja-JP")}件を表示 ／ 全${props.orders.length.toLocaleString("ja-JP")}件`}</span><button className="outline" disabled={currentPage >= pageCount} onClick={() => { setPage((value) => Math.min(pageCount, value + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>次へ →</button></nav></>;
}

function OrderList({ orders, onEdit, onAdvance, onCancel, onDelete, selectedIds, onToggleSelect, onReturn, onReturnToOrdered, showMemo, title }: { orders: Order[]; onEdit: (order: Order) => void; onAdvance: (id: string) => void; onCancel: (id: string) => void; onDelete?: (id: string) => void; selectedIds?: Set<string>; onToggleSelect?: (id: string) => void; onReturn: (id: string) => void; onReturnToOrdered: (id: string) => void; showMemo: boolean; title: string }) {
  return <section className="orderSection"><div className="sectionTitle"><div><p className="eyebrow">ORDER PIPELINE</p><h2>{title}</h2></div></div><div className="orderList">{orders.map((o) => <article className={`orderRow${selectedIds ? " historySelectableRow" : ""}${selectedIds?.has(o.orderId) ? " selected" : ""}`} key={o.orderId}>{selectedIds && onToggleSelect && <label className="historySelectCheck"><input type="checkbox" checked={selectedIds.has(o.orderId)} onChange={() => onToggleSelect(o.orderId)}/><span>選択</span></label>}{(o.status !== "取消" || onDelete) && <OptionsMenu label={`${o.name}の操作`}>{o.status !== "取消" && <><button className="menuNeutral" onClick={() => onEdit(o)}>発注内容を編集</button>{o.status === "入荷済み" && <button className="menuNeutral" onClick={() => onReturn(o.orderId)}>入荷待ちへ戻す</button>}{o.status === "入荷待ち" && <button className="menuNeutral" onClick={() => onReturnToOrdered(o.orderId)}>発注待ちに戻す</button>}<button onClick={() => onCancel(o.orderId)}>発注取消</button></>}{onDelete && <button className="menuDelete" onClick={() => onDelete(o.orderId)}>履歴を完全に削除</button>}</OptionsMenu>}<span className={`status s-${o.status}`}>{o.status}</span><div className="orderMain"><small>{o.code} ・ {o.category}</small><h3>{o.name}</h3>{showMemo && <p>{o.memo}</p>}{o.orderNote && <p className="orderNoteDisplay">発注メモ：{o.orderNote}</p>}</div><div className="orderMeta"><small>数量</small><strong>{o.qty}<i>{o.unit}</i></strong></div><div className="orderMeta"><small>発注者</small><b>{o.purchaser}</b><span>{o.orderedAt}</span></div>{o.status === "発注待ち" || o.status === "入荷待ち" ? <button className="next" onClick={() => onAdvance(o.orderId)}>{o.status === "発注待ち" ? "入荷待ちへ" : "入荷済みにする"} →</button> : <span className={`done ${o.status === "取消" ? "cancelled" : ""}`}>{o.status === "取消" ? "× 取消" : "✓ 入荷済み"}</span>}</article>)}</div></section>;
}

function OrderBoard({ orders, onEdit, onAdvance, onCancel, onReturn, onReturnToOrdered, onViewStatus, statusAlerts, showMemo }: { orders: Order[]; onEdit: (order: Order) => void; onAdvance: (id: string) => void; onCancel: (id: string) => void; onReturn: (id: string) => void; onReturnToOrdered: (id: string) => void; onViewStatus: (status: "発注待ち" | "入荷待ち" | "入荷済み") => void; statusAlerts: Record<"発注待ち" | "入荷待ち" | "入荷済み", number>; showMemo: boolean }) {
  const statuses: Exclude<Status, "取消">[] = ["発注待ち", "入荷待ち", "入荷済み"];
  return <section><div className="sectionTitle"><div><p className="eyebrow">ORDER PIPELINE</p><h2>発注・入荷状況</h2></div></div><div className="pipelineBoard">{statuses.map((status) => {
    const statusOrders = orders.filter((order) => order.status === status);
    return <section className="pipelineColumn" key={status}><header onClick={() => onViewStatus(status)}><h3>{status}</h3>{statusAlerts[status] > 0 && <i className="progressLamp" title="新しい進展があります"/>}<span>{statusOrders.length}</span></header><div>{statusOrders.map((order) => <article className="pipelineCard" key={order.orderId}><OptionsMenu label={`${order.name}の操作`}><button className="menuNeutral" onClick={() => onEdit(order)}>発注内容を編集</button>{status === "入荷済み" && <button className="menuNeutral" onClick={() => onReturn(order.orderId)}>入荷待ちへ戻す</button>}{status === "入荷待ち" && <button className="menuNeutral" onClick={() => onReturnToOrdered(order.orderId)}>発注待ちに戻す</button>}<button onClick={() => onCancel(order.orderId)}>発注取消</button></OptionsMenu><small>{order.code} ・ {order.category}</small><h4>{order.name}</h4>{showMemo && <p>{order.memo}</p>}{order.orderNote && <p className="orderNoteDisplay">発注メモ：{order.orderNote}</p>}<dl><div><dt>数量</dt><dd>{order.qty}{order.unit}</dd></div><div><dt>発注者</dt><dd>{order.purchaser}</dd></div></dl>{status !== "入荷済み" && <button className="next pipelineNext" onClick={() => onAdvance(order.orderId)}>{status === "発注待ち" ? "入荷待ちへ" : "入荷済みにする"} →</button>}</article>)}</div></section>;
  })}</div></section>;
}

function QrBoards({ items, columns, rows, width, height, qrSources }: { items: Item[]; columns: number; rows: number; width: number; height: number; save: (item: Item) => Promise<void>; qrSources: Record<string, string> }) {
  const safeColumns = Math.max(1, columns);
  const safeRows = Math.max(1, rows);
  const boardStyle = { "--board-width": `${width}mm`, "--board-height": `${height}mm`, "--board-columns": safeColumns, gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))` } as React.CSSProperties;
  const sortedItems = [...items].sort((a, b) => a.category.localeCompare(b.category, "ja", { numeric: true, sensitivity: "base" }) || a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" }));
  const pageSize = safeColumns * safeRows;
  const pages = Array.from({ length: Math.ceil(sortedItems.length / pageSize) }, (_, index) => sortedItems.slice(index * pageSize, (index + 1) * pageSize));
  return <section><div className="sectionTitle"><div><p className="eyebrow">QR KANBAN</p><h2>QR読み取り用看板</h2><span className="editHint">品目ページの看板と同じレイアウトで印刷します。カテゴリ・品名が近い順に並びます。</span></div></div>{pages.map((page, pageIndex) => <div className="boards printItemCards" style={boardStyle} key={pageIndex}>{page.map((item) => <PrintItemCard key={`${item.id}:${item.code}:${item.name}:${item.qty}:${item.orderPoint}:${item.boardNumber}:${item.memo}`} item={item} qrSource={qrSources[item.id]} />)}</div>)}</section>;
}

function PrintItemCard({ item, qrSource }: { item: Item; qrSource: string }) {
  const codeSize = printTextSize(item.code, 9.5, 8, 6.5);
  const nameSize = printTextSize(item.name, 12.5, 9.5, 7);
  return <article className="itemCard inlineItemCard" style={{ "--print-code-size": `${codeSize}pt`, "--print-name-size": `${nameSize}pt` } as React.CSSProperties}>
    <div className="inlineItemField"><span>カテゴリ</span><span className="printItemValue inlineItemCategory">{item.category}</span></div>
    <div className="itemCardQr"><img className="fakeQr" src={qrSource} data-item-id={item.id} onError={(event) => void useGeneratedQr(event.currentTarget, item.id)} alt=""/></div>
    <div className="inlineItemField"><span>品名</span><span className="printItemValue inlineItemName">{item.name}</span></div>
    <div className="inlineItemField"><span>品番</span><span className="printItemValue inlineItemCode">{item.code}</span></div>
    <div className="inlineItemMemoField"><span>備考</span><span className="printItemValue inlineItemMemo">{item.memo}</span></div>
    <div className="inlineItemNumbers"><label><span className="numberLabel">発注数量:</span><span className="numberWithUnit"><strong>{item.qty}</strong><span className="fixedUnit">{item.unit}</span></span></label><label className="orderPointField"><span className="numberLabel">発注点:</span><span className="numberWithUnit"><strong style={{ fontSize: `${singleLineOrderPointSize(item.orderPoint)}px` }}>{item.orderPoint}</strong>{/^\d+$/.test(String(item.orderPoint)) && <span className="fixedUnit">{item.unit}</span>}</span></label></div>
  </article>;
}

function printTextSize(value: string, regular: number, medium: number, compact: number) {
  const length = Array.from(value).reduce((total, character) => total + (/^[\u0000-\u00ff]$/.test(character) ? .55 : 1), 0);
  return length > 30 ? compact : length > 18 ? medium : regular;
}

function singleLineOrderPointSize(value: string) {
  const length = Math.max(1, Array.from(String(value)).reduce((total, character) => total + (/^[\u0000-\u00ff]$/.test(character) ? .55 : 1), 0));
  return Math.max(6, Math.min(11, 104 / length));
}

function InlineBoard({ item, save }: { item: Item; save: (item: Item) => Promise<void> }) {
  const [draft, setDraft] = useState(item);
  const [quantityText, setQuantityText] = useState(String(item.qty));
  const commit = async () => {
    if (JSON.stringify(draft) === JSON.stringify(item)) return;
    try { await save(draft); } catch { setDraft(item); }
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") event.currentTarget.blur(); };
  const commitQuantity = async () => {
    const quantity = Number(quantityText);
    if (!/^\d+$/.test(quantityText) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) { setQuantityText(String(draft.qty)); return; }
    const next = { ...draft, qty: quantity };
    setDraft(next);
    if (quantity !== item.qty) try { await save(next); } catch { setDraft(item); setQuantityText(String(item.qty)); }
  };
  return <article className="board"><span className="printMenuDots">•••</span><FakeQr value={item.id}/><div className="inlineBoardFields">
    <label className="printBoardField"><span>カテゴリ</span><input className="inlineCategory" aria-label="カテゴリ" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label>
    <label className="printBoardField"><span>品番</span><input className="inlineCode" aria-label="品番" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label>
    <div className="boardTitleLine"><label className="boardNameField"><span>品名</span><input className="inlineName" aria-label="品名" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label><strong className="boardNumber">No.{String(item.boardNumber).padStart(3, "0")}</strong></div>
    <label className="printBoardField printBoardMemo"><span>備考</span><input aria-label="備考" value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label>
    <div className="inlineMeta"><label>発注数量 <input className="inlineQty" aria-label="発注数量" type="number" min="1" max="10000" value={quantityText} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setQuantityText(event.target.value); }} onBlur={() => void commitQuantity()} onKeyDown={keyDown}/><input className="inlineUnit" aria-label="単位" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label><label className="orderPointField">発注点 <input className="orderPointTextInput" aria-label="発注点" value={draft.orderPoint} onChange={(event) => setDraft({ ...draft, orderPoint: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></label></div>
    <div className="printOrderButton">発注する</div>
  </div></article>;
}

function InlineItemCard({ item, save, edit, order, showQueueControl = true }: { item: Item; save: (item: Item) => Promise<void>; edit: () => void; order: () => void; showQueueControl?: boolean }) {
  const [draft, setDraft] = useState(item);
  const [quantityText, setQuantityText] = useState(String(item.qty));
  const [queuedForPrint, setQueuedForPrint] = useState(false);
  useEffect(() => { setQuantityText(String(item.qty)); }, [item.qty]);
  useEffect(() => {
    const refresh = () => setQueuedForPrint(readPrintQueue().includes(item.id));
    refresh();
    window.addEventListener("print-queue-change", refresh);
    return () => window.removeEventListener("print-queue-change", refresh);
  }, [item.id]);
  const commit = async () => {
    if (JSON.stringify(draft) === JSON.stringify(item)) return;
    try { await save(draft); } catch { setDraft(item); }
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") event.currentTarget.blur(); };
  const commitQuantity = async () => {
    const quantity = Number(quantityText);
    if (!/^\d+$/.test(quantityText) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) { setQuantityText(String(draft.qty)); return; }
    const next = { ...draft, qty: quantity };
    setDraft(next);
    if (quantity !== item.qty) try { await save(next); } catch { setDraft(item); setQuantityText(String(item.qty)); }
  };
  const addToPrintQueue = () => {
    const current = readPrintQueue();
    if (!current.includes(item.id)) writePrintQueue([...current, item.id]);
  };
  const field = (key: keyof Item, label: string, className = "") => <input className={className} aria-label={label} value={String(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/>;
  return <article className={`itemCard inlineItemCard${showQueueControl && queuedForPrint ? " queuedForPrint" : ""}`} title={showQueueControl ? (queuedForPrint ? "部分印刷キューに追加済み" : "右クリックで部分印刷キューへ追加") : undefined} onContextMenu={showQueueControl ? (event) => { event.preventDefault(); addToPrintQueue(); } : undefined}>
    {showQueueControl && <label className="printQueueCheck"><input type="checkbox" checked={queuedForPrint} onChange={() => { const current = readPrintQueue(); writePrintQueue(queuedForPrint ? current.filter((id) => id !== item.id) : [...current, item.id]); }}/><span>{queuedForPrint ? "印刷キューに追加済み" : "部分印刷に追加"}</span></label>}
    <label className="inlineItemField"><span>カテゴリ</span>{field("category", "カテゴリ", "inlineItemCategory")}</label>
    <div className="itemCardQr"><FakeQr value={item.id}/></div>
    <label className="inlineItemField"><span>品番</span>{field("code", "品番", "inlineItemCode")}</label>
    <label className="inlineItemField"><span>品名</span>{field("name", "品名", "inlineItemName")}</label>
    <label className="inlineItemMemoField"><span>備考</span>{field("memo", "備考", "inlineItemMemo")}</label>
    <div className="inlineItemNumbers"><label><span className="numberLabel">発注数量:</span><span className="numberWithUnit"><input aria-label="発注数量" type="number" min="1" max="10000" value={quantityText} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setQuantityText(event.target.value); }} onBlur={() => void commitQuantity()} onKeyDown={keyDown}/>{field("unit", "単位", "inlineItemUnit")}</span></label><label className="orderPointField"><span className="numberLabel">発注点:</span><span className="numberWithUnit"><input className="orderPointTextInput" style={{ fontSize: `${singleLineOrderPointSize(draft.orderPoint)}px` }} aria-label="発注点" value={draft.orderPoint} onChange={(event) => setDraft({ ...draft, orderPoint: event.target.value })} onBlur={() => void commit()} onKeyDown={keyDown}/></span></label></div>
    <OptionsMenu label={`${item.name}の操作`}><button onClick={edit}>詳細編集</button></OptionsMenu>
    <div className="itemActions"><button className="primary" onClick={order}>発注する</button></div>
  </article>;
}

function fitSingleLineInput(input: HTMLInputElement) {
  if (["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "hidden"].includes(input.type) || input.dataset.autoFit === "off") return;
  const naturalSize = Number(input.dataset.autoFitSize || Number.parseFloat(window.getComputedStyle(input).fontSize) || 16);
  input.dataset.autoFitSize = String(naturalSize);
  let size = naturalSize;
  input.style.setProperty("font-size", `${size}px`, "important");
  for (let attempt = 0; attempt < 4 && input.clientWidth > 0 && input.scrollWidth > input.clientWidth; attempt += 1) {
    size *= Math.max(.1, (input.clientWidth - 1) / input.scrollWidth);
    input.style.setProperty("font-size", `${Math.max(1, size)}px`, "important");
  }
}

function OptionsMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (menuRef.current?.open && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);
  return <details ref={menuRef} className="optionsMenu"><summary aria-label={label}>•••</summary><div onClick={() => { if (menuRef.current) menuRef.current.open = false; }}>{children}</div></details>;
}

function FakeQr({ value }: { value: string }) {
  const [source, setSource] = useState(`/qr/${encodeURIComponent(value)}.svg`);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="fakeQr" src={source} loading="lazy" onError={() => void generatedQrSource(value).then(setSource)} alt={`品目 ${value} の発注用QRコード`} />;
}

async function generatedQrSource(itemId: string) {
  const cached = generatedQrCache.get(itemId);
  if (cached) return cached;
  const stableValue = `${window.location.origin}/?item=${encodeURIComponent(itemId)}`;
  const generated = await QRCode.toDataURL(stableValue, { errorCorrectionLevel: "M", margin: 1, width: 320 });
  generatedQrCache.set(itemId, generated);
  return generated;
}

async function useGeneratedQr(image: HTMLImageElement, itemId: string) {
  image.onerror = null;
  image.src = await generatedQrSource(itemId);
}

function QrScanner({ items, close, found }: { items: Item[]; close: () => void; found: (item: Item) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const itemsRef = useRef(items);
  const foundRef = useRef(found);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("カメラをQRコードへ向けてください");
  const [cameraFailed, setCameraFailed] = useState(false);
  const [retryCamera, setRetryCamera] = useState(0);

  useEffect(() => {
    itemsRef.current = items;
    foundRef.current = found;
  }, [items, found]);

  const resolve = useCallback((raw: string) => {
    let id = raw.trim();
    try { id = new URL(id).searchParams.get("item") ?? id; } catch { /* 管理番号を直接入力した場合 */ }
    const item = itemsRef.current.find((row) => row.id.toLowerCase() === id.toLowerCase());
    if (item) foundRef.current(item); else setMessage("該当する品目が見つかりません。管理番号をご確認ください。");
  }, []);

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
          { preferredCamera: "environment", highlightScanRegion: false, highlightCodeOutline: false, returnDetailedScanResult: true },
        );
        await scanner.start();
        setMessage("QRコードを枠内に合わせてください");
      } catch (error) {
        setCameraFailed(true);
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
        setMessage(denied ? "カメラが許可されていません。iPhoneの設定でSafari（またはこのアプリ）のカメラを許可してください。" : "カメラを開始できません。カメラの許可を確認してから再試行してください。");
      }
    };
    void start();
    return () => { scanner?.stop(); scanner?.destroy(); };
  }, [resolve, retryCamera]);

  return <div className="modalBackdrop scannerBackdrop" onClick={close}><section className="scanModal iphoneScanner" onClick={(event) => event.stopPropagation()}>
    <header className="scannerHeader"><div><p>HINODE QR SCANNER</p><h2>QR看板を読み取る</h2></div><button className="scannerClose" onClick={close} aria-label="QR読み取りを閉じる">×</button></header>
    <div className={`camera scannerViewport ${cameraFailed ? "cameraError" : ""}`}><video ref={videoRef} muted playsInline/><div className="scannerShade"/><div className="scanTarget"><i/><i/><i/><i/></div><span className="scannerMessage">{message}</span></div>
    <section className="scannerControls">
      <p className="scannerTip">看板のQRコードを四角い枠の中に合わせてください</p>
      {cameraFailed && <button className="cameraRetry" onClick={() => setRetryCamera((value) => value + 1)}>↻ ライブカメラを再試行</button>}
      {cameraFailed && <p className="iosCameraHelp">設定 → Safari（または使用中のアプリ）→ カメラ → 許可後、「再試行」を押してください。</p>}
      <details className="manualScan"><summary>管理番号を手入力する</summary><div><input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") resolve(code); }} placeholder="例：HZ-2CE1D46BD51220" inputMode="text" autoCapitalize="characters"/><button className="primary" onClick={() => resolve(code)} disabled={!code.trim()}>品目を開く</button></div></details>
    </section>
  </section></div>;
}

function OrderModal({ item, history, close, save, submit }: { item: Item; history: Order[]; close: () => void; save: (item: Item) => Promise<void>; submit: (item: Item, quantity: number, purchaser: string, orderNote: string) => Promise<void> }) {
  const previousQuantity = [...history].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime())[0]?.qty;
  const [draft, setDraft] = useState(item);
  const [quantityText, setQuantityText] = useState(String(Math.max(1, previousQuantity ?? item.qty)));
  const [purchaser, setPurchaser] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingOnly, setSavingOnly] = useState(false);
  const quantity = Number(quantityText);
  const quantityValid = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10_000;
  const editedItem = () => ({ ...draft, code: draft.code.trim(), name: draft.name.trim(), qty: quantity });
  const saveOnly = async () => {
    if (!draft.code.trim() || !draft.name.trim() || !quantityValid || savingOnly || submitting) return;
    setSavingOnly(true);
    try { await save(editedItem()); }
    catch { setSavingOnly(false); }
  };
  const confirm = async () => {
    if (!draft.code.trim() || !draft.name.trim() || !purchaser.trim() || !quantityValid || submitting || savingOnly) return;
    setSubmitting(true);
    try { await submit(editedItem(), quantity, purchaser, orderNote); }
    catch { setSubmitting(false); }
  };
  return <div className="modalBackdrop" onClick={close}><section className="orderModal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">ORDER ITEM</p><label className="orderEditableName">品名（必須）<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={200}/></label><label className="orderEditableCode">品番（必須）<input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} maxLength={100}/><span>{item.category}</span></label><label>発注点<input value={draft.orderPoint} onChange={(event) => setDraft({ ...draft, orderPoint: event.target.value })} maxLength={100}/></label><dl><div><dt>備考</dt><dd>{item.memo}</dd></div></dl>{history.length > 0 && <section className="previousOrders"><h3>前回までの発注履歴</h3>{history.slice(0, 3).map((order, index) => <article key={order.orderId}><div><b>{index === 0 ? "前回" : `${index + 1}回前`}</b><span>{formatOrderDate(order.orderedAt)}</span></div><strong>{order.qty}{order.unit}</strong><small>{order.purchaser} ・ {order.status}</small>{order.orderNote && <p className="historyOrderNote">発注メモ：{order.orderNote}</p>}</article>)}</section>}<label>発注者名（必須）<input autoFocus value={purchaser} onChange={(event) => setPurchaser(event.target.value)} placeholder="氏名を入力" maxLength={100}/></label><label>発注用メモ（任意）<textarea className="orderNoteInput" value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="納期・購入先・連絡事項など" maxLength={500}/></label><label>発注数量<div className="quantity"><button aria-label="数量を減らす" onClick={() => setQuantityText(String(Math.max(1, (Number(quantityText) || 1) - 1)))}>−</button><input type="number" min="1" max="10000" value={quantityText} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setQuantityText(event.target.value); }}/><span>{item.unit}</span><button aria-label="数量を増やす" onClick={() => setQuantityText(String(Math.min(10_000, (Number(quantityText) || 0) + 1)))}>＋</button></div></label><button className="outline wide" disabled={savingOnly || submitting || !quantityValid || !draft.code.trim() || !draft.name.trim()} onClick={() => void saveOnly()}>{savingOnly ? "保存中…" : "変更だけ保存"}</button><button className="primary wide" disabled={submitting || savingOnly || !quantityValid || !purchaser.trim() || !draft.code.trim() || !draft.name.trim()} onClick={() => void confirm()}>{submitting ? "保存・発注中…" : "この内容で発注する"}</button></section></div>;
}

function OrderEditModal({ order, close, save }: { order: Order; close: () => void; save: (order: Order) => Promise<void> }) {
  const [draft, setDraft] = useState(order);
  const [quantityText, setQuantityText] = useState(String(order.qty));
  const [saving, setSaving] = useState(false);
  const quantity = Number(quantityText);
  const quantityValid = /^\d+$/.test(quantityText) && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10_000;
  const requiredValid = Boolean(String(draft.code).trim() && String(draft.name).trim() && String(draft.unit).trim() && String(draft.orderPoint).trim() && String(draft.purchaser).trim());
  const update = <K extends keyof Order>(key: K, value: Order[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!quantityValid || !requiredValid || saving) return;
    setSaving(true);
    try { await save({ ...draft, qty: quantity }); }
    finally { setSaving(false); }
  };
  return <div className="modalBackdrop" onClick={close}><section className="orderModal orderEditModal" onClick={(event) => event.stopPropagation()}>
    <button className="close" onClick={close}>×</button><p className="eyebrow">EDIT ORDER</p><h2>発注内容を編集</h2>
    <p className="orderEditStatus">状態：<b>{order.status}</b></p>
    <label>品番（必須）<input autoFocus value={draft.code} onChange={(event) => update("code", event.target.value)} maxLength={100}/></label>
    <label>品名（必須）<input value={draft.name} onChange={(event) => update("name", event.target.value)} maxLength={200}/></label>
    <div className="editorTwo"><label>カテゴリ<input value={draft.category} onChange={(event) => update("category", event.target.value)} maxLength={100}/></label><label>単位（必須）<input value={draft.unit} onChange={(event) => update("unit", event.target.value)} maxLength={30}/></label></div>
    <div className="editorTwo"><label>発注数量（必須）<input type="number" min="1" max="10000" value={quantityText} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setQuantityText(event.target.value); }}/></label><label>発注点（必須）<input value={draft.orderPoint} onChange={(event) => update("orderPoint", event.target.value)} maxLength={100}/></label></div>
    <label>発注者（必須）<input value={draft.purchaser} onChange={(event) => update("purchaser", event.target.value)} maxLength={100}/></label>
    <label>備考<textarea value={draft.memo} onChange={(event) => update("memo", event.target.value)} maxLength={500}/></label>
    <label>発注用メモ<textarea className="orderNoteInput" value={draft.orderNote} onChange={(event) => update("orderNote", event.target.value)} maxLength={500}/></label>
    <button className="primary wide" disabled={saving || !quantityValid || !requiredValid} onClick={() => void submit()}>{saving ? "保存中…" : "変更を保存"}</button>
  </section></div>;
}

function formatOrderDate(value: string) {
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function ItemEditor({ item, close, save }: { item: Item | null; close: () => void; save: (item: Item, isNew: boolean) => Promise<void> }) {
  const isNew = !item;
  const [draft, setDraft] = useState<Item>(item ?? { id: "", code: "", name: "", category: "", unit: "個", qty: 1, orderPoint: "1", boardNumber: 0, location: "", memo: "" });
  const [quantityText, setQuantityText] = useState(String(item?.qty ?? 1));
  const [saving, setSaving] = useState(false);
  const quantity = Number(quantityText);
  const quantityValid = /^\d+$/.test(quantityText) && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10_000;
  const update = (key: keyof Item, value: string | number) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!draft.code.trim() || !draft.name.trim() || !quantityValid) return;
    setSaving(true);
    try { await save({ ...draft, qty: quantity }, isNew); } catch (error) { showRequestError(error); setSaving(false); }
  };
  return <div className="modalBackdrop" onClick={close}><section className="orderModal itemEditor" onClick={(event) => event.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">MASTER ITEM</p><h2>{isNew ? "新規品目登録" : "品目を編集"}</h2><label>品番（必須）<input autoFocus value={draft.code} onChange={(event) => update("code", event.target.value)} /></label><label>品名（必須）<input value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>カテゴリ<input value={draft.category} onChange={(event) => update("category", event.target.value)} /></label><div className="editorTwo"><label>発注数量<input type="number" min="1" max="10000" value={quantityText} onChange={(event) => { if (/^\d*$/.test(event.target.value)) setQuantityText(event.target.value); }} /></label><label>発注点<input value={draft.orderPoint} onChange={(event) => update("orderPoint", event.target.value)} maxLength={100} /></label></div><label>単位<input value={draft.unit} onChange={(event) => update("unit", event.target.value)} /></label><label>備考<textarea value={draft.memo} onChange={(event) => update("memo", event.target.value)} /></label><button className="primary wide" disabled={saving || !draft.code.trim() || !draft.name.trim() || !quantityValid} onClick={() => void submit()}>{saving ? "保存中…" : isNew ? "この品目を登録" : "変更を保存"}</button></section></div>;
}

function AccessGate({ access, refresh }: { access: AccessState; refresh: () => Promise<void> }) {
  const requestAgain = async () => {
    await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request" }) });
    await refresh();
  };
  return <main className="accessGate"><section>
    <div className="brand accessBrand"><span className="brandLogo"/><div className="brandControl"><span>MATERIAL ORDER CONTROL</span><strong>日の出製作所</strong></div></div>
    <p className="eyebrow">ACCOUNT ACCESS</p>
    <h1>{access.status === "rejected" ? "アクセスは許可されていません" : access.status === "loading" ? "本人確認中…" : "アクセス承認待ち"}</h1>
    {access.user && <p className="accessIdentity">{access.user.name}<small>{access.user.email}</small></p>}
    {access.status === "pending" && <p>管理者がアクセスを許可すると、この画面から発注システムを利用できるようになります。</p>}
    {access.status === "rejected" && <button className="primary wide" onClick={() => void requestAgain()}>もう一度アクセスを申請</button>}
    {access.status === "pending" && <button className="outline wide" onClick={() => void refresh()}>承認状況を確認</button>}
    {access.status === "signed_out" && <a className="primary accessSignIn" href="/signin-with-chatgpt?return_to=%2F">ChatGPTで本人確認</a>}
  </section></main>;
}

function SettingsPanel({ settings, setSettings, pushStatus, enableNotifications, access, updateAccountAccess, close, save }: { settings: typeof defaultSettings; setSettings: React.Dispatch<React.SetStateAction<typeof defaultSettings>>; pushStatus: string; enableNotifications: () => Promise<void>; access: AccessState; updateAccountAccess: (email: string, action: "approve" | "reject" | "revoke") => Promise<void>; close: () => void; save: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof defaultSettings, value: string | number | boolean) => setSettings((s) => ({ ...s, [key]: value }));
  return <div className="drawerBackdrop" onClick={close}><aside className="settingsDrawer" onClick={(e) => e.stopPropagation()}><div className="drawerHead"><div><p className="eyebrow">CUSTOMIZE</p><h2>詳細設定</h2></div><button className="close" onClick={close}>×</button></div>
    <fieldset><legend>表示とレイアウト</legend><label>システム名<input value={settings.siteName} onChange={(e) => update("siteName", e.target.value)} /></label><label>アクセントカラー<input type="color" value={settings.accent} onChange={(e) => update("accent", e.target.value)} /></label><label>表示密度<select value={settings.density} onChange={(e) => update("density", e.target.value)}><option value="comfortable">ゆったり</option><option value="compact">コンパクト</option></select></label><label>カード列数<input type="range" min="1" max="4" value={settings.cardColumns} onChange={(e) => update("cardColumns", Number(e.target.value))}/><b>{settings.cardColumns}列</b></label><Check label="備考を表示" value={settings.showMemo} change={(v) => update("showMemo", v)}/><Check label="iPad全画面モード" value={settings.ipadFullscreen} change={(v) => update("ipadFullscreen", v)}/></fieldset>
    <fieldset><legend>発注フロー</legend><label>発注待ちの表示名<input value={settings.orderLabel} onChange={(e) => update("orderLabel", e.target.value)} /></label><label>入荷待ちの表示名<input value={settings.arrivalLabel} onChange={(e) => update("arrivalLabel", e.target.value)} /></label><label>完了の表示名<input value={settings.doneLabel} onChange={(e) => update("doneLabel", e.target.value)} /></label><label>初期発注数量<input type="number" min="1" value={settings.defaultQty} onChange={(e) => update("defaultQty", Number(e.target.value))}/></label><Check label="新規発注を通知" value={settings.notifyNew} change={(v) => update("notifyNew", v)}/><Check label="入荷を通知" value={settings.notifyArrival} change={(v) => update("notifyArrival", v)}/></fieldset>
    <fieldset><legend>QR看板・印刷</legend><label>列数<input type="number" min="1" max="4" value={settings.boardColumns} onChange={(e) => update("boardColumns", Number(e.target.value))}/></label><label>行数<input type="number" min="1" max="8" value={settings.boardRows} onChange={(e) => update("boardRows", Number(e.target.value))}/></label><div className="two"><label>幅 mm<input type="number" value={settings.boardWidth} onChange={(e) => update("boardWidth", Number(e.target.value))}/></label><label>高さ mm<input type="number" value={settings.boardHeight} onChange={(e) => update("boardHeight", Number(e.target.value))}/></label></div></fieldset>
    <fieldset><legend>親機通知</legend><button className="outline wide" type="button" onClick={() => void enableNotifications()}>● {pushStatus}</button></fieldset>
    {access.isOwner && <fieldset className="accountSettings"><legend>アカウント</legend><p>アクセス申請</p>{access.accounts.filter((account) => account.status === "pending").length === 0 ? <small>現在、承認待ちの申請はありません。</small> : access.accounts.filter((account) => account.status === "pending").map((account) => <article key={account.email}><div><b>{account.name || account.email}</b><small>{account.email}</small><small>申請：{formatOrderDate(account.requestedAt)}</small></div><div><button className="outline" onClick={() => void updateAccountAccess(account.email, "reject").catch(showRequestError)}>拒否</button><button className="primary" onClick={() => void updateAccountAccess(account.email, "approve").catch(showRequestError)}>許可</button></div></article>)}<p>アクセス許可済み</p>{access.accounts.filter((account) => account.status === "approved").map((account) => <article key={account.email}><div><b>{account.name || account.email}</b><small>{account.email}</small><small>最終アクセス：{formatOrderDate(account.lastSeenAt)}</small></div>{account.email !== "renbou12040@gmail.com" && <button className="outline" onClick={() => void updateAccountAccess(account.email, "revoke").catch(showRequestError)}>許可を解除</button>}</article>)}</fieldset>}
    <div className="drawerActions"><button className="outline" onClick={() => setSettings(defaultSettings)}>初期値に戻す</button><button className="primary saveSettingsButton" disabled={saving} onClick={async () => { setSaving(true); try { await save(); } catch (error) { showRequestError(error); setSaving(false); } }}>{saving ? "保存中…" : "設定を保存"}</button></div>
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

async function persistSettings(settings: typeof defaultSettings) {
  window.localStorage.setItem("device-settings", JSON.stringify(settings));
  const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settings", settings }) });
  if (response.ok || response.status === 401) return;
  const data = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(data?.error ?? "設定を保存できませんでした。");
}

function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP")
    .replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60))
    .replace(/[‐‑‒–—―ーｰ]/g, "-")
    .replace(/[×✕＊*]/g, "x")
    .replace(/[・･,，、/／\\|｜()（）［\][\]{}｛｝:：]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function matchesSearch(query: string, values: Array<string | number | null | undefined>) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const searchable = normalizeSearch(values.filter((value) => value !== null && value !== undefined).join(" "));
  const compactSearchable = searchable.replace(/[\s-]/g, "");
  return terms.every((term) => searchable.includes(term) || compactSearchable.includes(term.replace(/[\s-]/g, "")));
}

function compareItems(a: Item, b: Item, sort: "newest" | "oldest" | "code" | "name") {
  if (sort === "code") return a.code.localeCompare(b.code, "ja", { numeric: true, sensitivity: "base" }) || a.boardNumber - b.boardNumber;
  if (sort === "name") return a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" }) || a.boardNumber - b.boardNumber;
  const aDate = a.createdAt ?? "2026-01-01T00:00:00.000Z";
  const bDate = b.createdAt ?? "2026-01-01T00:00:00.000Z";
  return sort === "oldest"
    ? aDate.localeCompare(bDate) || a.boardNumber - b.boardNumber
    : bDate.localeCompare(aDate) || b.boardNumber - a.boardNumber;
}

function readPrintQueue() {
  try {
    const value = JSON.parse(window.localStorage.getItem("partial-print-queue") ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
  } catch { return []; }
}

function writePrintQueue(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  window.localStorage.setItem("partial-print-queue", JSON.stringify(uniqueIds));
  window.dispatchEvent(new CustomEvent("print-queue-change", { detail: uniqueIds }));
}

function isIPhone() {
  return /iPhone/i.test(navigator.userAgent);
}

function isIPad() {
  return /iPad/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function printQrBoards() {
  const startedAt = Date.now();
  const deadline = startedAt + 15_000;
  let fallbackStarted = false;
  while (Date.now() < deadline) {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".integratedPrintBoards .fakeQr"));
    const incomplete = images.filter((image) => !image.complete || image.naturalWidth === 0);
    if (images.length > 0 && incomplete.length === 0) {
      await document.fonts?.ready;
      window.print();
      return true;
    }
    if (!fallbackStarted && Date.now() - startedAt >= 3_000) {
      fallbackStarted = true;
      await Promise.all(incomplete.map((image) => useGeneratedQr(image, image.dataset.itemId ?? "")));
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  window.alert("QRコードの準備が完了しませんでした。通信状態を確認して、もう一度印刷してください。");
  return false;
}

function urlBase64ToArrayBuffer(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return bytes.buffer;
}
