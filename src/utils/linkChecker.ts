import axios from 'axios';
import { compareTwoStrings } from 'string-similarity';

export interface BrokenLink {
    fileName: string;
    filePath: string;
    brokenUrl: string;
    suggestedUrl?: string;
    confidence?: number;
}

export class LinkCheckerService {
    private docBaseUrl = 'https://docs.capillarytech.com';
    private sitemapUrls: string[] = [];

    async fetchSitemap(): Promise<string[]> {
        try {
            // In a real browser context, fetching a foreign sitemap will result in a CORS error.
            // For this tool, we'll try to use a CORS proxy or advise the user to use a browser extension.
            // Using a public CORS proxy for demonstration:
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
            // Using AllOrigins for CORS-friendly HEAD check (this is tricky with HEAD)
            // For now, let's stick to the URL directly and hope the user has CORS disabled or it's allowed
            await axios.get(url, { timeout: 10000, validateStatus: (status) => status < 400 });
            return true;
        } catch (error: any) {
            return false;
        }
    }

    suggestBestMatch(brokenUrl: string): { url: string; confidence: number } {
        if (this.sitemapUrls.length === 0) return { url: '', confidence: 0 };

        let bestMatch = { url: '', confidence: 0 };

        for (const url of this.sitemapUrls) {
            const score = compareTwoStrings(brokenUrl, url);
            if (score > bestMatch.confidence) {
                bestMatch = { url, confidence: score };
            }
        }

        return bestMatch;
    }
}
