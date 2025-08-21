import React from 'react';

interface KpiCardProps {
    title: string;
    icon: React.ReactNode;
    value: number;
    delta?: number;
    isLoading: boolean;
    children?: React.ReactNode;
}

const LoadingSkeleton: React.FC = () => (
    <div className="space-y-2 animate-pulse">
        <div className="h-7 bg-dark-border rounded w-1/2"></div>
        <div className="h-4 bg-dark-border rounded w-1/4"></div>
    </div>
);

export const KpiCard: React.FC<KpiCardProps> = ({ title, icon, value, delta, isLoading, children }) => {
    const isPositive = delta !== undefined && delta >= 0;
    const formattedValue = value.toLocaleString();
    const formattedDelta = delta !== undefined ? `${isPositive ? '+' : ''}${delta.toFixed(1)}%` : null;

    return (
        <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <div className="flex items-center justify-between text-dark-text-secondary mb-2">
                <span className="text-sm font-medium">{title}</span>
                {icon}
            </div>
            {isLoading ? (
                <LoadingSkeleton />
            ) : (
                <>
                    <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-bold text-white">{formattedValue}</p>
                        {formattedDelta && (
                            <span className={`text-sm font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                {formattedDelta}
                            </span>
                        )}
                    </div>
                    {children && <div className="mt-2 h-8">{children}</div>}
                </>
            )}
        </div>
    );
};
