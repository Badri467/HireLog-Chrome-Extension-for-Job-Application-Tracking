// content/content-script.js — HireLog Universal Job Data Extractor
// Runs on ALL URLs. Detects job pages and extracts structured data.
// Strategy: Portal-specific selectors → JSON-LD schema → Meta tags → Generic heuristics

'use strict';

// ──────────────────────────────────────────────
// Portal-specific CSS selector maps
// Add new portals here without touching any other code
// ──────────────────────────────────────────────

const PORTAL_SELECTORS = {

  // ── Global Job Boards ──────────────────────
  'linkedin.com': {
    title:       ['.job-details-jobs-unified-top-card__job-title h1',
                  '.jobs-unified-top-card__job-title h1',
                  '.t-24.t-bold.inline',
                  'h1.job-title'],
    company:     ['.job-details-jobs-unified-top-card__company-name a',
                  '.jobs-unified-top-card__company-name',
                  '.topcard__org-name-link'],
    location:    ['.job-details-jobs-unified-top-card__bullet',
                  '.jobs-unified-top-card__bullet'],
    description: ['.jobs-description__content .jobs-box__html-content',
                  '#job-details',
                  '.jobs-description'],
  },

  'indeed.com': {
    title:       ['[data-testid="jobsearch-JobInfoHeader-title"]',
                  'h1.jobsearch-JobInfoHeader-title',
                  '.jobsearch-JobInfoHeader-title span:first-child'],
    company:     ['[data-testid="inlineHeader-companyName"] a',
                  '[data-testid="inlineHeader-companyName"]',
                  '.icl-u-lg-mr--sm a'],
    location:    ['[data-testid="job-location"]',
                  '.icl-u-xs-mt--xs.icl-u-textColor--secondary'],
    description: ['#jobDescriptionText', '.jobsearch-jobDescriptionText'],
  },

  'glassdoor.com': {
    title:       ['[data-test="job-title"]',
                  '.job-title',
                  'h1[data-test="job-title"]'],
    company:     ['[data-test="employer-name"]',
                  '.employer-name',
                  '.css-16nw49e'],
    location:    ['[data-test="location"]', '.location'],
    description: ['[data-test="description"]',
                  '.jobDescriptionContent',
                  '.desc'],
  },

  // ── Indian Portals ─────────────────────────
  'naukri.com': {
    title:       ['.jd-header-title', 'h1.jobTitle', '.title'],
    company:     ['.jd-header-comp-name a', '.comp-name', '.companyName a'],
    location:    ['.locWdth', '.location', '.loc'],
    description: ['.job-desc', '.jd-desc', '.dang-inner-html'],
  },

  'shine.com': {
    title:       ['h1.job-title', '.jd-title h1'],
    company:     ['.company-name a', '.comp-name'],
    location:    ['.location-text'],
    description: ['.job-description'],
  },

  'internshala.com': {
    title:       ['.internship_heading h1', '.job_heading h1', '.heading_4_5'],
    company:     ['.company-name a', '.heading_6 a'],
    location:    ['.location_link'],
    description: ['.internship_details', '.job_details'],
  },

  'instahyre.com': {
    title:       ['.job-title h1', '.job-heading'],
    company:     ['.company-name', '.org-name a'],
    location:    ['.job-location'],
    description: ['.job-description', '.description-text'],
  },

  'cutshort.io': {
    title:       ['h1.job-title', '.role-name h1'],
    company:     ['.company-link', '.company-name'],
    location:    ['.job-location'],
    description: ['.job-description-content'],
  },

  'foundit.in': {
    title:       ['.designationTitle', 'h1.jd-designation'],
    company:     ['.companyInfo a', '.company-name'],
    location:    ['.loc a', '.location'],
    description: ['.job-desc-main', '.jd-description'],
  },

  'iimjobs.com': {
    title:       ['h1.job-title'],
    company:     ['.company-name a'],
    location:    ['.location'],
    description: ['.job-desc'],
  },

  'apna.co': {
    title:       ['h1.job-title', '.designation'],
    company:     ['.company-name'],
    location:    ['.job-location'],
    description: ['.job-description'],
  },

  // ── ATS Platforms ──────────────────────────
  'greenhouse.io': {
    title:       ['h1.app-title', 'h2.posting-title', '.posting-headline h2'],
    company:     ['.company-name', 'span.company-name'],
    location:    ['.location', '.posting-categories .location'],
    description: ['.content', '#content', '.job-post-description'],
  },

  'lever.co': {
    title:       ['.posting-headline h2', '.posting-name h2', 'h2.posting-title'],
    company:     ['.posting-headline .sort-by-team', '.main-header-text .company'],
    location:    ['.posting-headline .sort-by-location', '.sort-by-location'],
    description: ['.posting-description', '.posting-requirements'],
  },

  'myworkdayjobs.com': {
    title:       ['[data-automation-id="jobPostingHeader"]',
                  'h2[data-automation-id="jobPostingHeader"]'],
    company:     ['[data-automation-id="jobPostingCompanyName"]',
                  '.css-1q2dra3'],
    location:    ['[data-automation-id="locations"]'],
    description: ['[data-automation-id="jobPostingDescription"]',
                  '.wd-rich-text-viewer'],
  },

  'smartrecruiters.com': {
    title:       ['h1.job-title', '.job-title h1'],
    company:     ['.company-name', '.job-company-name'],
    location:    ['.job-detail-location'],
    description: ['.job-sections', '.job-description'],
  },

  'bamboohr.com': {
    title:       ['h2.Header-module--pageTitle--', '.page-title h2'],
    company:     ['.Header-module--companyName--'],
    location:    ['[data-tname="jobLocation"]', '.detail-content .location'],
    description: ['#job-description', '.job-description'],
  },

  'ashbyhq.com': {
    title:       ['h1', '.ashby-job-posting-heading'],
    company:     ['.ashby-job-posting-brief-company'],
    location:    ['.ashby-job-posting-brief-location'],
    description: ['.ashby-application-form-stack'],
  },

  'workable.com': {
    title:       ['h1.posting-title', '.job-title h1'],
    company:     ['.company-details h2', '.company-name'],
    location:    ['.listing-location'],
    description: ['.description', '#job-description'],
  },

  'icims.com': {
    title:       ['h1#icims_page_header_job_title', '.iCIMS_Header_Job h1'],
    company:     ['.iCIMS_Header_Employer'],
    location:    ['.iCIMS_JobHeaderField .iCIMS_InfoMsg_Wrapper'],
    description: ['#JobDescriptionWrapper', '.iCIMS_JobContent'],
  },

  'jobvite.com': {
    title:       ['h1.jv-header'],
    company:     ['.jv-company'],
    location:    ['.jv-location'],
    description: ['.jv-job-detail-description', '#job-description'],
  },

  // ── Tech-specific boards ───────────────────
  'wellfound.com': {
    title:       ['h1.job-title', '.styles_title__xpQDw', 'h1'],
    company:     ['.company-title a', '.styles_company__Y4mCI'],
    location:    ['.job-listing-location', '.styles_location__gOXtI'],
    description: ['.job-description', '.styles_description__GXOdN'],
  },

  'stackoverflow.com': {
    title:       ['h1.fs-headline1 a', 'h1[itemprop="title"] a'],
    company:     ['.employer a', '.ps-relative .fc-black-800'],
    location:    ['.location'],
    description: ['#job-description-content', '.description-block'],
  },

  'remoteok.com': {
    title:       ['h2[itemprop="title"]'],
    company:     ['[itemprop="hiringOrganization"] [itemprop="name"]'],
    location:    ['.location'],
    description: ['.description'],
  },

  'weworkremotely.com': {
    title:       ['h1.listing-header-container h2'],
    company:     ['h1.listing-header-container h3 a'],
    description: ['.listing-container'],
  },

  // ── International ──────────────────────────
  'seek.com.au': {
    title:       ['[data-automation="job-detail-title"]', 'h1'],
    company:     ['[data-automation="advertiser-name"] a', '.FYwKg'],
    location:    ['[data-automation="job-detail-location"]'],
    description: ['[data-automation="jobAdDetails"]', '#jobAdDetails'],
  },

  'reed.co.uk': {
    title:       ['h1[itemprop="title"]', '.job-title h1'],
    company:     ['[itemprop="name"]', '.employer-name a'],
    location:    ['[itemprop="jobLocation"]'],
    description: ['[itemprop="description"]', '.description'],
  },

  'totalJobs.com': {
    title:       ['h1.job-title'],
    company:     ['.employer-name a'],
    location:    ['.job-location'],
    description: ['.job-description'],
  },
};

