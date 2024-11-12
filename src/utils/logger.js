export const log = (level, message, context = {}) => {
    const timestamp = new Date().toISOString();
    const contextInfo = Object.keys(context).map(key => `${key}=${context[key]}`).join(', ');
    console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message} | Context: ${contextInfo}`);
  };
