"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { dateTime } from "../../lib/format";
import { api as baseApi } from "../../lib/api";
import { api } from "../api";
import { Modal } from "../../sales/ui";

/** 客户位置（Web 端客户位置功能开发文档 V1.0）：单一数据源 Customer，Web 与未来小程序读写同一份。 */

type LocationSource = "address_search" | "map_click" | "map_drag" | "web_manual" | "miniapp";
type LatLng = { latitude: number; longitude: number };
type Draft = LatLng & { source: LocationSource };
type LocationView = {
  customer_id: string;
  company_address: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinate_system: string | null;
  location_status: "unset" | "located" | "needs_review";
  location_source: LocationSource | null;
  location_updated_at: string | null;
  location_updated_by: { id: string; display_name: string } | null;
};
type MapConfig = { enabled: boolean; web_key: string | null };
type GeocodeResult = { address: string; latitude: number; longitude: number; coordinate_system: string };

declare global {
  interface Window {
    TMap?: {
      Map: new (dom: HTMLElement, options: { center: unknown; zoom: number }) => {
        on: (event: string, handler: (e: { latLng?: unknown; geometry?: { position?: unknown } }) => void) => void;
        setCenter: (position: unknown) => void;
        setZoom: (zoom: number) => void;
        destroy: () => void;
      };
      LatLng: new (lat: number, lng: number) => unknown;
      MultiMarker: new (options: { map: unknown; geometries: { id: string; position: unknown; draggable?: boolean }[] }) => {
        updateGeometries: (geometries: { id: string; position: unknown }[]) => void;
      };
    };
  }
}

type TMapNS = NonNullable<Window["TMap"]>;

