import React, { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Download, Upload, Plus, Filter } from "lucide-react";

// ---- Utility helpers ----
const CATEGORIES = [
  "Combustible",
  "Mantenimiento",
  "Amarras/Puerto",
  "Dietas tripulación",
  "Sueldos",
  "Seguro",
  "Materiales/EPIs",
  "Tasas",
  "Taller externo",
  "Misceláneo",
];

const CREW = ["Tripulante 1", "Tripulante 2", "Tripulante 3"];

function eur(n) {
  if (isNaN(n)) return "€0.00";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function yyyymm(d) {
  const dt = new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dt.getFullYear()}-${m}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---- PWA Support ----
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => console.error("SW registration failed", err));
  });
}

// ---- Main App ----
export default function BoatExpensesApp() {
  const [expenses, setExpenses] = useState([]);
  const [month, setMonth] = useState(() => yyyymm(new Date()));
  const [jobType, setJobType] = useState("Todos");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("boat-expenses-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        setExpenses(parsed);
      } else {
        setExpenses([
          { id: uid(), date: new Date().toISOString().slice(0,10), category: "Combustible", crew: CREW[0], amount: 320.5, taxRate: 7, notes: "Repostaje gasóleo", jobType: "Portuarios" },
          { id: uid(), date: new Date().toISOString().slice(0,10), category: "Dietas tripulación", crew: CREW[1], amount: 45.2, taxRate: 7, notes: "Comidas día", jobType: "Aguas interiores" },
        ]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("boat-expenses-v1", JSON.stringify(expenses));
    } catch {}
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const sameMonth = yyyymm(e.date) === month;
      const typeOk = jobType === "Todos" || e.jobType === jobType;
      const q = search.trim().toLowerCase();
      const qOk = !q ||
        e.category.toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q) ||
        (e.crew || "").toLowerCase().includes(q);
      return sameMonth && typeOk && qOk;
    });
  }, [expenses, month, jobType, search]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, e) => {
      const base = Number(e.amount || 0);
      const rate = Number(e.taxRate || 0) / 100;
      return s + base * (1 + rate);
    }, 0);
    const byCat = {};
    const byCrew = {};
    for (const e of filtered) {
      const base = Number(e.amount || 0);
      const rate = Number(e.taxRate || 0) / 100;
      const gross = base * (1 + rate);
      byCat[e.category] = (byCat[e.category] || 0) + gross;
      byCrew[e.crew || "—"] = (byCrew[e.crew || "—"] || 0) + gross;
    }
    return { total, byCat, byCrew };
  }, [filtered]);

  function addExpense(exp) {
    setExpenses((prev) => [{ id: uid(), ...exp }, ...prev]);
  }

  function deleteExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function handleExportCSV() {
    const header = ["id","fecha","categoria","tripulante","base_eur","igic_%","igic_eur","total_eur","tipo_trabajo","notas"];
    const rows = expenses.map(e => {
      const base = Number(e.amount || 0);
      const rate = Number(e.taxRate || 0);
      const igic = base * rate / 100;
      const total = base + igic;
      return [e.id, e.date, e.category, e.crew || "", base, rate, igic, total, e.jobType || "", (e.notes || "").replaceAll("\n"," ")];
    });
    const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gastos_barco_${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const fileRef = useRef(null);
  function handleImportCSV(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const [h, ...rest] = lines;
      const idx = (name) => h.toLowerCase().split(",").findIndex(x => x.replaceAll('"','').trim() === name);
      const idI = idx("id"), dI = idx("fecha"), cI = idx("categoria"), crI = idx("tripulante");
      const aI = (()=>{ const i1 = idx("base_eur"); const i2 = idx("importe"); return i1>-1?i1:i2; })();
      const ivaI = (()=>{ const i1 = idx("igic_%"); const i2 = idx("iva_%"); return i1>-1?i1:i2; })();
      const jtI = idx("tipo_trabajo"), nI = idx("notas");
      const parsed = rest.map(line => {
        const cols = splitCSV(line);
        return {
          id: cols[idI] || uid(),
          date: cols[dI] || new Date().toISOString().slice(0,10),
          category: cols[cI] || "Misceláneo",
          crew: cols[crI] || "",
          amount: Number(cols[aI] || 0),
          taxRate: Number(cols[ivaI] || 0),
          jobType: cols[jtI] || "Portuarios",
          notes: cols[nI] || "",
        };
      });
      setExpenses((prev) => [...parsed, ...prev]);
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gastos mensuales del barco</h1>
            <p className="text-sm text-slate-600">3 tripulantes · trabajos portuarios y aguas interiores</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExportCSV}><Download className="w-4 h-4 mr-2"/>Exportar CSV</Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e)=> handleImportCSV(e.target.files?.[0])}/>
            <Button variant="outline" onClick={()=> fileRef.current?.click()}><Upload className="w-4 h-4 mr-2"/>Importar CSV</Button>
          </div>
        </header>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label>Mes</Label>
                <Input type="month" value={month} onChange={(e)=> setMonth(e.target.value)} />
              </div>
              <div>
                <Label>Tipo de trabajo</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger><SelectValue placeholder="Selecciona"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    <SelectItem value="Portuarios">Portuarios</SelectItem>
                    <SelectItem value="Aguas interiores">Aguas interiores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label><span className="inline-flex items-center gap-1"><Filter className="w-4 h-4"/>Buscar</span></Label>
                <Input placeholder="categoria, nota o tripulante" value={search} onChange={(e)=> setSearch(e.target.value)} />
              </div>
              <div className="flex items-end">
                <AddExpenseDialog onAdd={addExpense} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SummaryCard title="Total del mes" value={eur(totals.total)} subtitle={`${filtered.length} apuntes`} />
          <BreakdownCard title="Por categoría" data={totals.byCat} />
          <BreakdownCard title="Por tripulante" data={totals.byCrew} />
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="text-left text-slate-700">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Tripulante</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3 text-right">Base</th>
                  <th className="p-3 text-right">IGIC</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3">Notas</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td className="p-4 text-slate-500" colSpan={9}>No hay gastos para este filtro.</td></tr>
                )}
                {filtered.map((e) => {
                  const base = Number(e.amount || 0);
                  const rate = Number(e.taxRate || 0) / 100;
                  const igic = base * rate;
                  const total = base + igic;
                  return (
                    <tr key={e.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap">{e.date}</td>
                      <td className="p-3"><Badge variant="secondary">{e.category}</Badge></td>
                      <td className="p-3">{e.crew || "—"}</td>
                      <td className="p-3">{e.jobType}</td>
                      <td className="p-3 text-right">{eur(base)}</td>
                      <td className="p-3 text-right">{eur(igic)}</td>
                      <td className="p-3 text-right font-medium">{eur(total)}</td>
                      <td className="p-3 max-w-[320px] truncate" title={e.notes}>{e.notes}</td>
                      <td className="p-3 text-right">
                        <Button size="icon" variant="ghost" onClick={()=> deleteExpense(e.id)} title="Eliminar"><Trash2 className="w-4 h-4"/></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Tips />
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6">
        <div className="text-slate-500 text-sm">{title}</div>
        <div className="text-3xl font-bold mt-1">{value}</div>
        {subtitle && <div className="text-slate-500 text-xs mt-2">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, data }) {
  const entries = Object.entries(data || {}).sort((a,b)=> b[1]-a[1]);
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6">
        <div className="text-slate-500 text-sm mb-3">{title}</div>
        <div className="space-y-2">
          {entries.length === 0 && <div className="text-slate-500 text-sm">—</div>}
          {entries.map(([k,v])=> (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="truncate pr-2">{k}</span>
              <span className="font-medium">{eur(v)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AddExpenseDialog({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [crew, setCrew] = useState("");
  const [amount, setAmount] = useState("");
  const [taxRate, setTaxRate] = useState("7");
  const [notes, setNotes] = useState("");
  const [jobType, setJobType] = useState("Portuarios");

  function reset() {
    setDate(new Date().toISOString().slice(0,10));
    setCategory(CATEGORIES[0]);
    setCrew("");
    setAmount("");
    setTaxRate("7");
    setNotes("");
    setJobType("Portuarios");
  }

  function submit() {
    const amt = Number(amount);
    if (!amt || isNaN(amt)) return alert("Importe no válido");
    onAdd({ date, category, crew, amount: amt, taxRate: Number(taxRate||0), notes, jobType });
    setOpen(false);
    reset();


/* =========================
   PWA SETUP (añadido)
   Archivos virtuales para tu build (Vite/CRA/Next static):
   - public/manifest.webmanifest
   - public/service-worker.js
   - src/sw-register.js (o registra directo en index.html)
   - index.html: añade <link rel="manifest"> y <meta name="theme-color">
   ========================= */

// --- (1) Registro del Service Worker: simple y directo ---
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => console.error("SW registration failed:", err));
  });
}

/* --- (2) public/manifest.webmanifest ---
{
  "name": "Gastos del Barco",
  "short_name": "Gastos Barco",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#0f172a",
  "lang": "es-ES",
  "icons": [
    { "src": "/icons/pwa-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/pwa-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
*/

/* --- (3) public/service-worker.js ---
// SW minimalista: cache-first para estáticos y network-first para documentos
const CACHE = "boat-expenses-cache-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  // añade aquí tus bundles estáticos si haces build (e.g. /assets/index-xxxxx.js, /assets/index-xxxxx.css)
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first para documentos (HTML)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first para estáticos del mismo origen
  if (url.origin === location.origin && (url.pathname.startsWith("/assets/") || STATIC_ASSETS.includes(url.pathname))) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Por defecto: pasar de largo (se puede añadir runtime caching específico)
});
*/

/* --- (4) index.html: inserta en <head> ---
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0f172a" />
<link rel="apple-touch-icon" href="/icons/pwa-192.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
*/

/* --- (5) Notas ---
- Mantengo almacenamiento en localStorage: funciona offline.
- La exportación CSV sigue operando offline (descarga local).
- Si usas Vite: coloca manifest y SW en /public y asegúrate de que el path sea /service-worker.js.
- Tras desplegar en HTTPS, abre la app, refresca y debería ofrecer "Instalar" (A2HS) en Android/Chrome.
*/
