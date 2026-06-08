import React, { useMemo } from 'react';
import { PieChart, TrendingUp, Calendar, Hash, Layers, Globe } from 'lucide-react';

const StatsDashboard = ({ bookmarks, stacks }) => {
    const stats = useMemo(() => {
        const totalBookmarks = bookmarks.length;
        const totalStacks = stacks.length;

        // Tag Stats
        const tagCounts = {};
        let totalTags = 0;
        bookmarks.forEach(b => {
            b.tags.forEach(t => {
                const tag = t.toLowerCase();
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        const uniqueTags = Object.keys(tagCounts).length;
        const topTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        // Domain Stats
        const domainCounts = {};
        bookmarks.forEach(b => {
            try {
                const domain = new URL(b.url).hostname.replace('www.', '');
                domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            } catch (e) { }
        });
        const topDomains = Object.entries(domainCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // Recent Activity
        const recent = [...bookmarks]
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) // Assuming created_at exists, else minimal sort
            .slice(0, 5);

        return { totalBookmarks, totalStacks, uniqueTags, topTags, topDomains, recent };
    }, [bookmarks, stacks]);

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in p-4">

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Bookmarks"
                    value={stats.totalBookmarks}
                    icon={<Globe size={24} className="text-blue-400" />}
                    trend="+12% this week" // Mock trend
                />
                <StatCard
                    title="Unique Tags"
                    value={stats.uniqueTags}
                    icon={<Hash size={24} className="text-purple-400" />}
                />
                <StatCard
                    title="Stacks Created"
                    value={stats.totalStacks}
                    icon={<Layers size={24} className="text-orange-400" />}
                />
                <StatCard
                    title="Active Domains"
                    value={Object.keys(stats.topDomains).length + "+"} // Just a visual
                    icon={<PieChart size={24} className="text-green-400" />}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Tags */}
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-medium text-zinc-100 mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-purple-400" />
                        Top Tags
                    </h3>
                    <div className="space-y-4">
                        {stats.topTags.map(([tag, count], index) => (
                            <div key={tag} className="relative">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-zinc-300 font-medium">#{tag}</span>
                                    <span className="text-zinc-500">{count}</span>
                                </div>
                                <div className="w-full bg-zinc-800/50 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-purple-500/80 h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${(count / stats.topTags[0][1]) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Domains & Recent */}
                <div className="space-y-8">
                    {/* Top Domains */}
                    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
                        <h3 className="text-lg font-medium text-zinc-100 mb-6 flex items-center gap-2">
                            <Globe size={20} className="text-blue-400" />
                            Top Sources
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {stats.topDomains.map(([domain, count]) => (
                                <div key={domain} className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                                    <img
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                        alt=""
                                        className="w-4 h-4 rounded-sm"
                                    />
                                    <span className="text-sm text-zinc-300">{domain}</span>
                                    <span className="text-xs text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded ml-1">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent */}
                    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
                        <h3 className="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
                            <Calendar size={20} className="text-green-400" />
                            Recently Captured
                        </h3>
                        <div className="space-y-3">
                            {stats.recent.map(b => (
                                <a
                                    key={b.id}
                                    href={b.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-3 p-3 hover:bg-zinc-800/30 rounded-lg transition-colors group"
                                >
                                    <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {b.image ? (
                                            <img src={b.image} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                                        ) : (
                                            <Globe size={16} className="text-zinc-600" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm text-zinc-300 truncate group-hover:text-zinc-100">{b.title || b.url}</h4>
                                        <p className="text-xs text-zinc-500 truncate">{new URL(b.url).hostname}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon, trend }) => (
    <div className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-2xl hover:border-zinc-700 transition-colors">
        <div className="flex justify-between items-start mb-4">
            <div>
                <p className="text-zinc-500 text-sm font-medium mb-1">{title}</p>
                <h4 className="text-3xl font-light text-zinc-100">{value}</h4>
            </div>
            <div className="p-2 bg-zinc-800/50 rounded-xl">
                {icon}
            </div>
        </div>
        {trend && (
            <p className="text-xs text-emerald-400 font-medium bg-emerald-500/10 inline-block px-2 py-0.5 rounded">
                {trend}
            </p>
        )}
    </div>
);

export default StatsDashboard;
