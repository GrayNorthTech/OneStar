import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 mb-5 border-b border-[#DCE2EA] dark:border-[#242D3D]">
    <div className="min-w-0">
      <h1 className="font-display text-xl font-semibold tracking-tight text-[#0B1018] dark:text-white truncate">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-[13px] text-[#526075] dark:text-[#94A3B8]">
          {description}
        </p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2.5 shrink-0 flex-wrap">{actions}</div>}
  </div>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md';
  }
> = ({ variant = 'secondary', size = 'md', className = '', ...props }) => {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047FF] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-[13px]',
  };
  const variants = {
    primary: 'bg-[#0047FF] text-white hover:bg-[#0039CC] border border-[#0047FF]',
    secondary:
      'bg-white dark:bg-[#141A24] text-[#0B1018] dark:text-[#E2E8F0] border border-[#DCE2EA] dark:border-[#2B3548] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432]',
    danger:
      'bg-white dark:bg-[#141A24] text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[#7F1D1D] hover:bg-[#FEF2F2] dark:hover:bg-[#450A0A]/40',
    ghost: 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0B1018] dark:hover:text-white hover:bg-[#EBF0F6] dark:hover:bg-[#1C2432]',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
};

// Clean unboxed semantic status text (strict Zero-Pill discipline — never rounded pill capsules)
export const StatusText: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  const v = (value || '').toLowerCase();
  let tone = 'text-[#475569] dark:text-[#94A3B8]';
  if (['active', 'completed', 'approved', 'paid', 'won', 'resolved', 'connected', 'deployed', 'accepted', 'active (api key configured)'].includes(v)) {
    tone = 'text-[#15803D] dark:text-[#4ADE80]';
  } else if (['in progress', 'scheduled', 'sent', 'assigned', 'qualified', 'proposal sent', 'negotiation', 'onboarding', 'refurbished', 'dispatched', 'configured (pending verification)'].includes(v)) {
    tone = 'text-[#0047FF] dark:text-[#60A5FA]';
  } else if (['pending', 'draft', 'awaiting customer', 'awaiting parts', 'on hold', 'partial', 'under evaluation', 'under repair', 'pending retirement', 'not configured', 'high'].includes(v)) {
    tone = 'text-[#B45309] dark:text-[#FBBF24]';
  } else if (['critical', 'escalated', 'overdue', 'rejected', 'lost', 'cancelled', 'deactivated', 'blocked', 'expired', 'disposed', 'unavailable (planned)'].includes(v)) {
    tone = 'text-[#B91C1C] dark:text-[#F87171]';
  }
  return <span className={`font-medium text-[12.5px] whitespace-nowrap ${tone} ${className}`}>{value}</span>;
};

export const Surface: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md ${className}`}>
    {children}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="py-12 px-6 text-center bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md">
    <h3 className="font-display text-[15px] font-semibold text-[#0B1018] dark:text-white">{title}</h3>
    <p className="mt-1.5 text-[13px] text-[#526075] dark:text-[#94A3B8] max-w-md mx-auto">{description}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1018]/60 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${maxWidth} bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#2B3548] rounded-md shadow-xl overflow-hidden my-auto`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#DCE2EA] dark:border-[#242D3D]">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[#0B1018] dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#526075] dark:text-[#94A3B8]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-md text-[#526075] hover:text-[#0B1018] dark:text-[#94A3B8] dark:hover:text-white hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, children }) => (
  <label className="block">
    <span className="block text-[12.5px] font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
      {label}
      {required && <span className="text-[#DC2626] ml-0.5">*</span>}
    </span>
    {children}
    {hint && <span className="block mt-1 text-[11.5px] text-[#64748B] dark:text-[#94A3B8]">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full px-3 py-2 text-[13px] rounded-md bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-[#F4F6F9] border border-[#DCE2EA] dark:border-[#2B3548] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0047FF] focus:ring-1 focus:ring-[#0047FF]';