// SDK 脚本只加载一次；Key 固定来自服务端 /api/map/config。
let sdkPromise: Promise<void> | null = null;
function loadMapSdk(key: string): Promise<void> {
  if (window.TMap) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { sdkPromise = null; reject(new Error("地图脚本加载失败")); };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

function useMapConfig(): { config: MapConfig | null; error: string } {
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    baseApi<MapConfig>("/api/map/config").then(c => { if (live) setConfig(c); }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, []);
  return { config, error };
}

// 未配置 Key / SDK 加载失败 / 供应商异常时位置卡与详情页都必须可用（文档第 28 节）。
const MAP_UNAVAILABLE = "地图暂时无法加载，请稍后重试。";
// 无已存位置时的中性画布中心（济南）；仅用于展示，禁止被当作客户位置保存。
const FALLBACK_CENTER = { latitude: 36.675, longitude: 117.12 };

/** 纯地图交互：初始化、Marker、点击选点、拖拽校正；不感知 CRM 业务。 */
function TencentMapPicker({ mapKey, editable, center, position, onPick, onLoadError }: {
  mapKey: string;
  editable: boolean;
  center: LatLng;
  position: LatLng | null;
  onPick: (p: LatLng, source: "map_click" | "map_drag") => void;
  onLoadError: () => void;
}) {
  const domRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<TMapNS["Map"]> | null>(null);
  const markerRef = useRef<InstanceType<TMapNS["MultiMarker"]> | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let live = true;
    // 等 Modal 的 showModal 生效（父组件 effect）后再初始化，否则容器尺寸为 0。
    const timer = window.setTimeout(() => {
      const dom = domRef.current;
      if (!live || !dom) return;
      loadMapSdk(mapKey).then(() => {
        const TMap = window.TMap;
        if (!live || !TMap || !domRef.current) return;
        const map = new TMap.Map(domRef.current, { center: new TMap.LatLng(center.latitude, center.longitude), zoom: position ? 16 : 12 });
        mapRef.current = map;
        if (editable) {
          map.on("click", e => {
            const latLng = e.latLng as { lat: number; lng: number } | undefined;
            if (latLng) onPickRef.current({ latitude: latLng.lat, longitude: latLng.lng }, "map_click");
          });
          map.on("markerDragend", e => {
            const pos = e.geometry?.position as { lat: number; lng: number } | undefined;
            if (pos) onPickRef.current({ latitude: pos.lat, longitude: pos.lng }, "map_drag");
          });
        }
      }).catch(onLoadError);
    }, 0);
    return () => { live = false; clearTimeout(timer); mapRef.current?.destroy(); mapRef.current = null; markerRef.current = null; };
    // 仅在挂载时初始化一次；position 变化由下方 effect 同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, editable]);

  useEffect(() => {
    if (!position || !mapRef.current) return;
    const TMap = window.TMap;
    if (!TMap) return;
    const target = new TMap.LatLng(position.latitude, position.longitude);
    if (!markerRef.current) {
      markerRef.current = new TMap.MultiMarker({ map: mapRef.current, geometries: [{ id: "customer", position: target, draggable: editable }] });
    } else {
      markerRef.current.updateGeometries([{ id: "customer", position: target }]);
    }
    mapRef.current.setCenter(target);
    mapRef.current.setZoom(16);
  }, [position, editable]);

  return <div ref={domRef} className="loc-map" aria-label="地图" role="application" />;
}

/** 查看位置：只读 Modal，Marker 不可拖动、无表单。 */
function LocationViewer({ customerName, position, close }: {
  customerName: string; position: LatLng; close: () => void;
}) {
  const { config, error } = useMapConfig();
  const [mapError, setMapError] = useState(false);
  const mapReady = !!config?.enabled && !!config.web_key && !mapError;
  return (
    <Modal title={customerName} close={close} wide>
      <div className="loc-modal-body">
        {mapReady
          ? <TencentMapPicker mapKey={config!.web_key!} editable={false} center={position} position={position} onPick={() => { }} onLoadError={() => setMapError(true)} />
          : <p role="status" className="error">{error || MAP_UNAVAILABLE}</p>}
        <p className="loc-coords">经纬度：{position.latitude.toFixed(7)}, {position.longitude.toFixed(7)}</p>
      </div>
    </Modal>
  );
}

/** 设置/修改位置：地址搜索 + 点击选点 + 拖拽校正；搜索结果不直接保存。 */
function LocationEditor({ customerId, customerName, companyAddress, existing, close, onSaved }: {
  customerId: string;
  customerName: string;
  companyAddress: string;
  existing: LatLng | null;
  close: () => void;
  onSaved: (loc: LocationView) => void;
}) {
  const { config, error: configError } = useMapConfig();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState(companyAddress);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const mapReady = !!config?.enabled && !!config.web_key;

  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true); setSearchError("");
    try {
      const r = await baseApi<GeocodeResult>(`/api/map/geocode?address=${encodeURIComponent(q.trim())}`);
      setDraft({ latitude: r.latitude, longitude: r.longitude, source: "address_search" });
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setSaveError("");
    try {
      const loc = await api<LocationView>(`/customers/${customerId}/location`, "PUT", {
        latitude: draft.latitude, longitude: draft.longitude,
        coordinate_system: "GCJ-02", location_source: draft.source,
      });
      onSaved(loc);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="设置客户位置" close={close} wide locked={saving}>
      <div className="loc-modal-body">
        <p className="muted">{customerName}</p>
        {!config && !configError && <p role="status">正在加载地图配置…</p>}
        {!mapReady && <p role="alert" className="error">{configError || MAP_UNAVAILABLE}</p>}
        {mapReady && <>
          <form className="loc-search" onSubmit={search}>
            <label>地址搜索<input value={q} maxLength={255} onChange={e => setQ(e.target.value)} placeholder="输入地址关键词，如：济南市历下区工业南路88号" /></label>
            <button type="submit" disabled={searching}>{searching ? "搜索中…" : "搜索"}</button>
          </form>
          {searchError && <p role="alert" className="error">{searchError}</p>}
          <TencentMapPicker mapKey={config!.web_key!} editable center={existing ?? FALLBACK_CENTER} position={draft} onPick={(p, source) => setDraft({ ...p, source })} onLoadError={() => setSearchError(MAP_UNAVAILABLE)} />
          <p className="loc-coords">当前坐标：{draft ? `纬度 ${draft.latitude.toFixed(7)} · 经度 ${draft.longitude.toFixed(7)}` : "尚未选择"}</p>
          <p className="muted">提示：可点击地图或拖动标记精确调整客户位置；搜索结果需确认后才会保存。</p>
          {saveError && <p role="alert" className="error">{saveError}</p>}
          <div className="loc-footer">
            <button type="button" onClick={close} disabled={saving}>取消</button>
            <button type="button" className="sales-primary" disabled={!draft || saving} onClick={save}>{saving ? "保存中…" : "保存位置"}</button>
          </div>
        </>}
      </div>
    </Modal>
  );
}

/** 客户详情位置摘要卡：默认只显示摘要，需要时再打开地图（文档第 31 节）。 */
export function CustomerLocationCard({ customerId, customerName, companyAddress, canEdit, setNotice }: {
  customerId: string;
  customerName: string;
  companyAddress: string | null;
  canEdit: boolean;
  setNotice: (v: string) => void;
}) {
  const [loc, setLoc] = useState<LocationView | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"viewer" | "editor" | null>(null);
  useEffect(() => {
    let live = true;
    setLoc(null); setFailed(false); setView(null);
    api<LocationView>(`/customers/${customerId}/location`)
      .then(l => { if (live) setLoc(l); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [customerId]);
  const located = loc?.location_status === "located" && loc.latitude != null && loc.longitude != null;
  const onSaved = useCallback((next: LocationView) => { setLoc(next); setView(null); setNotice("客户位置已更新"); }, [setNotice]);
  return (
    <section className="cd-card" aria-label="客户位置">
      <header><h3>客户位置</h3>
        <span className="cd-loc-actions">
          {located && <button onClick={() => setView("viewer")}>查看位置</button>}
          {canEdit && <button onClick={() => setView("editor")}>{located ? "修改位置" : "设置位置"}</button>}
        </span>
      </header>
      <dl className="cd-info">
        <div><dt>公司地址</dt><dd>{companyAddress || "未填写"}</dd></div>
        <div><dt>地图位置</dt><dd>{failed ? "位置信息暂时无法加载，请稍后重试。" : located ? <span className="cd-tag status">已定位</span> : "尚未设置"}</dd></div>
        {located && <div className="weak"><dt>最后更新</dt><dd>{loc!.location_updated_at ? dateTime(loc!.location_updated_at) : ""}{loc!.location_updated_by ? ` · ${loc!.location_updated_by.display_name}` : ""}</dd></div>}
      </dl>
      {view === "viewer" && located && <LocationViewer customerName={customerName} position={{ latitude: loc!.latitude!, longitude: loc!.longitude! }} close={() => setView(null)} />}
      {view === "editor" && <LocationEditor customerId={customerId} customerName={customerName} companyAddress={companyAddress || ""} existing={located ? { latitude: loc!.latitude!, longitude: loc!.longitude! } : null} close={() => setView(null)} onSaved={onSaved} />}
    </section>
  );
}
