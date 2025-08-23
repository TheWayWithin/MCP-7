/**
 * PulseMCP Server Directory Sync for MCP-7 v3.0
 * Handles daily synchronization of PulseMCP server directory with local storage
 */

import { PulseMCPClient } from './pulsemcp-client.js';
import { MCPStorage } from './storage.js';
import { createHash } from 'crypto';

export class PulseMCPSync {
  constructor(options = {}) {
    this.options = {
      // Sync configuration
      syncInterval: options.syncInterval || 24 * 60 * 60 * 1000, // 24 hours
      batchSize: options.batchSize || 100,
      maxRetries: options.maxRetries || 3,
      
      // Data configuration
      includeInactive: options.includeInactive || false,
      minHealthScore: options.minHealthScore || 60,
      verifiedOnly: options.verifiedOnly || false,
      
      // Client options
      debug: options.debug || false,
      dryRun: options.dryRun || false,
      
      ...options
    };

    // Initialize components
    this.client = new PulseMCPClient({
      debug: this.options.debug,
      mockMode: options.mockMode || false
    });

    this.storage = new MCPStorage({
      debug: this.options.debug,
      dbPath: options.dbPath
    });

    // Sync tracking
    this.currentSyncId = null;
    this.stats = {
      servers: {
        total: 0,
        new: 0,
        updated: 0,
        inactive: 0,
        skipped: 0
      },
      categories: {
        processed: 0,
        created: 0
      },
      processing: {
        startTime: null,
        endTime: null,
        duration: 0,
        errors: [],
        warnings: []
      }
    };

    // Auto-sync timer
    this.syncTimer = null;
  }

  /**
   * Initialize sync system
   */
  async initialize() {
    try {
      if (this.options.debug) {
        console.log('🔧 Initializing PulseMCP sync system...');
      }

      await this.storage.initialize();
      await this.createPulseMCPTables();
      
      const connection = await this.client.testConnection();
      if (this.options.debug) {
        console.log('✅ PulseMCP sync initialized', connection.mock ? '(mock mode)' : '');
      }

    } catch (error) {
      console.error('❌ Failed to initialize PulseMCP sync:', error.message);
      throw error;
    }
  }