// ──────────────────────────────────────────────
// Query helper — tries selectors in order, returns first match
// ──────────────────────────────────────────────

function queryText(selectors, parent = document) {
  if (!selectors) return null;
  for (const sel of selectors) {
    try {
      const el = parent.querySelector(sel);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text.length > 0) return text;
      }
    } catch (e) { /* bad selector, skip */ }
  }
  return null;
}

function queryInnerText(selectors, maxLen = 6000, parent = document) {
  if (!selectors) return null;
  for (const sel of selectors) {
    try {
      const el = parent.querySelector(sel);
      if (el) {
        const text = (el.innerText || '').trim();
        if (text.length > 50) return text.substring(0, maxLen);
      }
    } catch (e) {}
  }
  return null;
}

// ──────────────────────────────────────────────
// Strategy 1: JSON-LD structured data (schema.org/JobPosting)
// Many modern job boards & ATS platforms embed this
// ──────────────────────────────────────────────

function extractFromJSONLD() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      let data = JSON.parse(script.textContent);
      if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting') || data[0];
      if (data && (data['@type'] === 'JobPosting' || data.title)) {
        const location = data.jobLocation?.address?.addressLocality
          || data.jobLocation?.address?.addressRegion
          || (Array.isArray(data.jobLocation)
              ? data.jobLocation[0]?.address?.addressLocality
              : null);
        const desc = data.description
          ? data.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 6000)
          : null;
        return {
          title:       data.title || null,
          company:     data.hiringOrganization?.name || null,
          location:    location || null,
          description: desc,
        };
      }
    } catch (e) {}
  }
  return null;
}

