/**
 * News Retrieval Agent - Fetches trending topics from multiple sources.
 */

import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import { NewsItem } from '../models';
import { RateLimiter, retryWithBackoff, globalCache } from '../utils';

// Stopwords for keyword extraction
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
  'until', 'while', 'this', 'that', 'these', 'those', 'over',
]);

export class NewsAgent extends BaseAgent {
  private config: Config;

  constructor(config: Config, rateLimiter?: RateLimiter) {
    super('news_agent', rateLimiter);
    this.config = config;
  }

  async execute(keywords?: string[]): Promise<NewsItem[]> {
    this.logger.info('Starting news retrieval from all sources');

    const tasks: Promise<NewsItem[]>[] = [];

    // NewsAPI (if configured)
    if (this.config.newsapiKey) {
      tasks.push(this.fetchNewsApi(keywords));
    }

    // Reddit (always available - public API)
    tasks.push(this.fetchReddit(keywords));

    // Twitter/X search requires a paid Basic or Pro API tier ($100+/mo).
    // The free tier returns 402, so this source is disabled by default.
    // Uncomment if you have a paid plan:
    // if (this.config.twitterBearerToken) {
    //   tasks.push(this.fetchTwitterTrends());
    // }

    // Hacker News (always available - public API)
    tasks.push(this.fetchHackerNews());

    // Gather all results
    const results = await Promise.allSettled(tasks);

    const allNews: NewsItem[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allNews.push(...result.value);
      } else {
        this.logger.error(`Source failed: ${result.reason}`);
      }
    }

    // Sort by relevance and recency
    allNews.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    // Apply content filters
    const filteredNews = this.applyFilters(allNews, keywords);

