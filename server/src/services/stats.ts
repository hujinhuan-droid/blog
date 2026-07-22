import { count, desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import type { Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feeds, siteVisits, siteVisitStats, visitStats } from "../db/schema";
import { HyperLogLog } from "../utils/hyperloglog";

// Single-row id for the site-wide stats record
const SITE_STATS_ID = 1;

export function StatsService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // POST /stats/track - record a homepage/site visit (PV + UV via HyperLogLog)
    app.post("/track", async (c) => {
        const db = c.get('db');
        const clientConfig = c.get('clientConfig');
        const enableVisit = await profileAsync(c, 'site_counter_flag', () =>
            clientConfig.getOrDefault('counter.enabled', true)
        );
        if (!enableVisit) {
            return c.json({ success: true, skipped: true });
        }

        const ip = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || "UNK";

        // Keep a raw visit log for the "today" count
        await profileAsync(c, 'site_visit_insert', () => db.insert(siteVisits).values({ ip }));

        const stats = await profileAsync(c, 'site_stats_lookup', () =>
            db.query.siteVisitStats.findFirst({ where: eq(siteVisitStats.id, SITE_STATS_ID) })
        );

        if (!stats) {
            await profileAsync(c, 'site_stats_insert', () => db.insert(siteVisitStats).values({
                id: SITE_STATS_ID,
                pv: 1,
                hllData: new HyperLogLog().serialize(),
            }));
        } else {
            const hll = new HyperLogLog(stats.hllData);
            hll.add(ip);
            const newPv = stats.pv + 1;
            await profileAsync(c, 'site_stats_update', () => db.update(siteVisitStats).set({
                pv: newPv,
                hllData: hll.serialize(),
                updatedAt: new Date(),
            }).where(eq(siteVisitStats.id, SITE_STATS_ID)));
        }

        return c.json({ success: true });
    });

    // GET /stats - return site-wide traffic statistics
    app.get("/", async (c) => {
        const db = c.get('db');
        const clientConfig = c.get('clientConfig');
        const enableVisit = await profileAsync(c, 'site_counter_flag_get', () =>
            clientConfig.getOrDefault('counter.enabled', true)
        );

        const stats = await profileAsync(c, 'site_stats_lookup_get', () =>
            db.query.siteVisitStats.findFirst({ where: eq(siteVisitStats.id, SITE_STATS_ID) })
        );
        const pv = stats?.pv ?? 0;
        const uv = stats ? Math.round(new HyperLogLog(stats.hllData).count()) : 0;

        // Today's visits (local day start)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayRes = await profileAsync(c, 'site_today_count', () =>
            db.select({ value: count() })
                .from(siteVisits)
                .where(gte(siteVisits.createdAt, startOfDay))
        );
        const today = todayRes[0]?.value ?? 0;

        // Top articles by PV (reuses the existing article-level visit_stats)
        let topArticles: Array<{ id: number; title: string | null; pv: number }> = [];
        if (enableVisit) {
            topArticles = await profileAsync(c, 'site_top_articles', () =>
                db.select({
                    id: feeds.id,
                    title: feeds.title,
                    pv: visitStats.pv,
                })
                    .from(visitStats)
                    .innerJoin(feeds, eq(visitStats.feedId, feeds.id))
                    .orderBy(desc(visitStats.pv))
                    .limit(5)
            );
        }

        return c.json({ enabled: enableVisit, pv, uv, today, topArticles });
    });

    return app;
}
