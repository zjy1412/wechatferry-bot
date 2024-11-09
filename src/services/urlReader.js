import axios from 'axios';
import { JSDOM } from 'jsdom';
import { log } from '../utils/logger.js';
import pdf from 'pdf-parse';

export class URLReaderService {
  isArxivURL(url) {
    return url.includes('arxiv.org');
  }

  normalizeArxivURL(url) {
    // Extract the paper ID
    const matches = url.match(/\d+\.\d+/);
    if (!matches) {
      throw new Error('Invalid arXiv URL format');
    }
    const paperId = matches[0];
    return `https://arxiv.org/pdf/${paperId}.pdf`;
  }

  async isPDFContent(response) {
    // Check if response is PDF by looking at the first few bytes
    // PDF files start with %PDF
    if (response.data instanceof ArrayBuffer) {
      const uint8Array = new Uint8Array(response.data.slice(0, 4));
      const header = String.fromCharCode.apply(null, uint8Array);
      return header.startsWith('%PDF');
    }
    return false;
  }

  async readURL(url) {
    try {
      // Handle arXiv URLs specially
      if (this.isArxivURL(url)) {
        const pdfUrl = this.normalizeArxivURL(url);
        log('info', `Normalized arXiv URL to: ${pdfUrl}`);
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        log('info', `Downloaded PDF from arXiv: ${pdfUrl}`);
        const pdfData = await pdf(response.data);
        // log('info', `Extracted text from PDF: ${pdfData.text}`);
        return {
          title: `arXiv:${url.match(/\d+\.\d+/)[0]}`,
          content: pdfData.text,
          type: 'pdf'
        };
      }

      // First try to get the content type without downloading the full file
      const headResponse = await axios.head(url).catch(() => null);
      const contentType = headResponse?.headers?.['content-type'] || '';
      const isPDF = contentType.includes('pdf') || url.endsWith('.pdf');

      // Get the actual content
      const response = await axios.get(url, {
        responseType: isPDF ? 'arraybuffer' : 'text'
      });

      // Double check if it's actually a PDF by looking at the content
      const actuallyIsPDF = isPDF || await this.isPDFContent(response);

      if (actuallyIsPDF) {
        const pdfData = await pdf(response.data);
        return {
          title: url.split('/').pop().replace('.pdf', ''),
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