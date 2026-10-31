"use client";

import { useEffect, useState } from "react";
import type { Net } from "@/lib/net/engine";
import { isIp, parseCidr, validAclAddr } from "@/lib/net/ip";
import { ipconfig, showAcls, showArp, showIpIntBrief, showIpRoute, showMacTable, showSpanningTree, showVlanBrief } from "@/lib/net/show";
import type { Device, Topology } from "@/lib/net/types";

type Mutate = (fn: (t: Topology) => void) => void;

/** Text input that only commits valid values, on Enter or blur. */
function Field({ value, valid, onCommit, placeholder, width = 150 }: { value: string; valid: (s: string) => boolean; onCommit: (s: string) => void; placeholder?: string; width?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ok = valid(v);
  const commit = () => {
    if (ok && v !== value) onCommit(v);
    if (!ok) setV(value);
  };
  return (
    <input
      className={`wf ${ok ? "" : "bad"}`}
      style={{ width }}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      spellCheck={false}
    />
  );
}

const vlanList = (s: string) => s.trim() === "all" || /^\d{1,4}(,\d{1,4})*$/.test(s.replace(/\s/g, ""));
const cidrOk = (s: string) => parseCidr(s) !== null;

function views(net: Net, d: Device, vlan: number): { key: string; label: string; text: () => string }[] {
  if (net.isHost(d))
    return [
      { key: "ipconfig", label: "ipconfig", text: () => ipconfig(net, d.id) },
      { key: "arp", label: "arp -a", text: () => showArp(net, d.id) },
    ];
  const out = [{ key: "brief", label: "show ip int brief", text: () => showIpIntBrief(net, d.id) }];
  if (net.isSwitch(d)) {
    out.push({ key: "vlan", label: "show vlan brief", text: () => showVlanBrief(net, d.id) });
    out.push({ key: "mac", label: "show mac address-table", text: () => showMacTable(net, d.id) });
    out.push({ key: "stp", label: `show spanning-tree vlan ${vlan}`, text: () => showSpanningTree(net, d.id, vlan) });
  }
  if (d.kind !== "switch") {
    out.push({ key: "route", label: "show ip route", text: () => showIpRoute(net, d.id) });
    out.push({ key: "arp", label: "show ip arp", text: () => showArp(net, d.id) });
  }
  if (d.acls) out.push({ key: "acl", label: "show access-lists", text: () => showAcls(net, d.id) });
  return out;
}

export function WireInspector({ net, devId, vlan, mutate, tick }: { net: Net; devId: string; vlan: number; mutate: Mutate; tick: number }) {
  const d = net.device(devId);
  const [tab, setTab] = useState<"state" | "config">("state");
  const vs = views(net, d, vlan);
  const [view, setView] = useState(vs[0].key);
  const active = vs.find((v) => v.key === view) ?? vs[0];
  const edit = (fn: (dev: Device) => void) => mutate((t) => fn(t.devices.find((x) => x.id === devId)!));

  return (
    <aside className="wire-inspector" aria-label={`${d.id} inspector`}>
      <div className="wi-head">
        <div>
          <span className="silk">{d.kind === "l3switch" ? "layer 3 switch" : d.kind}</span>
          <h3 className="display" style={{ margin: "2px 0 0" }}>
            {d.id}
          </h3>
        </div>
        <div className="radio-sw">
          <button className={tab === "state" ? "on" : ""} onClick={() => setTab("state")}>
            State
          </button>
          <button className={tab === "config" ? "on" : ""} onClick={() => setTab("config")}>
            Configure
          </button>
        </div>
      </div>

      {tab === "state" ? (
        <>
          <div className="wi-views">
            {vs.map((v) => (
              <button key={v.key} className={`chip ${v.key === active.key ? "on" : ""}`} onClick={() => setView(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
          <pre className="cli wi-out" key={tick}>
            {d.id}
            {net.isHost(d) ? "> " : "# "}
            {active.label}
            {"\n"}
            {active.text()}
          </pre>
        </>
      ) : (
        <div className="wi-config">
          <p className="silk" style={{ margin: "0 0 10px" }}>
            Quick config. Changes apply instantly and flush MAC/ARP tables.
          </p>

          {net.isHost(d) && (
            <table className="wt">
              <tbody>
                <tr>
                  <th>IP / prefix</th>
                  <td>
                    <Field value={d.ports[0].ip ?? ""} valid={cidrOk} onCommit={(v) => edit((x) => (x.ports[0].ip = v))} />
                  </td>
                </tr>
                <tr>
                  <th>Gateway</th>
                  <td>
                    <Field value={d.gateway ?? ""} valid={(s) => s === "" || isIp(s)} onCommit={(v) => edit((x) => (x.gateway = v || undefined))} />
                  </td>
                </tr>
                <tr>
                  <th>NIC</th>
                  <td>
                    <Toggle on={!d.ports[0].shutdown} onChange={(on) => edit((x) => (x.ports[0].shutdown = !on))} />
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {net.isSwitch(d) && (
            <div className="wi-row">
              <span className="silk">STP priority</span>
              <select className="wf" value={d.stpPriority ?? 32768} onChange={(e) => edit((x) => (x.stpPriority = Number(e.target.value)))}>
                {Array.from({ length: 16 }, (_, i) => i * 4096).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!net.isHost(d) && (
            <table className="wt">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Up</th>
                  {net.isSwitch(d) && <th>Mode</th>}
                  <th>Setting</th>
                </tr>
              </thead>
              <tbody>
                {d.ports.map((p, i) => {
                  const mode = net.portMode(d, p);
                  return (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>
                        <Toggle on={!p.shutdown} onChange={(on) => edit((x) => (x.ports[i].shutdown = !on))} />
                      </td>
                      {net.isSwitch(d) && (
                        <td>
                          <select
                            className="wf"
                            value={mode}
                            onChange={(e) =>
                              edit((x) => {
                                x.ports[i].mode = e.target.value as "access" | "trunk" | "routed";
                              })
                            }
                          >
                            <option value="access">access</option>
                            <option value="trunk">trunk</option>
                            {d.kind === "l3switch" && <option value="routed">routed</option>}
                          </select>
                        </td>
                      )}
                      <td>
                        {mode === "access" && (
                          <label className="wl">
                            vlan <Field width={56} value={String(p.vlan ?? 1)} valid={(s) => /^\d{1,4}$/.test(s) && +s >= 1 && +s <= 4094} onCommit={(v) => edit((x) => (x.ports[i].vlan = Number(v)))} />
                          </label>
                        )}
                        {mode === "trunk" && (
                          <label className="wl">
                            allowed{" "}
                            <Field
                              width={110}
                              value={p.allowed ? p.allowed.join(",") : "all"}
                              valid={vlanList}
                              onCommit={(v) => edit((x) => (x.ports[i].allowed = v.trim() === "all" ? undefined : v.replace(/\s/g, "").split(",").map(Number)))}
                            />
                          </label>
                        )}
                        {mode === "routed" && <Field width={130} value={p.ip ?? ""} valid={(s) => s === "" || cidrOk(s)} onCommit={(v) => edit((x) => (x.ports[i].ip = v || undefined))} placeholder="10.0.0.1/30" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {d.kind === "l3switch" && (
            <table className="wt">
              <thead>
                <tr>
                  <th>SVI</th>
                  <th>Up</th>
                  <th>IP / prefix</th>
                </tr>
              </thead>
              <tbody>
                {(d.svis ?? []).map((s, i) => (
                  <tr key={s.vlan}>
                    <td>Vlan{s.vlan}</td>
                    <td>
                      <Toggle on={!s.shutdown} onChange={(on) => edit((x) => (x.svis![i].shutdown = !on))} />
                    </td>
                    <td>
                      <Field width={130} value={s.ip} valid={cidrOk} onCommit={(v) => edit((x) => (x.svis![i].ip = v))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(d.kind === "router" || d.kind === "l3switch") && <Routes d={d} edit={edit} />}
          {d.acls && <Acls d={d} edit={edit} />}
        </div>
      )}
    </aside>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className={`toggle ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span />
      {on ? "no shut" : "shut"}
    </button>
  );
}

function Routes({ d, edit }: { d: Device; edit: (fn: (dev: Device) => void) => void }) {
  const [prefix, setPrefix] = useState("");
  const [via, setVia] = useState("");
  const ok = cidrOk(prefix) && isIp(via);
  return (
    <div className="wi-block">
      <span className="silk">Static routes</span>
      {(d.routes ?? []).map((r, i) => (
        <div className="wi-row" key={`${r.prefix}-${r.via}`}>
          <code className="inline-code">
            ip route {r.prefix} {r.via}
          </code>
          <button className="sw" style={{ padding: "1px 7px" }} onClick={() => edit((x) => x.routes!.splice(i, 1))} aria-label={`Remove route ${r.prefix}`}>
            ✕
          </button>
        </div>
      ))}
      <form
        className="wi-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          edit((x) => (x.routes = [...(x.routes ?? []), { prefix, via }]));
          setPrefix("");
          setVia("");
        }}
      >
        <input className={`wf ${prefix && !cidrOk(prefix) ? "bad" : ""}`} style={{ width: 130 }} placeholder="10.20.20.0/24" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        <input className={`wf ${via && !isIp(via) ? "bad" : ""}`} style={{ width: 100 }} placeholder="via 10.0.0.1" value={via} onChange={(e) => setVia(e.target.value)} />
        <button className="sw" disabled={!ok}>
          Add
        </button>
      </form>
    </div>
  );
}

function Acls({ d, edit }: { d: Device; edit: (fn: (dev: Device) => void) => void }) {
  return (
    <>
      {Object.entries(d.acls ?? {}).map(([name, aces]) => (
        <div className="wi-block" key={name}>
          <span className="silk">ACL {name}</span>
          {aces.map((a, i) => (
            <div className="wi-row" key={i}>
              <span className="silk" style={{ width: 22 }}>
                {(i + 1) * 10}
              </span>
              <select className="wf" value={a.action} onChange={(e) => edit((x) => (x.acls![name][i].action = e.target.value as "permit" | "deny"))}>
                <option>permit</option>
                <option>deny</option>
              </select>
              <span className="silk">{a.proto}</span>
              <Field width={96} value={a.src} valid={validAclAddr} onCommit={(v) => edit((x) => (x.acls![name][i].src = v))} />
              <Field width={96} value={a.dst} valid={validAclAddr} onCommit={(v) => edit((x) => (x.acls![name][i].dst = v))} />
            </div>
          ))}
          <p className="silk" style={{ margin: "4px 0 0" }}>
            Addresses: any · host 1.2.3.4 · 10.0.0.0/8. Implicit deny at the end.
          </p>
        </div>
      ))}
    </>
  );
}