  /**
   * Run manual sync
   */
  async runSync(options = {}) {
    const syncOptions = { ...this.options, ...options };
    
    try {
      console.log('🔄 Starting PulseMCP directory sync');
      console.log('===================================\n');

      this.currentSyncId = this.generateSyncId();
      this.stats.processing.startTime = Date.now();

      // Check last sync time
      const lastSync = await this.getLastSyncTime();
      if (lastSync && !options.force) {
        const timeSinceSync = Date.now() - new Date(lastSync).getTime();
        if (timeSinceSync < this.options.syncInterval) {
          const remainingTime = this.options.syncInterval - timeSinceSync;
          const remainingHours = Math.round(remainingTime / (60 * 60 * 1000));
          
          console.log(`⏰ Last sync was ${Math.round(timeSinceSync / (60 * 60 * 1000))} hours ago`);
          console.log(`   Next scheduled sync in ${remainingHours} hours`);
          console.log('   Use --force to override');
          return { skipped: true, nextSyncIn: remainingHours };
        }
      }

      console.log('📊 Fetching PulseMCP statistics...');
      const remoteStats = await this.client.getStats();
      console.log(`   Total servers: ${remoteStats.totalServers}`);
      console.log(`   Active servers: ${remoteStats.activeServers}`);
      console.log(`   Verified servers: ${remoteStats.verifiedServers}`);

      // Sync categories first
      console.log('\n📂 Syncing categories...');
      await this.syncCategories();

      // Sync server directory
      console.log('\n📦 Syncing server directory...');
      await this.syncServers(syncOptions);

      // Update health data
      console.log('\n🏥 Updating health monitoring...');
      await this.updateHealthData();

      // Record sync completion
      await this.recordSyncCompletion();

      this.stats.processing.endTime = Date.now();
      this.stats.processing.duration = this.stats.processing.endTime - this.stats.processing.startTime;

      console.log('\n✅ PulseMCP sync completed successfully!');
      this.printSyncSummary();

      return {
        syncId: this.currentSyncId,
        stats: this.stats,
        duration: this.formatDuration(this.stats.processing.duration)
      };

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'sync',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      console.error('❌ PulseMCP sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Sync categories from PulseMCP
   */
  async syncCategories() {
    try {
      const categoriesData = await this.client.getCategories();
      
      if (!categoriesData.categories) {
        console.warn('⚠️  No categories data received');
        return;
      }

      for (const category of categoriesData.categories) {
        await this.storage.db.runAsync(`
          INSERT OR REPLACE INTO pulsemcp_categories (
            id, name, server_count, last_updated
          ) VALUES (?, ?, ?, ?)
        `, [
          category.id,
          category.name,
          category.count,
          new Date().toISOString()
        ]);

        this.stats.categories.processed++;
      }

      console.log(`✅ Synced ${categoriesData.categories.length} categories`);

    } catch (error) {
      this.stats.processing.warnings.push(`Failed to sync categories: ${error.message}`);
      console.warn('⚠️  Failed to sync categories:', error.message);
    }
  }

  /**
   * Sync servers from PulseMCP
   */
  async syncServers(options) {
    try {
      const serversData = await this.client.getAllServers({
        active: !options.includeInactive,
        verified: options.verifiedOnly ? true : null
      });

      if (!serversData.servers || serversData.servers.length === 0) {
        console.warn('⚠️  No servers data received');
        return;
      }

      this.stats.servers.total = serversData.servers.length;
      console.log(`📊 Processing ${serversData.servers.length} servers...`);

      // Process servers in batches
      const batches = this.createBatches(serversData.servers, options.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`   Batch ${i + 1}/${batches.length}: ${batch.length} servers`);

        await Promise.all(batch.map(server => this.syncServer(server, options)));

        if ((i + 1) % 10 === 0) {
          console.log(`   📊 Progress: ${Math.round(((i + 1) / batches.length) * 100)}%`);
        }
      }

      console.log(`✅ Server sync completed`);
      console.log(`   New servers: ${this.stats.servers.new}`);
      console.log(`   Updated servers: ${this.stats.servers.updated}`);
      console.log(`   Skipped servers: ${this.stats.servers.skipped}`);

    } catch (error) {
      this.stats.processing.errors.push({
        phase: 'servers',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Sync individual server
   */
  async syncServer(server, options) {
    try {
      // Skip servers below health threshold
      if (server.healthScore && server.healthScore < options.minHealthScore) {
        this.stats.servers.skipped++;
        return;
      }

      // Check if server exists
      const existingServer = await this.storage.db.getAsync(
        'SELECT * FROM pulsemcp_servers WHERE server_id = ?',
        [server.id]
      );

      const serverData = {
        server_id: server.id,
        name: server.name,
        description: server.description,
        category: server.category,
        language: server.language,
        capabilities: JSON.stringify(server.capabilities || []),
        version: server.version,
        author: server.author,
        repository: server.repository,
        verified: server.verified ? 1 : 0,
        active: server.active ? 1 : 0,
        health_score: server.healthScore || null,
        downloads: server.downloads || 0,
        stars: server.stars || 0,
        installation_method: server.installation?.method,
        installation_command: server.installation?.command,
        last_updated_upstream: server.lastUpdated,
        synced_at: new Date().toISOString()
      };

      if (existingServer) {
        // Update existing server
        await this.updateServerRecord(server.id, serverData);
        this.stats.servers.updated++;
      } else {
        // Create new server record
        await this.createServerRecord(serverData);
        this.stats.servers.new++;
      }

      // Store health history
      if (server.healthScore) {
        await this.recordHealthHistory(server.id, server.healthScore);
      }

    } catch (error) {
      this.stats.processing.warnings.push(
        `Failed to sync server ${server.id}: ${error.message}`
      );
      
      if (this.options.debug) {
        console.warn(`⚠️  Failed to sync server ${server.id}:`, error.message);
      }
    }
  }

  /**
   * Create new server record
   */
  async createServerRecord(serverData) {
    const fields = Object.keys(serverData).join(', ');
    const placeholders = Object.keys(serverData).map(() => '?').join(', ');
    const values = Object.values(serverData);

    await this.storage.db.runAsync(`
      INSERT INTO pulsemcp_servers (${fields}) VALUES (${placeholders})
    `, values);
  }

  /**
   * Update existing server record
   */
  async updateServerRecord(serverId, serverData) {
    const fields = Object.keys(serverData)
      .filter(key => key !== 'server_id')
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = Object.keys(serverData)
      .filter(key => key !== 'server_id')
      .map(key => serverData[key]);
    
    values.push(serverId);

    await this.storage.db.runAsync(`
      UPDATE pulsemcp_servers SET ${fields} WHERE server_id = ?
    `, values);
  }

  /**
   * Record health history
   */
  async recordHealthHistory(serverId, healthScore) {
    await this.storage.db.runAsync(`
      INSERT INTO pulsemcp_health_history (
        server_id, health_score, recorded_at
      ) VALUES (?, ?, ?)
    `, [serverId, healthScore, new Date().toISOString()]);
  }

  /**
   * Update health monitoring data
   */
  async updateHealthData() {
    try {
      // Calculate health trends
      await this.storage.db.runAsync(`
        UPDATE pulsemcp_servers 
        SET health_trend = (
          SELECT 
            CASE 
              WHEN COUNT(*) < 2 THEN 'stable'
              WHEN AVG(CASE WHEN rowid > (SELECT COUNT(*)/2 FROM pulsemcp_health_history h2 WHERE h2.server_id = h1.server_id) THEN health_score END) >
                   AVG(CASE WHEN rowid <= (SELECT COUNT(*)/2 FROM pulsemcp_health_history h2 WHERE h2.server_id = h1.server_id) THEN health_score END)
              THEN 'improving'
              WHEN AVG(CASE WHEN rowid > (SELECT COUNT(*)/2 FROM pulsemcp_health_history h2 WHERE h2.server_id = h1.server_id) THEN health_score END) <
                   AVG(CASE WHEN rowid <= (SELECT COUNT(*)/2 FROM pulsemcp_health_history h2 WHERE h2.server_id = h1.server_id) THEN health_score END)
              THEN 'declining'
              ELSE 'stable'
            END
          FROM pulsemcp_health_history h1
          WHERE h1.server_id = pulsemcp_servers.server_id
          GROUP BY h1.server_id
        )
      `);

      console.log('✅ Health monitoring data updated');

    } catch (error) {
      console.warn('⚠️  Failed to update health data:', error.message);
    }
  }

  /**
   * Record sync completion
   */
  async recordSyncCompletion() {
    try {
      await this.storage.db.runAsync(`
        INSERT INTO pulsemcp_sync_history (
          sync_id, started_at, completed_at, servers_total, servers_new,
          servers_updated, servers_skipped, categories_processed, errors, warnings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        this.currentSyncId,
        new Date(this.stats.processing.startTime).toISOString(),
        new Date().toISOString(),
        this.stats.servers.total,
        this.stats.servers.new,
        this.stats.servers.updated,
        this.stats.servers.skipped,
        this.stats.categories.processed,
        JSON.stringify(this.stats.processing.errors),
        JSON.stringify(this.stats.processing.warnings)
      ]);

      // Update metadata
      await this.storage.setMetadata('pulsemcp_last_sync', new Date().toISOString());
      await this.storage.setMetadata('pulsemcp_last_sync_id', this.currentSyncId);

    } catch (error) {
      console.warn('⚠️  Failed to record sync completion:', error.message);
    }
  }

  /**
   * Start automatic sync scheduling
   */
  startAutoSync() {
    if (this.syncTimer) {
      this.stopAutoSync();
    }

    console.log(`⏰ Starting automatic sync every ${Math.round(this.options.syncInterval / (60 * 60 * 1000))} hours`);
    
    this.syncTimer = setInterval(async () => {
      try {
        console.log('⏰ Running scheduled PulseMCP sync...');
        await this.runSync();
      } catch (error) {
        console.error('❌ Scheduled sync failed:', error.message);
      }
    }, this.options.syncInterval);
  }

  /**
   * Stop automatic sync scheduling
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('⏰ Automatic sync stopped');
    }
  }

  /**
   * Get servers by category
   */
  async getServersByCategory(category, options = {}) {
    const { limit = 50, offset = 0, verified = null } = options;
    
    let whereClause = 'WHERE category = ? AND active = 1';
    let params = [category];

    if (verified !== null) {
      whereClause += ' AND verified = ?';
      params.push(verified ? 1 : 0);
    }

    const servers = await this.storage.db.allAsync(`
      SELECT * FROM pulsemcp_servers 
      ${whereClause}
      ORDER BY health_score DESC, stars DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return servers.map(server => ({
      ...server,
      capabilities: JSON.parse(server.capabilities || '[]'),
      verified: Boolean(server.verified),
      active: Boolean(server.active)
    }));
  }

  /**
   * Search servers
   */
  async searchServers(query, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const searchTerm = `%${query.toLowerCase()}%`;

    const servers = await this.storage.db.allAsync(`
      SELECT * FROM pulsemcp_servers 
      WHERE (
        LOWER(name) LIKE ? OR 
        LOWER(description) LIKE ? OR 
        LOWER(capabilities) LIKE ?
      ) AND active = 1
      ORDER BY health_score DESC, stars DESC
      LIMIT ? OFFSET ?
    `, [searchTerm, searchTerm, searchTerm, limit, offset]);

    return servers.map(server => ({
      ...server,
      capabilities: JSON.parse(server.capabilities || '[]'),
      verified: Boolean(server.verified),
      active: Boolean(server.active)
    }));
  }

  /**
   * Get sync statistics
   */
  async getSyncStats() {
    try {
      const totalServers = await this.storage.db.getAsync(
        'SELECT COUNT(*) as count FROM pulsemcp_servers'
      );
      
      const activeServers = await this.storage.db.getAsync(
        'SELECT COUNT(*) as count FROM pulsemcp_servers WHERE active = 1'
      );
      
      const verifiedServers = await this.storage.db.getAsync(
        'SELECT COUNT(*) as count FROM pulsemcp_servers WHERE verified = 1'
      );

      const lastSync = await this.storage.getMetadata('pulsemcp_last_sync');
      const lastSyncId = await this.storage.getMetadata('pulsemcp_last_sync_id');

      const categories = await this.storage.db.allAsync(
        'SELECT category, COUNT(*) as count FROM pulsemcp_servers WHERE active = 1 GROUP BY category ORDER BY count DESC'
      );

      return {
        servers: {
          total: totalServers.count,
          active: activeServers.count,
          verified: verifiedServers.count
        },
        categories: categories.reduce((acc, cat) => {
          acc[cat.category] = cat.count;
          return acc;
        }, {}),
        lastSync: lastSync,
        lastSyncId: lastSyncId,
        autoSyncEnabled: !!this.syncTimer
      };

    } catch (error) {
      console.warn('⚠️  Failed to get sync stats:', error.message);
      return null;
    }
  }

  /**
   * Create PulseMCP-specific database tables
   */
  async createPulseMCPTables() {
    const tables = [
      // PulseMCP servers table
      `CREATE TABLE IF NOT EXISTS pulsemcp_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        language TEXT,
        capabilities TEXT, -- JSON array
        version TEXT,
        author TEXT,
        repository TEXT,
        verified BOOLEAN DEFAULT 0,
        active BOOLEAN DEFAULT 1,
        health_score INTEGER,
        health_trend TEXT DEFAULT 'stable',
        downloads INTEGER DEFAULT 0,
        stars INTEGER DEFAULT 0,
        installation_method TEXT,
        installation_command TEXT,
        last_updated_upstream TEXT,
        synced_at TEXT NOT NULL
      )`,

      // PulseMCP categories table
      `CREATE TABLE IF NOT EXISTS pulsemcp_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        server_count INTEGER DEFAULT 0,
        last_updated TEXT NOT NULL
      )`,

      // Health monitoring history
      `CREATE TABLE IF NOT EXISTS pulsemcp_health_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        health_score INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES pulsemcp_servers(server_id)
      )`,

      // Sync history tracking
      `CREATE TABLE IF NOT EXISTS pulsemcp_sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        servers_total INTEGER DEFAULT 0,
        servers_new INTEGER DEFAULT 0,
        servers_updated INTEGER DEFAULT 0,
        servers_skipped INTEGER DEFAULT 0,
        categories_processed INTEGER DEFAULT 0,
        errors TEXT, -- JSON array
        warnings TEXT -- JSON array
      )`
    ];

    for (const table of tables) {
      await this.storage.db.runAsync(table);
    }
  }

  /**
   * Utility methods
   */
  async getLastSyncTime() {
    return await this.storage.getMetadata('pulsemcp_last_sync');
  }

  generateSyncId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = createHash('md5')
      .update(`${timestamp}-${Math.random()}`)
      .digest('hex')
      .substring(0, 8);
    return `pulsemcp-sync-${timestamp}-${hash}`;
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
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

  printSyncSummary() {
    console.log('\n📊 Sync Summary');
    console.log('===============');
    console.log(`🕒 Duration: ${this.formatDuration(this.stats.processing.duration)}`);
    console.log(`📦 Total servers: ${this.stats.servers.total}`);
    console.log(`🆕 New servers: ${this.stats.servers.new}`);
    console.log(`🔄 Updated servers: ${this.stats.servers.updated}`);
    console.log(`⏭️  Skipped servers: ${this.stats.servers.skipped}`);
    console.log(`📂 Categories processed: ${this.stats.categories.processed}`);
    
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
    this.stopAutoSync();
    await this.storage.close();
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const sync = new PulseMCPSync({ 
    debug: true,
    mockMode: process.argv.includes('--mock')
  });

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const autoSync = args.includes('--auto');

  try {
    console.log('🔄 PulseMCP Sync v3.0');
    console.log('====================\n');

    await sync.initialize();

    if (autoSync) {
      sync.startAutoSync();
      console.log('🔄 Auto-sync started. Press Ctrl+C to stop.');
      
      // Keep process running
      process.on('SIGINT', async () => {
        console.log('\n🛑 Stopping auto-sync...');
        await sync.cleanup();
        process.exit(0);
      });
      
    } else {
      const result = await sync.runSync({ force });
      
      if (result.skipped) {
        console.log('⏭️  Sync skipped (use --force to override)');
      } else {
        console.log('✅ Sync completed successfully!');
        
        const stats = await sync.getSyncStats();
        console.log('\n📊 Current Statistics:');
        console.log(`   Total servers: ${stats.servers.total}`);
        console.log(`   Active servers: ${stats.servers.active}`);
        console.log(`   Verified servers: ${stats.servers.verified}`);
        console.log(`   Categories: ${Object.keys(stats.categories).length}`);
      }
      
      await sync.cleanup();
    }

  } catch (error) {
    console.error('❌ PulseMCP sync failed:', error.message);
    await sync.cleanup();
    process.exit(1);
  }
}

export default PulseMCPSync;