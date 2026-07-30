import { useState, useEffect } from "react";
// Subcomponents import
// @ts-ignore
import Dashboard from "./components/Dashboard";

export default function App() {
  const [utcTime, setUtcTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col selection:bg-amber-500/20" id="applet-container">
      {/* Main Content Workspace Layout with Premium Container Padding */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 md:px-6 py-6 flex flex-col" id="applet-viewport">
        <Dashboard />
      </main>

      {/* Footer banner */}
      <footer className="border-t border-slate-800 bg-[#0B1120] py-4 px-6 text-center shadow-xs" id="applet-footer">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2 text-xs md:text-sm text-slate-400 uppercase tracking-wider font-semibold font-mono">
          <span>CHAMBERFX © Private Institutional Syndicate — SECURE TERMINAL PORT</span>
          <span className="text-amber-500 font-bold">Spot & Futures Quantitative Market Intelligence</span>
        </div>
      </footer>
    </div>
  );
}

