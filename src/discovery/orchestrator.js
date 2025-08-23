/**
 * Discovery Orchestrator for MCP-7 v3.0
 * Coordinates the entire MCP discovery pipeline: GitHub scanning, analysis, detection, and storage
 */

import { GitHubScanner } from './github-scanner.js';
import { RepositoryAnalyzer } from './repo-analyzer.js';
import { MCPDetector } from './mcp-detector.js';
import { MCPStorage } from './storage.js';
import { createHash } from 'crypto';
import PQueue from 'p-queue';

export class DiscoveryOrchestrator {
  constructor(options = {}) {
    this.options = {
      // GitHub configuration
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      maxRepositories: options.maxRepositories || 5000,
      minStars: options.minStars || 0,
      
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
      
      // Runtime configuration
      debug: options.debug || false,
      dryRun: options.dryRun || false,
      resumeRun: options.resumeRun,
      
      ...options
    };

    // Initialize components
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
      repositories: {
        discovered: 0,
        analyzed: 0,
        stored: 0
      },
      mcpServers: {
        detected: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0
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
   * Main orchestration method - runs the complete discovery pipeline
   */
  async runDiscovery(options = {}) {
    const runOptions = { ...this.options, ...options };
    
    try {
      console.log('🚀 MCP-7 GitHub Discovery Engine v3.0');
      console.log('=====================================\n');

      // Initialize components
      await this.initialize();

      // Generate run ID
      this.currentRunId = this.generateRunId();
      
      // Start tracking
      await this.startRun(runOptions);

      console.log(`📋 Discovery Configuration:`);
      console.log(`   Max repositories: ${runOptions.maxRepositories}`);
      console.log(`   Min stars: ${runOptions.minStars}`);
      console.log(`   Concurrency: ${runOptions.concurrency}`);
      console.log(`   Strict mode: ${runOptions.strictMode ? 'ON' : 'OFF'}`);
      console.log(`   Dry run: ${runOptions.dryRun ? 'YES' : 'NO'}`);
      console.log(`   Run ID: ${this.currentRunId}\n`);

      // Phase 1: Discover repositories
      console.log('🔍 PHASE 1: Repository Discovery');
      console.log('--------------------------------');
      const repositories = await this.discoverRepositories(runOptions);

      // Phase 2: Analyze repositories
      console.log('\n🔬 PHASE 2: Repository Analysis');
      console.log('-------------------------------');
      const analyses = await this.analyzeRepositories(repositories, runOptions);

      // Phase 3: Detect MCP servers
      console.log('\n🎯 PHASE 3: MCP Detection');
      console.log('-------------------------');
      const detections = await this.detectMCPServers(analyses, runOptions);

      // Phase 4: Store results
      console.log('\n💾 PHASE 4: Data Storage');
      console.log('------------------------');
      await this.storeResults(detections, runOptions);

      // Phase 5: Generate reports
      console.log('\n📊 PHASE 5: Report Generation');
      console.log('-----------------------------');
      const report = await this.generateReport();

      // Complete run tracking
      await this.completeRun();

      console.log('\n✅ Discovery Complete!');
      console.log('======================\n');
      
      this.printSummary(report);
      
      return {
        runId: this.currentRunId,
        repositories: detections,
        stats: this.stats,
        report
      };

    } catch (error) {
      console.error('❌ Discovery failed:', error.message);
      
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
    if (this.options.debug) {
      console.log('🔧 Initializing discovery components...');
    }

    await this.storage.initialize();
    
    if (this.options.debug) {
      console.log('✅ All components initialized\n');
    }
  }

  /**
   * Phase 1: Discover repositories from GitHub
   */
  async discoverRepositories(options) {
    this.stats.processing.startTime = Date.now();
    
    try {
      // Check rate limits
      const rateLimits = await this.scanner.getRateLimitStatus();
      if (rateLimits && rateLimits.search.remaining < 10) {
        throw new Error(`Insufficient GitHub API rate limit. Remaining: ${rateLimits.search.remaining}/5000`);
      }

      // Run discovery
      const searchResults = await this.scanner.searchMCPRepositories({
        maxResults: options.maxRepositories,
        minStars: options.minStars,
        includeArchived: false
      });

      this.stats.repositories.discovered = searchResults.repositories.length;
      
      console.log(`✅ Discovered ${searchResults.repositories.length} repositories`);
      console.log(`   Patterns searched: ${searchResults.stats.patternsSearched}`);
      console.log(`   Duplicates filtered: ${searchResults.stats.duplicatesFiltered}`);

      // Update run progress
      await this.storage.updateDiscoveryRun(this.currentRunId, {
        repositoriesFound: searchResults.repositories.length
      });

      return searchResults.repositories;

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'discovery',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Phase 2: Analyze repositories in batches
   */
  async analyzeRepositories(repositories, options) {
    try {
      const analyses = [];
      const batches = this.createBatches(repositories, options.batchSize);
      
      console.log(`🔄 Processing ${repositories.length} repositories in ${batches.length} batches...`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`\n📦 Batch ${i + 1}/${batches.length} (${batch.length} repositories)`);

        // Get repository details and analyze
        const batchAnalyses = await this.processBatch(batch, async (repo) => {
          try {
            // Get detailed repository information
            const details = await this.scanner.getRepositoryDetails(
              repo.owner.login,
              repo.name
            );

            if (!details) {
              this.stats.processing.warnings.push(`Failed to get details for ${repo.full_name}`);
              return null;
            }

            // Analyze repository
            const analysis = await this.analyzer.analyzeRepository(
              details.repository,
              details.contents
            );

            return analysis;

          } catch (error) {
            this.stats.processing.errors.push({
              phase: 'analysis',
              repository: repo.full_name,
              error: error.message,
              timestamp: new Date().toISOString()
            });
            return null;
          }
        });

        // Filter out failed analyses
        const validAnalyses = batchAnalyses.filter(a => a !== null);
        analyses.push(...validAnalyses);
        
        this.stats.repositories.analyzed += validAnalyses.length;
        
        console.log(`   ✅ Analyzed ${validAnalyses.length}/${batch.length} repositories`);
        console.log(`   📊 Total progress: ${analyses.length}/${repositories.length} (${Math.round((analyses.length / repositories.length) * 100)}%)`);

        // Update run progress
        await this.storage.updateDiscoveryRun(this.currentRunId, {
          repositoriesAnalyzed: this.stats.repositories.analyzed
        });

        // Brief pause between batches
        if (i < batches.length - 1) {
          await this.sleep(1000);
        }
      }

      console.log(`\n✅ Repository analysis complete!`);
      console.log(`   Successfully analyzed: ${analyses.length}/${repositories.length}`);
      console.log(`   Failed analyses: ${repositories.length - analyses.length}`);

      return analyses;

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'analysis',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Phase 3: Detect MCP servers
   */
  async detectMCPServers(analyses, options) {
    try {
      console.log(`🎯 Running MCP detection on ${analyses.length} analyses...`);

      const detections = await this.detector.detectMCPRepositories(analyses);
      
      // Calculate statistics
      detections.forEach(detection => {
        const mcpDetection = detection.mcpDetection;
        if (mcpDetection.isMCP) {
          this.stats.mcpServers.detected++;
          
          if (mcpDetection.confidence >= 70) {
            this.stats.mcpServers.highConfidence++;
          } else if (mcpDetection.confidence >= 50) {
            this.stats.mcpServers.mediumConfidence++;
          } else {
            this.stats.mcpServers.lowConfidence++;
          }
        }
      });

      console.log(`✅ MCP detection complete!`);
      console.log(`   MCP servers detected: ${this.stats.mcpServers.detected}`);
      console.log(`   High confidence: ${this.stats.mcpServers.highConfidence}`);
      console.log(`   Medium confidence: ${this.stats.mcpServers.mediumConfidence}`);
      console.log(`   Low confidence: ${this.stats.mcpServers.lowConfidence}`);

      // Update run progress
      await this.storage.updateDiscoveryRun(this.currentRunId, {
        mcpServersDetected: this.stats.mcpServers.detected
      });

      return detections;

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'detection',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Phase 4: Store results in database
   */
  async storeResults(detections, options) {
    if (options.dryRun) {
      console.log('🏃 Dry run mode - skipping database storage');
      return;
    }

    try {
      console.log(`💾 Storing ${detections.length} results in database...`);

      let storedCount = 0;
      const batches = this.createBatches(detections, 25); // Smaller batches for database operations

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        await Promise.all(batch.map(async (detection) => {
          try {
            // Store repository
            const repositoryId = await this.storage.storeRepository(detection.repository);
            
            // Store analysis results
            await this.storage.storeAnalysis(repositoryId, detection);
            
            // Store detection results
            await this.storage.storeDetection(repositoryId, detection.mcpDetection);
            
            storedCount++;

          } catch (error) {
            this.stats.processing.errors.push({
              phase: 'storage',
              repository: detection.repository.fullName,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }));

        if ((i + 1) % 10 === 0 || i === batches.length - 1) {
          console.log(`   📊 Stored ${storedCount}/${detections.length} results`);
        }
      }

      this.stats.repositories.stored = storedCount;

      console.log(`✅ Data storage complete!`);
      console.log(`   Successfully stored: ${storedCount}/${detections.length}`);
      console.log(`   Storage failures: ${detections.length - storedCount}`);

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'storage',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Phase 5: Generate comprehensive report
   */
  async generateReport() {
    try {
      const dbStats = await this.storage.getDiscoveryStats();
      const processingTime = this.stats.processing.startTime ? 
        Date.now() - this.stats.processing.startTime : 0;

      const report = {
        runId: this.currentRunId,
        timestamp: new Date().toISOString(),
        processing: {
          duration: processingTime,
          durationFormatted: this.formatDuration(processingTime),
          errors: this.stats.processing.errors.length,
          warnings: this.stats.processing.warnings.length
        },
        discovery: {
          repositoriesDiscovered: this.stats.repositories.discovered,
          repositoriesAnalyzed: this.stats.repositories.analyzed,
          repositoriesStored: this.stats.repositories.stored,
          analysisSuccessRate: this.stats.repositories.discovered > 0 ?
            Math.round((this.stats.repositories.analyzed / this.stats.repositories.discovered) * 100) : 0
        },
        mcpDetection: {
          totalMCPServers: this.stats.mcpServers.detected,
          highConfidence: this.stats.mcpServers.highConfidence,
          mediumConfidence: this.stats.mcpServers.mediumConfidence,
          lowConfidence: this.stats.mcpServers.lowConfidence,
          detectionRate: this.stats.repositories.analyzed > 0 ?
            Math.round((this.stats.mcpServers.detected / this.stats.repositories.analyzed) * 100) : 0
        },
        database: dbStats
      };

      return report;

    } catch (error) {
      console.warn('⚠️  Failed to generate report:', error.message);
      return {
        runId: this.currentRunId,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Start run tracking
   */
  async startRun(options) {
    try {
      await this.storage.startDiscoveryRun(this.currentRunId, {
        maxRepositories: options.maxRepositories,
        minStars: options.minStars,
        strictMode: options.strictMode,
        version: '3.0'
      });
    } catch (error) {
      console.warn('⚠️  Failed to start run tracking:', error.message);
    }
  }

  /**
   * Complete run tracking
   */
  async completeRun() {
    try {
      await this.storage.updateDiscoveryRun(this.currentRunId, {
        status: 'completed',
        completed: true
      });
    } catch (error) {
      console.warn('⚠️  Failed to complete run tracking:', error.message);
    }
  }

  /**
   * Process batch of items with queue management
   */
  async processBatch(batch, processor) {
    const results = [];
    
    for (const item of batch) {
      const result = await this.queue.add(() => processor(item));
      results.push(result);
    }

    return results;
  }

  /**
   * Create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Generate unique run ID
   */
  generateRunId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = createHash('md5')
      .update(`${timestamp}-${Math.random()}`)
      .digest('hex')
      .substring(0, 8);
    return `discovery-${timestamp}-${hash}`;
  }

  /**
   * Print summary report
   */
  printSummary(report) {
    console.log('📊 Discovery Summary');
    console.log('===================');
    console.log(`🕒 Duration: ${report.processing.durationFormatted}`);
    console.log(`📦 Repositories Discovered: ${report.discovery.repositoriesDiscovered}`);
    console.log(`🔬 Repositories Analyzed: ${report.discovery.repositoriesAnalyzed} (${report.discovery.analysisSuccessRate}% success)`);
    console.log(`💾 Repositories Stored: ${report.discovery.repositoriesStored}`);
    console.log(`🎯 MCP Servers Detected: ${report.mcpDetection.totalMCPServers} (${report.mcpDetection.detectionRate}% rate)`);
    console.log(`   📈 High Confidence: ${report.mcpDetection.highConfidence}`);
    console.log(`   📊 Medium Confidence: ${report.mcpDetection.mediumConfidence}`);
    console.log(`   📉 Low Confidence: ${report.mcpDetection.lowConfidence}`);
    
    if (report.processing.errors > 0) {
      console.log(`⚠️  Errors: ${report.processing.errors}`);
    }
    
    if (report.processing.warnings > 0) {
      console.log(`⚡ Warnings: ${report.processing.warnings}`);
    }

    console.log(`\n💾 Database Status:`);
    console.log(`   Total Repositories: ${report.database?.totalRepositories || 0}`);
    console.log(`   Total MCP Servers: ${report.database?.mcpServers || 0}`);
  }

  /**
   * Utility methods
   */
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get high-confidence MCPs from database
   */
  async getHighConfidenceMCPs(limit = 100) {
    return await this.storage.getMCPRepositories({
      minConfidence: 70,
      limit,
      orderBy: 'confidence',
      orderDirection: 'DESC'
    });
  }

  /**
   * Export discovery results
   */
  async exportResults(format = 'json') {
    return await this.storage.exportData({ format });
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    await this.storage.close();
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new DiscoveryOrchestrator({ 
    debug: true,
    maxRepositories: 1000,
    minStars: 1,
    concurrency: 3
  });

  // Handle CLI arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const strictMode = args.includes('--strict');
  
  try {
    const results = await orchestrator.runDiscovery({
      dryRun,
      strictMode
    });

    console.log(`\n🎉 Discovery completed successfully!`);
    console.log(`📋 Run ID: ${results.runId}`);
    console.log(`📊 Found ${results.stats.mcpServers.detected} MCP servers`);

    // Show top results
    const topMCPs = await orchestrator.getHighConfidenceMCPs(10);
    if (topMCPs.length > 0) {
      console.log('\n🏆 Top High-Confidence MCP Servers:');
      topMCPs.forEach((mcp, i) => {
        console.log(`   ${i + 1}. ${mcp.full_name} (${mcp.confidence}% confidence)`);
        console.log(`      ⭐ ${mcp.stars} stars | 📝 ${mcp.description || 'No description'}`);
      });
    }

  } catch (error) {
    console.error('❌ Discovery failed:', error.message);
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

export default DiscoveryOrchestrator;