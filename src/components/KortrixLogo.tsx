import React from 'react';

interface KortrixLogoProps {
  logoDataUrl?: string;
  compact?: boolean;
  className?: string;
}

export const KortrixLogo: React.FC<KortrixLogoProps> = ({ logoDataUrl, compact = false, className = '' }) => {
  if (logoDataUrl && logoDataUrl.startsWith('data:image/')) {
    return (
      <div className={`flex items-center gap-2.5 shrink-0 ${className}`}>
        <img
          src={logoDataUrl}
          alt="KORTRIX Official Logo"
          referrerPolicy="no-referrer"
          className={compact ? 'h-7 w-7 object-contain' : 'h-7 max-w-[140px] object-contain'}
        />
        {!compact && (
          <span className="font-display text-xs font-semibold tracking-wider text-[#0047FF] whitespace-nowrap">
            ONE
          </span>
        )}
      </div>
    );
  }

  // Crisp architectural KORTRIX brand monogram + wordmark (replaceable with official raster/SVG in Company Settings)
  return (
    <div className={`flex items-center gap-2.5 shrink-0 select-none ${className}`}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="4" fill="#0047FF" />
        <path d="M7.5 6.5H11V13.2L17.4 6.5H21.6L14.8 13.7L22 21.5H17.6L11 14.3V21.5H7.5V6.5Z" fill="#FFFFFF" />
      </svg>
      {!compact && (
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-display text-[15px] font-bold tracking-[0.06em] text-[#0B1018] dark:text-[#FFFFFF]">
            KORTRIX
          </span>
          <span className="font-display text-[12px] font-semibold tracking-[0.08em] text-[#0047FF]">
            ONE
          </span>
        </div>
      )}
    </div>
  );
};
