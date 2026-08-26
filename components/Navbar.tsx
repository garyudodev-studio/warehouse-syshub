'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAdminAuthenticated, logoutAdmin } from '@/lib/adminAuth';
import {
  HardHat,
  LayoutDashboard,
  FileCheck,
  UserPlus,
  QrCode,
  ScanLine,
  Lock,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const hydrate = () => {
      setMounted(true);
      setIsAdmin(isAdminAuthenticated());
      const saved = (localStorage.getItem('sys_hub_theme') as 'dark' | 'light') || 'dark';
      setTheme(saved);
      if (saved === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      }
    };
    const t = setTimeout(hydrate, 0);

    const handleAuthChange = () => {
      setIsAdmin(isAdminAuthenticated());
    };

    window.addEventListener('safestack_auth_change', handleAuthChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener('safestack_auth_change', handleAuthChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('sys_hub_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  };

  const handleLogout = () => {
    logoutAdmin();
    router.push('/');
  };

  return (
    <header className="sticky top-2.5 z-50 border-b border-slate-800/90 bg-[#0a0d14]/95 backdrop-blur-md px-3 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 font-mono">
        {/* Branding */}
        <Link
          href="/"
          className="flex items-center gap-3 group transition-opacity hover:opacity-90"
        >
          <div className="relative w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20">
            <HardHat className="w-5 h-5 stroke-[2.5]" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-gray-400 font-mono">
                SYS-HUB<span className="text-amber-400">::WAREHOUSE</span>
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                OSHA 1910
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 leading-none mt-0.5">
              <span className="text-emerald-400 font-semibold">● ONLINE</span>
              <span className="text-slate-600">/</span>
              <span>{isAdmin ? 'ADMIN LEVEL' : 'GUEST TELEMETRY'}</span>
            </div>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Admin Private Links (Visible only when logged in as Admin) */}
          {mounted && isAdmin && (
            <>
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-all"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">LIVE TELEMETRY</span>
              </Link>

              <Link
                href="/admin/reports"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-all"
              >
                <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">REPORTS</span>
              </Link>

              <Link
                href="/admin/register"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-all"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">ENROLLMENT</span>
              </Link>

              <Link
                href="/admin/containers"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-all"
              >
                <QrCode className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">QR PLACARDS</span>
              </Link>
            </>
          )}

          {/* Primary Staff Button: PERSONNEL SCAN (Always visible) */}
          <Link
            href="/scan"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all active:scale-95 tracking-wider uppercase cursor-pointer"
          >
            <ScanLine className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>PERSONNEL SCAN</span>
          </Link>

          {/* Admin Login / Logout Toggle Button */}
          {mounted && (
            isAdmin ? (
              <button
                onClick={handleLogout}
                title="Log out of Admin mode"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-rose-950/80 text-gray-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">LOGOUT</span>
              </button>
            ) : (
              <Link
                href="/admin/login"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-[#07090e] hover:bg-slate-800 text-gray-400 hover:text-gray-200 border border-slate-700 transition-all cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">ADMIN LOGIN</span>
              </Link>
            )
          )}

          {/* Theme Light / Dark Mode Toggle Button */}
          {mounted && (
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              className="flex items-center justify-center p-2 rounded-lg border border-slate-800 bg-[#07090e] hover:bg-slate-800 text-amber-400 transition-all cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-sky-400" />
              )}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
