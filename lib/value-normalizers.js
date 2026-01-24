/**
 * Value Normalizers for Lead Capture
 * 
 * Pure functions that compute enum bands from raw values.
 * Both raw values and computed bands are persisted to Hestia.
 */

// =============================================================================
// LAND VALUE BAND COMPUTATION
// =============================================================================

/**
 * Compute land value band from raw dollar amount
 * 
 * @param {number|string} rawValue - Raw dollar amount (e.g., 40000, "40000", "forty thousand")
 * @returns {{ raw: number|null, band: string|null }} - Both raw value and computed band
 */
export function computeLandValueBand(rawValue) {
  const numericValue = parseNumericValue(rawValue);
  
  if (numericValue === null) {
    return { raw: null, band: 'not_sure' };
  }
  
  let band;
  if (numericValue < 25000) {
    band = '0_25k';
  } else if (numericValue < 50000) {
    band = '25k_50k';
  } else if (numericValue < 100000) {
    band = '50k_100k';
  } else if (numericValue < 200000) {
    band = '100k_200k';
  } else {
    band = '200k_plus';
  }
  
  return { raw: numericValue, band };
}

// =============================================================================
// CREDIT BAND COMPUTATION
// =============================================================================

/**
 * Compute credit band from raw credit score
 * 
 * @param {number|string} rawValue - Raw credit score (e.g., 650, "650", "six fifty")
 * @returns {{ raw: number|null, band: string|null }} - Both raw value and computed band
 */
export function computeCreditBand(rawValue) {
  const numericValue = parseNumericValue(rawValue);
  
  if (numericValue === null) {
    return { raw: null, band: 'prefer_not_to_say' };
  }
  
  // Validate credit score range (300-850 is typical)
  if (numericValue < 300 || numericValue > 850) {
    return { raw: numericValue, band: 'prefer_not_to_say' };
  }
  
  let band;
  if (numericValue < 580) {
    band = 'under_580';
  } else if (numericValue < 620) {
    band = '580_619';
  } else if (numericValue < 680) {
    band = '620_679';
  } else if (numericValue < 720) {
    band = '680_719';
  } else {
    band = '720_plus';
  }
  
  return { raw: numericValue, band };
}

// =============================================================================
// TIMELINE BAND COMPUTATION
// =============================================================================

/**
 * Month name to number mapping
 */
const MONTH_NAMES = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Compute timeline band from raw timeline input
 * 
 * Handles:
 * - Month names: "April", "next April", "this April"
 * - Relative terms: "soon", "right away", "next month", "end of year", "next year"
 * - Explicit durations: "3 months", "6 months", "a year"
 * 
 * @param {string} rawValue - Raw timeline input
 * @param {Date} currentDate - Current date for month calculations (defaults to now)
 * @returns {{ raw: string, band: string, monthsOut: number|null, isAmbiguous?: boolean }} - Raw value, computed band, months out, and ambiguity flag
 */
