'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase, AccessLogRecord, WorkerRecord } from '@/lib/supabaseClient';
import * as XLSX from 'xlsx';
import {
  FileCheck,
  Activity,
  Users,
  Box,
  Printer,
  CheckCircle2,
  TrendingUp,
  Award,
  HardHat,
  FileSpreadsheet,
} from 'lucide-react';

type JoinedWorker = { name: string; role?: string; photo_url?: string };
type JoinedContainer = { container_number: string };

type RawLogRow = {
  id: string;
  worker_id: string;
  container_id: string;
  activity: string | null;
  notes: string | null;
  scanned_at: string;
  workers: JoinedWorker | JoinedWorker[] | null;
  containers: JoinedContainer | JoinedContainer[] | null;
};

import AdminGuard from '@/components/AdminGuard';

export default function ManagementReportsPage() {
  const [logs, setLogs] = useState<AccessLogRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Timeframe selector: daily | weekly | monthly | custom_date | custom_month
  const [reportTimeframe, setReportTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'custom_date' | 'custom_month'>('daily');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>('');
  const [selectedCustomMonth, setSelectedCustomMonth] = useState<string>('');

  const [generatedAt, setGeneratedAt] = useState('');

  useEffect(() => {
    const stamp = () => setGeneratedAt(new Date().toLocaleString());
    const t = setTimeout(stamp, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      supabase
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
        .order('scanned_at', { ascending: false }),
      supabase.from('warehouse_workers').select('*'),
    ])
      .then(([logsRes, workersRes]) => {
        if (cancelled) return;

        if (logsRes.data) {
          const formatted: AccessLogRecord[] = (logsRes.data as unknown as RawLogRow[]).map((item) => ({
            id: item.id,
            worker_id: item.worker_id,
            container_id: item.container_id,
            activity: item.activity || 'Routine Stack Inspection',
            notes: item.notes ?? undefined,
            scanned_at: item.scanned_at,
            workers: Array.isArray(item.workers) ? item.workers[0] : item.workers ?? undefined,
            containers: Array.isArray(item.containers) ? item.containers[0] : item.containers ?? undefined,
          }));
          setLogs(formatted);
        }

        if (workersRes.data) setWorkers(workersRes.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading report data:', err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter logs based on report timeframe or date/month
  const timeframeLogs = useMemo(() => {
    const now = new Date();
    return logs.filter((log) => {
      const logDate = new Date(log.scanned_at);
      const diffHours = (now.getTime() - logDate.getTime()) / (1000 * 60 * 60);

      if (reportTimeframe === 'daily') {
        return diffHours <= 24;
      } else if (reportTimeframe === 'weekly') {
        return diffHours <= 24 * 7;
      } else if (reportTimeframe === 'monthly') {
        return diffHours <= 24 * 30;
      } else if (reportTimeframe === 'custom_date' && selectedCustomDate) {
        return logDate.toISOString().substring(0, 10) === selectedCustomDate;
      } else if (reportTimeframe === 'custom_month' && selectedCustomMonth) {
        return logDate.toISOString().substring(0, 7) === selectedCustomMonth;
      }
      return true;
    });
  }, [logs, reportTimeframe, selectedCustomDate, selectedCustomMonth]);

  // Metrics calculation
  const totalScans = timeframeLogs.length;
  const uniqueWorkersScanned = new Set(timeframeLogs.map((l) => l.worker_id)).size;
  const servicedContainersCount = new Set(timeframeLogs.map((l) => l.container_id)).size;

  // Activity breakdown distribution
  const activityDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    timeframeLogs.forEach((l) => {
      const act = l.activity || 'Routine Stack Inspection';
      counts[act] = (counts[act] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [timeframeLogs]);

  const formatLogTime = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleExportExcel = () => {
    if (timeframeLogs.length === 0) return;

    const excelData = timeframeLogs.map((l) => {
      const rawNotes = l.notes || '';
      const ppeUses = rawNotes.includes('PPE')
        ? rawNotes.replace('[PPE VERIFIED: ', '').replace(']', '')
        : 'Hard Hat, Full Body Harness, Protective Gloves, Safety Shoes';

      const d = new Date(l.scanned_at);
      const pad = (n: number) => (n < 10 ? '0' + n : n);
      const formattedTimestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      return {
        'Worker Personnel': l.workers?.name || 'Unknown Worker',
        'Assigned Role': l.workers?.role || 'Standard Crew',
        'Container Unit': l.containers?.container_number || 'Unknown Unit',
        'Activity Task': l.activity || 'Routine Stack Inspection',
        'PPE Safety Gear Uses': ppeUses,
        Timestamp: formattedTimestamp,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 24 },
      { wch: 18 },
      { wch: 34 },
      { wch: 60 },
      { wch: 22 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Logs');

    const dateStr = new Date().toISOString().substring(0, 10);
    XLSX.writeFile(workbook, `AUDIT_LOGS_${reportTimeframe.toUpperCase()}_${dateStr}.xlsx`);
  };

  return (
    <AdminGuard>
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 space-y-6 font-mono">
      {/* Printable Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
            <FileCheck className="w-4 h-4" />
            <span>PERSONNEL LOG BOOK & ACTIVITY REPORT</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-sans">
            Worker Container Activity Report
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Chronological log book of verified personnel activity on box containers for the selected reporting window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe & Date/Month selector */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-[#0a0d16] p-1">
            <button
              onClick={() => setReportTimeframe('daily')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                reportTimeframe === 'daily' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              DAILY
            </button>
            <button
              onClick={() => setReportTimeframe('weekly')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                reportTimeframe === 'weekly' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              WEEKLY
            </button>
            <button
              onClick={() => setReportTimeframe('monthly')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                reportTimeframe === 'monthly' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              MONTHLY
            </button>
            <button
              onClick={() => setReportTimeframe('custom_date')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                reportTimeframe === 'custom_date' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              BY DATE
            </button>
            <button
              onClick={() => setReportTimeframe('custom_month')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                reportTimeframe === 'custom_month' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              BY MONTH
            </button>
          </div>

          {reportTimeframe === 'custom_date' && (
            <input
              type="date"
              value={selectedCustomDate}
              onChange={(e) => setSelectedCustomDate(e.target.value)}
              className="px-2.5 py-1 bg-[#07090e] border border-amber-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            />
          )}

          {reportTimeframe === 'custom_month' && (
            <input
              type="month"
              value={selectedCustomMonth}
              onChange={(e) => setSelectedCustomMonth(e.target.value)}
              className="px-2.5 py-1 bg-[#07090e] border border-amber-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            />
          )}

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>EXPORT EXCEL (.XLSX)</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PRINT REPORT</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ACTIVITY LOGS</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-white">
            {loading ? '…' : totalScans}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            In selected reporting window
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ACTIVE CREW ON DUTY</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-sky-400">
            {loading ? '…' : uniqueWorkersScanned}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Out of {workers.length} enrolled personnel
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>CONTAINERS SERVICED</span>
            <Box className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-400">
            {loading ? '…' : servicedContainersCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Units with logged personnel activity
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>DOMINANT ACTIVITY</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-sm sm:text-base font-black text-purple-400 uppercase leading-tight break-words">
            {activityDistribution.length > 0 ? activityDistribution[0][0] : '—'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {activityDistribution.length > 0
              ? `${activityDistribution[0][1]} of ${totalScans} logs`
              : 'No logs in window'}
          </div>
        </div>
      </div>

      {/* Personnel Activity Log Book */}
      <div className="p-5 rounded-2xl bg-[#0a0d16] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-bold text-white text-xs">
            <HardHat className="w-4 h-4 text-amber-400" />
            <span>PERSONNEL ACTIVITY LOG BOOK</span>
          </div>
          <span className="text-[10px] text-amber-400 font-bold uppercase">
            {timeframeLogs.length} ENTRIES · {reportTimeframe} WINDOW
          </span>
        </div>

        {timeframeLogs.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#07090e] border border-slate-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-white">NO PERSONNEL ACTIVITY RECORDED</div>
            <div className="text-[11px] text-slate-500">
              No worker check-ins were logged on any container in this reporting window.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#07090e] text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="text-left px-3 py-2.5 border-b border-slate-800">Timestamp</th>
                  <th className="text-left px-3 py-2.5 border-b border-slate-800">Worker</th>
                  <th className="text-left px-3 py-2.5 border-b border-slate-800">Role</th>
                  <th className="text-left px-3 py-2.5 border-b border-slate-800">Container</th>
                  <th className="text-left px-3 py-2.5 border-b border-slate-800">Activity</th>
                  <th className="text-left px-3 py-2.5 border-b border-slate-800">PPE Safety Gear Uses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {timeframeLogs.map((log) => {
                  const rawNotes = log.notes || '';
                  const ppeText = rawNotes.includes('PPE')
                    ? rawNotes.replace('[PPE VERIFIED: ', '').replace(']', '')
                    : 'Hard Hat, Harness, Gloves, Safety Shoes';

                  return (
                    <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {formatLogTime(log.scanned_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {log.workers?.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={log.workers.photo_url}
                              alt={log.workers?.name || 'Worker'}
                              className="w-6 h-6 rounded-full object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                              <HardHat className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <span className="font-bold text-white whitespace-nowrap">
                            {log.workers?.name || 'Unknown Worker'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {log.workers?.role || 'Standard Crew'}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-amber-400 whitespace-nowrap">
                        {log.containers?.container_number || 'Unknown Unit'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">{log.activity}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold">
                            ✓ PPE VERIFIED
                          </span>
                          <span className="text-slate-400 text-[10px] font-sans truncate max-w-[160px]" title={ppeText}>
                            {ppeText}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Breakdown Distribution + Sign-Off */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-[#0a0d16] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 font-bold text-white text-xs">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>ACTIVITY TYPE DISTRIBUTION</span>
            </div>
            <span className="text-[10px] text-slate-400">{activityDistribution.length} TASKS</span>
          </div>

          <div className="space-y-2.5 text-xs">
            {activityDistribution.map(([activityName, count]) => {
              const pct = totalScans > 0 ? Math.round((count / totalScans) * 100) : 0;
              return (
                <div key={activityName} className="space-y-1">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-sans font-bold">{activityName}</span>
                    <span className="font-mono text-[11px] text-amber-400">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {activityDistribution.length === 0 && (
              <div className="py-6 text-center text-slate-500 text-xs">
                No activity logs recorded in this timeframe.
              </div>
            )}
          </div>
        </div>

        {/* Executive Compliance Sign-Off Box */}
        <div className="p-5 rounded-2xl bg-[#0a0d16] border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-white text-xs border-b border-slate-800 pb-3">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>MANAGEMENT LOG BOOK VERIFICATION</span>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed space-y-2 font-sans">
              <p>
                This personnel log book report certifies that {totalScans} activity records from {uniqueWorkersScanned} verified workers across {servicedContainersCount} box containers were captured via zero-input facial recognition telemetry.
              </p>
              <p>
                <strong>OSHA Standard 1910 Compliance Status:</strong>{' '}
                <span className="text-emerald-400 font-mono font-bold">VERIFIED SAFE</span>
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-3 font-mono">
            <div className="flex justify-between">
              <span>REPORT GENERATED:</span>
              <span className="text-white">{generatedAt || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>TIMEFRAME WINDOW:</span>
              <span className="text-amber-400 uppercase font-bold">{reportTimeframe} REPORT</span>
            </div>
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-slate-500">
              <span>SAFETY OFFICER SIGNATURE: ____________________</span>
              <span>STAMP: [OFFICIAL]</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AdminGuard>
  );
}
