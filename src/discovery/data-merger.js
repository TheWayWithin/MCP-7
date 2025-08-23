/**
 * Data Merger for MCP-7 v3.0
 * Merges GitHub discoveries with PulseMCP directory data to create unified server catalog
 */

import { MCPStorage } from './storage.js';
import { createHash } from 'crypto';

export class DataMerger {
  constructor(options = {}) {
    this.options = {
      // Merge preferences
      preferPulseMCP: options.preferPulseMCP !== false, // Prefer PulseMCP data by default
      confidenceBoost: options.confidenceBoost || 15, // Boost confidence for verified servers
      minMatchScore: options.minMatchScore || 0.7, // Minimum similarity for matching
      
      // Processing options
      debug: options.debug || false,
      dryRun: options.dryRun || false,
      
      ...options
    };

    this.storage = new MCPStorage({
      debug: this.options.debug,
      dbPath: options.dbPath
    });

    // Merge statistics
    this.stats = {
      github: {
        total: 0,
        matched: 0,
        unmatched: 0
      },
      pulsemcp: {
        total: 0,
        matched: 0,
        unmatched: 0
      },
      merged: {
        created: 0,
        updated: 0,
        enriched: 0
      },
      processing: {
        startTime: null,
        endTime: null,
        errors: [],
        warnings: []
      }
    };

    // Matching algorithms
    this.matchers = {
      repository: this.matchByRepository.bind(this),
      name: this.matchByName.bind(this),
      description: this.matchByDescription.bind(this),
      capabilities: this.matchByCapabilities.bind(this)
    };
  }

  /**
   * Initialize data merger
   */
  async initialize() {
    try {
      if (this.options.debug) {
        console.log('🔧 Initializing data merger...');
      }

      await this.storage.initialize();
      await this.createMergedTables();

      if (this.options.debug) {
        console.log('✅ Data merger initialized');
      }

    } catch (error) {
      console.error('❌ Failed to initialize data merger:', error.message);
      throw error;
    }
  }

  /**
   * Run complete data merge operation
   */
  async runMerge(options = {}) {
    const mergeOptions = { ...this.options, ...options };
    
    try {
      console.log('🔗 Starting data merge operation');
      console.log('=================================\n');

      this.stats.processing.startTime = Date.now();

      // Load source data
      console.log('📊 Loading source data...');
      const githubData = await this.loadGitHubData();
      const pulsemcpData = await this.loadPulseMCPData();

      console.log(`   GitHub repositories: ${githubData.length}`);
      console.log(`   PulseMCP servers: ${pulsemcpData.length}`);

      this.stats.github.total = githubData.length;
      this.stats.pulsemcp.total = pulsemcpData.length;

      if (githubData.length === 0 && pulsemcpData.length === 0) {
        console.warn('⚠️  No data to merge');
        return { merged: 0, skipped: true };
      }

      // Find matches between datasets
      console.log('\n🔍 Finding matches between datasets...');
      const matchResults = await this.findMatches(githubData, pulsemcpData);

      console.log(`   Matched pairs: ${matchResults.matches.length}`);
      console.log(`   Unmatched GitHub: ${matchResults.unmatchedGitHub.length}`);
      console.log(`   Unmatched PulseMCP: ${matchResults.unmatchedPulseMCP.length}`);

      // Create merged records
      console.log('\n🔗 Creating merged records...');
      await this.createMergedRecords(matchResults, mergeOptions);

      // Generate provenance tracking
      console.log('\n📋 Updating provenance tracking...');
      await this.updateProvenanceTracking();

      this.stats.processing.endTime = Date.now();

      console.log('\n✅ Data merge completed successfully!');
      this.printMergeSummary();

      return {
        stats: this.stats,
        duration: this.formatDuration(this.stats.processing.endTime - this.stats.processing.startTime)
      };

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'merge',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      console.error('❌ Data merge failed:', error.message);
      throw error;
    }
  }

