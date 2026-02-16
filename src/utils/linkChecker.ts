import axios from 'axios';
import { compareTwoStrings } from 'string-similarity';

export interface BrokenLink {
    fileName: string;
    filePath: string;
    brokenUrl: string;
    suggestedUrl?: string;
    allSuggestions?: { url: string; confidence: number }[];
    confidence?: number;
}

export class LinkCheckerService {
    private docBaseUrl = 'https://docs.capillarytech.com';
    private sitemapUrls: string[] = [];

    async fetchSitemap(): Promise<string[]> {
        if (this.sitemapUrls.length > 0) return this.sitemapUrls;

        try {
            const proxy = 'https://api.allorigins.win/raw?url=';
            const response = await axios.get(`${proxy}${encodeURIComponent(this.docBaseUrl + '/sitemap.xml')}`);

            if (!response.data || typeof response.data !== 'string') {
                throw new Error('Invalid sitemap response');
            }

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response.data, 'text/xml');

            // Check for parsing errors
            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                throw new Error('Sitemap XML parsing failed');
            }

            const locs = xmlDoc.getElementsByTagName('loc');
            this.sitemapUrls = Array.from(locs)
                .map(loc => loc.textContent?.trim() || '')
                .filter(url => url.startsWith('http'))
                .map(url => url.replace(/\/$/, '')); // Normalize by removing trailing slash

            console.log(`Loaded ${this.sitemapUrls.length} valid URLs from sitemap.`);
            return this.sitemapUrls;
        } catch (error) {
            console.error('Error fetching sitemap:', error);
            return [];
        }
    }

    extractLinks(content: string): string[] {
        // Find everything that looks like a capillary docs link
        const regex = /https:\/\/docs\.capillarytech\.com\/[a-zA-Z0-9\-\_\.\/]+/g;
        return Array.from(new Set(content.match(regex) || []));
    }

    async checkUrl(url: string): Promise<boolean> {
        const normalizedUrl = url.replace(/\/$/, '');

        // 1. Source of Truth: If it's in the sitemap, it's valid.
        // This avoids CORS issues entirely for 99% of links.
        if (this.sitemapUrls.includes(normalizedUrl)) {
            return true;
        }

        // 2. Fallback: If not in sitemap, it MIGHT be a new or hidden page.
        // Try a proxy check as a last resort.
        try {
            const proxy = 'https://api.allorigins.win/get?url=';
            const response = await axios.get(`${proxy}${encodeURIComponent(url)}`, { timeout: 8000 });
            // AllOrigins wraps the result, check status inside
            return response.status === 200 && response.data.contents !== null;
        } catch (error: any) {
            return false;
        }
    }

    suggestMatches(brokenUrl: string): { url: string; confidence: number }[] {
        if (this.sitemapUrls.length === 0) return [];

        const normalizedBroken = brokenUrl.replace(/\/$/, '');
        const brokenSlug = normalizedBroken.split('/').pop() || '';

        const matches = this.sitemapUrls.map(url => {
            const targetSlug = url.split('/').pop() || '';

            // Score based on full URL similarity
            const urlScore = compareTwoStrings(normalizedBroken, url);

            // Score based on slug similarity (high importance for moved files)
            const slugScore = compareTwoStrings(brokenSlug, targetSlug);

            // Weighted average: prioritizing slug match
            const totalScore = (urlScore * 0.4) + (slugScore * 0.6);

            return { url, confidence: totalScore };
        });

        return matches
            .filter(m => m.confidence > 0.15)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }
}
