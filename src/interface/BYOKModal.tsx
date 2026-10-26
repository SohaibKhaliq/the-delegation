// VIEW-ONLY notice — replaces the old Gemini BYOK modal.
//
// This fork no longer uses Gemini at all: there is no API key to enter, no
// key is stored, and no link to a key-issuing page is offered. The dashboard
// displays real Muse agent data (see src/muse/museStore.ts) and agents are
// controlled from Muse chat only. This component keeps the old modal's
// props (onClose) so Header can render it without a wider refactor.
import { X } from 'lucide-react';
import React from 'react';

interface BYOKModalProps {
  onClose: () => void;
}

const BYOKModal: React.FC<BYOKModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl"
      />
      <div className="relative w-full max-w-md bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-10 border border-zinc-100">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-zinc-300 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
        <div className="max-w-md mx-auto">
          <h2 className="text-3xl font-black text-darkDelegation tracking-tight mb-2">
            View-only — no key needed
          </h2>
          <p className="text-zinc-400 text-sm font-medium leading-relaxed">
            This dashboard shows real Muse agent data. It does not use Gemini,
            it does not ask for an API key, and it cannot start, command, or
            approve agents. Agent control stays in Muse chat.
          </p>
          <button
            onClick={onClose}
            className="mt-8 px-12 py-4 bg-darkDelegation text-white rounded-[24px] text-xs font-black uppercase tracking-[0.2em] hover:bg-black transition-all active:scale-95 cursor-pointer shadow-xl shadow-black/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BYOKModal;