  /**
   * Load GitHub discovery data
   */
  async loadGitHubData() {
    try {
      const repositories = await this.storage.db.allAsync(`
        SELECT r.*, ma.confidence, ma.server_type, ma.capabilities, ma.indicators,
               pi.package_name, pi.version, pi.installation_method
        FROM repositories r
        LEFT JOIN mcp_analysis ma ON r.id = ma.repository_id
        LEFT JOIN package_info pi ON r.id = pi.repository_id
        WHERE ma.is_mcp = 1 OR ma.confidence >= 30
        ORDER BY ma.confidence DESC
      `);

      return repositories.map(repo => ({
        id: repo.id,
        source: 'github',
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner,
        description: repo.description,
        url: repo.url,
        cloneUrl: repo.clone_url,
        language: repo.language,
        stars: repo.stars,
        forks: repo.forks,
        topics: JSON.parse(repo.topics || '[]'),
        confidence: repo.confidence || 0,
        serverType: repo.server_type,
        capabilities: JSON.parse(repo.capabilities || '[]'),
        indicators: JSON.parse(repo.indicators || '[]'),
        packageName: repo.package_name,
        version: repo.version,
        installationMethod: repo.installation_method,
        discoveredAt: repo.discovered_at,
        lastAnalyzed: repo.last_analyzed_at
      }));

    } catch (error) {
      console.warn('⚠️  Failed to load GitHub data:', error.message);
      return [];
    }
  }

  /**
   * Load PulseMCP directory data
   */
  async loadPulseMCPData() {
    try {
      const servers = await this.storage.db.allAsync(`
        SELECT * FROM pulsemcp_servers 
        WHERE active = 1
        ORDER BY health_score DESC, stars DESC
      `);

      return servers.map(server => ({
        id: server.id,
        source: 'pulsemcp',
        serverId: server.server_id,
        name: server.name,
        description: server.description,
        category: server.category,
        language: server.language,
        capabilities: JSON.parse(server.capabilities || '[]'),
        version: server.version,
        author: server.author,
        repository: server.repository,
        verified: Boolean(server.verified),
        active: Boolean(server.active),
        healthScore: server.health_score,
        healthTrend: server.health_trend,
        downloads: server.downloads,
        stars: server.stars,
        installationMethod: server.installation_method,
        installationCommand: server.installation_command,
        lastUpdatedUpstream: server.last_updated_upstream,
        syncedAt: server.synced_at
      }));

    } catch (error) {
      console.warn('⚠️  Failed to load PulseMCP data:', error.message);
      return [];
    }
  }

  /**
   * Find matches between GitHub and PulseMCP data
   */
  async findMatches(githubData, pulsemcpData) {
    const matches = [];
    const unmatchedGitHub = [...githubData];
    const unmatchedPulseMCP = [...pulsemcpData];

    for (const github of githubData) {
      let bestMatch = null;
      let bestScore = 0;

      for (const pulsemcp of pulsemcpData) {
        const matchScore = this.calculateMatchScore(github, pulsemcp);
        
        if (matchScore > bestScore && matchScore >= this.options.minMatchScore) {
          bestMatch = pulsemcp;
          bestScore = matchScore;
        }
      }

      if (bestMatch) {
        matches.push({
          github,
          pulsemcp: bestMatch,
          matchScore: bestScore,
          matchReasons: this.getMatchReasons(github, bestMatch)
        });

        // Remove from unmatched lists
        const githubIndex = unmatchedGitHub.findIndex(g => g.id === github.id);
        if (githubIndex >= 0) unmatchedGitHub.splice(githubIndex, 1);

        const pulsemcpIndex = unmatchedPulseMCP.findIndex(p => p.id === bestMatch.id);
        if (pulsemcpIndex >= 0) unmatchedPulseMCP.splice(pulsemcpIndex, 1);

        this.stats.github.matched++;
        this.stats.pulsemcp.matched++;
      }
    }

    this.stats.github.unmatched = unmatchedGitHub.length;
    this.stats.pulsemcp.unmatched = unmatchedPulseMCP.length;

    return { matches, unmatchedGitHub, unmatchedPulseMCP };
  }

