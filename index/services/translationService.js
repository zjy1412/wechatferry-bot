import axios from 'axios';
import { log } from '../utils/logger.js';

export class TranslationService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async translate(text, targetLanguage) {
    try {
      const response = await axios.post('https://translation.googleapis.com/language/translate/v2', null, {
        params: {
          q: text,
          target: targetLanguage,
          key: this.apiKey
        }
      });
      return response.data.data.translations[0].translatedText;
    } catch (error) {
      log('error', `Translation failed: ${error}`, { text, targetLanguage });
      throw new Error(`Translation failed: ${error.message}`);
    }
  }
}
