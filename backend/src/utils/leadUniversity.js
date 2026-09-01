const CONSUMER_EXACT = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'pm.me',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'charter.net',
  'earthlink.net', 'optonline.net', 'peoplepc.com', 'bellsouth.net', 'prodigy.net',
  'juno.com', 'netzero.net', 'mail.com', 'gmx.com', 'gmx.net', 'zoho.com', 'yandex.com',
  'inbox.com', 'fastmail.com', 'hushmail.com', 'tutanota.com', 'frontier.com',
  'windstream.net', 'centurylink.net', 'suddenlink.net', 'wowway.com', 'qq.com',
  'rediffmail.com', '163.com', '126.com', 'btinternet.com', 'sky.com', 'ntlworld.com',
  'virginmedia.com', 'blueyonder.co.uk', 'talktalk.net', 'shaw.ca', 'rogers.com',
  'sympatico.ca', 'bell.net', 'telus.net', 'videotron.ca',
]);

const CONSUMER_SUFFIXES = ['.rr.com', '.yahoo.com', '.hotmail.com', '.outlook.com'];

/** Well-known academic domains → display name. Unmapped academic domains still get a readable stem. */
const UNIVERSITY_MAP = {
  'clemson.edu': 'Clemson University',
  'psu.edu': 'Penn State University',
  'case.edu': 'Case Western Reserve University',
  'osu.edu': 'Ohio State University',
  'uc.edu': 'University of Cincinnati',
  'ohio.edu': 'Ohio University',
  'ncsu.edu': 'NC State University',
  'potsdam.edu': 'SUNY Potsdam',
  'ccsu.edu': 'Central Connecticut State University',
  'uoregon.edu': 'University of Oregon',
  'williams.edu': 'Williams College',
  'syr.edu': 'Syracuse University',
  'augusta.edu': 'Augusta University',
  'brynmawr.edu': 'Bryn Mawr College',
  'cardiff.ac.uk': 'Cardiff University',
  'seattleu.edu': 'Seattle University',
  'oregonstate.edu': 'Oregon State University',
  'olemiss.edu': 'University of Mississippi',
  'uw.edu': 'University of Washington',
  'hws.edu': 'Hobart and William Smith Colleges',
  'lvc.edu': 'Lebanon Valley College',
  'marquette.edu': 'Marquette University',
  'adelaide.edu.au': 'University of Adelaide',
  'unh.edu': 'University of New Hampshire',
  'auburn.edu': 'Auburn University',
  'drexel.edu': 'Drexel University',
  'pitt.edu': 'University of Pittsburgh',
  'pdx.edu': 'Portland State University',
  'bgsu.edu': 'Bowling Green State University',
  'southwestern.edu': 'Southwestern University',
  'aber.ac.uk': 'Aberystwyth University',
  'wisc.edu': 'University of Wisconsin–Madison',
  'umd.edu': 'University of Maryland',
  'wvu.edu': 'West Virginia University',
  'colostate.edu': 'Colorado State University',
  'umn.edu': 'University of Minnesota',
  'columbia.edu': 'Columbia University',
  'gc.cuny.edu': 'CUNY Graduate Center',
  'cuny.edu': 'City University of New York',
  'flinders.edu.au': 'Flinders University',
  'fandm.edu': 'Franklin & Marshall College',
  'uwsuper.edu': 'University of Wisconsin–Superior',
  'bucknell.edu': 'Bucknell University',
  'purdue.edu': 'Purdue University',
  'iu.edu': 'Indiana University',
  'ou.edu': 'University of Oklahoma',
  'illinois.edu': 'University of Illinois',
  'arcadia.edu': 'Arcadia University',
  'stanford.edu': 'Stanford University',
  'harvard.edu': 'Harvard University',
  'mit.edu': 'MIT',
  'yale.edu': 'Yale University',
  'princeton.edu': 'Princeton University',
  'berkeley.edu': 'UC Berkeley',
  'ucla.edu': 'UCLA',
  'umich.edu': 'University of Michigan',
  'utexas.edu': 'University of Texas at Austin',
  'nyu.edu': 'New York University',
  'cornell.edu': 'Cornell University',
  'duke.edu': 'Duke University',
  'northwestern.edu': 'Northwestern University',
  'uchicago.edu': 'University of Chicago',
  'jhu.edu': 'Johns Hopkins University',
  'cmu.edu': 'Carnegie Mellon University',
  'gatech.edu': 'Georgia Tech',
  'vt.edu': 'Virginia Tech',
  'fsu.edu': 'Florida State University',
  'ufl.edu': 'University of Florida',
  'uga.edu': 'University of Georgia',
  'unc.edu': 'UNC Chapel Hill',
  'asu.edu': 'Arizona State University',
  'arizona.edu': 'University of Arizona',
  'unm.edu': 'University of New Mexico',
  'unl.edu': 'University of Nebraska–Lincoln',
  'ku.edu': 'University of Kansas',
  'ksu.edu': 'Kansas State University',
  'missouri.edu': 'University of Missouri',
  'msu.edu': 'Michigan State University',
  'wayne.edu': 'Wayne State University',
  'temple.edu': 'Temple University',
  'rutgers.edu': 'Rutgers University',
  'stonybrook.edu': 'Stony Brook University',
  'buffalo.edu': 'University at Buffalo',
  'albany.edu': 'University at Albany',
  'binghamton.edu': 'Binghamton University',
  'rpi.edu': 'Rensselaer Polytechnic Institute',
  'vanderbilt.edu': 'Vanderbilt University',
  'emory.edu': 'Emory University',
  'rice.edu': 'Rice University',
  'tulane.edu': 'Tulane University',
  'baylor.edu': 'Baylor University',
  'tamu.edu': 'Texas A&M University',
  'uh.edu': 'University of Houston',
  'smu.edu': 'SMU',
  'bc.edu': 'Boston College',
  'bu.edu': 'Boston University',
  'northeastern.edu': 'Northeastern University',
  'umass.edu': 'UMass Amherst',
  'uri.edu': 'University of Rhode Island',
  'uconn.edu': 'University of Connecticut',
  'udel.edu': 'University of Delaware',
  'gwu.edu': 'George Washington University',
  'georgetown.edu': 'Georgetown University',
  'american.edu': 'American University',
  'gmu.edu': 'George Mason University',
  'vcu.edu': 'Virginia Commonwealth University',
  'odu.edu': 'Old Dominion University',
  'jmu.edu': 'James Madison University',
  'wm.edu': 'William & Mary',
  'miami.edu': 'University of Miami',
  'fiu.edu': 'Florida International University',
  'ucf.edu': 'University of Central Florida',
  'usf.edu': 'University of South Florida',
  'lsu.edu': 'LSU',
  'msstate.edu': 'Mississippi State University',
  'ua.edu': 'University of Alabama',
  'uab.edu': 'University of Alabama at Birmingham',
  'utk.edu': 'University of Tennessee',
  'uky.edu': 'University of Kentucky',
  'louisville.edu': 'University of Louisville',
  'indiana.edu': 'Indiana University',
  'nd.edu': 'University of Notre Dame',
  'depaul.edu': 'DePaul University',
  'luc.edu': 'Loyola University Chicago',
  'uic.edu': 'University of Illinois Chicago',
  'iastate.edu': 'Iowa State University',
  'uiowa.edu': 'University of Iowa',
  'wustl.edu': 'Washington University in St. Louis',
  'slu.edu': 'Saint Louis University',
  'colorado.edu': 'University of Colorado Boulder',
  'du.edu': 'University of Denver',
  'utah.edu': 'University of Utah',
  'byu.edu': 'Brigham Young University',
  'unlv.edu': 'UNLV',
  'unr.edu': 'University of Nevada, Reno',
  'sdsu.edu': 'San Diego State University',
  'ucsd.edu': 'UC San Diego',
  'uci.edu': 'UC Irvine',
  'ucdavis.edu': 'UC Davis',
  'ucsb.edu': 'UC Santa Barbara',
  'ucsc.edu': 'UC Santa Cruz',
  'usc.edu': 'University of Southern California',
  'caltech.edu': 'Caltech',
  'washington.edu': 'University of Washington',
  'wsu.edu': 'Washington State University',
  'oregon.edu': 'University of Oregon',
  'uidaho.edu': 'University of Idaho',
  'montana.edu': 'Montana State University',
  'umt.edu': 'University of Montana',
  'uwyo.edu': 'University of Wyoming',
  'ndsu.edu': 'North Dakota State University',
  'und.edu': 'University of North Dakota',
  'sdstate.edu': 'South Dakota State University',
  'usd.edu': 'University of South Dakota',
  'hawaii.edu': 'University of Hawaii',
  'alaska.edu': 'University of Alaska',
  'dal.ca': 'Dalhousie University',
  'utoronto.ca': 'University of Toronto',
  'ubc.ca': 'University of British Columbia',
  'mcgill.ca': 'McGill University',
  'uwaterloo.ca': 'University of Waterloo',
  'queensu.ca': 'Queen\'s University',
  'ualberta.ca': 'University of Alberta',
  'ucalgary.ca': 'University of Calgary',
  'sfu.ca': 'Simon Fraser University',
  'yorku.ca': 'York University',
  'uwo.ca': 'Western University',
  'ox.ac.uk': 'University of Oxford',
  'cam.ac.uk': 'University of Cambridge',
  'ucl.ac.uk': 'UCL',
  'imperial.ac.uk': 'Imperial College London',
  'ed.ac.uk': 'University of Edinburgh',
  'gla.ac.uk': 'University of Glasgow',
  'manchester.ac.uk': 'University of Manchester',
  'leeds.ac.uk': 'University of Leeds',
  'sheffield.ac.uk': 'University of Sheffield',
  'bristol.ac.uk': 'University of Bristol',
  'nottingham.ac.uk': 'University of Nottingham',
  'bham.ac.uk': 'University of Birmingham',
  'soton.ac.uk': 'University of Southampton',
  'warwick.ac.uk': 'University of Warwick',
  'kcl.ac.uk': 'King\'s College London',
  'lse.ac.uk': 'LSE',
  'qmul.ac.uk': 'Queen Mary University of London',
  'unimelb.edu.au': 'University of Melbourne',
  'sydney.edu.au': 'University of Sydney',
  'unsw.edu.au': 'UNSW Sydney',
  'anu.edu.au': 'Australian National University',
  'uq.edu.au': 'University of Queensland',
  'monash.edu': 'Monash University',
  'auckland.ac.nz': 'University of Auckland',
  'otago.ac.nz': 'University of Otago',
  'nus.edu.sg': 'National University of Singapore',
  'ntu.edu.sg': 'Nanyang Technological University',
  'hku.hk': 'University of Hong Kong',
  'cuhk.edu.hk': 'CUHK',
  'ust.hk': 'HKUST',
};

