#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cliArgs = process.argv.slice(2);
const modeArgIndex = cliArgs.indexOf('--mode');
const cliMode = modeArgIndex >= 0 ? cliArgs[modeArgIndex + 1] : '';

const BASE_URL = process.env.VISUAL_BASE_URL || 'http://localhost:3000';
const MODE = String(cliMode || process.env.VISUAL_MODE || 'baseline').trim().toLowerCase();
const DATE_STAMP = new Date().toISOString().slice(0, 10);

const ROOT_OUTPUT_DIR =
  MODE === 'candidate'
    ? path.join(projectRoot, 'visual-regression', 'candidate', DATE_STAMP)
    : path.join(projectRoot, 'visual-regression', 'baseline');

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 }
];

const ROUTE_SCENARIOS = [
  { role: 'public', routes: ['/', '/about-us', '/contact-us', '/login'] },
  {
    role: 'admin',
    routes: ['/admin/dashboard', '/admin/fees', '/admin/marks', '/admin/notices']
  },
  {
    role: 'teacher',
    routes: ['/teacher/dashboard']
  },
  {
    role: 'student',
    routes: ['/student/dashboard']
  }
];

const DEFAULT_USERS = {
  admin: { name: 'Visual Admin', email: 'visual.admin@example.com', role: 'admin' },
  teacher: { name: 'Visual Teacher', email: 'visual.teacher@example.com', role: 'teacher' },
  student: { name: 'Visual Student', email: 'visual.student@example.com', role: 'student' }
};

const getAuthConfig = (role) => {
  const upper = role.toUpperCase();
  const token = String(process.env[`VISUAL_${upper}_TOKEN`] || '').trim();
  const rawUser = String(process.env[`VISUAL_${upper}_USER`] || '').trim();

  if (!token) {
    return null;
  }

  let parsedUser = null;
  if (rawUser) {
    try {
      parsedUser = JSON.parse(rawUser);
    } catch (_error) {
      parsedUser = null;
    }
  }

  return {
    token,
    user: parsedUser && typeof parsedUser === 'object' ? parsedUser : DEFAULT_USERS[role] || { role }
  };
};

const sanitizeRouteToName = (route) => {
  if (route === '/') {
    return 'home';
  }

  return route.replace(/^\/+/, '').replace(/\//g, '__').replace(/[^A-Za-z0-9_-]/g, '_');
};

const captureScenario = async ({ browser, role, route, viewport }) => {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();

  if (role !== 'public') {
    const auth = getAuthConfig(role);
    if (!auth) {
      await context.close();
      return {
        skipped: true,
        reason: `Missing VISUAL_${role.toUpperCase()}_TOKEN`,
        role,
        route,
        viewport: viewport.label
      };
    }

    await page.addInitScript((session) => {
      window.localStorage.setItem('sms_token', session.token);
      window.localStorage.setItem('sms_user', JSON.stringify(session.user));
    }, auth);
  }

  const targetUrl = new URL(route, BASE_URL).toString();
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 120000 });

  // Wait for route transition overlays and chart/3D hydration to settle.
  await page.waitForTimeout(900);

  const roleDir = path.join(ROOT_OUTPUT_DIR, role, viewport.label);
  await fs.mkdir(roleDir, { recursive: true });
  const screenshotPath = path.join(roleDir, `${sanitizeRouteToName(route)}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await context.close();

  return {
    skipped: false,
    role,
    route,
    viewport: viewport.label,
    screenshotPath
  };
};

const main = async () => {
  await fs.mkdir(ROOT_OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const scenario of ROUTE_SCENARIOS) {
      for (const route of scenario.routes) {
        for (const viewport of VIEWPORTS) {
          const result = await captureScenario({
            browser,
            role: scenario.role,
            route,
            viewport
          });
          results.push(result);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const captured = results.filter((result) => !result.skipped);
  const skipped = results.filter((result) => result.skipped);

  console.log(`Visual capture mode: ${MODE}`);
  console.log(`Output directory: ${ROOT_OUTPUT_DIR}`);
  console.log(`Captured screenshots: ${captured.length}`);

  if (captured.length > 0) {
    for (const item of captured) {
      console.log(`CAPTURED [${item.role}] [${item.viewport}] ${item.route} -> ${path.relative(projectRoot, item.screenshotPath)}`);
    }
  }

  if (skipped.length > 0) {
    for (const item of skipped) {
      console.log(`SKIPPED [${item.role}] [${item.viewport}] ${item.route} (${item.reason})`);
    }
  }
};

main().catch((error) => {
  console.error('Visual baseline capture failed:', error);
  process.exitCode = 1;
});
