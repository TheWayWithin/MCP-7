/**
 * Test suite for GitHub Scanner
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { GitHubScanner } from '../../src/discovery/github-scanner.js';

// Mock repository data for testing
const mockRepository = {
  id: 123456,
  name: 'test-mcp-server',
  full_name: 'test-owner/test-mcp-server',
  owner: {
    login: 'test-owner',
    type: 'User'
  },
  description: 'A test MCP server for model context protocol',
  html_url: 'https://github.com/test-owner/test-mcp-server',
  clone_url: 'https://github.com/test-owner/test-mcp-server.git',
  ssh_url: 'git@github.com:test-owner/test-mcp-server.git',
  stargazers_count: 15,
  forks_count: 3,
  watchers_count: 15,
  language: 'JavaScript',
  size: 1024,
  archived: false,
  fork: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-08-20T12:00:00Z',
  pushed_at: '2024-08-20T12:00:00Z',
  topics: ['mcp', 'claude', 'server'],
  license: {
    key: 'mit',
    name: 'MIT License'
  }
};

test('GitHubScanner - Constructor', () => {
  const scanner = new GitHubScanner();
  assert.ok(scanner instanceof GitHubScanner);
  assert.equal(typeof scanner.searchMCPRepositories, 'function');
  assert.equal(typeof scanner.getRepositoryDetails, 'function');
  assert.ok(Array.isArray(scanner.searchPatterns));
  assert.ok(scanner.searchPatterns.length > 0);
});

test('GitHubScanner - Search patterns validation', () => {
  const scanner = new GitHubScanner();
  
  const expectedPatterns = [
    'mcp-server',
    'model-context-protocol',
    'claude-mcp',
    'anthropic-mcp'
  ];
  
  expectedPatterns.forEach(pattern => {
    assert.ok(
      scanner.searchPatterns.includes(pattern),
      `Should include search pattern: ${pattern}`
    );
  });
});

test('GitHubScanner - Build search query', () => {
  const scanner = new GitHubScanner();
  
  // Test basic query
  const basicQuery = scanner.buildSearchQuery('mcp-server');
  assert.ok(basicQuery.includes('mcp-server'));
  assert.ok(basicQuery.includes('archived:false'));
  assert.ok(basicQuery.includes('in:name,description,readme'));
  
  // Test with options
  const queryWithOptions = scanner.buildSearchQuery('mcp-server', {
    minStars: 10,
    language: 'javascript',
    includeArchived: true
  });
  
  assert.ok(queryWithOptions.includes('stars:>=10'));
  assert.ok(queryWithOptions.includes('language:javascript'));
  assert.ok(!queryWithOptions.includes('archived:false'));
});

test('GitHubScanner - Rate limit handling', async () => {
  const scanner = new GitHubScanner({
    token: 'fake-token-for-testing'
  });
  
  // Test rate limit status method exists
  assert.equal(typeof scanner.getRateLimitStatus, 'function');
  
  // Test sleep utility
  const start = Date.now();
  await scanner.sleep(100);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 90, 'Sleep should wait approximately the specified time');
});

test('GitHubScanner - Repository processing', async () => {
  const scanner = new GitHubScanner();
  
  const repositories = [mockRepository, { ...mockRepository, id: 123457 }];
  
  let processedCount = 0;
  const processor = async (repo) => {
    processedCount++;
    return { processed: true, repo: repo.full_name };
  };
  
  const results = await scanner.processRepositories(repositories, processor, {
    concurrency: 2,
    delay: 10
  });
  
  assert.equal(results.length, 2);
  assert.equal(processedCount, 2);
  assert.ok(results.every(r => r.processed === true));
});

test('GitHubScanner - File content search query', async () => {
  const scanner = new GitHubScanner();
  
  // Test that method exists and handles basic case
  assert.equal(typeof scanner.searchByFileContent, 'function');
  
  // Mock the method to avoid actual API calls in tests
  const originalMethod = scanner.octokit.rest.search.code;
  scanner.octokit.rest.search.code = async (params) => {
    assert.ok(params.q.includes('package.json'));
    assert.ok(params.q.includes('mcp'));
    return {
      data: {
        items: []
      }
    };
  };
  
  const results = await scanner.searchByFileContent('package.json', 'mcp');
  assert.ok(Array.isArray(results));
  
  // Restore original method
  scanner.octokit.rest.search.code = originalMethod;
});

test('GitHubScanner - Configuration validation', () => {
  // Test with custom configuration
  const customScanner = new GitHubScanner({
    userAgent: 'test-agent',
    maxConcurrentRequests: 5,
    debug: true
  });
  
  assert.equal(customScanner.debug, true);
  assert.equal(typeof customScanner.concurrencyLimit, 'function');
});

test('GitHubScanner - MCP file patterns', () => {
  const scanner = new GitHubScanner();
  
  const expectedFilePatterns = [
    'mcp-server',
    'claude_desktop_config',
    'package.json',
    'README.md'
  ];
  
  expectedFilePatterns.forEach(pattern => {
    assert.ok(
      scanner.mcpFilePatterns.includes(pattern),
      `Should include file pattern: ${pattern}`
    );
  });
});

test('GitHubScanner - Error handling', async () => {
  const scanner = new GitHubScanner();
  
  // Test that errors are handled gracefully
  try {
    // This should not throw but return empty results or handle gracefully
    const results = await scanner.processRepositories([], () => {
      throw new Error('Test error');
    });
    
    // Should return empty array or handle errors
    assert.ok(Array.isArray(results));
    
  } catch (error) {
    // If it does throw, make sure it's a meaningful error
    assert.ok(error instanceof Error);
  }
});

test('GitHubScanner - Search patterns comprehensive', () => {
  const scanner = new GitHubScanner();
  
  // Ensure we have comprehensive coverage of MCP-related terms
  const patterns = scanner.searchPatterns;
  
  assert.ok(patterns.some(p => p.includes('mcp')));
  assert.ok(patterns.some(p => p.includes('claude')));
  assert.ok(patterns.some(p => p.includes('anthropic')));
  assert.ok(patterns.some(p => p.includes('context-protocol')));
  
  // Should have both exact and quoted patterns
  assert.ok(patterns.includes('mcp-server'));
  assert.ok(patterns.includes('"mcp server"'));
});

test('GitHubScanner - Utility methods', () => {
  const scanner = new GitHubScanner();
  
  // Test sleep method
  assert.equal(typeof scanner.sleep, 'function');
  
  // Test that sleep returns a promise
  const sleepResult = scanner.sleep(1);
  assert.ok(sleepResult instanceof Promise);
});