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
        try {
            const proxy = 'https://api.allorigins.win/raw?url=';
            const response = await axios.get(`${proxy}${encodeURIComponent(this.docBaseUrl + '/sitemap.xml')}`);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response.data, 'text/xml');
            const locs = xmlDoc.getElementsByTagName('loc');
            this.sitemapUrls = Array.from(locs).map(loc => loc.textContent || '').filter(url => url !== '');
            return this.sitemapUrls;
        } catch (error) {
            console.error('Error fetching sitemap:', error);
            return [];
        }
    }

    extractLinks(content: string): string[] {
        const regex = /https:\/\/docs\.capillarytech\.com\/[a-zA-Z0-9\-\_\.\/]+/g;
        return Array.from(new Set(content.match(regex) || []));
    }

    async checkUrl(url: string): Promise<boolean> {
        try {
            // Some URLs might block proxy or direct access, but we'll try a status check
            await axios.get(url, { timeout: 10000, validateStatus: (status) => status < 400 });
            return true;
        } catch (error: any) {
            return false;
        }
    }

    suggestMatches(brokenUrl: string): { url: string; confidence: number }[] {
        if (this.sitemapUrls.length === 0) return [];

        const brokenSlug = brokenUrl.split('/').pop() || '';

        const matches = this.sitemapUrls.map(url => {
            const targetSlug = url.split('/').pop() || '';

            // Score based on full URL similarity
            const urlScore = compareTwoStrings(brokenUrl, url);

            // Score based on slug similarity (often more important)
            const slugScore = compareTwoStrings(brokenSlug, targetSlug);

            // Weighted average: prioritizing slug match
            const totalScore = (urlScore * 0.4) + (slugScore * 0.6);

            return { url, confidence: totalScore };
        });

        // Filter out very low confidence and sort
        return matches
            .filter(m => m.confidence > 0.2)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }
}
