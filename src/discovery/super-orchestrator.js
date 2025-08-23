/**
 * Super Discovery Orchestrator for MCP-7 v3.0
 * Integrates GitHub Discovery with PulseMCP API for comprehensive MCP server catalog
 */

import { GitHubScanner } from './github-scanner.js';
import { RepositoryAnalyzer } from './repo-analyzer.js';
import { MCPDetector } from './mcp-detector.js';
import { MCPStorage } from './storage.js';
import { PulseMCPClient } from './pulsemcp-client.js';
import { PulseMCPSync } from './pulsemcp-sync.js';
import { DataMerger } from './data-merger.js';
import { HealthMonitor } from './health-monitor.js';
import { createHash } from 'crypto';
import PQueue from 'p-queue';

export class SuperDiscoveryOrchestrator {
  constructor(options = {}) {
    this.options = {
      // GitHub configuration
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      maxRepositories: options.maxRepositories || 5000,
      minStars: options.minStars || 0,
      
      // PulseMCP configuration
      pulsemcpApiKey: options.pulsemcpApiKey || process.env.PULSEMCP_API_KEY,
      pulsemcpMockMode: options.pulsemcpMockMode || false,
      includePulseMCP: options.includePulseMCP !== false,
      
      // Processing configuration
      concurrency: options.concurrency || 5,
      batchSize: options.batchSize || 50,
      delayBetweenRequests: options.delayBetweenRequests || 200,
      
      // Storage configuration
      dbPath: options.dbPath,
      cacheEnabled: options.cacheEnabled !== false,
      
      // Detection configuration
      strictMode: options.strictMode || false,
      minConfidence: options.minConfidence || 30,
      
      // Health monitoring
      enableHealthMonitoring: options.enableHealthMonitoring !== false,
      
      // Runtime configuration
      debug: options.debug || false,
      dryRun: options.dryRun || false,
      resumeRun: options.resumeRun,
      
      ...options
    };

    // Initialize GitHub components
    this.scanner = new GitHubScanner({
      token: this.options.githubToken,
      debug: this.options.debug
    });

    this.analyzer = new RepositoryAnalyzer({
      debug: this.options.debug
    });

    this.detector = new MCPDetector({
      debug: this.options.debug,
      strictMode: this.options.strictMode
    });

    // Initialize PulseMCP components
    this.pulsemcpClient = new PulseMCPClient({
      apiKey: this.options.pulsemcpApiKey,
      mockMode: this.options.pulsemcpMockMode,
      debug: this.options.debug
    });

    this.pulsemcpSync = new PulseMCPSync({
      mockMode: this.options.pulsemcpMockMode,
      debug: this.options.debug,
      dbPath: this.options.dbPath
    });

    this.dataMerger = new DataMerger({
      debug: this.options.debug,
      dbPath: this.options.dbPath
    });

    this.healthMonitor = new HealthMonitor({
      mockMode: this.options.pulsemcpMockMode,
      debug: this.options.debug,
      dbPath: this.options.dbPath
    });

    // Initialize storage
    this.storage = new MCPStorage({
      dbPath: this.options.dbPath,
      debug: this.options.debug,
      cacheEnabled: this.options.cacheEnabled
    });

    // Processing queue
    this.queue = new PQueue({
      concurrency: this.options.concurrency,
      interval: this.options.delayBetweenRequests,
      intervalCap: 1
    });

    // Run tracking
    this.currentRunId = null;
    this.stats = {
      github: {
        repositories: { discovered: 0, analyzed: 0, stored: 0 },
        mcpServers: { detected: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 }
      },
      pulsemcp: {
        servers: { total: 0, synced: 0, verified: 0 },
        categories: { synced: 0 }
      },
      merged: {
        total: 0,
        githubOnly: 0,
        pulsemcpOnly: 0,
        matched: 0
      },
      health: {
        monitored: 0,
        healthy: 0,
        warning: 0,
        critical: 0
      },
      processing: {
        startTime: null,
        endTime: null,
        errors: [],
        warnings: []
      }
    };
  }

