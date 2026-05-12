import { browser } from 'k6/browser';
import { check } from 'k6';

export const options = {
  scenarios: {
    browser: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    'browser_web_vital_lcp': ['p(75) < 2500'],
    'browser_web_vital_cls': ['p(75) < 0.1'],
    'browser_web_vital_fid': ['p(75) < 100'],
  },
};

export default async function () {
  const targetURL = __ENV.TARGET_URL || 'https://postbaby.uz';
  const page = await browser.newPage();

  try {
    const response = await page.goto(targetURL, { waitUntil: 'networkidle', timeout: 30000 });

    check(response, {
      'page loaded': (r) => r && r.status() < 400,
    });

    // Wait a bit for web vitals to be collected
    await page.waitForTimeout(2000);

    await page.screenshot({ path: `/tmp/perf-screenshot-${__ENV.TEST_ID || 'latest'}.png` });
  } finally {
    await page.close();
  }
}
