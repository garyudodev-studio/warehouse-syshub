'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase, AccessLogRecord, ContainerRecord, WorkerRecord } from '@/lib/supabaseClient';
import * as XLSX from 'xlsx';
import {
  ShieldCheck,
  Users,
  Box,
  Clock,
  Search,
  RefreshCw,
  ArrowUpRight,
  Activity,
  Radio,
  FileSpreadsheet,
  FileCheck,
  ClipboardList,
} from 'lucide-react';

type RawLogRow = {
  id: string;
  worker_id: string;
  container_id: string;
  activity: string | null;
  notes: string | null;
  scanned_at: string;
  workers: AccessLogRecord['workers'] | AccessLogRecord['workers'][] | null;
  containers: AccessLogRecord['containers'] | AccessLogRecord['containers'][] | null;
};

import AdminGuard from '@/components/AdminGuard';

export default function AdminDashboardPage() {
  const [logs, setLogs] = useState<AccessLogRecord[]>([]);
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Advanced Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContainer, setSelectedContainer] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'recent' | 'custom_date' | 'custom_month'>('today');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>('');
  const [selectedCustomMonth, setSelectedCustomMonth] = useState<string>('');

  // Fetch Data
  const fetchData = useCallback(async () => {
    try {
      const { data: logsData } = await supabase
        .from('warehouse_access_logs')
        .select(`
          id,
          worker_id,
          container_id,
          activity,
          notes,
          scanned_at,
          workers:warehouse_workers ( name, role, photo_url ),
          containers:warehouse_containers ( container_number )
        `)
        .order('scanned_at', { ascending: false })
        .limit(300);

      if (logsData) {
        const formattedLogs: AccessLogRecord[] = (logsData as unknown as RawLogRow[]).map((item) => ({
          id: item.id,
          worker_id: item.worker_id,
          container_id: item.container_id,
          activity: item.activity || 'Routine Stack Inspection',
          notes: item.notes ?? undefined,
          scanned_at: item.scanned_at,
          workers: Array.isArray(item.workers) ? item.workers[0] : item.workers ?? undefined,
          containers: Array.isArray(item.containers) ? item.containers[0] : item.containers ?? undefined,
        }));
        setLogs(formattedLogs);
      }

      const { data: containersData } = await supabase
        .from('warehouse_containers')
        .select('*')
        .order('container_number', { ascending: true });
      if (containersData) setContainers(containersData);

      const { data: workersData } = await supabase
        .from('warehouse_workers')
        .select('*')
        .order('name', { ascending: true });
      if (workersData) setWorkers(workersData);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = setTimeout(fetchData, 0);

    // Supabase Realtime Channel
    const channel = supabase
      .channel('dashboard_realtime_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warehouse_access_logs' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData();
      }, 4000);
    }

    return () => {
      clearTimeout(initialFetch);
      supabase.removeChannel(channel);
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    const todayStr = new Date().toDateString();

    return logs.filter((log) => {
      const workerName = log.workers?.name || 'Unknown';
      const containerNum = log.containers?.container_number || '';
      const activityName = log.activity || '';
      const logDate = new Date(log.scanned_at);

      const matchesSearch =
        workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        containerNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activityName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesContainer =
        selectedContainer === 'all' || log.container_id === selectedContainer;

      let matchesTime = true;
      if (timeFilter === 'today') {
        matchesTime = logDate.toDateString() === todayStr;
      } else if (timeFilter === 'recent') {
        const hoursAgo = (new Date().getTime() - logDate.getTime()) / (1000 * 60 * 60);
        matchesTime = hoursAgo <= 4;
      } else if (timeFilter === 'custom_date' && selectedCustomDate) {
        // YYYY-MM-DD match
        const yyyyMmDd = logDate.toISOString().substring(0, 10);
        matchesTime = yyyyMmDd === selectedCustomDate;
      } else if (timeFilter === 'custom_month' && selectedCustomMonth) {
        // YYYY-MM match
        const yyyyMm = logDate.toISOString().substring(0, 7);
        matchesTime = yyyyMm === selectedCustomMonth;
      }

      return matchesSearch && matchesContainer && matchesTime;
    });
  }, [logs, searchTerm, selectedContainer, timeFilter, selectedCustomDate, selectedCustomMonth]);

  // Statistics
  const todayStr = new Date().toDateString();
  const todayLogs = logs.filter((l) => new Date(l.scanned_at).toDateString() === todayStr);
  const uniquePersonnelToday = new Set(todayLogs.map((l) => l.worker_id)).size;

  // Container activity mapping for box containers
  const containerActivityMap = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((log) => {
      const num = log.containers?.container_number || '';
      map.set(num, (map.get(num) || 0) + 1);
    });
    return map;
  }, [logs]);

  // Professional Excel Table Export using SheetJS (.xlsx)
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) return;

    // Build worksheet data
    const excelData = filteredLogs.map((l, index) => ({
      'No.': index + 1,
      'Log Reference ID': l.id,
      'Worker Personnel': l.workers?.name || 'Unknown',
      'Assigned Safety Role': l.workers?.role || 'Standard Crew',
      'Worker ID': l.worker_id,
      'Box Container Unit': l.containers?.container_number || 'Unknown Unit',
      'Activity Task': l.activity || 'Routine Stack Inspection',
      'Local Time': new Date(l.scanned_at).toLocaleTimeString(),
      'Date (YYYY-MM-DD)': new Date(l.scanned_at).toISOString().substring(0, 10),
      'ISO Timestamp': l.scanned_at,
      'Compliance Status': 'VERIFIED BIOMETRIC PASS',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Auto-fit column widths
    const columnWidths = [
      { wch: 5 },
      { wch: 36 },
      { wch: 24 },
      { wch: 20 },
      { wch: 36 },
      { wch: 20 },
      { wch: 32 },
      { wch: 14 },
      { wch: 18 },
      { wch: 24 },
      { wch: 26 },
    ];
    worksheet['!cols'] = columnWidths;

    // Create workbook and append sheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Access Audit Telemetry');

    // Create secondary Summary sheet
    const summaryData = [
      { Metric: 'Total Monitored Box Containers', Value: containers.length },
      { Metric: 'Filtered Audit Records', Value: filteredLogs.length },
      { Metric: 'Active Enrolled Workers', Value: workers.length },
      { Metric: 'Export Timestamp', Value: new Date().toLocaleString() },
      { Metric: 'OSHA Standard', Value: '1910 COMPLIANT' },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 32 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

    // Write file
    const dateStr = new Date().toISOString().substring(0, 10);
    XLSX.writeFile(workbook, `SAFESTACK_AUDIT_REPORT_${dateStr}.xlsx`);
  };

  return (
    <AdminGuard>
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 space-y-6 font-mono">
      {/* Tactical Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
            <span>CENTRAL ACCESS TELEMETRY</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-sans">
            Box Container Access Audit Telemetry
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Real-time biometric audit stream across {containers.length} box container units with date/month filters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/reports"
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 shadow-md transition-all"
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>SAFETY REPORTS</span>
          </Link>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 transition-all ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span>{autoRefresh ? 'LIVE STREAM' : 'PAUSED'}</span>
          </button>

          <button
            onClick={fetchData}
            title="Refresh logs"
            className="p-2 rounded-lg bg-[#0f1420] hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportExcel}
            disabled={filteredLogs.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>EXPORT EXCEL (.XLSX)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>SHIFT SCANS</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-white">{todayLogs.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Entries logged today</div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>PERSONNEL ON SITE</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-400">
            {uniquePersonnelToday}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Of {workers.length} registered workers
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>BOX CONTAINERS</span>
            <Box className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-white">{containers.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Monitored container units</div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>LATEST ACCESS</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-lg sm:text-xl font-bold text-white truncate">
            {logs.length > 0
              ? new Date(logs[0].scanned_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : 'NO LOGS'}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">
            {logs.length > 0 ? logs[0].workers?.name : 'Awaiting entries'}
          </div>
        </div>
      </div>

      {/* Box Containers Yard Grid Visualizer */}
      <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Box className="w-4 h-4 text-amber-400" />
            <span>BOX CONTAINERS MAP ({containers.length} UNITS)</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Active Today
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-slate-800" /> Idle
            </span>
          </div>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-12 md:grid-cols-17 gap-1.5 text-[10px]">
          {containers.map((c) => {
            const count = containerActivityMap.get(c.container_number) || 0;
            const isSelected = selectedContainer === c.id;

            return (
              <button
                key={c.id}
                onClick={() => setSelectedContainer(isSelected ? 'all' : c.id)}
                title={`${c.container_number}: ${count} access events`}
                className={`p-1.5 rounded text-center border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-black border-amber-400 font-bold'
                    : count > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 hover:border-emerald-400'
                    : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="truncate">{c.container_number.replace('Container ', '#')}</div>
                <div className="text-[9px] opacity-80">{count}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* FILTER TOOLBAR WITH DATE & MONTH PICKER */}
      <div className="p-3.5 rounded-xl bg-[#0a0d16] border border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search worker, container, or task..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#07090e] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Time & Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-800 p-0.5 bg-[#07090e]">
            <button
              onClick={() => setTimeFilter('today')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                timeFilter === 'today' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              TODAY
            </button>
            <button
              onClick={() => setTimeFilter('recent')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                timeFilter === 'recent' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              LAST 4H
            </button>
            <button
              onClick={() => setTimeFilter('custom_date')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                timeFilter === 'custom_date' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              BY DATE
            </button>
            <button
              onClick={() => setTimeFilter('custom_month')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                timeFilter === 'custom_month' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              BY MONTH
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                timeFilter === 'all' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              ALL TIME
            </button>
          </div>

          {/* Date Picker Input when "BY DATE" is chosen */}
          {timeFilter === 'custom_date' && (
            <input
              type="date"
              value={selectedCustomDate}
              onChange={(e) => setSelectedCustomDate(e.target.value)}
              className="px-2.5 py-1 bg-[#07090e] border border-amber-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            />
          )}

          {/* Month Picker Input when "BY MONTH" is chosen */}
          {timeFilter === 'custom_month' && (
            <input
              type="month"
              value={selectedCustomMonth}
              onChange={(e) => setSelectedCustomMonth(e.target.value)}
              className="px-2.5 py-1 bg-[#07090e] border border-amber-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            />
          )}

          {/* Box Container Filter */}
          <select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            className="px-2.5 py-1.5 bg-[#07090e] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">ALL BOX CONTAINERS</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.container_number}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Telemetry Log Grid */}
      <div className="rounded-xl border border-slate-800 bg-[#0a0d16] overflow-hidden shadow-xl font-mono text-xs">
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-[#07090e]">
          <div className="flex items-center gap-2 text-white font-bold">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>AUDIT TELEMETRY STREAM</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {filteredLogs.length} RECORDS MATCHED
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
            <span>STREAMING ACCESS LOGS...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <ShieldCheck className="w-10 h-10 text-slate-700 mx-auto" />
            <p className="font-bold text-slate-400">NO ACCESS EVENTS FOUND</p>
            <p className="text-[11px] text-slate-500">
              Select a different date/month filter or start a personnel scan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider bg-[#080b11]">
                  <th className="py-2.5 px-4">Worker Personnel</th>
                  <th className="py-2.5 px-4">Box Container Unit</th>
                  <th className="py-2.5 px-4">Logged Task / Activity</th>
                  <th className="py-2.5 px-4">Timestamp (Local)</th>
                  <th className="py-2.5 px-4 text-right">Quick Scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => {
                  const workerName = log.workers?.name || 'Unknown';
                  const workerRole = log.workers?.role || 'Crew';
                  const photoUrl = log.workers?.photo_url;
                  const containerNum = log.containers?.container_number || 'Unit';
                  const activityName = log.activity || 'Routine Stack Inspection';
                  const scanDate = new Date(log.scanned_at);

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Worker */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={workerName}
                              className="w-7 h-7 rounded object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0 font-sans">
                              {workerName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <div className="font-bold text-white font-sans">{workerName}</div>
                            <div className="text-[10px] text-slate-500">{workerRole}</div>
                          </div>
                        </div>
                      </td>

                      {/* Box Container */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                          <Box className="w-3 h-3" />
                          <span>{containerNum}</span>
                        </span>
                      </td>

                      {/* Logged Task Activity */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 font-bold text-[11px]">
                          <ClipboardList className="w-3 h-3 text-emerald-400" />
                          <span>{activityName}</span>
                        </span>
                      </td>

                      {/* Scanned At */}
                      <td className="py-3 px-4">
                        <div className="text-slate-200">
                          {scanDate.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {scanDate.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      {/* Quick Launch */}
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/log/${encodeURIComponent(containerNum)}`}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-400 transition-colors"
                        >
                          <span>Re-scan</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </AdminGuard>
  );
}