  /**
   * Main orchestration method - runs the complete super discovery pipeline
   */
  async runSuperDiscovery(options = {}) {
    const runOptions = { ...this.options, ...options };
    
    try {
      console.log('🚀 MCP-7 Super Discovery Engine v3.0');
      console.log('=====================================');
      console.log('GitHub Discovery + PulseMCP Integration\n');

      // Initialize all components
      await this.initialize();

      // Generate run ID
      this.currentRunId = this.generateRunId();
      
      // Start tracking
      await this.startRun(runOptions);

      this.printConfiguration(runOptions);

      // Phase 1: GitHub Discovery
      console.log('🔍 PHASE 1: GitHub Repository Discovery');
      console.log('---------------------------------------');
      const githubResults = await this.runGitHubDiscovery(runOptions);

      // Phase 2: PulseMCP Sync (if enabled)
      if (runOptions.includePulseMCP) {
        console.log('\n📡 PHASE 2: PulseMCP Directory Sync');
        console.log('-----------------------------------');
        await this.runPulseMCPSync(runOptions);
      } else {
        console.log('\n⏭️  PHASE 2: PulseMCP Sync (Skipped)');
      }

      // Phase 3: Data Merge
      console.log('\n🔗 PHASE 3: Data Integration & Merge');
      console.log('------------------------------------');
      await this.runDataMerge(runOptions);

      // Phase 4: Health Monitoring (if enabled)
      if (runOptions.enableHealthMonitoring) {
        console.log('\n🏥 PHASE 4: Health Monitoring');
        console.log('-----------------------------');
        await this.runHealthMonitoring(runOptions);
      } else {
        console.log('\n⏭️  PHASE 4: Health Monitoring (Skipped)');
      }

      // Phase 5: Final Report
      console.log('\n📊 PHASE 5: Super Report Generation');
      console.log('-----------------------------------');
      const superReport = await this.generateSuperReport();

      // Complete run tracking
      await this.completeRun();

      console.log('\n✅ Super Discovery Complete!');
      console.log('=============================\n');
      
      this.printSuperSummary(superReport);
      
      return {
        runId: this.currentRunId,
        githubResults: githubResults,
        stats: this.stats,
        report: superReport
      };

    } catch (error) {
      console.error('❌ Super discovery failed:', error.message);
      
      if (this.currentRunId) {
        await this.storage.updateDiscoveryRun(this.currentRunId, {
          status: 'failed',
          error: error.message,
          completed: true
        });
      }

      throw error;
    }
  }

  /**
   * Initialize all components
   */
  async initialize() {
    try {
      if (this.options.debug) {
        console.log('🔧 Initializing super discovery components...');
      }

      await this.storage.initialize();
      await this.pulsemcpSync.initialize();
      await this.dataMerger.initialize();
      await this.healthMonitor.initialize();

      // Test PulseMCP connection
      if (this.options.includePulseMCP) {
        const pulsemcpStatus = await this.pulsemcpClient.testConnection();
        if (this.options.debug) {
          console.log('📡 PulseMCP connection:', pulsemcpStatus.status, pulsemcpStatus.mock ? '(mock)' : '');
        }
      }
      
      if (this.options.debug) {
        console.log('✅ All super discovery components initialized\n');
      }

    } catch (error) {
      console.error('❌ Failed to initialize super discovery:', error.message);
      throw error;
    }
  }