    this.logger.info(`Retrieved ${filteredNews.length} news items`);
    return filteredNews.slice(0, 5);
  }

  private async fetchNewsApi(keywords?: string[]): Promise<NewsItem[]> {
    const cacheKey = globalCache.makeKey('newsapi', keywords);
    const cached = globalCache.get<NewsItem[]>(cacheKey);
    if (cached) return cached;

    if (!(await this.rateLimiter.acquire('newsapi'))) {
      this.logger.warn('NewsAPI rate limited');
      return [];
    }

    return retryWithBackoff(
      async () => {
        const query = keywords?.length ? keywords.join(' OR ') : 'technology OR business OR trending';
        const url = new URL('https://newsapi.org/v2/everything');
        url.searchParams.set('q', query);
        url.searchParams.set('sortBy', 'publishedAt');
        url.searchParams.set('language', 'en');
        url.searchParams.set('pageSize', '20');
        url.searchParams.set('apiKey', this.config.newsapiKey!);

        const response = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
        if (!response.ok) {
          this.logger.error(`NewsAPI error: ${response.status}`);
          return [];
        }

        const data = await response.json() as { articles?: Array<{
          title?: string;
          url?: string;
          description?: string;
          publishedAt?: string;
        }> };

        const newsItems: NewsItem[] = [];
        for (const article of data.articles ?? []) {
          try {
            newsItems.push({
              topic: article.title ?? '',
              source: 'NewsAPI',
              url: article.url ?? '',
              summary: article.description ?? '',
              keywords: this.extractKeywords(article.title ?? ''),
              timestamp: article.publishedAt
                ? new Date(article.publishedAt)
                : new Date(),
              relevanceScore: 0.8,
            });
          } catch (e) {
            this.logger.debug(`Skipping article: ${e}`);
          }
        }

        globalCache.set(cacheKey, newsItems, 300000);
        return newsItems;
      },
      { maxRetries: 3, baseDelayMs: 2000 }
    );
  }

  private async fetchReddit(keywords?: string[]): Promise<NewsItem[]> {
    const cacheKey = globalCache.makeKey('reddit', keywords);
    const cached = globalCache.get<NewsItem[]>(cacheKey);
    if (cached) return cached;

    if (!(await this.rateLimiter.acquire('reddit'))) {
      this.logger.warn('Reddit rate limited');
      return [];
    }

    const subreddits = ['technology', 'business', 'news', 'worldnews'];
    if (keywords) {
      subreddits.push(...keywords.slice(0, 3).map((k) => k.toLowerCase()));
    }

    const newsItems: NewsItem[] = [];

    for (const subreddit of subreddits.slice(0, 5)) {
      try {
        const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json`, {
          headers: { 'User-Agent': 'SocialMediaBot/1.0' },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) continue;

        const data = await response.json() as {
          data?: {
            children?: Array<{
              data?: {
                title?: string;
                permalink?: string;
                selftext?: string;
                created_utc?: number;
                score?: number;
                is_self?: boolean;
              };
            }>;
          };
        };

        for (const post of (data.data?.children ?? []).slice(0, 5)) {
          const postData = post.data;
          if (!postData) continue;
          if (postData.is_self && !postData.selftext) continue;

          newsItems.push({
            topic: postData.title ?? '',
            source: `Reddit r/${subreddit}`,
            url: `https://reddit.com${postData.permalink ?? ''}`,
            summary: (postData.selftext ?? '').slice(0, 500) || (postData.title ?? ''),
            keywords: this.extractKeywords(postData.title ?? ''),
            timestamp: new Date((postData.created_utc ?? 0) * 1000),
            relevanceScore: Math.min((postData.score ?? 0) / 10000, 1.0),
          });
        }
      } catch (e) {
        this.logger.debug(`Reddit r/${subreddit} error: ${e}`);
      }
    }

    globalCache.set(cacheKey, newsItems, 300000);
    return newsItems;
  }

  // private async fetchTwitterTrends(): Promise<NewsItem[]> {
  //   const cacheKey = globalCache.makeKey('twitter_trends');
  //   const cached = globalCache.get<NewsItem[]>(cacheKey);
  //   if (cached) return cached;

  //   if (!(await this.rateLimiter.acquire('twitter'))) {
  //     this.logger.warn('Twitter rate limited');
  //     return [];
  //   }

  //   try {
  //     const url = new URL('https://api.twitter.com/2/tweets/search/recent');
  //     url.searchParams.set('query', 'trending OR viral -is:retweet');
  //     url.searchParams.set('max_results', '20');
  //     url.searchParams.set('tweet.fields', 'created_at,public_metrics');

  //     const response = await fetch(url.toString(), {
  //       headers: {
  //         Authorization: `Bearer ${this.config.twitterBearerToken}`,
  //       },
  //       signal: AbortSignal.timeout(30000),
  //     });

  //     if (!response.ok) {
  //       this.logger.error(`Twitter API error: ${response.status}`);
  //       return [];
  //     }

  //     const data = await response.json() as {
  //       data?: Array<{
  //         id?: string;
  //         text?: string;
  //         created_at?: string;
  //       }>;
  //     };

  //     const newsItems: NewsItem[] = [];
  //     for (const tweet of data.data ?? []) {
  //       newsItems.push({
  //         topic: (tweet.text ?? '').slice(0, 100),
  //         source: 'Twitter/X',
  //         url: `https://twitter.com/i/web/status/${tweet.id ?? ''}`,
  //         summary: tweet.text ?? '',
  //         keywords: this.extractKeywords(tweet.text ?? ''),
  //         timestamp: tweet.created_at ? new Date(tweet.created_at) : new Date(),
  //         relevanceScore: 0.7,
  //       });
  //     }

  //     globalCache.set(cacheKey, newsItems, 300000);
  //     return newsItems;
  //   } catch (e) {
  //     this.logger.error(`Twitter fetch error: ${e}`);
  //     return [];
  //   }
  // }

  private async fetchHackerNews(): Promise<NewsItem[]> {
    const cacheKey = globalCache.makeKey('hackernews');
    const cached = globalCache.get<NewsItem[]>(cacheKey);
    if (cached) return cached;

    if (!(await this.rateLimiter.acquire('hackernews'))) {
      this.logger.warn('Hacker News rate limited');
      return [];
    }

    try {
      const response = await fetch(
        'https://hacker-news.firebaseio.com/v0/topstories.json',
        { signal: AbortSignal.timeout(30000) }
      );

      if (!response.ok) return [];

      const storyIds = (await response.json()) as number[];
      const newsItems: NewsItem[] = [];

      for (const storyId of storyIds.slice(0, 10)) {
        try {
          const storyResponse = await fetch(
            `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`,
            { signal: AbortSignal.timeout(30000) }
          );

          if (!storyResponse.ok) continue;

          const story = await storyResponse.json() as {
            title?: string;
            url?: string;
            time?: number;
            score?: number;
            type?: string;
          };

          if (!story || story.type !== 'story') continue;

          newsItems.push({
            topic: story.title ?? '',
            source: 'Hacker News',
            url: story.url ?? `https://news.ycombinator.com/item?id=${storyId}`,
            summary: story.title ?? '',
            keywords: this.extractKeywords(story.title ?? ''),
            timestamp: new Date((story.time ?? 0) * 1000),
            relevanceScore: Math.min((story.score ?? 0) / 500, 1.0),
          });
        } catch (e) {
          this.logger.debug(`HN story ${storyId} error: ${e}`);
        }
      }

      globalCache.set(cacheKey, newsItems, 300000);
      return newsItems;
    } catch (e) {
      this.logger.error(`Hacker News fetch error: ${e}`);
      return [];
    }
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const keywords = words
      .map((word) => word.replace(/[.,!?:;"'()[\]{}]/g, ''))
      .filter((word) => !STOPWORDS.has(word) && word.length > 2);

    return [...new Set(keywords)].slice(0, 10);
  }

  private applyFilters(newsItems: NewsItem[], keywords?: string[]): NewsItem[] {
    const filtered: NewsItem[] = [];
    const seenTopics = new Set<string>();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const item of newsItems) {
      // Simple deduplication
      const topicKey = item.topic.toLowerCase().slice(0, 50);
      if (seenTopics.has(topicKey)) continue;
      seenTopics.add(topicKey);

      // Filter by recency (last 24 hours)
      if (item.timestamp < dayAgo) continue;

      // Filter by keywords if provided
      if (keywords?.length) {
        const itemText = `${item.topic} ${item.summary}`.toLowerCase();
        if (!keywords.some((kw) => itemText.includes(kw.toLowerCase()))) {
          continue;
        }
      }

      filtered.push(item);
    }

    return filtered;
  }
}
