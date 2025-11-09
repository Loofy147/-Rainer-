import { test, expect } from '@playwright/test';

test('should display CI/CD pipeline status after creating a project', async ({ page }) => {
  await page.goto('/');

  // Mock the API calls
  await page.route('/api/templates', route => route.fulfill({
    status: 200,
    body: JSON.stringify([{ id: 'node-express-api', name: 'Node.js Express API', description: 'A simple Node.js Express API template.', secrets: [{name: 'DOCKER_USERNAME', description: 'Docker Hub Username'}], workflow_id: 'ci.yml' }]),
  }));
  await page.route('/api/auth/status', route => route.fulfill({
    status: 200,
    body: JSON.stringify({ loggedIn: true }),
  }));
  await page.route('/api/repositories', route => route.fulfill({
    status: 201,
    body: JSON.stringify({ url: 'https://github.com/test-user/test-repo', owner: 'test-user', repo: 'test-repo' }),
  }));
  await page.route('**/api/repositories/test-user/test-repo/secrets', route => route.fulfill({
    status: 204,
  }));
  await page.route('**/api/repositories/test-user/test-repo/dispatch', route => route.fulfill({
    status: 204,
  }));

  let statusRequestCount = 0;
  await page.route('**/api/repositories/test-user/test-repo/workflows/ci.yml/status', route => {
    statusRequestCount++;
    if (statusRequestCount <= 2) {
      route.fulfill({ status: 200, body: JSON.stringify({ status: 'in_progress', conclusion: null }) });
    } else {
      route.fulfill({ status: 200, body: JSON.stringify({ status: 'completed', conclusion: 'success' }) });
    }
  });

  // The test is already in a logged-in state due to the mocked auth status.
  // Fill out the form and submit
  await page.fill('input[name="name"]', 'test-project');
  await page.selectOption('select[name="template"]', 'node-express-api');
  await page.click('button:has-text("Create Project")');

  // Wait for the secrets form and submit
  await page.waitForSelector('form#secrets-form');
  await page.click('button:has-text("Set Secrets & Run Pipeline")');

  // Check for the pipeline status
  await expect(page.locator('#pipeline-status')).toContainText('in_progress');
  await expect(page.locator('#pipeline-status')).toContainText('completed');
  await expect(page.locator('#pipeline-status')).toContainText('success');
});
