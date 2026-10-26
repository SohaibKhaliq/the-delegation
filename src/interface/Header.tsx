import { Info, Eye, Maximize2 } from 'lucide-react';
import React, { useState } from 'react';
import packageJson from '../../package.json';
import { useUiStore } from '../integration/store/uiStore';
import BYOKModal from './BYOKModal';
import InfoModal from './InfoModal';

const version = packageJson.version;

const Header: React.FC = () => {
  const { isBYOKOpen, setBYOKOpen } = useUiStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <header className="h-14 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0 relative z-40">
      {/* Left: Project Title — owner branding (S.O.N.I.A / Muse Agents) */}
      <div className="flex items-center min-w-0">
        <div className="flex flex-col leading-none shrink-0">
          <span className="text-lg font-black tracking-tight text-darkDelegation">S.O.N.I.A</span>
          <span className="text-[10px] font-medium text-zinc-400 tracking-wider">Muse Agents</span>
        </div>

        <div className="flex items-center gap-3 self-center ml-3 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="text-zinc-300 hover:text-zinc-500 transition-colors cursor-pointer"
            >
              <Info size={14} strokeWidth={2} />
            </button>
            <span className="text-[10px] font-medium text-zinc-400 font-mono">v{version}-muse</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <a
              href="https://github.com/sohaibkhaliq"
              target="_blank"
              rel="noopener"
              className="text-[10px] font-medium text-zinc-400 hover:text-darkDelegation transition-colors truncate"
            >
              @sohaibkhaliq
            </a>
            <a
              href="https://github.com/SohaibKhaliq/the-delegation"
              target="_blank"
              rel="noopener"
              className="text-zinc-300 hover:text-darkDelegation transition-colors shrink-0"
              title="View on GitHub"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            </a>
          </div>
        </div>
      </div>

      {/* Right: Global Controls */}
      <div className="flex items-center gap-3">

        {/* MANAGE TEAMS button removed by owner order: the only team is the
            owner's Muse team, synced from the feed (see src/muse/museSync.ts).
            No team manager / team switching entry point remains in the header. */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFullscreen}
            className="text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="Fullscreen Browser"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={() => setBYOKOpen(true)}
            className="relative text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="View-only — no API key needed"
          >
            <Eye size={16} />
          </button>
        </div>
      </div>

      {isInfoOpen && (
        <InfoModal key="info-modal" onClose={() => setIsInfoOpen(false)} />
      )}

      {isBYOKOpen && (
        <BYOKModal key="byok-modal" onClose={() => setBYOKOpen(false)} />
      )}
    </header>
  );
};

export default Header;
