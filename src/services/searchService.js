import { SearxngClient } from '@agentic/searxng';
import { log } from '../utils/logger.js';

export class SearchService {
  constructor(apiBaseUrl) {
    this.client = new SearxngClient({ apiBaseUrl });
  }

  async search(keywords) {
    try {
      log('info', `Searching the internet for: ${keywords}`);
      const query = keywords.join(' ');
      const searchResults = await this.client.search({
        query,
        categories: ['general'],
        engines: ['google', 'bing', 'duckduckgo']
      });

      const formattedResults = searchResults.results.slice(0, 5).map(result => ({
        title: result.title,
        url: result.url,
        content: result.content
      }));
      log('info', `Search results: ${JSON.stringify(formattedResults)}`);
      return formattedResults;
    } catch (error) {
      log('error', `Search failed: ${error}`);
      return [];
    }
  }
}