// ──────────────────────────────────────────────
// Strategy 2: OpenGraph / meta tags
// og:title often follows patterns like "Engineer at Google | LinkedIn"
// ──────────────────────────────────────────────

function extractFromMeta() {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim();
  const description = document.querySelector('meta[name="description"]')?.content?.trim()
    || document.querySelector('meta[property="og:description"]')?.content?.trim();

  if (!ogTitle) return null;

  // Pattern: "Software Engineer at Google" or "Software Engineer at Google | Indeed"
  const atMatch = ogTitle.match(/^(.+?)\s+at\s+([^|–\-]+)/i);
  if (atMatch) return { title: atMatch[1].trim(), company: atMatch[2].trim(), description };

  // Pattern: "Google - Software Engineer" or "Google | Software Engineer"
  const separatorMatch = ogTitle.match(/^([^|\-–]+)[|\-–]\s*(.+)/);
  if (separatorMatch) {
    // Heuristic: if first part looks like a company (no job keywords) use it as company
    const part1 = separatorMatch[1].trim();
    const part2 = separatorMatch[2].trim();
    const jobWords = /engineer|developer|manager|analyst|designer|scientist|lead|head|director|intern|associate/i;
    if (!jobWords.test(part1) && jobWords.test(part2)) {
      return { title: part2, company: part1, description };
    }
    return { title: part1, company: null, description };
  }

  return { title: ogTitle, company: null, description };
}

// ──────────────────────────────────────────────
// Strategy 3: Generic DOM heuristics
// Fallback for completely unknown portals
// ──────────────────────────────────────────────

function extractGeneric() {
  // Job title — usually the page's h1
  const h1 = document.querySelector('h1');
  const title = h1?.innerText?.trim() || null;

  // Company — look for common class/id patterns
  const companySelectors = [
    '[class*="company-name"]', '[class*="companyName"]', '[class*="company_name"]',
    '[class*="employer"]', '[class*="hiring-org"]', '[id*="company"]',
    '[itemprop="name"]', '[class*="org-name"]', '[class*="employer-name"]',
  ];
  const company = queryText(companySelectors);

  // Location
  const locationSelectors = [
    '[class*="location"]', '[class*="city"]', '[itemprop="addressLocality"]',
  ];
  const location = queryText(locationSelectors);

  // Description — grab the largest text block
  const descSelectors = [
    '[class*="job-description"]', '[class*="jobDescription"]', '[class*="job_description"]',
    '[class*="job-detail"]',  '[class*="jobDetail"]',
    '[class*="description"]', '[id*="description"]',
    'article', 'main',
  ];
  const description = queryInnerText(descSelectors);

  return { title, company, location, description };
}

// ──────────────────────────────────────────────
// Page-level job detection heuristic
// ──────────────────────────────────────────────

function isLikelyJobPage() {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const keywords = ['job', 'career', 'position', 'vacancy', 'opening', 'apply', 'hiring', 'recruit', 'role', 'internship'];
  return keywords.some(k => url.includes(k) || title.includes(k));
}