export function computeTimelineBand(rawValue, currentDate = new Date()) {
  if (!rawValue || typeof rawValue !== 'string') {
    return { raw: rawValue || '', band: 'not_sure', monthsOut: null };
  }
  
  const input = rawValue.toLowerCase().trim();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  // Handle explicit band values (already normalized)
  if (['0_3_months', '3_6_months', '6_12_months', '12_plus', 'not_sure'].includes(input)) {
    return { raw: rawValue, band: input, monthsOut: null };
  }
  
  // Handle "not sure" variations
  if (input.includes('not sure') || input.includes('unsure') || input.includes("don't know")) {
    return { raw: rawValue, band: 'not_sure', monthsOut: null };
  }
  
  // Handle immediate/soon
  if (input.includes('right away') || input.includes('asap') || input.includes('immediately') ||
      input === 'soon' || input === 'now') {
    return { raw: rawValue, band: '0_3_months', monthsOut: 0 };
  }
  
  // Handle "next year"
  if (input.includes('next year') || input.includes('a year') || input.includes('over a year')) {
    return { raw: rawValue, band: '12_plus', monthsOut: 12 };
  }
  
  // Handle "end of year"
  if (input.includes('end of year') || input.includes('end of the year')) {
    const monthsToEndOfYear = 11 - currentMonth;
    return { 
      raw: rawValue, 
      band: monthsToEndOfYear <= 3 ? '0_3_months' : 
            monthsToEndOfYear <= 6 ? '3_6_months' : '6_12_months',
      monthsOut: monthsToEndOfYear 
    };
  }
  
  // Handle "next month"
  if (input.includes('next month')) {
    return { raw: rawValue, band: '0_3_months', monthsOut: 1 };
  }
  
  // Handle "few months"
  if (input.includes('few months') || input.includes('couple months') || input.includes('couple of months')) {
    return { raw: rawValue, band: '0_3_months', monthsOut: 2 };
  }
  
  // Handle explicit month counts: "3 months", "6 months", etc.
  const monthCountMatch = input.match(/(\d+)\s*months?/);
  if (monthCountMatch) {
    const months = parseInt(monthCountMatch[1], 10);
    let band;
    if (months <= 3) {
      band = '0_3_months';
    } else if (months <= 6) {
      band = '3_6_months';
    } else if (months <= 12) {
      band = '6_12_months';
    } else {
      band = '12_plus';
    }
    return { raw: rawValue, band, monthsOut: months };
  }
  
  // Handle month names
  for (const [monthName, monthNum] of Object.entries(MONTH_NAMES)) {
    if (input.includes(monthName)) {
      let targetMonth = monthNum;
      
      // Check for explicit year modifiers
      const isNextYear = input.includes('next year');
      const isThisYear = input.includes('this year');
      const hasNext = input.includes('next') && !isNextYear;  // "next February" not "next year"
      
      // Calculate months until target month
      let monthsOut;
      let isAmbiguous = false;
      
      if (isNextYear) {
        // Explicit "next year" - always means the following year
        monthsOut = 12 - currentMonth + targetMonth;
      } else if (isThisYear) {
        // Explicit "this year" - use this year
        if (targetMonth >= currentMonth) {
          monthsOut = targetMonth - currentMonth;
        } else {
          // Month already passed this year - they might mean it but that's in the past
          // Treat as next year occurrence but flag as needing clarification
          monthsOut = 12 - currentMonth + targetMonth;
          isAmbiguous = true;
        }
      } else if (targetMonth > currentMonth) {
        // Target month is later this year - assume this year
        // "February" or "next February" when in January both mean the upcoming Feb
        monthsOut = targetMonth - currentMonth;
      } else if (targetMonth === currentMonth) {
        // Same month - "this June" in June
        if (hasNext) {
          // "next June" in June = next year
          monthsOut = 12;
        } else {
          // Just "June" in June = could be now or next year, assume soon (0-3 months)
          monthsOut = 0;
        }
      } else {
        // Target month has already passed this year
        // "February" in March = next year's February
        // "next February" in March = definitely next year
        monthsOut = 12 - currentMonth + targetMonth;
      }
      
      // Determine band
      let band;
      if (monthsOut <= 3) {
        band = '0_3_months';
      } else if (monthsOut <= 6) {
        band = '3_6_months';
      } else if (monthsOut <= 12) {
        band = '6_12_months';
      } else {
        band = '12_plus';
      }
      
      return { raw: rawValue, band, monthsOut, isAmbiguous };
    }
  }
  
  // Default to not_sure if we can't parse
  return { raw: rawValue, band: 'not_sure', monthsOut: null };
}

// =============================================================================
// BEST TIME TO CONTACT BAND COMPUTATION
// =============================================================================

/**
 * Compute best time to contact band from raw input
 * 
 * Handles natural language like:
 * - "mornings", "in the morning", "before noon" → "morning"
 * - "afternoons", "after lunch", "midday" → "afternoon"
 * - "evenings", "after 5", "after work" → "evening"
 * - "weekday mornings", "weekdays before noon" → "weekday_morning"
 * - "weekday evenings", "after work on weekdays" → "weekday_evening"
 * - "weekends", "Saturday", "Sunday" → "weekend"
 * 
 * @param {string} rawValue - Raw input from user
 * @returns {{ raw: string, band: string }} - Raw value and computed band
 */
export function computeBestTimeToContactBand(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return { raw: rawValue || '', band: 'morning' }; // Default to morning
  }
  
  const input = rawValue.toLowerCase().trim();
  
  // Check if already a valid band
  const validBands = ['morning', 'afternoon', 'evening', 'weekday_morning', 'weekday_evening', 'weekend'];
  if (validBands.includes(input)) {
    return { raw: rawValue, band: input };
  }
  
  // Check for weekday-specific patterns
  const hasWeekday = input.includes('weekday') || 
                     (input.includes('week') && input.includes('day'));
  
  // Check for weekend patterns
  if (input.includes('weekend') || input.includes('saturday') || input.includes('sunday')) {
    return { raw: rawValue, band: 'weekend' };
  }
  
  // Morning patterns
  const isMorning = input.includes('morning') || 
                    input.includes('before noon') ||
                    input.includes('before lunch') ||
                    input.includes('am') ||
                    input.match(/before\s+(\d{1,2})\s*(pm)?/i)?.groups?.[1] < 12;
  
  // Afternoon patterns
  const isAfternoon = input.includes('afternoon') ||
                      input.includes('after lunch') ||
                      input.includes('midday') ||
                      input.includes('mid day') ||
                      input.includes('noon');
  
  // Evening patterns
  const isEvening = input.includes('evening') ||
                    input.includes('night') ||
                    input.includes('after work') ||
                    input.includes('after 5') ||
                    input.includes('after five') ||
                    input.includes('pm');
  
  // Determine the band
  if (hasWeekday) {
    if (isMorning) return { raw: rawValue, band: 'weekday_morning' };
    if (isEvening || input.includes('after work')) return { raw: rawValue, band: 'weekday_evening' };
    return { raw: rawValue, band: 'weekday_morning' }; // Default weekday to morning
  }
  
  if (isMorning) return { raw: rawValue, band: 'morning' };
  if (isAfternoon) return { raw: rawValue, band: 'afternoon' };
  if (isEvening) return { raw: rawValue, band: 'evening' };
  
  // Default to morning if we can't determine
  return { raw: rawValue, band: 'morning' };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse a numeric value from various input formats
 * 
 * @param {number|string} value - Input value
 * @returns {number|null} - Parsed numeric value or null
 */