const MAIL_PREFIX = /^(mail|email|e-mail|smtp|outlook|ucmail|alumni|staff|faculty|student|students|users|mailbox)\./i;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function emailDomain(email) {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  return at === -1 ? '' : e.slice(at + 1);
}

export function isConsumerDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return true;
  if (CONSUMER_EXACT.has(d)) return true;
  return CONSUMER_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

export function isAcademicDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d || isConsumerDomain(d)) return false;
  return (
    d.endsWith('.edu')
    || d.includes('.edu.')
    || d.includes('.ac.')
    || d.endsWith('.ac.uk')
    || d.endsWith('.edu.au')
  );
}

function canonicalDomain(domain) {
  let d = String(domain || '').toLowerCase().replace(/^www\./, '');
  d = d.replace(MAIL_PREFIX, '');
  // mail.wvu.edu → wvu.edu (second pass if nested)
  d = d.replace(MAIL_PREFIX, '');
  return d;
}

function titleCaseStem(stem) {
  return stem
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function prettyFromDomain(domain) {
  const d = canonicalDomain(domain);
  if (UNIVERSITY_MAP[d]) return UNIVERSITY_MAP[d];

  let stem = d
    .replace(/\.edu\.au$/, '')
    .replace(/\.ac\.uk$/, '')
    .replace(/\.edu$/, '')
    .replace(/\.ac\.[a-z]{2}$/, '')
    .replace(/\.edu\.[a-z]{2}$/, '')
    .replace(/\.ac\.za$/, '')
    .replace(/\.ac\.nz$/, '');

  const parts = stem.split('.').filter(Boolean);
  const main = parts[parts.length - 1] || stem;
  if (UNIVERSITY_MAP[`${main}.edu`]) return UNIVERSITY_MAP[`${main}.edu`];
  if (UNIVERSITY_MAP[`${main}.ac.uk`]) return UNIVERSITY_MAP[`${main}.ac.uk`];
  return titleCaseStem(main) || d;
}

export function inferCountry(domain) {
  const d = canonicalDomain(domain);
  if (!d || isConsumerDomain(d)) return null;
  if (d.endsWith('.edu') || d.endsWith('.edu.us')) return 'United States';
  if (d.endsWith('.ac.uk') || d.endsWith('.gov.uk') || d.endsWith('.org.uk')) return 'United Kingdom';
  if (d.endsWith('.edu.au') || d.endsWith('.ac.au') || d.endsWith('.gov.au')) return 'Australia';
  if (d.endsWith('.ac.nz') || d.endsWith('.edu.nz')) return 'New Zealand';
  if (d.endsWith('.edu.sg') || d.endsWith('.ac.sg')) return 'Singapore';
  if (d.endsWith('.ac.za') || d.endsWith('.edu.za')) return 'South Africa';
  if (d.endsWith('.ac.jp') || d.endsWith('.ed.jp')) return 'Japan';
  if (d.endsWith('.edu.hk') || d.endsWith('.ac.hk') || d.endsWith('.hk')) return 'Hong Kong';
  if (d.endsWith('.ac.il') || d.endsWith('.edu.il')) return 'Israel';
  if (d.endsWith('.edu.in') || d.endsWith('.ac.in')) return 'India';
  if (d.endsWith('.edu.pk') || d.endsWith('.ac.pk')) return 'Pakistan';
  if (d.endsWith('.edu.mx') || d.endsWith('.ac.mx')) return 'Mexico';
  if (d.endsWith('.edu.br') || d.endsWith('.ac.br')) return 'Brazil';
  if (d.endsWith('.ac.kr') || d.endsWith('.edu.kr')) return 'South Korea';
  if (d.endsWith('.edu.cn') || d.endsWith('.ac.cn')) return 'China';
  if (d.endsWith('.edu.tw') || d.endsWith('.ac.tw')) return 'Taiwan';
  if (d.endsWith('.ac.ie') || d.endsWith('.edu.ie')) return 'Ireland';
  if (d.endsWith('.ac.at')) return 'Austria';
  if (d.endsWith('.ac.be')) return 'Belgium';
  if (d.endsWith('.edu.de') || d.endsWith('.ac.de')) return 'Germany';
  if (d.endsWith('.ac.fr') || d.endsWith('.edu.fr')) return 'France';
  if (d.endsWith('.ac.nl') || d.endsWith('.nl') && isAcademicDomain(d)) return 'Netherlands';
  if (d.endsWith('.ca') && !isConsumerDomain(d)) return 'Canada';
  if (isAcademicDomain(d)) return 'United States';
  return null;
}

export function inferUniversity(domain, explicit) {
  const named = String(explicit || '').trim();
  if (named) return named.slice(0, 160);
  const d = canonicalDomain(domain);
  if (!d || isConsumerDomain(d) || !isAcademicDomain(d)) return null;
  if (UNIVERSITY_MAP[d]) return UNIVERSITY_MAP[d];
  // gc.cuny.edu etc. — prefer full mapped parent if present
  const parts = d.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) {
    const parent = parts.slice(i).join('.');
    if (UNIVERSITY_MAP[parent]) return UNIVERSITY_MAP[parent];
  }
  return prettyFromDomain(d).slice(0, 160);
}

/**
 * Resolve university + country for a lead row.
 * Explicit sheet columns win; otherwise infer from email domain.
 */
export function resolveLeadPlace({ email, university, country }) {
  const domain = emailDomain(email);
  const uni = inferUniversity(domain, university);
  const ctry = String(country || '').trim().slice(0, 80) || inferCountry(domain);
  return {
    emailDomain: domain || null,
    university: uni,
    country: ctry || null,
  };
}
