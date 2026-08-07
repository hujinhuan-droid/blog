import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { SiteStatsResponse } from "@ai-agent/api";

export function SiteTraffic({ stats }: { stats: SiteStatsResponse | null }) {
    const { t } = useTranslation();
    return (
        <div className="wauto ani-show mb-6">
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-black dark:text-white">{t('traffic.title')}</h3>
                    <span className="text-xs text-neutral-400">{t('traffic.desc')}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <Stat label={t('traffic.pv')} value={stats ? formatNumber(stats.pv) : "-"} />
                    <Stat label={t('traffic.uv')} value={stats ? formatNumber(stats.uv) : "-"} />
                    <Stat label={t('traffic.today')} value={stats ? formatNumber(stats.today) : "-"} />
                </div>
                {stats && stats.topArticles.length > 0 && (
                    <div className="mt-5">
                        <p className="text-sm font-semibold text-neutral-500 mb-2">{t('traffic.topArticles')}</p>
                        <ol className="space-y-1">
                            {stats.topArticles.map((a, i) => (
                                <li key={a.id} className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-300">
                                    <span className="truncate">
                                        <span className="text-theme font-bold mr-2">{i + 1}.</span>
                                        <Link href={`/feed/${a.id}`} className="hover:underline">
                                            {a.title || t('traffic.untitled')}
                                        </Link>
                                    </span>
                                    <span className="text-neutral-400 text-xs ml-2 whitespace-nowrap">
                                        {formatNumber(a.pv)} {t('traffic.views')}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-3 text-center">
            <div className="text-2xl font-bold text-theme">{value}</div>
            <div className="text-xs text-neutral-500 mt-1">{label}</div>
        </div>
    );
}

function formatNumber(n: number): string {
    return n.toLocaleString();
}