// ──────────────────────────────────────────────
// Main extraction orchestrator
// ──────────────────────────────────────────────

function extractJobData() {
  let result = { title: null, company: null, location: null, description: null };

  // Strategy 1: Portal-specific selectors
  const hostname = window.location.hostname.replace('www.', '');
  for (const [domain, selectors] of Object.entries(PORTAL_SELECTORS)) {
    if (hostname.includes(domain) || domain.includes(hostname)) {
      const portalData = {
        title:       queryText(selectors.title),
        company:     queryText(selectors.company),
        location:    selectors.location ? queryText(selectors.location) : null,
        description: selectors.description ? queryInnerText(selectors.description) : null,
      };
      // Merge in non-null values
      for (const [k, v] of Object.entries(portalData)) {
        if (v && !result[k]) result[k] = v;
      }
      if (result.title && result.company) break; // good enough
      break;
    }
  }

  // Strategy 2: JSON-LD
  if (!result.title || !result.company) {
    const jsonLd = extractFromJSONLD();
    if (jsonLd) {
      for (const [k, v] of Object.entries(jsonLd)) {
        if (v && !result[k]) result[k] = v;
      }
    }
  }

  // Strategy 3: Meta tags
  if (!result.title || !result.company) {
    const meta = extractFromMeta();
    if (meta) {
      for (const [k, v] of Object.entries(meta)) {
        if (v && !result[k]) result[k] = v;
      }
    }
  }

  // Strategy 4: Generic DOM heuristics
  if (!result.title || !result.company) {
    const generic = extractGeneric();
    for (const [k, v] of Object.entries(generic)) {
      if (v && !result[k]) result[k] = v;
    }
  }

  // Fallback: extract company name from domain/subdomain for ATS and corporate pages
  if (!result.company) {
    const hostname = window.location.hostname.replace('www.', '').toLowerCase();
    const pathname = window.location.pathname;
    let detectedCompany = null;

    if (hostname.includes('myworkdayjobs.com')) {
      const match = hostname.match(/^([^.]+)/);
      if (match) detectedCompany = match[1];
    } else if (hostname.includes('greenhouse.io')) {
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'boards') detectedCompany = match[1];
      else {
        const sub = hostname.split('.')[0];
        if (sub !== 'boards' && sub !== 'jobs') detectedCompany = sub;
      }
    } else if (hostname.includes('lever.co')) {
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'jobs') detectedCompany = match[1];
    } else if (hostname.includes('ashbyhq.com')) {
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'jobs') detectedCompany = match[1];
    } else if (hostname.includes('bamboohr.com')) {
      const match = hostname.match(/^([^.]+)/);
      if (match && match[1] !== 'careers' && match[1] !== 'jobs') detectedCompany = match[1];
    } else if (hostname.includes('smartrecruiters.com')) {
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'careers') detectedCompany = match[1];
    } else if (hostname.includes('workable.com')) {
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'apply') detectedCompany = match[1];
    }

    // Universal corporate domain fallback (e.g. stripe.com -> stripe)
    if (!detectedCompany) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const sld = parts[parts.length - 2];
        const commonHosts = ['com', 'org', 'net', 'edu', 'gov', 'co', 'io', 'in', 'us', 'uk', 'ca', 'au', 'ai', 'app', 'dev', 'jobs', 'careers'];
        if (!commonHosts.includes(sld)) {
          detectedCompany = sld;
        }
      }
    }

    if (detectedCompany) {
      const cleanCompany = detectedCompany
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      result.company = cleanCompany;
    }
  }

  const isJobPage = isLikelyJobPage() || !!(result.title && result.company);

  return {
    ...result,
    url: window.location.href,
    pageTitle: document.title,
    isJobPage,
  };
}

// ──────────────────────────────────────────────
// Badge signalling — tell the service worker to highlight the icon
// when we're on a likely job page
// ──────────────────────────────────────────────

(function signalBadge() {
  const data = extractJobData();
  if (data.isJobPage && (data.title || data.company)) {
    chrome.runtime.sendMessage({ action: 'setJobBadge' }).catch(() => {});
  }
})();

// ──────────────────────────────────────────────
// Message listener — popup requests data
// ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractJobData') {
    try {
      const data = extractJobData();
      sendResponse(data);
    } catch (e) {
      sendResponse({ isJobPage: false, url: window.location.href });
    }
  }
  return true; // keep channel open for async sendResponse
});


