"use client";

import { useId, useMemo, useState } from "react";
import { formatINRCompact, formatNumber, formatINR } from "@/lib/format";

/**
 * Lightweight SVG charts (no chart library). Single-series forms use one validated hue
 * (series-1). Every chart has a hover tooltip and a "Show data" table view.
 */
export type Point = { label: string; value: number };
type Fmt = "inr" | "number" | "percent";

const SERIES = "#2a78d6";
const GRID = "#e8ebf0";
const AXIS_TEXT = "#5b6577";

const fmtShort = (v: number, f: Fmt) => (f === "inr" ? formatINRCompact(v) : f === "percent" ? `${v}%` : formatNumber(Math.round(v)));
const fmtLong = (v: number, f: Fmt) => (f === "inr" ? formatINR(v) : f === "percent" ? `${v}%` : formatNumber(Math.round(v)));

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function DataTableView({ data, format, label }: { data: Point[]; format: Fmt; label: string }) {
  return (
    <details className="mt-2 text-[12px] text-slate-500">
      <summary className="cursor-pointer select-none hover:text-ink-900">Show data</summary>
      <table className="mt-2 w-full">
        <caption className="sr-only">{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-b border-slate-100">
              <td className="py-1">{d.label}</td>
              <td className="num py-1 text-right text-ink-900">{fmtLong(d.value, format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** x/y are percentages of the chart box. */
function Tooltip({ x, y, label, value }: { x: number; y: number; label: string; value: string }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg bg-ink-900 px-2.5 py-1.5 text-[12px] whitespace-nowrap text-white shadow-lg" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="text-white/60">{label}</div>
      <div className="num font-semibold">{value}</div>
    </div>
  );
}

const W = 640;
const PAD = { l: 44, r: 8, t: 12, b: 26 };

export function BarChart({ data, format = "number", height = 220, label }: { data: Point[]; format?: Fmt; height?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const step = iw / Math.max(data.length, 1);
  const bw = Math.max(6, Math.min(36, step - 2 - step * 0.35));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const empty = data.every((d) => d.value === 0);
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {fmtShort(t, format)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.l + step * i + step / 2;
            const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * ih);
            const top = PAD.t + ih - h;
            const r = Math.min(4, h / 2);
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={cx - step / 2} y={PAD.t} width={step} height={ih} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M ${cx - bw / 2},${PAD.t + ih} L ${cx - bw / 2},${top + r} Q ${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} L ${cx + bw / 2 - r},${top} Q ${cx + bw / 2},${top} ${cx + bw / 2},${top + r} L ${cx + bw / 2},${PAD.t + ih} Z`}
                    fill={SERIES}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {(data.length <= 12 || i % 2 === 0) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke="#cbd2dc" />
        </svg>
        {hover !== null && (
          <Tooltip x={((PAD.l + step * hover + step / 2) / W) * 100} y={(y(data[hover].value) / height) * 100} label={data[hover].label} value={fmtLong(data[hover].value, format)} />
        )}
        {empty && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-slate-400">No activity yet</div>}
      </div>
      <DataTableView data={data} format={format} label={label} />
    </div>
  );
}

export function LineChart({ data, format = "number", height = 220, label }: { data: Point[]; format?: Fmt; height?: number; label: string }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length <= 1 ? iw / 2 : (iw * i) / (data.length - 1));
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const path = useMemo(() => data.map((d, i) => `${i ? "L" : "M"} ${x(i)},${y(d.value)}`).join(" "), [data, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const area = `${path} L ${x(data.length - 1)},${PAD.t + ih} L ${x(0)},${PAD.t + ih} Z`;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const last = data.length - 1;
  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={label}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round(((px - PAD.l) / iw) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={SERIES} stopOpacity="0.18" />
              <stop offset="1" stopColor={SERIES} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {fmtShort(t, format)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            data.length <= 12 || i % 2 === 0 ? (
              <text key={d.label + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                {d.label}
              </text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gid})`} />
          <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="#94a3b8" strokeDasharray="3 3" />}
          {hover !== null && <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill={SERIES} stroke="#fff" strokeWidth={2} />}
          {hover === null && last >= 0 && <circle cx={x(last)} cy={y(data[last].value)} r={4.5} fill={SERIES} stroke="#fff" strokeWidth={2} />}
        </svg>
        {hover !== null && <Tooltip x={(x(hover) / W) * 100} y={(y(data[hover].value) / height) * 100} label={data[hover].label} value={fmtLong(data[hover].value, format)} />}
      </div>
      <DataTableView data={data} format={format} label={label} />
    </div>
  );
}

/** Ranked horizontal bars — for category breakdowns (auction results, districts). */
export function HBarList({ data, format = "number", label }: { data: Point[]; format?: Fmt; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <div className="py-6 text-center text-[13px] text-slate-400">No data yet</div>;
  return (
    <div role="list" aria-label={label} className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} role="listitem" className="group" title={`${d.label}: ${fmtLong(d.value, format)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate font-medium capitalize text-slate-700">{d.label.toLowerCase()}</span>
            <span className="num font-semibold text-ink-900">{fmtLong(d.value, format)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full transition-all group-hover:opacity-80" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES }} />
          </div>
        </div>
      ))}
    </div>
  );
}
