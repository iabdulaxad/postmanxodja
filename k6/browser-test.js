import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 3,
};

export default function () {
  const targetURL = __ENV.TARGET_URL || 'https://postbaby.uz';

  const res = http.get(targetURL, {
    tags: { test_id: __ENV.TEST_ID || '0' },
    timeout: '30s',
  });

  check(res, {
    'status is 2xx or 3xx': (r) => r.status < 400,
  });

  sleep(1);
}
