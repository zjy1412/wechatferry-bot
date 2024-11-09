import axios from 'axios';
import { JSDOM } from 'jsdom';
import { log } from '../utils/logger.js';
import pdf from 'pdf-parse';

export class URLReaderService {
  async readURL(url) {
    try {
      const response = await axios.get(url, {
        responseType: url.endsWith('.pdf') ? 'arraybuffer' : 'text'
      });

      if (url.endsWith('.pdf')) {
        const pdfData = await pdf(response.data);
        return {
          title: url.split('/').pop(),
          content: pdfData.text,
          type: 'pdf'
        };
      } else {
        const dom = new JSDOM(response.data);
        const document = dom.window.document;

        // Remove script and style elements
        const scripts = document.getElementsByTagName('script');
        const styles = document.getElementsByTagName('style');
        [...scripts, ...styles].forEach(element => element.remove());

        const title = document.title;
        const content = document.body.textContent.replace(/\\s+/g, ' ').trim();

        return {
          title,
          content,
          type: 'webpage'
        };
      }
    } catch (error) {
      log('error', `Failed to read URL: ${error}`);
      throw new Error(`Failed to read URL: ${error.message}`);
    }
  }
}