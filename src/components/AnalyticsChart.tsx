
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Post } from '../types';

interface AnalyticsChartProps {
  posts: Post[];
}

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({ posts }) => {
  const sortedPosts = [...posts].sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());

  const data = sortedPosts.map(post => ({
    name: new Date(post.postedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    likes: post.engagement.likes,
    comments: post.engagement.comments,
    shares: post.engagement.shares,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{
          top: 5, right: 30, left: 0, bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
        <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
        <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}/>
        <Legend wrapperStyle={{color: '#E5E7EB'}}/>
        <Line type="monotone" dataKey="likes" stroke="#3B82F6" strokeWidth={2} />
        <Line type="monotone" dataKey="comments" stroke="#8B5CF6" strokeWidth={2} />
        <Line type="monotone" dataKey="shares" stroke="#10B981" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
};