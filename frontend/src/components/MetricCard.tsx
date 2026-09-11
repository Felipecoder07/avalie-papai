import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: ReactNode;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  accent?: 'default' | 'warning' | 'danger' | 'success';
  icon?: ReactNode;
}

function getMetricCardAccentBorder(accent: string) {
  if (accent === 'warning') {
    return 'border-l-warning';
  }
  if (accent === 'danger') {
    return 'border-l-danger';
  }
  if (accent === 'success') {
    return 'border-l-success';
  }
  return 'border-l-charcoal/20';
}

function getMetricCardTrendColor(trend: { value: string; direction: 'up' | 'down' | 'flat' } | undefined) {
  if (trend?.direction === 'up') {
    return 'text-success';
  }
  if (trend?.direction === 'down') {
    return 'text-danger';
  }
  return 'text-muted';
}

function getMetricCardTrendIcon(trend: { value: string; direction: 'up' | 'down' | 'flat' } | undefined) {
  if (trend?.direction === 'up') {
    return TrendingUp;
  }
  if (trend?.direction === 'down') {
    return TrendingDown;
  }
  return Minus;
}

export function MetricCard({ label, value, sub, trend, accent = 'default', icon }: Readonly<MetricCardProps>) {
  const TrendIcon = getMetricCardTrendIcon(trend);
  const trendColor = getMetricCardTrendColor(trend);
  const accentBorder = getMetricCardAccentBorder(accent);

  return (
    <div className={`bg-off-white border border-border-passive border-l-2 ${accentBorder} rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-shadow`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
        {icon && <span className="text-muted/60">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-charcoal tabular tracking-tight">{value}</span>
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon size={13} />
            {trend.value}
          </span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
