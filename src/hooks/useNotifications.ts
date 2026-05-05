import { useEffect } from 'react';

import { useNewsStore } from '@/stores/newsStore';
import { useNotificationStore } from '@/stores/notificationStore';
import type { Notification } from '@/stores/notificationStore';
import type { NewsCluster } from '@/types/entities';

/** Minimum distinct sources for a cluster to qualify as "major". */
const MIN_SOURCES = 2;

/** Minimum keyword count on primary article to qualify single-source clusters. */
const MIN_KEYWORDS_SINGLE_SOURCE = 3;

/**
 * Count distinct source names across all articles in a cluster.
 */
function countDistinctSources(cluster: NewsCluster): number {
  const sources = new Set<string>();
  for (const article of cluster.articles) {
    sources.add(article.source);
  }
  return sources.size;
}

/**
 * Filter clusters to only "major" news:
 * - Multi-source: 2+ distinct sources in the cluster, OR
 * - High keyword density: primary article has 3+ conflict keywords
 */
function isMajorCluster(cluster: NewsCluster): boolean {
  if (countDistinctSources(cluster) >= MIN_SOURCES) return true;
  if (cluster.primaryArticle.keywords.length >= MIN_KEYWORDS_SINGLE_SOURCE) return true;
  return false;
}

/**
 * Derives notifications from newsStore clusters.
 * Only major news releases (multi-source or high keyword density) become notifications.
 * Call once in AppShell alongside other polling hooks.
 */
export function useNotifications(): void {
  const clusters = useNewsStore((s) => s.clusters);
  const setNotifications = useNotificationStore((s) => s.setNotifications);

  useEffect(() => {
    const major = clusters.filter(isMajorCluster);

    const notifications: Notification[] = major.map((cluster) => {
      const sourceCount = countDistinctSources(cluster);
      return {
        id: cluster.id,
        title: cluster.primaryArticle.title,
        url: cluster.primaryArticle.url,
        source: cluster.primaryArticle.source,
        sourceCount,
        articleCount: cluster.articles.length,
        keywords: cluster.primaryArticle.keywords,
        timestamp: cluster.firstSeen,
        lastUpdated: cluster.lastUpdated,
      };
    });

    // Sort by lastUpdated descending (most recent activity first)
    notifications.sort((a, b) => b.lastUpdated - a.lastUpdated);

    setNotifications(notifications);
  }, [clusters, setNotifications]);
}
