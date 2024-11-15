import fs from 'fs';
import { log } from '../utils/logger.js';

export class StateManager {
  constructor() {
    this.dataDir = 'data';
    this.ensureDataDirectory();
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir);
    }
  }

  saveState(filename, data) {
    try {
      const filepath = `${this.dataDir}/${filename}.json`;
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      // log('info', `Saved state to ${filepath}`);
    } catch (error) {
      log('error', `Error saving state: ${error}`);
    }
  }

  loadState(filename) {
    try {
      const filepath = `${this.dataDir}/${filename}.json`;
      if (fs.existsSync(filepath)) {
        const data = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      log('error', `Error loading state: ${error}`);
    }
    return null;
  }

  deleteState(filename) {
    try {
      const filepath = `${this.dataDir}/${filename}.json`;
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (error) {
      log('error', `Error deleting state file: ${error}`);
    }
  }
}