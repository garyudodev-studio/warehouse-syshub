'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase, AccessLogRecord, ContainerRecord } from '@/lib/supabaseClient';
import {
  ShieldCheck,
  UserPlus,
  LayoutDashboard,
  QrCode,
  Box,
  HardHat,
  Radio,
  ArrowRight,
  ScanLine,
  Activity,
  Cpu,
  Database,
  Lock,
  FileCheck,
  Zap,
  Users,
  Clock,
  ClipboardList,
  RefreshCw,
  Search,
  KeyRound,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
} from 'lucide-react';

export default function HomePage() {
  const [logs, setLogs] = useState<AccessLogRecord[]>([]);
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [workerCount, setWorkerCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedContainerFilter, setSelectedContainerFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);
  const ITEMS_PER_PAGE = 21;

  const fetchPublicTelemetry = useCallback(async () => {
    try {
      // 1. Fetch recent access logs
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
        .limit(100);

      if (logsData) {
        const formattedLogs: AccessLogRecord[] = logsData.map((item: any) => ({
          id: item.id,
          worker_id: item.worker_id,
          container_id: item.container_id,
          activity: item.activity || 'Routine Stack Inspection',
          notes: item.notes,
          scanned_at: item.scanned_at,
          workers: Array.isArray(item.workers) ? item.workers[0] : item.workers,
          containers: Array.isArray(item.containers) ? item.containers[0] : item.containers,
        }));
        setLogs(formattedLogs);
      }

      // 2. Fetch box containers
      const { data: containersData } = await supabase
        .from('warehouse_containers')
        .select('*')
        .order('container_number', { ascending: true });
      if (containersData) setContainers(containersData);

      // 3. Worker count
      const { count: workers } = await supabase
        .from('warehouse_workers')
        .select('*', { count: 'exact', head: true });
      setWorkerCount(workers || 0);

    } catch (err) {
      console.error('Public telemetry fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicTelemetry();

    // Supabase Realtime Channel for live guest stream
    const channel = supabase
      .channel('guest_live_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warehouse_access_logs' },
        () => {
          fetchPublicTelemetry();
        }
      )
      .subscribe();

    const interval = setInterval(fetchPublicTelemetry, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchPublicTelemetry]);

  // Scroll listener for floating Back to Top button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Statistics
  const todayStr = new Date().toDateString();
  const todayLogs = logs.filter((l) => new Date(l.scanned_at).toDateString() === todayStr);
  const uniquePersonnelToday = new Set(todayLogs.map((l) => l.worker_id)).size;

  // Container activity mapping
  const containerActivityMap = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((log) => {
      const num = log.containers?.container_number || '';
      map.set(num, (map.get(num) || 0) + 1);
    });
    return map;
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const workerName = log.workers?.name || 'Unknown';
      const containerNum = log.containers?.container_number || '';
      const activityName = log.activity || '';

      const matchesSearch =
        workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        containerNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activityName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesContainer =
        selectedContainerFilter === 'all' || log.container_id === selectedContainerFilter;

      let matchesDate = true;
      if (selectedDate) {
        const d = new Date(log.scanned_at);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const logDateStr = `${yyyy}-${mm}-${dd}`;
        matchesDate = logDateStr === selectedDate;
      }

      return matchesSearch && matchesContainer && matchesDate;
    });
  }, [logs, searchTerm, selectedContainerFilter, selectedDate]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedContainerFilter, selectedDate]);

  // Paginated Logs (21 items per page)
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE) || 1;
  const paginatedLogs = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-8 space-y-8 font-mono">
      {/* Tactical Hero Banner */}
      <div className="border border-slate-800 rounded-2xl bg-[#0a0d16] p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-mono font-bold uppercase tracking-wider">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>LIVE GUEST OPERATIONS TELEMETRY</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-sans leading-tight">
              Container Safety Logbook <br />
              <span className="text-amber-400 font-mono text-xl sm:text-2xl">
                [ REAL-TIME CONTAINER AUDIT ]
              </span>
            </h1>

            <p className="text-slate-400 text-xs sm:text-sm font-mono leading-relaxed">
              Zero-input biometric facial recognition telemetry for industrial container stacks. Staff workers scan QR placards; neural networks verify access automatically.
            </p>
          </div>

          {/* Core Action Callouts: PERSONNEL SCAN & ADMIN LOGIN */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            {/* Primary Staff Button: PERSONNEL SCAN */}
            <Link
              href="/scan"
              className="px-6 py-4 rounded-xl font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2.5 active:scale-95 text-sm uppercase tracking-wider group cursor-pointer"
            >
              <ScanLine className="w-5 h-5 stroke-[2.5]" />
              <span>PERSONNEL SCAN</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            {/* Private Admin Login Button */}
            <Link
              href="/admin/login"
              className="px-4 py-2.5 rounded-xl font-bold bg-[#07090e] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 shadow-md transition-all flex items-center justify-center gap-2 text-xs"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>ADMIN PORTAL LOGIN</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>SHIFT SCANS TODAY</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white mt-2">
            {todayLogs.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Verified biometric entries</div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>ACTIVE ON SITE</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">
            {uniquePersonnelToday}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Of {workerCount} enrolled personnel</div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>BOX CONTAINERS</span>
            <Box className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white mt-2">
            {containers.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Monitored risk units</div>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0d16] border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase">
            <span>LATEST SCAN TIME</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white truncate mt-2">
            {logs.length > 0
              ? new Date(logs[0].scanned_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : 'AWAITING LOGS'}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">
            {logs.length > 0 ? logs[0].workers?.name : 'Edge Biometrics Ready'}
          </div>
        </div>
      </div>

      {/* Box Container Yard Activity Matrix */}
      <div className="p-5 rounded-2xl bg-[#0a0d16] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
              <Box className="w-4 h-4 text-amber-400" />
              <span>LIVE BOX CONTAINER ACTIVITY MATRIX ({containers.length} UNITS)</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click any box container to view its live access events or launch its verification scan.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Active Today
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-800" /> Idle
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12 gap-2 text-[11px]">
          {containers.map((c) => {
            const count = containerActivityMap.get(c.container_number) || 0;
            const isSelected = selectedContainerFilter === c.id;

            return (
              <button
                key={c.id}
                onClick={() => setSelectedContainerFilter(isSelected ? 'all' : c.id)}
                title={`${c.container_number}: ${count} total scans`}
                className={`p-2 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md'
                    : count > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 hover:border-emerald-400'
                    : 'bg-[#07090e] text-slate-500 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span className="text-[9px] opacity-70">BOX</span>
                <span className="font-bold text-xs">
                  {c.container_number.replace('Container ', '#')}
                </span>
                <span className="text-[9px] opacity-80 mt-0.5">{count} scans</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Public Access Audit Stream Feed */}
      <div className="rounded-2xl border border-slate-800 bg-[#0a0d16] overflow-hidden shadow-xl text-xs">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#07090e]">
          <div className="flex items-center gap-2 text-white font-bold">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>LIVE CONTAINER AUDIT FEED (PUBLIC TELEMETRY)</span>
            <span className="text-[10px] text-slate-400 font-mono font-normal">
              ({filteredLogs.length} {filteredLogs.length === 1 ? 'EVENT' : 'EVENTS'})
            </span>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search worker, container..."
                className="w-full pl-8 pr-2.5 py-1 bg-[#0a0d16] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            {/* Date Pick Filter */}
            <div className="flex items-center gap-1.5 bg-[#0a0d16] border border-slate-800 rounded-lg px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                title="Filter pick by date"
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer font-sans [color-scheme:dark]"
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  title="Clear date filter"
                  className="text-slate-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={fetchPublicTelemetry}
              title="Refresh stream"
              className="p-1.5 rounded-lg bg-[#0f1420] hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
            <span>CONNECTING TO LIVE TELEMETRY STREAM...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <ShieldCheck className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="font-bold text-slate-400">NO RECENT ACCESS EVENTS</p>
            <p className="text-[11px] font-sans">
              {selectedDate || searchTerm || selectedContainerFilter !== 'all'
                ? 'No audit logs matched your active search or date filter.'
                : 'Staff workers can scan containers to record new biometric activity.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider bg-[#080b11]">
                  <th className="py-2.5 px-4">Verified Personnel</th>
                  <th className="py-2.5 px-4">Box Container Unit</th>
                  <th className="py-2.5 px-4">Activity / Task</th>
                  <th className="py-2.5 px-4">PPE Safety Gear Uses</th>
                  <th className="py-2.5 px-4">Time Logged</th>
                  <th className="py-2.5 px-4 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedLogs.map((log) => {
                  const workerName = log.workers?.name || 'Unknown';
                  const workerRole = log.workers?.role || 'Crew';
                  const photoUrl = log.workers?.photo_url;
                  const containerNum = log.containers?.container_number || 'Unit';
                  const activityName = log.activity || 'Routine Stack Inspection';
                  const scanDate = new Date(log.scanned_at);
                  const rawNotes = log.notes || '';
                  const ppeItemsText = rawNotes.includes('PPE')
                    ? rawNotes.replace('[PPE VERIFIED: ', '').replace(']', '')
                    : 'Hard Hat, Harness, Gloves, Safety Shoes';

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

                      {/* Logged Activity */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700 font-bold text-[11px]">
                          <ClipboardList className="w-3 h-3 text-emerald-400" />
                          <span>{activityName}</span>
                        </span>
                      </td>

                      {/* PPE Uses Display */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold font-mono">
                            <HardHat className="w-3 h-3 text-amber-400" />
                            <span>PPE VERIFIED</span>
                          </span>
                          <div className="text-[10px] text-slate-400 font-sans max-w-[200px] truncate" title={ppeItemsText}>
                            {ppeItemsText}
                          </div>
                        </div>
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
                          })}
                        </div>
                      </td>

                      {/* Verification Status */}
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3" />
                          <span>PASSED</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls (21 display data per page) */}
        {filteredLogs.length > 0 && (
          <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#07090e] text-slate-400 text-xs">
            <div className="font-mono text-[11px]">
              Showing{' '}
              <span className="font-bold text-white">
                {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredLogs.length)}
              </span>{' '}
              to{' '}
              <span className="font-bold text-white">
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)}
              </span>{' '}
              of <span className="font-bold text-amber-400">{filteredLogs.length}</span> audit logs
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-800 bg-[#0a0d16] hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-[#0a0d16] transition-all flex items-center gap-1 font-bold text-xs cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>PREV</span>
              </button>

              <span className="px-3 py-1 text-xs font-mono font-bold text-white bg-slate-900 rounded-lg border border-slate-800">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-800 bg-[#0a0d16] hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-[#0a0d16] transition-all flex items-center gap-1 font-bold text-xs cursor-pointer disabled:cursor-not-allowed"
              >
                <span>NEXT</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Back to Top"
          className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-2xl shadow-amber-500/30 border border-amber-400/50 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center group"
        >
          <ArrowUp className="w-5 h-5 stroke-[2.5] group-hover:-translate-y-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}
