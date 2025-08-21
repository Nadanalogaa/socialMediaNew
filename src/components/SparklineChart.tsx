import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineChartProps {
    data: { name: string; value: number }[];
}

export const SparklineChart: React.FC<SparklineChartProps> = ({ data }) => {
    if (!data || data.length < 2) return null;

    const isPositive = data[data.length - 1].value >= data[0].value;
    const strokeColor = isPositive ? '#34D399' : '#F87171';
    
    // Find min/max for YAxis domain to give some padding
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max-min) * 0.1;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                <YAxis hide domain={[min - padding, max + padding]} />
                <Line
                    type="monotone"
                    dataKey="value"
                    stroke={strokeColor}
                    strokeWidth={2}
                    dot={false}
                />
            </LineChart>
        </ResponsiveContainer>
    );
};