  /**
   * Phase 1: Run GitHub-based discovery
   */
  async runGitHubDiscovery(options) {
    try {
      this.stats.processing.startTime = Date.now();

      // GitHub discovery (existing logic)
      const searchResults = await this.scanner.searchMCPRepositories({
        maxResults: options.maxRepositories,
        minStars: options.minStars,
        includeArchived: false
      });

      this.stats.github.repositories.discovered = searchResults.repositories.length;
      console.log(`✅ Discovered ${searchResults.repositories.length} GitHub repositories`);

      // Analyze repositories in batches
      console.log(`🔄 Analyzing repositories in batches...`);
      const analyses = [];
      const batches = this.createBatches(searchResults.repositories, options.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`   Batch ${i + 1}/${batches.length}: ${batch.length} repositories`);

        const batchAnalyses = await this.processBatch(batch, async (repo) => {
          try {
            const details = await this.scanner.getRepositoryDetails(repo.owner.login, repo.name);
            if (!details) return null;
            
            const analysis = await this.analyzer.analyzeRepository(details.repository, details.contents);
            return analysis;
          } catch (error) {
            this.stats.processing.errors.push({
              phase: 'github_analysis',
              repository: repo.full_name,
              error: error.message
            });
            return null;
          }
        });

        const validAnalyses = batchAnalyses.filter(a => a !== null);
        analyses.push(...validAnalyses);
        
        console.log(`   ✅ Analyzed ${validAnalyses.length}/${batch.length} repositories`);
      }

      this.stats.github.repositories.analyzed = analyses.length;

      // Detect MCP servers
      console.log(`🎯 Detecting MCP servers...`);
      const detections = await this.detector.detectMCPRepositories(analyses);
      
      // Calculate GitHub MCP statistics
      detections.forEach(detection => {
        const mcpDetection = detection.mcpDetection;
        if (mcpDetection.isMCP) {
          this.stats.github.mcpServers.detected++;
          
          if (mcpDetection.confidence >= 70) {
            this.stats.github.mcpServers.highConfidence++;
          } else if (mcpDetection.confidence >= 50) {
            this.stats.github.mcpServers.mediumConfidence++;
          } else {
            this.stats.github.mcpServers.lowConfidence++;
          }
        }
      });

      // Store GitHub results
      if (!options.dryRun) {
        console.log(`💾 Storing GitHub results...`);
        let storedCount = 0;
        
        for (const detection of detections) {
          try {
            const repositoryId = await this.storage.storeRepository(detection.repository);
            await this.storage.storeAnalysis(repositoryId, detection);
            await this.storage.storeDetection(repositoryId, detection.mcpDetection);
            storedCount++;
          } catch (error) {
            this.stats.processing.errors.push({
              phase: 'github_storage',
              repository: detection.repository.fullName,
              error: error.message
            });
          }
        }
        
        this.stats.github.repositories.stored = storedCount;
        console.log(`✅ Stored ${storedCount} GitHub results`);
      }

      return detections;

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'github_discovery',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Phase 2: Run PulseMCP sync
   */
  async runPulseMCPSync(options) {
    try {
      const syncResult = await this.pulsemcpSync.runSync({ force: options.force });
      
      if (syncResult.skipped) {
        console.log('⏭️  PulseMCP sync skipped (recent sync exists)');
        console.log('   Use --force to override');
      } else {
        this.stats.pulsemcp.servers.total = syncResult.stats.servers.total;
        this.stats.pulsemcp.servers.synced = syncResult.stats.servers.new + syncResult.stats.servers.updated;
        this.stats.pulsemcp.categories.synced = syncResult.stats.categories.processed;
        
        console.log(`✅ PulseMCP sync completed`);
        console.log(`   Total servers: ${syncResult.stats.servers.total}`);
        console.log(`   New/Updated: ${this.stats.pulsemcp.servers.synced}`);
        console.log(`   Categories: ${syncResult.stats.categories.processed}`);
      }

      // Get verified server count
      const verifiedStats = await this.pulsemcpSync.getSyncStats();
      this.stats.pulsemcp.servers.verified = verifiedStats.servers.verified;

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'pulsemcp_sync',
        error: error.message
      });
      
      console.warn('⚠️  PulseMCP sync failed, continuing with GitHub data only');
      console.warn('    Error:', error.message);
    }
  }

  /**
   * Phase 3: Run data merge
   */
  async runDataMerge(options) {
    try {
      const mergeResult = await this.dataMerger.runMerge();
      
      this.stats.merged.total = mergeResult.stats.merged.created;
      this.stats.merged.githubOnly = mergeResult.stats.github.unmatched;
      this.stats.merged.pulsemcpOnly = mergeResult.stats.pulsemcp.unmatched;
      this.stats.merged.matched = mergeResult.stats.github.matched;

      console.log(`✅ Data merge completed`);
      console.log(`   Total merged records: ${this.stats.merged.total}`);
      console.log(`   GitHub-only: ${this.stats.merged.githubOnly}`);
      console.log(`   PulseMCP-only: ${this.stats.merged.pulsemcpOnly}`);
      console.log(`   Matched pairs: ${this.stats.merged.matched}`);

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'data_merge',
        error: error.message
      });
      
      console.warn('⚠️  Data merge failed, results may be incomplete');
      console.warn('    Error:', error.message);
    }
  }

  /**
   * Phase 4: Run health monitoring
   */
  async runHealthMonitoring(options) {
    try {
      const healthResult = await this.healthMonitor.runHealthCheck();
      
      if (healthResult.skipped) {
        console.log('⏭️  Health monitoring skipped (no servers to monitor)');
      } else {
        this.stats.health.monitored = healthResult.stats.servers.total;
        this.stats.health.healthy = healthResult.stats.servers.healthy;
        this.stats.health.warning = healthResult.stats.servers.warning;
        this.stats.health.critical = healthResult.stats.servers.critical;

        console.log(`✅ Health monitoring completed`);
        console.log(`   Servers monitored: ${this.stats.health.monitored}`);
        console.log(`   Healthy: ${this.stats.health.healthy}`);
        console.log(`   Warning: ${this.stats.health.warning}`);
        console.log(`   Critical: ${this.stats.health.critical}`);
      }

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'health_monitoring',
        error: error.message
      });
      
      console.warn('⚠️  Health monitoring failed');
      console.warn('    Error:', error.message);
    }
  }

  /**
   * Generate comprehensive super report
   */
  async generateSuperReport() {
    try {
      const processingTime = this.stats.processing.startTime ? 
        Date.now() - this.stats.processing.startTime : 0;

      // Get database statistics
      const dbStats = await this.storage.getDiscoveryStats();
      const mergedStats = await this.dataMerger.getMergedStats();
      const healthReport = await this.healthMonitor.generateHealthReport({ period: 1 });

      const superReport = {
        runId: this.currentRunId,
        timestamp: new Date().toISOString(),
        processing: {
          duration: processingTime,
          durationFormatted: this.formatDuration(processingTime),
          errors: this.stats.processing.errors.length,
          warnings: this.stats.processing.warnings.length,
          totalPhases: 5
        },
        github: {
          repositoriesDiscovered: this.stats.github.repositories.discovered,
          repositoriesAnalyzed: this.stats.github.repositories.analyzed,
          repositoriesStored: this.stats.github.repositories.stored,
          mcpServersDetected: this.stats.github.mcpServers.detected,
          analysisSuccessRate: this.stats.github.repositories.discovered > 0 ?
            Math.round((this.stats.github.repositories.analyzed / this.stats.github.repositories.discovered) * 100) : 0
        },
        pulsemcp: {
          totalServers: this.stats.pulsemcp.servers.total,
          syncedServers: this.stats.pulsemcp.servers.synced,
          verifiedServers: this.stats.pulsemcp.servers.verified,
          categoriesSynced: this.stats.pulsemcp.categories.synced,
          enabled: this.options.includePulseMCP
        },
        integration: {
          totalMergedRecords: this.stats.merged.total,
          githubOnlyRecords: this.stats.merged.githubOnly,
          pulsemcpOnlyRecords: this.stats.merged.pulsemcpOnly,
          matchedPairs: this.stats.merged.matched,
          dataQualityScore: this.calculateDataQualityScore()
        },
        health: {
          monitoringEnabled: this.options.enableHealthMonitoring,
          serversMonitored: this.stats.health.monitored,
          healthyServers: this.stats.health.healthy,
          warningServers: this.stats.health.warning,
          criticalServers: this.stats.health.critical,
          overallHealthScore: this.calculateOverallHealthScore()
        },
        database: dbStats,
        merged: mergedStats,
        healthDetails: healthReport
      };

      return superReport;

    } catch (error) {
      console.warn('⚠️  Failed to generate super report:', error.message);
      return {
        runId: this.currentRunId,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Calculate data quality score
   */
  calculateDataQualityScore() {
    let score = 0;
    let factors = 0;

    // Factor 1: Match rate
    if (this.stats.merged.matched > 0) {
      const totalSourceRecords = this.stats.github.mcpServers.detected + this.stats.pulsemcp.servers.total;
      const matchRate = totalSourceRecords > 0 ? this.stats.merged.matched / totalSourceRecords : 0;
      score += matchRate * 40; // 40 points for matching
      factors++;
    }

    // Factor 2: Verification rate (from PulseMCP)
    if (this.stats.pulsemcp.servers.verified > 0 && this.stats.pulsemcp.servers.total > 0) {
      const verificationRate = this.stats.pulsemcp.servers.verified / this.stats.pulsemcp.servers.total;
      score += verificationRate * 30; // 30 points for verification
      factors++;
    }

    // Factor 3: Analysis success rate (from GitHub)
    if (this.stats.github.repositories.analyzed > 0 && this.stats.github.repositories.discovered > 0) {
      const analysisRate = this.stats.github.repositories.analyzed / this.stats.github.repositories.discovered;
      score += analysisRate * 30; // 30 points for analysis success
      factors++;
    }

    return factors > 0 ? Math.round(score / factors) : 0;
  }

  /**
   * Calculate overall health score
   */
  calculateOverallHealthScore() {
    if (this.stats.health.monitored === 0) return 0;

    const healthy = this.stats.health.healthy / this.stats.health.monitored;
    const warning = (this.stats.health.warning / this.stats.health.monitored) * 0.6;
    const critical = (this.stats.health.critical / this.stats.health.monitored) * 0.2;

    return Math.round((healthy + warning + critical) * 100);
  }

  /**
   * Print configuration
   */
  printConfiguration(options) {
    console.log(`📋 Super Discovery Configuration:`);
    console.log(`   GitHub max repositories: ${options.maxRepositories}`);
    console.log(`   GitHub min stars: ${options.minStars}`);
    console.log(`   PulseMCP integration: ${options.includePulseMCP ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Health monitoring: ${options.enableHealthMonitoring ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Concurrency: ${options.concurrency}`);
    console.log(`   Strict mode: ${options.strictMode ? 'ON' : 'OFF'}`);
    console.log(`   Dry run: ${options.dryRun ? 'YES' : 'NO'}`);
    console.log(`   Run ID: ${this.currentRunId}\n`);
  }

  /**
   * Print super summary
   */
  printSuperSummary(report) {
    console.log('📊 Super Discovery Summary');
    console.log('==========================');
    console.log(`🕒 Total Duration: ${report.processing.durationFormatted}`);
    
    // GitHub results
    console.log(`\n🐙 GitHub Discovery:`);
    console.log(`   📦 Repositories: ${report.github.repositoriesDiscovered} discovered, ${report.github.repositoriesAnalyzed} analyzed`);
    console.log(`   🎯 MCP Servers: ${report.github.mcpServersDetected} detected`);
    console.log(`   📊 Success Rate: ${report.github.analysisSuccessRate}%`);

    // PulseMCP results
    if (report.pulsemcp.enabled) {
      console.log(`\n📡 PulseMCP Integration:`);
      console.log(`   📦 Servers: ${report.pulsemcp.totalServers} total, ${report.pulsemcp.verifiedServers} verified`);
      console.log(`   🔄 Synced: ${report.pulsemcp.syncedServers} servers, ${report.pulsemcp.categoriesSynced} categories`);
    }

    // Integration results
    console.log(`\n🔗 Data Integration:`);
    console.log(`   📋 Total Records: ${report.integration.totalMergedRecords}`);
    console.log(`   🤝 Matched Pairs: ${report.integration.matchedPairs}`);
    console.log(`   📊 Quality Score: ${report.integration.dataQualityScore}%`);
    console.log(`   📂 GitHub Only: ${report.integration.githubOnlyRecords}`);
    console.log(`   📂 PulseMCP Only: ${report.integration.pulsemcpOnlyRecords}`);

    // Health monitoring
    if (report.health.monitoringEnabled) {
      console.log(`\n🏥 Health Monitoring:`);
      console.log(`   🔍 Monitored: ${report.health.serversMonitored} servers`);
      console.log(`   ✅ Healthy: ${report.health.healthyServers}`);
      console.log(`   ⚠️  Warning: ${report.health.warningServers}`);
      console.log(`   🚨 Critical: ${report.health.criticalServers}`);
      console.log(`   📊 Overall Score: ${report.health.overallHealthScore}%`);
    }

    // Database totals
    console.log(`\n💾 Final Database State:`);
    console.log(`   📦 Total Repositories: ${report.database?.totalRepositories || 0}`);
    console.log(`   🎯 Total MCP Servers: ${report.database?.mcpServers || 0}`);
    console.log(`   🔗 Merged Records: ${report.merged?.total || 0}`);
    
    if (report.processing.errors > 0) {
      console.log(`\n⚠️  Errors: ${report.processing.errors}`);
    }
    
    if (report.processing.warnings > 0) {
      console.log(`⚡ Warnings: ${report.processing.warnings}`);
    }
  }

  /**
   * Start high-level health monitoring service
   */
  async startHealthMonitoring() {
    if (!this.options.enableHealthMonitoring) {
      console.log('⚠️  Health monitoring is disabled');
      return;
    }

    console.log('🏥 Starting continuous health monitoring...');
    await this.healthMonitor.startMonitoring();
  }

  /**
   * Stop health monitoring service
   */
  stopHealthMonitoring() {
    this.healthMonitor.stopMonitoring();
  }

  /**
   * Get top MCP servers from merged data
   */
  async getTopMCPServers(limit = 50) {
    try {
      return await this.storage.db.allAsync(`
        SELECT name, repository_url, confidence, health_score, verified, 
               combined_stars, capabilities, category, data_sources
        FROM merged_servers
        ORDER BY confidence DESC, health_score DESC, combined_stars DESC
        LIMIT ?
      `, [limit]);

    } catch (error) {
      console.warn('⚠️  Failed to get top MCP servers:', error.message);
      return [];
    }
  }

  /**
   * Export comprehensive results
   */
  async exportSuperResults(format = 'json') {
    try {
      const githubData = await this.storage.exportData({ format });
      const mergedStats = await this.dataMerger.getMergedStats();
      const healthReport = await this.healthMonitor.generateHealthReport({ period: 7 });

      return {
        exportedAt: new Date().toISOString(),
        runId: this.currentRunId,
        github: githubData,
        merged: mergedStats,
        health: healthReport,
        stats: this.stats
      };

    } catch (error) {
      console.error('❌ Failed to export super results:', error.message);
      throw error;
    }
  }

  /**
   * Utility methods
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  async processBatch(batch, processor) {
    const results = [];
    
    for (const item of batch) {
      const result = await this.queue.add(() => processor(item));
      results.push(result);
    }

    return results;
  }

  generateRunId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = createHash('md5')
      .update(`${timestamp}-${Math.random()}`)
      .digest('hex')
      .substring(0, 8);
    return `super-discovery-${timestamp}-${hash}`;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async startRun(options) {
    try {
      await this.storage.startDiscoveryRun(this.currentRunId, {
        type: 'super_discovery',
        githubMaxRepositories: options.maxRepositories,
        githubMinStars: options.minStars,
        pulsemcpEnabled: options.includePulseMCP,
        healthMonitoringEnabled: options.enableHealthMonitoring,
        strictMode: options.strictMode,
        version: '3.0'
      });
    } catch (error) {
      console.warn('⚠️  Failed to start run tracking:', error.message);
    }
  }

  async completeRun() {
    try {
      this.stats.processing.endTime = Date.now();
      
      await this.storage.updateDiscoveryRun(this.currentRunId, {
        status: 'completed',
        completed: true,
        repositoriesFound: this.stats.github.repositories.discovered + this.stats.pulsemcp.servers.total,
        repositoriesAnalyzed: this.stats.github.repositories.analyzed,
        mcpServersDetected: this.stats.github.mcpServers.detected + this.stats.merged.total
      });
    } catch (error) {
      console.warn('⚠️  Failed to complete run tracking:', error.message);
    }
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    this.stopHealthMonitoring();
    await this.storage.close();
    await this.pulsemcpSync.cleanup();
    await this.dataMerger.cleanup();
    await this.healthMonitor.cleanup();
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  const orchestrator = new SuperDiscoveryOrchestrator({ 
    debug: args.includes('--debug'),
    maxRepositories: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 1000,
    minStars: args.includes('--stars') ? parseInt(args[args.indexOf('--stars') + 1]) : 1,
    concurrency: args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1]) : 3,
    pulsemcpMockMode: args.includes('--mock-pulsemcp'),
    includePulseMCP: !args.includes('--github-only'),
    enableHealthMonitoring: !args.includes('--no-health')
  });

  const dryRun = args.includes('--dry-run');
  const strictMode = args.includes('--strict');
  const force = args.includes('--force');
  const healthService = args.includes('--health-service');
  
  try {
    if (healthService) {
      console.log('🏥 Starting MCP-7 Health Monitoring Service...');
      await orchestrator.initialize();
      await orchestrator.startHealthMonitoring();
      
      console.log('🏥 Health monitoring service started. Press Ctrl+C to stop.');
      
      process.on('SIGINT', async () => {
        console.log('\n🛑 Stopping health monitoring service...');
        await orchestrator.cleanup();
        process.exit(0);
      });
      
    } else {
      const results = await orchestrator.runSuperDiscovery({
        dryRun,
        strictMode,
        force
      });

      console.log(`\n🎉 Super Discovery completed successfully!`);
      console.log(`📋 Run ID: ${results.runId}`);

      // Show top results
      const topMCPs = await orchestrator.getTopMCPServers(10);
      if (topMCPs.length > 0) {
        console.log('\n🏆 Top MCP Servers (Merged Results):');
        topMCPs.forEach((mcp, i) => {
          const sources = mcp.data_sources || 'unknown';
          const health = mcp.health_score ? `${mcp.health_score}% health` : 'no health data';
          const verified = mcp.verified ? '✓ verified' : '';
          
          console.log(`   ${i + 1}. ${mcp.name} (${mcp.confidence}% confidence, ${health}) ${verified}`);
          console.log(`      ⭐ ${mcp.combined_stars} stars | 📂 ${mcp.category || 'uncategorized'} | 📊 ${sources}`);
          console.log(`      🔗 ${mcp.repository_url || 'no url'}`);
        });
      }

      await orchestrator.cleanup();
    }

  } catch (error) {
    console.error('❌ Super discovery failed:', error.message);
    await orchestrator.cleanup();
    process.exit(1);
  }
}

export default SuperDiscoveryOrchestrator;