export function parseNumericValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Already a number
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  
  if (typeof value !== 'string') {
    return null;
  }
  
  const input = value.toLowerCase().trim();
  
  // Handle word numbers
  const wordNumbers = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000, million: 1000000,
  };
  
  // Try to parse compound word numbers like "six fifty" (650) or "forty thousand" (40000)
  let words = input.replace(/[,$]/g, '').split(/\s+/);
  let result = 0;
  let current = 0;
  let hasWordNumber = false;
  
  // Special case: "six fifty" style credit scores (hundreds + tens)
  // This is a 3-digit number spoken as two words
  if (words.length === 2) {
    const firstWord = wordNumbers[words[0]];
    const secondWord = wordNumbers[words[1]];
    
    // Check if it's a credit score pattern: single digit (6,7) + tens (50, 20, etc)
    if (firstWord !== undefined && secondWord !== undefined && 
        firstWord >= 1 && firstWord <= 9 && 
        secondWord >= 10 && secondWord < 100) {
      return firstWord * 100 + secondWord;
    }
  }
  
  for (const word of words) {
    if (wordNumbers[word] !== undefined) {
      hasWordNumber = true;
      const num = wordNumbers[word];
      
      if (num === 100) {
        current = current === 0 ? 100 : current * 100;
      } else if (num === 1000) {
        current = current === 0 ? 1000 : current * 1000;
        result += current;
        current = 0;
      } else if (num === 1000000) {
        current = current === 0 ? 1000000 : current * 1000000;
        result += current;
        current = 0;
      } else {
        current += num;
      }
    }
  }
  
  if (hasWordNumber) {
    result += current;
    return result > 0 ? result : null;
  }
  
  // Try to parse as plain number
  const cleaned = input.replace(/[,$\s]/g, '');
  const parsed = parseFloat(cleaned);
  
  if (!isNaN(parsed)) {
    return parsed;
  }
  
  return null;
}

/**
 * Format a numeric value for speech (TTS-friendly)
 * 
 * @param {number} value - Numeric value
 * @param {string} type - Type of value: 'currency', 'credit', 'plain'
 * @returns {string} - Formatted string for speech
 */
export function formatValueForSpeech(value, type = 'plain') {
  if (value === null || value === undefined) {
    return '';
  }
  
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) {
    return String(value);
  }
  
  // Format based on type
  switch (type) {
    case 'currency':
      return formatCurrencyForSpeech(num);
    case 'credit':
      return formatCreditForSpeech(num);
    default:
      return num.toLocaleString('en-US');
  }
}

/**
 * Format currency for speech
 * Examples: 40000 -> "forty thousand dollars", 125000 -> "one hundred twenty five thousand dollars"
 */
function formatCurrencyForSpeech(value) {
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `${numberToWords(millions)} million dollars`;
  }
  
  if (value >= 1000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    if (remainder === 0) {
      return `${numberToWords(thousands)} thousand dollars`;
    }
    return `${numberToWords(thousands)} thousand ${numberToWords(remainder)} dollars`;
  }
  
  return `${numberToWords(value)} dollars`;
}

/**
 * Format credit score for speech
 * Examples: 650 -> "six fifty", 720 -> "seven twenty"
 */
function formatCreditForSpeech(value) {
  // Credit scores are typically read as pairs: "six fifty" for 650
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  
  const hundredWords = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  
  if (remainder === 0) {
    return `${hundredWords[hundreds]} hundred`;
  }
  
  if (remainder < 10) {
    return `${hundredWords[hundreds]} oh ${numberToWords(remainder)}`;
  }
  
  return `${hundredWords[hundreds]} ${numberToWords(remainder)}`;
}

/**
 * Convert number to words (simplified for common values)
 */
function numberToWords(num) {
  if (num === 0) return 'zero';
  
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  
  if (num < 20) {
    return ones[num];
  }
  
  if (num < 100) {
    const t = Math.floor(num / 10);
    const o = num % 10;
    return o === 0 ? tens[t] : `${tens[t]} ${ones[o]}`;
  }
  
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const remainder = num % 100;
    if (remainder === 0) {
      return `${ones[h]} hundred`;
    }
    return `${ones[h]} hundred ${numberToWords(remainder)}`;
  }
  
  // For larger numbers, just return the numeric string
  return num.toString();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  computeLandValueBand,
  computeCreditBand,
  computeTimelineBand,
  computeBestTimeToContactBand,
  parseNumericValue,
  formatValueForSpeech,
};
