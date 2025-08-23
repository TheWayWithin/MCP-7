/**
 * Data Storage Engine for MCP Discovery
 * SQLite-based storage for discovered MCPs with caching and metadata management
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MCPStorage {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(__dirname, '../../data/mcp-discovery.db');
    this.debug = options.debug || false;
    this.db = null;
    
    // Cache settings
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours
    
    // Database schema version for migrations
    this.schemaVersion = 1;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      await this.ensureDirectory(dataDir);

      // Open database connection
      this.db = new sqlite3.Database(this.dbPath);
      
      // Promisify database methods
      this.db.runAsync = promisify(this.db.run.bind(this.db));
      this.db.getAsync = promisify(this.db.get.bind(this.db));
      this.db.allAsync = promisify(this.db.all.bind(this.db));

      // Enable foreign keys and set pragmas for performance
      await this.db.runAsync('PRAGMA foreign_keys = ON');
      await this.db.runAsync('PRAGMA journal_mode = WAL');
      await this.db.runAsync('PRAGMA synchronous = NORMAL');
      await this.db.runAsync('PRAGMA temp_store = MEMORY');
      await this.db.runAsync('PRAGMA mmap_size = 268435456'); // 256MB

      // Create tables
      await this.createTables();
      
      // Run migrations if needed
      await this.runMigrations();

      if (this.debug) {
        console.log('✅ SQLite database initialized:', this.dbPath);
      }

    } catch (error) {
      console.error('❌ Failed to initialize database:', error.message);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    const tables = [
      // Main repositories table
      `CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        clone_url TEXT,
        ssh_url TEXT,
        language TEXT,
        stars INTEGER DEFAULT 0,
        forks INTEGER DEFAULT 0,
        watchers INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        topics TEXT, -- JSON array
        license TEXT,
        created_at TEXT,
        updated_at TEXT,
        pushed_at TEXT,
        archived BOOLEAN DEFAULT 0,
        fork BOOLEAN DEFAULT 0,
        discovered_at TEXT NOT NULL,
        last_analyzed_at TEXT,
        search_pattern TEXT
      )`,

      // MCP analysis results
      `CREATE TABLE IF NOT EXISTS mcp_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        confidence_level TEXT NOT NULL,
        is_mcp BOOLEAN NOT NULL DEFAULT 0,
        server_type TEXT,
        capabilities TEXT, -- JSON array
        indicators TEXT, -- JSON array
        analysis_version TEXT,
        analyzed_at TEXT NOT NULL,
        FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
      )`,

      // Detection results
      `CREATE TABLE IF NOT EXISTS mcp_detection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        detection_confidence REAL NOT NULL DEFAULT 0,
        detection_level TEXT NOT NULL,
        classification TEXT NOT NULL,
        positive_indicators TEXT, -- JSON array
        negative_indicators TEXT, -- JSON array
        edge_cases TEXT, -- JSON array
        reasons TEXT, -- JSON array
        detection_version TEXT,
        detected_at TEXT NOT NULL,
        FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
      )`,

      // Package information
      `CREATE TABLE IF NOT EXISTS package_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        package_name TEXT,
        version TEXT,
        main_file TEXT,
        installation_method TEXT,
        dependencies TEXT, -- JSON object
        dev_dependencies TEXT, -- JSON object
        scripts TEXT, -- JSON object
        bin TEXT, -- JSON object
        extracted_at TEXT NOT NULL,
        FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
      )`,

      // Repository files and structure
      `CREATE TABLE IF NOT EXISTS repository_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        file_type TEXT,
        size INTEGER,
        content_hash TEXT,
        analyzed BOOLEAN DEFAULT 0,
        mcp_relevant BOOLEAN DEFAULT 0,
        extracted_at TEXT NOT NULL,
        FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
      )`,

      // Discovery runs tracking
      `CREATE TABLE IF NOT EXISTS discovery_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        repositories_found INTEGER DEFAULT 0,
        repositories_analyzed INTEGER DEFAULT 0,
        mcp_servers_detected INTEGER DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        configuration TEXT -- JSON object
      )`,

      // Metadata and settings
      `CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      )`
    ];

    for (const table of tables) {
      await this.db.runAsync(table);
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    // Get current schema version
    let currentVersion = 0;
    try {
      const result = await this.db.getAsync(
        'SELECT value FROM metadata WHERE key = ?', 
        ['schema_version']
      );
      currentVersion = result ? parseInt(result.value) : 0;
    } catch (error) {
      // Metadata table might not exist yet
      currentVersion = 0;
    }

    // Run migrations if needed
    if (currentVersion < this.schemaVersion) {
      if (this.debug) {
        console.log(`📋 Running database migrations from v${currentVersion} to v${this.schemaVersion}`);
      }

      // Migration logic would go here for future schema changes
      // For now, just update version
      await this.setMetadata('schema_version', this.schemaVersion.toString());
    }
  }

  /**
   * Store discovered repository
   */
  async storeRepository(repositoryData) {
    try {
      const stmt = `INSERT OR REPLACE INTO repositories (
        full_name, name, owner, description, url, clone_url, ssh_url,
        language, stars, forks, watchers, size, topics, license,
        created_at, updated_at, pushed_at, archived, fork,
        discovered_at, search_pattern
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const result = await this.db.runAsync(stmt, [
        repositoryData.full_name,
        repositoryData.name,
        repositoryData.owner?.login || repositoryData.owner,
        repositoryData.description,
        repositoryData.html_url,
        repositoryData.clone_url,
        repositoryData.ssh_url,
        repositoryData.language,
        repositoryData.stargazers_count || 0,
        repositoryData.forks_count || 0,
        repositoryData.watchers_count || 0,
        repositoryData.size || 0,
        JSON.stringify(repositoryData.topics || []),
        repositoryData.license?.name,
        repositoryData.created_at,
        repositoryData.updated_at,
        repositoryData.pushed_at,
        repositoryData.archived ? 1 : 0,
        repositoryData.fork ? 1 : 0,
        repositoryData.discoveredAt || new Date().toISOString(),
        repositoryData.searchPattern
      ]);

      return result.lastID;

    } catch (error) {
      console.error('❌ Failed to store repository:', error.message);
      throw error;
    }
  }

  /**
   * Store repository analysis results
   */
  async storeAnalysis(repositoryId, analysisData) {
    try {
      const stmt = `INSERT OR REPLACE INTO mcp_analysis (
        repository_id, confidence, confidence_level, is_mcp, server_type,
        capabilities, indicators, analysis_version, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await this.db.runAsync(stmt, [
        repositoryId,
        analysisData.mcp?.confidence || 0,
        this.getConfidenceLevel(analysisData.mcp?.confidence || 0),
        (analysisData.mcp?.confidence || 0) > 30 ? 1 : 0,
        analysisData.mcp?.serverType,
        JSON.stringify(analysisData.mcp?.capabilities || []),
        JSON.stringify(analysisData.mcp?.indicators || []),
        '3.0',
        analysisData.analyzedAt || new Date().toISOString()
      ]);

      // Store package information if available
      if (analysisData.mcp?.packageInfo) {
        await this.storePackageInfo(repositoryId, analysisData);
      }

      // Store file information
      if (analysisData.files?.analyzed) {
        await this.storeFileInfo(repositoryId, analysisData);
      }

    } catch (error) {
      console.error('❌ Failed to store analysis:', error.message);
      throw error;
    }
  }

  /**
   * Store detection results
   */
  async storeDetection(repositoryId, detectionData) {
    try {
      const stmt = `INSERT OR REPLACE INTO mcp_detection (
        repository_id, detection_confidence, detection_level, classification,
        positive_indicators, negative_indicators, edge_cases, reasons,
        detection_version, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await this.db.runAsync(stmt, [
        repositoryId,
        detectionData.confidence || 0,
        detectionData.confidenceLevel || 'none',
        detectionData.classification || 'unknown',
        JSON.stringify(detectionData.indicators?.positive || []),
        JSON.stringify(detectionData.indicators?.negative || []),
        JSON.stringify(detectionData.edgeCases || []),
        JSON.stringify(detectionData.reasons || []),
        '3.0',
        new Date().toISOString()
      ]);

    } catch (error) {
      console.error('❌ Failed to store detection:', error.message);
      throw error;
    }
  }

  /**
   * Store package information
   */
  async storePackageInfo(repositoryId, analysisData) {
    try {
      const packageInfo = analysisData.mcp.packageInfo;
      if (!packageInfo) return;

      const stmt = `INSERT OR REPLACE INTO package_info (
        repository_id, package_name, version, main_file, installation_method,
        dependencies, dev_dependencies, scripts, bin, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await this.db.runAsync(stmt, [
        repositoryId,
        packageInfo.name,
        packageInfo.version,
        packageInfo.main,
        analysisData.analysis?.installationMethod,
        JSON.stringify(analysisData.analysis?.dependencies || {}),
        JSON.stringify(packageInfo.devDependencies || {}),
        JSON.stringify(packageInfo.scripts || {}),
        JSON.stringify(packageInfo.bin || null),
        new Date().toISOString()
      ]);

    } catch (error) {
      console.warn('⚠️  Failed to store package info:', error.message);
    }
  }

  /**
   * Store file information
   */
  async storeFileInfo(repositoryId, analysisData) {
    try {
      const analyzed = analysisData.files.analyzed || [];
      const mcpRelevant = analysisData.files.mcpRelevant || [];

      for (const filename of analyzed) {
        const stmt = `INSERT OR REPLACE INTO repository_files (
          repository_id, filename, analyzed, mcp_relevant, extracted_at
        ) VALUES (?, ?, ?, ?, ?)`;

        await this.db.runAsync(stmt, [
          repositoryId,
          filename,
          1,
          mcpRelevant.includes(filename) ? 1 : 0,
          new Date().toISOString()
        ]);
      }

    } catch (error) {
      console.warn('⚠️  Failed to store file info:', error.message);
    }
  }

  /**
   * Start discovery run tracking
   */
  async startDiscoveryRun(runId, configuration = {}) {
    try {
      const stmt = `INSERT INTO discovery_runs (
        run_id, status, started_at, configuration
      ) VALUES (?, ?, ?, ?)`;

      await this.db.runAsync(stmt, [
        runId,
        'running',
        new Date().toISOString(),
        JSON.stringify(configuration)
      ]);

      return runId;

    } catch (error) {
      console.error('❌ Failed to start discovery run:', error.message);
      throw error;
    }
  }

  /**
   * Update discovery run progress
   */
  async updateDiscoveryRun(runId, updates) {
    try {
      const fields = [];
      const values = [];

      if (updates.status) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      if (updates.repositoriesFound !== undefined) {
        fields.push('repositories_found = ?');
        values.push(updates.repositoriesFound);
      }

      if (updates.repositoriesAnalyzed !== undefined) {
        fields.push('repositories_analyzed = ?');
        values.push(updates.repositoriesAnalyzed);
      }

      if (updates.mcpServersDetected !== undefined) {
        fields.push('mcp_servers_detected = ?');
        values.push(updates.mcpServersDetected);
      }

      if (updates.completed) {
        fields.push('completed_at = ?');
        values.push(new Date().toISOString());
      }

      if (updates.error) {
        fields.push('error_message = ?');
        values.push(updates.error);
      }

      if (fields.length === 0) return;

      values.push(runId);
      const stmt = `UPDATE discovery_runs SET ${fields.join(', ')} WHERE run_id = ?`;
      
      await this.db.runAsync(stmt, values);

    } catch (error) {
      console.error('❌ Failed to update discovery run:', error.message);
      throw error;
    }
  }

  /**
   * Get repository by full name
   */
  async getRepository(fullName) {
    try {
      const stmt = `SELECT * FROM repositories WHERE full_name = ?`;
      return await this.db.getAsync(stmt, [fullName]);
    } catch (error) {
      console.error('❌ Failed to get repository:', error.message);
      return null;
    }
  }

  /**
   * Get repositories with MCP analysis
   */
  async getMCPRepositories(options = {}) {
    try {
      const {
        minConfidence = 30,
        limit = 1000,
        offset = 0,
        orderBy = 'confidence',
        orderDirection = 'DESC',
        serverType = null
      } = options;

      let whereClause = 'WHERE ma.confidence >= ?';
      let params = [minConfidence];

      if (serverType) {
        whereClause += ' AND ma.server_type = ?';
        params.push(serverType);
      }

      const orderByClause = `ORDER BY ma.${orderBy} ${orderDirection}`;
      const limitClause = `LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = `
        SELECT r.*, ma.confidence, ma.confidence_level, ma.is_mcp, 
               ma.server_type, ma.capabilities, ma.indicators,
               pi.package_name, pi.version, pi.installation_method
        FROM repositories r
        JOIN mcp_analysis ma ON r.id = ma.repository_id
        LEFT JOIN package_info pi ON r.id = pi.repository_id
        ${whereClause} ${orderByClause} ${limitClause}
      `;

      const results = await this.db.allAsync(stmt, params);
      
      return results.map(row => ({
        ...row,
        topics: JSON.parse(row.topics || '[]'),
        capabilities: JSON.parse(row.capabilities || '[]'),
        indicators: JSON.parse(row.indicators || '[]')
      }));

    } catch (error) {
      console.error('❌ Failed to get MCP repositories:', error.message);
      return [];
    }
  }

  /**
   * Get discovery run statistics
   */
  async getDiscoveryStats() {
    try {
      const stats = {
        totalRepositories: 0,
        analyzedRepositories: 0,
        mcpServers: 0,
        highConfidenceMCPs: 0,
        languageDistribution: {},
        serverTypeDistribution: {},
        lastDiscoveryRun: null
      };

      // Total repositories
      const totalRepos = await this.db.getAsync('SELECT COUNT(*) as count FROM repositories');
      stats.totalRepositories = totalRepos.count;

      // Analyzed repositories
      const analyzedRepos = await this.db.getAsync(
        'SELECT COUNT(*) as count FROM repositories r JOIN mcp_analysis ma ON r.id = ma.repository_id'
      );
      stats.analyzedRepositories = analyzedRepos.count;

      // MCP servers
      const mcpServers = await this.db.getAsync(
        'SELECT COUNT(*) as count FROM mcp_analysis WHERE is_mcp = 1'
      );
      stats.mcpServers = mcpServers.count;

      // High confidence MCPs
      const highConfMCPs = await this.db.getAsync(
        'SELECT COUNT(*) as count FROM mcp_analysis WHERE confidence >= 70'
      );
      stats.highConfidenceMCPs = highConfMCPs.count;

      // Language distribution
      const languages = await this.db.allAsync(`
        SELECT language, COUNT(*) as count 
        FROM repositories r 
        JOIN mcp_analysis ma ON r.id = ma.repository_id 
        WHERE ma.is_mcp = 1 AND language IS NOT NULL
        GROUP BY language 
        ORDER BY count DESC
      `);
      
      languages.forEach(row => {
        stats.languageDistribution[row.language] = row.count;
      });

      // Server type distribution
      const serverTypes = await this.db.allAsync(`
        SELECT server_type, COUNT(*) as count 
        FROM mcp_analysis 
        WHERE is_mcp = 1 AND server_type IS NOT NULL
        GROUP BY server_type 
        ORDER BY count DESC
      `);
      
      serverTypes.forEach(row => {
        stats.serverTypeDistribution[row.server_type] = row.count;
      });

      // Last discovery run
      const lastRun = await this.db.getAsync(`
        SELECT * FROM discovery_runs 
        WHERE status = 'completed' 
        ORDER BY completed_at DESC 
        LIMIT 1
      `);
      
      if (lastRun) {
        stats.lastDiscoveryRun = {
          ...lastRun,
          configuration: JSON.parse(lastRun.configuration || '{}')
        };
      }

      return stats;

    } catch (error) {
      console.error('❌ Failed to get discovery stats:', error.message);
      return null;
    }
  }

  /**
   * Set metadata value
   */
  async setMetadata(key, value) {
    try {
      const stmt = `INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, ?)`;
      await this.db.runAsync(stmt, [key, value, new Date().toISOString()]);
    } catch (error) {
      console.error('❌ Failed to set metadata:', error.message);
    }
  }

  /**
   * Get metadata value
   */
  async getMetadata(key) {
    try {
      const result = await this.db.getAsync('SELECT value FROM metadata WHERE key = ?', [key]);
      return result ? result.value : null;
    } catch (error) {
      console.error('❌ Failed to get metadata:', error.message);
      return null;
    }
  }

  /**
   * Clear old cache entries
   */
  async clearOldCache() {
    try {
      const cutoffDate = new Date(Date.now() - this.cacheTTL).toISOString();
      
      await this.db.runAsync(
        'DELETE FROM mcp_analysis WHERE analyzed_at < ?',
        [cutoffDate]
      );

      await this.db.runAsync(
        'DELETE FROM mcp_detection WHERE detected_at < ?',
        [cutoffDate]
      );

      if (this.debug) {
        console.log('🧹 Cleared old cache entries');
      }

    } catch (error) {
      console.warn('⚠️  Failed to clear cache:', error.message);
    }
  }

  /**
   * Export data to JSON
   */
  async exportData(options = {}) {
    try {
      const { includeAnalysis = true, includeDetection = true, format = 'json' } = options;
      
      const repositories = await this.db.allAsync('SELECT * FROM repositories');
      
      const exportData = {
        repositories: repositories.map(repo => ({
          ...repo,
          topics: JSON.parse(repo.topics || '[]'),
          archived: Boolean(repo.archived),
          fork: Boolean(repo.fork)
        })),
        exportedAt: new Date().toISOString(),
        totalCount: repositories.length
      };

      if (includeAnalysis) {
        const analysis = await this.db.allAsync(`
          SELECT ma.*, r.full_name
          FROM mcp_analysis ma
          JOIN repositories r ON ma.repository_id = r.id
        `);
        
        exportData.analysis = analysis.map(row => ({
          ...row,
          capabilities: JSON.parse(row.capabilities || '[]'),
          indicators: JSON.parse(row.indicators || '[]')
        }));
      }

      if (includeDetection) {
        const detection = await this.db.allAsync(`
          SELECT md.*, r.full_name
          FROM mcp_detection md
          JOIN repositories r ON md.repository_id = r.id
        `);
        
        exportData.detection = detection.map(row => ({
          ...row,
          positive_indicators: JSON.parse(row.positive_indicators || '[]'),
          negative_indicators: JSON.parse(row.negative_indicators || '[]'),
          edge_cases: JSON.parse(row.edge_cases || '[]'),
          reasons: JSON.parse(row.reasons || '[]')
        }));
      }

      return exportData;

    } catch (error) {
      console.error('❌ Failed to export data:', error.message);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }

  /**
   * Utility methods
   */
  async ensureDirectory(dirPath) {
    const fs = await import('fs/promises');
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  getConfidenceLevel(confidence) {
    if (confidence >= 70) return 'high';
    if (confidence >= 50) return 'medium';
    if (confidence >= 30) return 'low';
    return 'minimal';
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const storage = new MCPStorage({ debug: true });
  
  try {
    console.log('💾 MCP Storage Engine v3.0');
    console.log('===========================\n');
    
    await storage.initialize();
    
    const stats = await storage.getDiscoveryStats();
    console.log('📊 Current Database Stats:');
    console.log(`   Total repositories: ${stats.totalRepositories}`);
    console.log(`   Analyzed repositories: ${stats.analyzedRepositories}`);
    console.log(`   MCP servers detected: ${stats.mcpServers}`);
    console.log(`   High confidence MCPs: ${stats.highConfidenceMCPs}`);
    
    if (Object.keys(stats.languageDistribution).length > 0) {
      console.log('\n🔤 Language Distribution:');
      Object.entries(stats.languageDistribution)
        .slice(0, 5)
        .forEach(([lang, count]) => {
          console.log(`   ${lang}: ${count}`);
        });
    }
    
    await storage.close();
    
  } catch (error) {
    console.error('❌ Storage test failed:', error.message);
    process.exit(1);
  }
}

export default MCPStorage;