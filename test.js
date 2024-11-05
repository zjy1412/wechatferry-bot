import { SearxngService, type SearxngServiceConfig } from 'searxng';

const config: SearxngServiceConfig = {
  baseURL: 'https://your-searxng-instance.com'
};

const searxngService = new SearxngService(config);

async function performSearchWithParams() {
  const searchParams = {
    categories: ['general', 'web'],
    engines: ['google', 'bing'],
    lang: 'en',
    pageno: 2,
    time_range: 'month',
    format: 'json',
  };

  try {
    const results = await searxngService.search('example query', searchParams);
    console.log(results);
  } catch (error) {
    console.error('Search failed:', error);
  }
}

performSearchWithParams();