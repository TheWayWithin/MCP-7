/**
 * Test suite for Discovery Orchestrator
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { DiscoveryOrchestrator } from '../../src/discovery/orchestrator.js';

// Mock components to avoid external dependencies in tests
class MockGitHubScanner {
  constructor(options) {
    this.options = options;
  }
  
  async searchMCPRepositories(options) {
    return {
      repositories: [
        {
          id: 1,
          full_name: 'test/mcp-server-1',
          name: 'mcp-server-1',
          owner: { login: 'test' },
          description: 'Test MCP server',
          stargazers_count: 10
        },
        {
          id: 2,
          full_name: 'test/mcp-server-2',
          name: 'mcp-server-2',
          owner: { login: 'test' },
          description: 'Another test MCP server',
          stargazers_count: 5
        }
      ],
      stats: {
        patternsSearched: 5,
        totalResults: 2,
        uniqueRepositories: 2,
        duplicatesFiltered: 0
      }
    };
  }
  
  async getRepositoryDetails(owner, repo) {
    return {
      repository: {
        full_name: `${owner}/${repo}`,
        name: repo,
        owner: { login: owner },
        description: 'Test repository',
        stargazers_count: 10
      },
      contents: {
        'package.json': {
          name: 'package.json',
          content: JSON.stringify({
            name: repo,
            version: '1.0.0',
            dependencies: { '@modelcontextprotocol/server': '^1.0.0' }
          })
        },
        'README.md': {
          name: 'README.md',
          content: '# Test MCP Server\n\nA model context protocol server for testing.'
        }
      }
    };
  }
  
  async getRateLimitStatus() {
    return {
      core: { remaining: 5000, limit: 5000 },
      search: { remaining: 30, limit: 30 }
    };
  }
}

class MockRepositoryAnalyzer {
  async analyzeRepository(repository, contents) {
    return {
      repository: {
        fullName: repository.full_name,
        name: repository.name,
        owner: repository.owner.login,
        description: repository.description
      },
      metadata: {
        stars: repository.stargazers_count || 0,
        forks: 0,
        watchers: 0
      },
      mcp: {
        confidence: 75,
        indicators: ['MCP dependencies found'],
        capabilities: ['filesystem'],
        serverType: 'filesystem'
      },
      files: {
        analyzed: ['package.json', 'README.md'],
        mcpRelevant: ['package.json']
      },
      analysis: {
        language: 'javascript',
        installationMethod: 'npm'
      },
      analyzedAt: new Date().toISOString()
    };
  }
}

class MockMCPDetector {
  detectMCP(analysis) {
    return {
      isMCP: true,
      confidence: analysis.mcp.confidence,
      confidenceLevel: 'high',
      indicators: {
        positive: [{ type: 'strong_positive', description: 'Test indicator', weight: 40 }],
        negative: [],
        characteristics: []
      },
      classification: 'definite_mcp_server',
      reasons: ['Strong MCP indicators'],
      edgeCases: []
    };
  }
  
  async detectMCPRepositories(analyses) {
    return analyses.map(analysis => ({
      ...analysis,
      mcpDetection: this.detectMCP(analysis)
    }));
  }
}

class MockMCPStorage {
  constructor() {
    this.data = {
      repositories: [],
      analyses: [],
      detections: [],
      runs: []
    };
  }
  
  async initialize() {
    // Mock initialization
  }
  
  async startDiscoveryRun(runId, config) {
    this.data.runs.push({ runId, config, status: 'running' });
    return runId;
  }
  
  async updateDiscoveryRun(runId, updates) {
    const run = this.data.runs.find(r => r.runId === runId);
    if (run) {
      Object.assign(run, updates);
    }
  }
  
  async storeRepository(repo) {
    this.data.repositories.push(repo);
    return this.data.repositories.length;
  }
  
  async storeAnalysis(repoId, analysis) {
    this.data.analyses.push({ repoId, analysis });
  }
  
  async storeDetection(repoId, detection) {
    this.data.detections.push({ repoId, detection });
  }
  
  async getDiscoveryStats() {
    return {
      totalRepositories: this.data.repositories.length,
      analyzedRepositories: this.data.analyses.length,
      mcpServers: this.data.detections.filter(d => d.detection.isMCP).length,
      highConfidenceMCPs: this.data.detections.filter(d => d.detection.confidence >= 70).length,
      languageDistribution: { javascript: 2 },
      serverTypeDistribution: { filesystem: 2 },
      lastDiscoveryRun: this.data.runs[this.data.runs.length - 1]
    };
  }
  
  async close() {
    // Mock close
  }
}

test('DiscoveryOrchestrator - Constructor', () => {
  const orchestrator = new DiscoveryOrchestrator({
    maxRepositories: 100,
    concurrency: 2,
    debug: true
  });
  
  assert.ok(orchestrator instanceof DiscoveryOrchestrator);
  assert.equal(orchestrator.options.maxRepositories, 100);
  assert.equal(orchestrator.options.concurrency, 2);
  assert.equal(orchestrator.options.debug, true);
  assert.ok(orchestrator.scanner);
  assert.ok(orchestrator.analyzer);
  assert.ok(orchestrator.detector);
  assert.ok(orchestrator.storage);
  assert.ok(orchestrator.queue);
});

test('DiscoveryOrchestrator - Run ID generation', () => {
  const orchestrator = new DiscoveryOrchestrator();
  
  const runId1 = orchestrator.generateRunId();
  const runId2 = orchestrator.generateRunId();
  
  assert.ok(runId1.startsWith('discovery-'));
  assert.ok(runId2.startsWith('discovery-'));
  assert.notEqual(runId1, runId2, 'Run IDs should be unique');
  assert.ok(runId1.includes('-'), 'Run ID should contain hyphens');
});

test('DiscoveryOrchestrator - Batch creation', () => {
  const orchestrator = new DiscoveryOrchestrator();
  
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const batches = orchestrator.createBatches(items, 3);
  
  assert.equal(batches.length, 4, 'Should create 4 batches');
  assert.deepEqual(batches[0], [1, 2, 3]);
  assert.deepEqual(batches[1], [4, 5, 6]);
  assert.deepEqual(batches[2], [7, 8, 9]);
  assert.deepEqual(batches[3], [10]);
});

test('DiscoveryOrchestrator - Duration formatting', () => {
  const orchestrator = new DiscoveryOrchestrator();
  
  assert.equal(orchestrator.formatDuration(30000), '30s');
  assert.equal(orchestrator.formatDuration(90000), '1m 30s');
  assert.equal(orchestrator.formatDuration(3690000), '1h 1m 30s');
  assert.equal(orchestrator.formatDuration(1000), '1s');
});

test('DiscoveryOrchestrator - Statistics initialization', () => {
  const orchestrator = new DiscoveryOrchestrator();
  
  assert.ok(orchestrator.stats);
  assert.ok(orchestrator.stats.repositories);
  assert.ok(orchestrator.stats.mcpServers);
  assert.ok(orchestrator.stats.processing);
  
  assert.equal(orchestrator.stats.repositories.discovered, 0);
  assert.equal(orchestrator.stats.repositories.analyzed, 0);
  assert.equal(orchestrator.stats.mcpServers.detected, 0);
  assert.equal(orchestrator.stats.processing.errors.length, 0);
});

test('DiscoveryOrchestrator - Mock component integration', async () => {
  // Create orchestrator with mock components
  const orchestrator = new DiscoveryOrchestrator({ debug: false });
  
  // Replace components with mocks
  orchestrator.scanner = new MockGitHubScanner();
  orchestrator.analyzer = new MockRepositoryAnalyzer();
  orchestrator.detector = new MockMCPDetector();
  orchestrator.storage = new MockMCPStorage();
  
  // Test repository discovery phase
  const repositories = await orchestrator.discoverRepositories({
    maxRepositories: 10,
    minStars: 0
  });
  
  assert.equal(repositories.length, 2);
  assert.equal(orchestrator.stats.repositories.discovered, 2);
});

test('DiscoveryOrchestrator - Analysis phase', async () => {
  const orchestrator = new DiscoveryOrchestrator({ batchSize: 5 });
  
  // Replace with mock components
  orchestrator.scanner = new MockGitHubScanner();
  orchestrator.analyzer = new MockRepositoryAnalyzer();
  orchestrator.storage = new MockMCPStorage();
  
  const mockRepositories = [
    { full_name: 'test/repo1', name: 'repo1', owner: { login: 'test' } },
    { full_name: 'test/repo2', name: 'repo2', owner: { login: 'test' } }
  ];
  
  const analyses = await orchestrator.analyzeRepositories(mockRepositories, {
    batchSize: 5
  });
  
  assert.equal(analyses.length, 2);
  assert.ok(analyses.every(a => a.repository && a.mcp));
});

test('DiscoveryOrchestrator - Detection phase', async () => {
  const orchestrator = new DiscoveryOrchestrator();
  
  // Replace with mock components
  orchestrator.detector = new MockMCPDetector();
  orchestrator.storage = new MockMCPStorage();
  
  const mockAnalyses = [
    { repository: { fullName: 'test/repo1' }, mcp: { confidence: 80 } },
    { repository: { fullName: 'test/repo2' }, mcp: { confidence: 60 } }
  ];
  
  const detections = await orchestrator.detectMCPServers(mockAnalyses, {});
  
  assert.equal(detections.length, 2);
  assert.equal(orchestrator.stats.mcpServers.detected, 2);
  assert.ok(detections.every(d => d.mcpDetection));
});

test('DiscoveryOrchestrator - Storage phase', async () => {
  const orchestrator = new DiscoveryOrchestrator();
  orchestrator.storage = new MockMCPStorage();
  
  const mockDetections = [
    {
      repository: { fullName: 'test/repo1' },
      mcp: { confidence: 80 },
      mcpDetection: { isMCP: true, confidence: 80 }
    }
  ];
  
  await orchestrator.storeResults(mockDetections, { dryRun: false });
  
  assert.equal(orchestrator.stats.repositories.stored, 1);
  assert.equal(orchestrator.storage.data.repositories.length, 1);
});

test('DiscoveryOrchestrator - Dry run mode', async () => {
  const orchestrator = new DiscoveryOrchestrator();
  orchestrator.storage = new MockMCPStorage();
  
  const mockDetections = [
    {
      repository: { fullName: 'test/repo1' },
      mcpDetection: { isMCP: true, confidence: 80 }
    }
  ];
  
  await orchestrator.storeResults(mockDetections, { dryRun: true });
  
  // Should not store anything in dry run mode
  assert.equal(orchestrator.storage.data.repositories.length, 0);
});

test('DiscoveryOrchestrator - Report generation', async () => {
  const orchestrator = new DiscoveryOrchestrator();
  orchestrator.storage = new MockMCPStorage();
  orchestrator.currentRunId = 'test-run-123';
  orchestrator.stats.processing.startTime = Date.now() - 30000; // 30 seconds ago
  orchestrator.stats.repositories.discovered = 10;
  orchestrator.stats.repositories.analyzed = 8;
  orchestrator.stats.mcpServers.detected = 5;
  
  const report = await orchestrator.generateReport();
  
  assert.equal(report.runId, 'test-run-123');
  assert.ok(report.timestamp);
  assert.ok(report.processing.duration > 0);
  assert.ok(report.processing.durationFormatted);
  assert.equal(report.discovery.repositoriesDiscovered, 10);
  assert.equal(report.discovery.repositoriesAnalyzed, 8);
  assert.equal(report.mcpDetection.totalMCPServers, 5);
  assert.equal(report.discovery.analysisSuccessRate, 80);
});

test('DiscoveryOrchestrator - Error handling', async () => {
  const orchestrator = new DiscoveryOrchestrator();
  
  // Mock a failing scanner
  orchestrator.scanner = {
    getRateLimitStatus: async () => ({ search: { remaining: 0 } }),
    searchMCPRepositories: async () => {
      throw new Error('Rate limit exceeded');
    }
  };
  orchestrator.storage = new MockMCPStorage();
  
  try {
    await orchestrator.discoverRepositories({});
    assert.fail('Should have thrown an error');
  } catch (error) {
    assert.ok(error.message.includes('Insufficient GitHub API rate limit'));
    assert.equal(orchestrator.stats.processing.errors.length, 1);
  }
});

test('DiscoveryOrchestrator - Configuration options', () => {
  const options = {
    maxRepositories: 1000,
    minStars: 5,
    concurrency: 10,
    batchSize: 25,
    strictMode: true,
    debug: true
  };
  
  const orchestrator = new DiscoveryOrchestrator(options);
  
  assert.equal(orchestrator.options.maxRepositories, 1000);
  assert.equal(orchestrator.options.minStars, 5);
  assert.equal(orchestrator.options.concurrency, 10);
  assert.equal(orchestrator.options.batchSize, 25);
  assert.equal(orchestrator.options.strictMode, true);
  assert.equal(orchestrator.options.debug, true);
});

test('DiscoveryOrchestrator - Queue initialization', () => {
  const orchestrator = new DiscoveryOrchestrator({
    concurrency: 5,
    delayBetweenRequests: 100
  });
  
  assert.ok(orchestrator.queue);
  assert.equal(typeof orchestrator.queue.add, 'function');
});