  /**
   * Calculate match score between GitHub and PulseMCP entries
   */
  calculateMatchScore(github, pulsemcp) {
    let score = 0;
    let totalWeight = 0;

    // Repository URL match (highest weight)
    const repoScore = this.matchers.repository(github, pulsemcp);
    score += repoScore * 0.4;
    totalWeight += 0.4;

    // Name similarity
    const nameScore = this.matchers.name(github, pulsemcp);
    score += nameScore * 0.3;
    totalWeight += 0.3;

    // Description similarity
    const descScore = this.matchers.description(github, pulsemcp);
    score += descScore * 0.2;
    totalWeight += 0.2;

    // Capabilities overlap
    const capScore = this.matchers.capabilities(github, pulsemcp);
    score += capScore * 0.1;
    totalWeight += 0.1;

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Match by repository URL
   */
  matchByRepository(github, pulsemcp) {
    if (!github.cloneUrl || !pulsemcp.repository) return 0;

    const githubUrl = this.normalizeRepoUrl(github.cloneUrl);
    const pulsemcpUrl = this.normalizeRepoUrl(pulsemcp.repository);

    return githubUrl === pulsemcpUrl ? 1 : 0;
  }

  /**
   * Match by name similarity
   */
  matchByName(github, pulsemcp) {
    if (!github.name || !pulsemcp.name) return 0;
    return this.calculateStringSimilarity(github.name.toLowerCase(), pulsemcp.name.toLowerCase());
  }

  /**
   * Match by description similarity
   */
  matchByDescription(github, pulsemcp) {
    if (!github.description || !pulsemcp.description) return 0;
    return this.calculateStringSimilarity(
      github.description.toLowerCase(),
      pulsemcp.description.toLowerCase()
    );
  }

  /**
   * Match by capabilities overlap
   */
  matchByCapabilities(github, pulsemcp) {
    const githubCaps = github.capabilities || [];
    const pulsemcpCaps = pulsemcp.capabilities || [];

    if (githubCaps.length === 0 || pulsemcpCaps.length === 0) return 0;

    const intersection = githubCaps.filter(cap => 
      pulsemcpCaps.some(pcap => 
        this.calculateStringSimilarity(cap.toLowerCase(), pcap.toLowerCase()) > 0.8
      )
    );

    const union = [...new Set([...githubCaps, ...pulsemcpCaps])];
    return intersection.length / union.length;
  }

  /**
   * Get reasons for match
   */
  getMatchReasons(github, pulsemcp) {
    const reasons = [];

    if (this.matchers.repository(github, pulsemcp) > 0.9) {
      reasons.push('repository_url');
    }

    if (this.matchers.name(github, pulsemcp) > 0.8) {
      reasons.push('name_similarity');
    }

    if (this.matchers.description(github, pulsemcp) > 0.7) {
      reasons.push('description_similarity');
    }

    if (this.matchers.capabilities(github, pulsemcp) > 0.5) {
      reasons.push('capabilities_overlap');
    }

    return reasons;
  }

  /**
   * Create merged records from match results
   */
  async createMergedRecords(matchResults, options) {
    // Process matched pairs
    for (const match of matchResults.matches) {
      await this.createMergedRecord(match, options);
      this.stats.merged.created++;
    }

    // Process unmatched GitHub records
    for (const github of matchResults.unmatchedGitHub) {
      await this.createGitHubOnlyRecord(github);
      this.stats.merged.created++;
    }

    // Process unmatched PulseMCP records
    for (const pulsemcp of matchResults.unmatchedPulseMCP) {
      await this.createPulseMCPOnlyRecord(pulsemcp);
      this.stats.merged.created++;
    }
  }

  /**
   * Create merged record from matched pair
   */
  async createMergedRecord(match, options) {
    const { github, pulsemcp, matchScore, matchReasons } = match;

    // Determine which data to prefer
    const preferPulseMCP = options.preferPulseMCP && pulsemcp.verified;

    const mergedRecord = {
      // Identifiers
      github_id: github.id,
      pulsemcp_id: pulsemcp.id,
      pulsemcp_server_id: pulsemcp.serverId,

      // Basic info (prefer PulseMCP if verified, otherwise GitHub)
      name: preferPulseMCP ? pulsemcp.name : github.name,
      description: (preferPulseMCP ? pulsemcp.description : github.description) || 
                  github.description || pulsemcp.description,
      
      // Repository info (prefer GitHub as source of truth)
      repository_url: github.url,
      clone_url: github.cloneUrl,
      full_name: github.fullName,
      owner: github.owner,

      // Technical details
      language: pulsemcp.language || github.language,
      version: pulsemcp.version || github.version,
      
      // Capabilities (merge both)
      capabilities: JSON.stringify(this.mergeCapabilities(github.capabilities, pulsemcp.capabilities)),
      server_type: github.serverType || this.inferServerType(pulsemcp.category),
      category: pulsemcp.category,

      // Quality indicators
      confidence: this.calculateMergedConfidence(github, pulsemcp, options),
      verified: pulsemcp.verified ? 1 : 0,
      health_score: pulsemcp.healthScore,
      health_trend: pulsemcp.healthTrend,

      // Popularity metrics (combine when available)
      github_stars: github.stars || 0,
      pulsemcp_stars: pulsemcp.stars || 0,
      combined_stars: (github.stars || 0) + (pulsemcp.stars || 0),
      downloads: pulsemcp.downloads || 0,
      forks: github.forks || 0,

      // Installation info
      installation_method: pulsemcp.installationMethod || github.installationMethod,
      installation_command: pulsemcp.installationCommand,
      package_name: github.packageName || pulsemcp.name,

      // Topics and tags
      topics: JSON.stringify(github.topics || []),

      // Matching info
      match_score: matchScore,
      match_reasons: JSON.stringify(matchReasons),
      data_sources: 'github,pulsemcp',

      // Timestamps
      github_discovered_at: github.discoveredAt,
      github_analyzed_at: github.lastAnalyzed,
      pulsemcp_synced_at: pulsemcp.syncedAt,
      merged_at: new Date().toISOString()
    };

    // Store merged record
    await this.storeMergedRecord(mergedRecord);
  }

  /**
   * Create record from GitHub data only
   */
  async createGitHubOnlyRecord(github) {
    const mergedRecord = {
      github_id: github.id,
      name: github.name,
      description: github.description,
      repository_url: github.url,
      clone_url: github.cloneUrl,
      full_name: github.fullName,
      owner: github.owner,
      language: github.language,
      version: github.version,
      capabilities: JSON.stringify(github.capabilities || []),
      server_type: github.serverType,
      confidence: github.confidence,
      verified: 0,
      github_stars: github.stars || 0,
      combined_stars: github.stars || 0,
      forks: github.forks || 0,
      installation_method: github.installationMethod,
      package_name: github.packageName,
      topics: JSON.stringify(github.topics || []),
      data_sources: 'github',
      github_discovered_at: github.discoveredAt,
      github_analyzed_at: github.lastAnalyzed,
      merged_at: new Date().toISOString()
    };

    await this.storeMergedRecord(mergedRecord);
  }

  /**
   * Create record from PulseMCP data only
   */
  async createPulseMCPOnlyRecord(pulsemcp) {
    const mergedRecord = {
      pulsemcp_id: pulsemcp.id,
      pulsemcp_server_id: pulsemcp.serverId,
      name: pulsemcp.name,
      description: pulsemcp.description,
      repository_url: pulsemcp.repository,
      language: pulsemcp.language,
      version: pulsemcp.version,
      capabilities: JSON.stringify(pulsemcp.capabilities || []),
      category: pulsemcp.category,
      confidence: this.inferConfidenceFromPulseMCP(pulsemcp),
      verified: pulsemcp.verified ? 1 : 0,
      health_score: pulsemcp.healthScore,
      health_trend: pulsemcp.healthTrend,
      pulsemcp_stars: pulsemcp.stars || 0,
      combined_stars: pulsemcp.stars || 0,
      downloads: pulsemcp.downloads || 0,
      installation_method: pulsemcp.installationMethod,
      installation_command: pulsemcp.installationCommand,
      package_name: pulsemcp.name,
      data_sources: 'pulsemcp',
      pulsemcp_synced_at: pulsemcp.syncedAt,
      merged_at: new Date().toISOString()
    };

    await this.storeMergedRecord(mergedRecord);
  }

  /**
   * Store merged record in database
   */
  async storeMergedRecord(record) {
    try {
      const fields = Object.keys(record).join(', ');
      const placeholders = Object.keys(record).map(() => '?').join(', ');
      const values = Object.values(record);

      await this.storage.db.runAsync(`
        INSERT OR REPLACE INTO merged_servers (${fields}) 
        VALUES (${placeholders})
      `, values);

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'storage',
        record: record.name || 'unknown',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      if (this.options.debug) {
        console.warn(`⚠️  Failed to store merged record:`, error.message);
      }
    }
  }

  /**
   * Update provenance tracking
   */
  async updateProvenanceTracking() {
    try {
      await this.storage.setMetadata('last_merge_time', new Date().toISOString());
      await this.storage.setMetadata('merge_stats', JSON.stringify(this.stats));

      // Update server counts by source
      const sourceCounts = await this.storage.db.allAsync(`
        SELECT data_sources, COUNT(*) as count 
        FROM merged_servers 
        GROUP BY data_sources
      `);

      for (const { data_sources, count } of sourceCounts) {
        await this.storage.setMetadata(`merged_servers_${data_sources}`, count.toString());
      }

    } catch (error) {
      console.warn('⚠️  Failed to update provenance tracking:', error.message);
    }
  }

  /**
   * Helper methods
   */
  mergeCapabilities(githubCaps = [], pulsemcpCaps = []) {
    const combined = [...githubCaps, ...pulsemcpCaps];
    return [...new Set(combined.map(cap => cap.toLowerCase()))];
  }

  calculateMergedConfidence(github, pulsemcp, options) {
    let confidence = github.confidence || 0;

    // Boost confidence for verified PulseMCP servers
    if (pulsemcp.verified) {
      confidence += options.confidenceBoost;
    }

    // Boost confidence based on health score
    if (pulsemcp.healthScore) {
      confidence += Math.floor(pulsemcp.healthScore / 10);
    }

    // Cap at 100%
    return Math.min(confidence, 100);
  }

  inferConfidenceFromPulseMCP(pulsemcp) {
    let confidence = 50; // Base confidence for PulseMCP servers

    if (pulsemcp.verified) confidence += 30;
    if (pulsemcp.healthScore > 80) confidence += 15;
    if (pulsemcp.downloads > 1000) confidence += 10;
    if (pulsemcp.stars > 50) confidence += 5;

    return Math.min(confidence, 100);
  }

  inferServerType(category) {
    const categoryMap = {
      'development': 'development-tools',
      'productivity': 'productivity',
      'data': 'data-analysis',
      'communication': 'communication',
      'ai-ml': 'ai-integration',
      'automation': 'automation',
      'content': 'content-management',
      'integration': 'api-integration'
    };

    return categoryMap[category] || 'general';
  }

  normalizeRepoUrl(url) {
    if (!url) return '';
    
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^git@/, '')
      .replace(/\.git$/, '')
      .replace(/github\.com[:\\/]/, 'github.com/')
      .toLowerCase();
  }

  calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Use Jaccard similarity on word sets
    const words1 = new Set(str1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const words2 = new Set(str2.toLowerCase().split(/\W+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Create database tables for merged data
   */
  async createMergedTables() {
    const tables = [
      // Unified server records
      `CREATE TABLE IF NOT EXISTS merged_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER,
        pulsemcp_id INTEGER,
        pulsemcp_server_id TEXT,
        
        -- Basic information
        name TEXT NOT NULL,
        description TEXT,
        repository_url TEXT,
        clone_url TEXT,
        full_name TEXT,
        owner TEXT,
        
        -- Technical details
        language TEXT,
        version TEXT,
        capabilities TEXT, -- JSON array
        server_type TEXT,
        category TEXT,
        
        -- Quality indicators
        confidence INTEGER DEFAULT 0,
        verified BOOLEAN DEFAULT 0,
        health_score INTEGER,
        health_trend TEXT,
        
        -- Popularity metrics
        github_stars INTEGER DEFAULT 0,
        pulsemcp_stars INTEGER DEFAULT 0,
        combined_stars INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        forks INTEGER DEFAULT 0,
        
        -- Installation info
        installation_method TEXT,
        installation_command TEXT,
        package_name TEXT,
        
        -- Metadata
        topics TEXT, -- JSON array
        match_score REAL,
        match_reasons TEXT, -- JSON array
        data_sources TEXT, -- 'github', 'pulsemcp', or 'github,pulsemcp'
        
        -- Timestamps
        github_discovered_at TEXT,
        github_analyzed_at TEXT,
        pulsemcp_synced_at TEXT,
        merged_at TEXT NOT NULL
      )`
    ];

    for (const table of tables) {
      await this.storage.db.runAsync(table);
    }
  }

  /**
   * Get merged statistics
   */
  async getMergedStats() {
    try {
      const totalServers = await this.storage.db.getAsync(
        'SELECT COUNT(*) as count FROM merged_servers'
      );

      const verifiedServers = await this.storage.db.getAsync(
        'SELECT COUNT(*) as count FROM merged_servers WHERE verified = 1'
      );

      const highConfidenceServers = await this.storage.db.getAsync(
        'SELECT COUNT(*) as count FROM merged_servers WHERE confidence >= 70'
      );

      const sourceCounts = await this.storage.db.allAsync(`
        SELECT data_sources, COUNT(*) as count 
        FROM merged_servers 
        GROUP BY data_sources
      `);

      const lastMerge = await this.storage.getMetadata('last_merge_time');

      return {
        total: totalServers.count,
        verified: verifiedServers.count,
        highConfidence: highConfidenceServers.count,
        sources: sourceCounts.reduce((acc, row) => {
          acc[row.data_sources] = row.count;
          return acc;
        }, {}),
        lastMerge
      };

    } catch (error) {
      console.warn('⚠️  Failed to get merged stats:', error.message);
      return null;
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  printMergeSummary() {
    console.log('\n📊 Merge Summary');
    console.log('================');
    console.log(`🔗 GitHub matched: ${this.stats.github.matched}/${this.stats.github.total}`);
    console.log(`🔗 PulseMCP matched: ${this.stats.pulsemcp.matched}/${this.stats.pulsemcp.total}`);
    console.log(`📦 Merged records created: ${this.stats.merged.created}`);
    
    if (this.stats.processing.errors.length > 0) {
      console.log(`⚠️  Errors: ${this.stats.processing.errors.length}`);
    }
    
    if (this.stats.processing.warnings.length > 0) {
      console.log(`⚡ Warnings: ${this.stats.processing.warnings.length}`);
    }
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
  const merger = new DataMerger({ 
    debug: true 
  });

  try {
    console.log('🔗 Data Merger v3.0');
    console.log('===================\n');

    await merger.initialize();
    
    const result = await merger.runMerge();
    
    console.log('\n📊 Final Statistics:');
    const stats = await merger.getMergedStats();
    if (stats) {
      console.log(`   Total merged servers: ${stats.total}`);
      console.log(`   Verified servers: ${stats.verified}`);
      console.log(`   High confidence: ${stats.highConfidence}`);
      console.log(`   Data sources:`, stats.sources);
    }

    await merger.cleanup();

  } catch (error) {
    console.error('❌ Data merge failed:', error.message);
    await merger.cleanup();
    process.exit(1);
  }
}

export default DataMerger;