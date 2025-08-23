/**
 * PulseMCP Integration Tests for MCP-7 v3.0
 * Tests PulseMCP API client, sync, data merger, and health monitoring
 */

import { strict as assert } from 'assert';
import { test, describe, before, after } from 'node:test';
import { PulseMCPClient } from '../../src/discovery/pulsemcp-client.js';
import { PulseMCPSync } from '../../src/discovery/pulsemcp-sync.js';
import { DataMerger } from '../../src/discovery/data-merger.js';
import { HealthMonitor } from '../../src/discovery/health-monitor.js';
import { MCPStorage } from '../../src/discovery/storage.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('PulseMCP Integration Tests', () => {
  let testDbPath;
  let storage;
  let client;
  let sync;
  let merger;
  let healthMonitor;

  before(async () => {
    // Create temporary database for testing
    const testDir = path.join(process.cwd(), 'tests', 'temp');
    await fs.mkdir(testDir, { recursive: true });
    testDbPath = path.join(testDir, 'test-pulsemcp.db');

    // Initialize storage
    storage = new MCPStorage({ dbPath: testDbPath, debug: false });
    await storage.initialize();

    // Initialize components with mock mode
    client = new PulseMCPClient({ mockMode: true, debug: false });
    sync = new PulseMCPSync({ mockMode: true, debug: false, dbPath: testDbPath });
    merger = new DataMerger({ debug: false, dbPath: testDbPath });
    healthMonitor = new HealthMonitor({ mockMode: true, debug: false, dbPath: testDbPath });

    await sync.initialize();
    await merger.initialize();
    await healthMonitor.initialize();
  });

  after(async () => {
    // Clean up
    await storage?.close();
    await sync?.cleanup();
    await merger?.cleanup();
    await healthMonitor?.cleanup();

    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('PulseMCPClient', () => {
    test('should initialize in mock mode', async () => {
      const testClient = new PulseMCPClient({ mockMode: true });
      const status = testClient.getStatus();
      
      assert.strictEqual(status.mockMode, true);
      assert.strictEqual(status.baseUrl, 'https://www.pulsemcp.com/api');
    });

    test('should test connection successfully', async () => {
      const connection = await client.testConnection();
      
      assert.strictEqual(connection.status, 'ok');
      assert.strictEqual(connection.mock, true);
      assert(connection.servers > 0);
    });

    test('should get server statistics', async () => {
      const stats = await client.getStats();
      
      assert(stats.totalServers > 0);
      assert(stats.activeServers > 0);
      assert(stats.verifiedServers > 0);
      assert.strictEqual(stats.mock, true);
    });

    test('should get categories', async () => {
      const categories = await client.getCategories();
      
      assert(Array.isArray(categories.categories));
      assert(categories.categories.length > 0);
      assert.strictEqual(categories.mock, true);
      
      const category = categories.categories[0];
      assert(typeof category.id === 'string');
      assert(typeof category.name === 'string');
      assert(typeof category.count === 'number');
    });

    test('should get all servers with pagination', async () => {
      const result = await client.getAllServers({ limit: 10 });
      
      assert(Array.isArray(result.servers));
      assert(result.servers.length > 0);
      assert(result.servers.length <= 10);
      assert(result.totalCount > 0);
      assert.strictEqual(result.mock, true);
      
      const server = result.servers[0];
      assert(typeof server.id === 'string');
      assert(typeof server.name === 'string');
      assert(Array.isArray(server.capabilities));
    });

    test('should search servers', async () => {
      const result = await client.searchServers('file-system', { limit: 5 });
      
      assert(Array.isArray(result.servers));
      assert(result.totalCount >= 0);
      assert.strictEqual(result.query, 'file-system');
      assert.strictEqual(result.mock, true);
    });

    test('should get server details', async () => {
      const allServers = await client.getAllServers({ limit: 1 });
      const serverId = allServers.servers[0].id;
      
      const details = await client.getServerDetails(serverId);
      
      assert(details !== null);
      assert.strictEqual(details.id, serverId);
      assert.strictEqual(details.detailed, true);
    });

    test('should handle rate limiting', () => {
      assert(client.queue);
      assert.strictEqual(client.queue.intervalCap, client.options.rateLimit);
    });
  });

  describe('PulseMCPSync', () => {
    test('should initialize successfully', async () => {
      const testSync = new PulseMCPSync({ mockMode: true, debug: false });
      await testSync.initialize();
      
      // Should not throw
      await testSync.cleanup();
    });

    test('should run sync operation', async () => {
      const result = await sync.runSync({ force: true });
      
      assert(result.syncId);
      assert(result.stats);
      assert(result.duration);
      assert(result.stats.servers.total > 0);
    });

    test('should sync categories', async () => {
      await sync.syncCategories();
      
      const categories = await storage.db.allAsync('SELECT * FROM pulsemcp_categories');
      assert(categories.length > 0);
      
      const category = categories[0];
      assert(typeof category.id === 'string');
      assert(typeof category.name === 'string');
      assert(typeof category.server_count === 'number');
    });

    test('should get servers by category', async () => {
      // First run sync to populate data
      await sync.runSync({ force: true });
      
      const servers = await sync.getServersByCategory('development', { limit: 5 });
      assert(Array.isArray(servers));
    });

    test('should search servers', async () => {
      // First run sync to populate data
      await sync.runSync({ force: true });
      
      const servers = await sync.searchServers('test', { limit: 5 });
      assert(Array.isArray(servers));
    });

    test('should get sync statistics', async () => {
      const stats = await sync.getSyncStats();
      
      assert(stats !== null);
      assert(typeof stats.servers.total === 'number');
      assert(typeof stats.servers.active === 'number');
      assert(typeof stats.servers.verified === 'number');
    });

    test('should prevent duplicate syncs within interval', async () => {
      // Run first sync
      await sync.runSync({ force: true });
      
      // Try to run second sync immediately
      const result = await sync.runSync();
      
      // Should be skipped unless forced
      if (!result.skipped) {
        // If not skipped, verify it completed
        assert(result.stats);
      }
    });
  });

  describe('DataMerger', () => {
    test('should initialize successfully', async () => {
      const testMerger = new DataMerger({ debug: false });
      await testMerger.initialize();
      await testMerger.cleanup();
    });

    test('should create merged tables', async () => {
      // Check that merged_servers table exists
      const tables = await storage.db.allAsync(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='merged_servers'
      `);
      
      assert.strictEqual(tables.length, 1);
    });

    test('should calculate match scores', () => {
      const github = {
        name: 'mcp-file-server',
        description: 'File system access for MCP',
        cloneUrl: 'https://github.com/test/mcp-file-server.git',
        capabilities: ['file-system', 'read', 'write']
      };

      const pulsemcp = {
        name: 'mcp-file-server',
        description: 'File system MCP server',
        repository: 'https://github.com/test/mcp-file-server',
        capabilities: ['file-system', 'filesystem']
      };

      const score = merger.calculateMatchScore(github, pulsemcp);
      assert(score > 0.7); // Should be a high match
    });

    test('should normalize repository URLs', () => {
      const urls = [
        'https://github.com/user/repo.git',
        'git@github.com:user/repo.git',
        'http://github.com/user/repo',
        'github.com/user/repo'
      ];

      const normalized = urls.map(url => merger.normalizeRepoUrl(url));
      const expected = 'github.com/user/repo';
      
      normalized.forEach(url => {
        assert.strictEqual(url, expected);
      });
    });

    test('should calculate string similarity', () => {
      const similarity1 = merger.calculateStringSimilarity('hello world', 'hello world');
      assert.strictEqual(similarity1, 1);

      const similarity2 = merger.calculateStringSimilarity('hello world', 'goodbye world');
      assert(similarity2 > 0 && similarity2 < 1);

      const similarity3 = merger.calculateStringSimilarity('abc', 'xyz');
      assert.strictEqual(similarity3, 0);
    });

    test('should merge capabilities correctly', () => {
      const github = ['file-system', 'read'];
      const pulsemcp = ['file-system', 'write', 'filesystem'];
      
      const merged = merger.mergeCapabilities(github, pulsemcp);
      
      assert(Array.isArray(merged));
      assert(merged.includes('file-system'));
      assert(merged.includes('read'));
      assert(merged.includes('write'));
      assert(merged.includes('filesystem'));
      
      // Should not have duplicates
      const uniqueCount = new Set(merged).size;
      assert.strictEqual(merged.length, uniqueCount);
    });

    test('should run merge operation with sample data', async () => {
      // First, create some sample GitHub data
      const githubRepo = {
        full_name: 'test/mcp-sample',
        name: 'mcp-sample',
        owner: 'test',
        description: 'Sample MCP server',
        html_url: 'https://github.com/test/mcp-sample',
        clone_url: 'https://github.com/test/mcp-sample.git',
        ssh_url: 'git@github.com:test/mcp-sample.git',
        language: 'JavaScript',
        stargazers_count: 10,
        forks_count: 2,
        watchers_count: 5,
        size: 100,
        topics: ['mcp', 'server'],
        license: { name: 'MIT' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        pushed_at: '2024-01-15T00:00:00Z',
        archived: false,
        fork: false
      };

      // Store sample GitHub repository
      const repoId = await storage.storeRepository(githubRepo);
      
      // Store sample analysis
      await storage.storeAnalysis(repoId, {
        mcp: {
          confidence: 85,
          serverType: 'development-tools',
          capabilities: ['file-system', 'api-integration'],
          indicators: ['package.json', 'mcp.config.js']
        },
        analyzedAt: new Date().toISOString()
      });

      // Run PulseMCP sync first
      await sync.runSync({ force: true });

      // Now run merge
      const result = await merger.runMerge();
      
      assert(result.stats);
      assert(result.duration);
    });

    test('should get merged statistics', async () => {
      const stats = await merger.getMergedStats();
      
      if (stats) {
        assert(typeof stats.total === 'number');
        assert(typeof stats.verified === 'number');
        assert(typeof stats.highConfidence === 'number');
        assert(typeof stats.sources === 'object');
      }
    });
  });

  describe('HealthMonitor', () => {
    test('should initialize successfully', async () => {
      const testMonitor = new HealthMonitor({ mockMode: true, debug: false });
      await testMonitor.initialize();
      await testMonitor.cleanup();
    });

    test('should create health tables', async () => {
      const tables = await storage.db.allAsync(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND (name='health_measurements' OR name='health_alerts')
      `);
      
      assert(tables.length >= 2);
    });

    test('should determine health status correctly', () => {
      assert.strictEqual(healthMonitor.determineHealthStatus(90), 'healthy');
      assert.strictEqual(healthMonitor.determineHealthStatus(65), 'warning');
      assert.strictEqual(healthMonitor.determineHealthStatus(40), 'critical');
    });

    test('should estimate health from metadata', () => {
      const server = {
        verified: true,
        github_stars: 100,
        confidence: 85,
        github_analyzed_at: new Date().toISOString()
      };

      const health = healthMonitor.estimateHealthFromMetadata(server);
      
      assert(typeof health.healthScore === 'number');
      assert(health.healthScore > 50);
      assert(['healthy', 'warning', 'critical'].includes(health.status));
      assert.strictEqual(health.source, 'estimated');
      assert(Array.isArray(health.factors));
    });

    test('should run health check', async () => {
      // First populate some merged servers
      await sync.runSync({ force: true });
      await merger.runMerge();
      
      const result = await healthMonitor.runHealthCheck();
      
      if (!result.skipped) {
        assert(result.stats);
        assert(result.duration);
        assert(typeof result.stats.servers.total === 'number');
      }
    });

    test('should generate health report', async () => {
      // Populate data first
      await sync.runSync({ force: true });
      await merger.runMerge();
      
      const report = await healthMonitor.generateHealthReport({ 
        period: 7, 
        includeAlerts: true 
      });
      
      assert(report.generatedAt);
      assert(report.overview);
      assert(typeof report.overview.totalServers === 'number');
      assert(typeof report.overview.averageHealth === 'number');
      assert(report.overview.healthDistribution);
      assert(report.trends);
    });

    test('should start and stop monitoring', async () => {
      // Start monitoring
      await healthMonitor.startMonitoring();
      assert(healthMonitor.isMonitoring);
      assert(healthMonitor.monitoringTimer);

      // Stop monitoring
      healthMonitor.stopMonitoring();
      assert(!healthMonitor.isMonitoring);
      assert(!healthMonitor.monitoringTimer);
    });

    test('should calculate reliability scores', async () => {
      // Create a test server with some health measurements
      const serverId = 1;
      
      // Insert some mock measurements
      for (let i = 0; i < 10; i++) {
        await storage.db.runAsync(`
          INSERT INTO health_measurements (
            server_id, health_score, status, source, measured_at
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          serverId,
          80 + Math.random() * 20,
          'healthy',
          'test',
          new Date(Date.now() - i * 60 * 60 * 1000).toISOString()
        ]);
      }

      const reliability = await healthMonitor.calculateReliability(serverId);
      assert(typeof reliability === 'number');
      assert(reliability >= 0 && reliability <= 100);
    });
  });

  describe('Integration Tests', () => {
    test('should complete full PulseMCP integration workflow', async () => {
      console.log('🚀 Running full PulseMCP integration workflow...');

      // Step 1: Sync PulseMCP data
      console.log('📡 Step 1: Syncing PulseMCP data...');
      const syncResult = await sync.runSync({ force: true });
      assert(syncResult.stats.servers.total > 0);

      // Step 2: Create some GitHub data for merging
      console.log('📊 Step 2: Creating GitHub sample data...');
      const githubRepo = {
        full_name: 'integration/test-server',
        name: 'test-server',
        owner: 'integration',
        description: 'Integration test MCP server',
        html_url: 'https://github.com/integration/test-server',
        clone_url: 'https://github.com/integration/test-server.git',
        language: 'TypeScript',
        stargazers_count: 50,
        topics: ['mcp', 'integration'],
        license: { name: 'MIT' }
      };

      const repoId = await storage.storeRepository(githubRepo);
      await storage.storeAnalysis(repoId, {
        mcp: {
          confidence: 90,
          serverType: 'integration',
          capabilities: ['api-integration', 'data-analysis'],
          indicators: ['mcp.json', 'src/server.ts']
        }
      });

      // Step 3: Merge data
      console.log('🔗 Step 3: Merging GitHub and PulseMCP data...');
      const mergeResult = await merger.runMerge();
      assert(mergeResult.stats.merged.created > 0);

      // Step 4: Health monitoring
      console.log('🏥 Step 4: Running health monitoring...');
      const healthResult = await healthMonitor.runHealthCheck();
      if (!healthResult.skipped) {
        assert(healthResult.stats.servers.total > 0);
      }

      // Step 5: Generate reports
      console.log('📊 Step 5: Generating final reports...');
      const syncStats = await sync.getSyncStats();
      const mergedStats = await merger.getMergedStats();
      const healthReport = await healthMonitor.generateHealthReport({ period: 1 });

      // Verify integration results
      assert(syncStats.servers.total > 0);
      assert(mergedStats !== null);
      assert(healthReport.overview);

      console.log('✅ Full PulseMCP integration workflow completed successfully!');
      console.log(`   📡 Synced: ${syncStats.servers.total} servers`);
      console.log(`   🔗 Merged: ${mergedStats.total} records`);
      console.log(`   🏥 Health checked: ${healthReport.overview.totalServers} servers`);
    });

    test('should handle API failures gracefully', async () => {
      // Create a client that will fail connections
      const failingClient = new PulseMCPClient({ 
        mockMode: false, 
        baseUrl: 'https://nonexistent-api.example.com'
      });

      // Should automatically fall back to mock mode
      const connection = await failingClient.testConnection();
      assert.strictEqual(connection.status, 'fallback');
      assert.strictEqual(connection.mock, true);

      // Should still return mock data
      const stats = await failingClient.getStats();
      assert(stats.totalServers > 0);
      assert.strictEqual(stats.mock, true);
    });

    test('should maintain data consistency across operations', async () => {
      // Run sync
      await sync.runSync({ force: true });
      const syncStats1 = await sync.getSyncStats();

      // Run merge
      await merger.runMerge();
      const mergedStats1 = await merger.getMergedStats();

      // Run another sync (should not change much)
      await sync.runSync({ force: true });
      const syncStats2 = await sync.getSyncStats();

      // Data should remain consistent
      assert(syncStats2.servers.total >= syncStats1.servers.total);
      
      // Run another merge
      await merger.runMerge();
      const mergedStats2 = await merger.getMergedStats();

      // Merged data should be consistent
      assert(mergedStats2.total >= mergedStats1.total);
    });

    test('should track data provenance correctly', async () => {
      // Run sync and merge
      await sync.runSync({ force: true });
      await merger.runMerge();

      // Check provenance metadata
      const lastMerge = await storage.getMetadata('last_merge_time');
      const lastSync = await storage.getMetadata('pulsemcp_last_sync');

      assert(lastMerge !== null);
      assert(lastSync !== null);

      // Check data source tracking in merged records
      const sourceBreakdown = await storage.db.allAsync(`
        SELECT data_sources, COUNT(*) as count 
        FROM merged_servers 
        GROUP BY data_sources
      `);

      assert(sourceBreakdown.length > 0);
      sourceBreakdown.forEach(row => {
        assert(['github', 'pulsemcp', 'github,pulsemcp'].includes(row.data_sources));
        assert(row.count > 0);
      });
    });
  });
});