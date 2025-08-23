/**
 * Health Monitor for MCP-7 v3.0
 * Tracks server health status, trends, and generates reliability reports
 */

import { MCPStorage } from './storage.js';
import { PulseMCPClient } from './pulsemcp-client.js';

export class HealthMonitor {
  constructor(options = {}) {
    this.options = {
      // Monitoring configuration
      healthCheckInterval: options.healthCheckInterval || 60 * 60 * 1000, // 1 hour
      trendAnalysisPeriod: options.trendAnalysisPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
      reliabilityThreshold: options.reliabilityThreshold || 80, // Minimum reliability score
      
      // Alert thresholds
      criticalHealthThreshold: options.criticalHealthThreshold || 50,
      warningHealthThreshold: options.warningHealthThreshold || 70,
      maxConsecutiveFailures: options.maxConsecutiveFailures || 3,
      
      // Analysis configuration
      minDataPoints: options.minDataPoints || 5, // Minimum data points for trend analysis
      smoothingFactor: options.smoothingFactor || 0.3, // Exponential smoothing factor
      
      // Processing options
      debug: options.debug || false,
      
      ...options
    };

    this.storage = new MCPStorage({
      debug: this.options.debug,
      dbPath: options.dbPath
    });

    this.client = new PulseMCPClient({
      debug: this.options.debug,
      mockMode: options.mockMode || false
    });

    // Health monitoring state
    this.isMonitoring = false;
    this.monitoringTimer = null;
    
    this.stats = {
      servers: {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        unavailable: 0
      },
      trends: {
        improving: 0,
        stable: 0,
        declining: 0
      },
      alerts: {
        generated: 0,
        critical: 0,
        warnings: 0
      },
      processing: {
        lastCheck: null,
        errors: [],
        warnings: []
      }
    };
  }

  /**
   * Initialize health monitoring system
   */
  async initialize() {
    try {
      if (this.options.debug) {
        console.log('🔧 Initializing health monitoring system...');
      }

      await this.storage.initialize();
      await this.createHealthTables();
      
      if (this.options.debug) {
        console.log('✅ Health monitoring initialized');
      }

    } catch (error) {
      console.error('❌ Failed to initialize health monitoring:', error.message);
      throw error;
    }
  }

  /**
   * Start continuous health monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️  Health monitoring is already running');
      return;
    }

    try {
      console.log('🏥 Starting health monitoring system');
      console.log('===================================');

      this.isMonitoring = true;

      // Run initial health check
      await this.runHealthCheck();

      // Schedule periodic health checks
      this.monitoringTimer = setInterval(async () => {
        try {
          if (this.options.debug) {
            console.log('⏰ Running scheduled health check...');
          }
          await this.runHealthCheck();
        } catch (error) {
          console.error('❌ Scheduled health check failed:', error.message);
          this.stats.processing.errors.push({
            type: 'scheduled_check',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }, this.options.healthCheckInterval);

      console.log(`✅ Health monitoring started (checking every ${Math.round(this.options.healthCheckInterval / (60 * 1000))} minutes)`);

    } catch (error) {
      this.isMonitoring = false;
      console.error('❌ Failed to start health monitoring:', error.message);
      throw error;
    }
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️  Health monitoring is not running');
      return;
    }

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    this.isMonitoring = false;
    console.log('🛑 Health monitoring stopped');
  }

  /**
   * Run manual health check
   */
  async runHealthCheck(options = {}) {
    try {
      console.log('🔍 Running health check...');
      const startTime = Date.now();

      // Reset stats for this check
      this.resetStats();
      
      // Get all servers to monitor
      const servers = await this.getServersToMonitor();
      this.stats.servers.total = servers.length;

      if (servers.length === 0) {
        console.log('⚠️  No servers to monitor');
        return { servers: 0, skipped: true };
      }

      console.log(`📊 Checking health of ${servers.length} servers...`);

      // Check health in batches
      const batchSize = 10;
      const batches = this.createBatches(servers, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`   Batch ${i + 1}/${batches.length}: ${batch.length} servers`);

        await Promise.all(batch.map(server => this.checkServerHealth(server)));

        // Brief pause between batches
        if (i < batches.length - 1) {
          await this.sleep(1000);
        }
      }

      // Analyze trends
      console.log('📈 Analyzing health trends...');
      await this.analyzeTrends();

      // Generate alerts
      console.log('🚨 Checking for health alerts...');
      await this.generateAlerts();

      // Update monitoring statistics
      this.stats.processing.lastCheck = new Date().toISOString();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Health check completed in ${this.formatDuration(duration)}`);
      
      this.printHealthSummary();

      return {
        stats: this.stats,
        duration: this.formatDuration(duration)
      };

    } catch (error) {
      this.stats.processing.errors.push({
        type: 'health_check',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
  }

  /**
   * Check individual server health
   */
  async checkServerHealth(server) {
    try {
      let healthData = null;

      // Try to get health data from PulseMCP
      if (server.pulsemcp_server_id) {
        healthData = await this.getHealthFromPulseMCP(server.pulsemcp_server_id);
      }

      // If no PulseMCP data, estimate health from available metadata
      if (!healthData) {
        healthData = this.estimateHealthFromMetadata(server);
      }

      // Record health measurement
      await this.recordHealthMeasurement(server.id, healthData);

      // Update server health status
      await this.updateServerHealthStatus(server.id, healthData);

      // Categorize health
      this.categorizeServerHealth(healthData.healthScore);

    } catch (error) {
      this.stats.processing.warnings.push(`Failed to check health for ${server.name}: ${error.message}`);
      this.stats.servers.unavailable++;
      
      if (this.options.debug) {
        console.warn(`⚠️  Failed to check health for ${server.name}:`, error.message);
      }

      // Record failure
      await this.recordHealthMeasurement(server.id, {
        healthScore: 0,
        status: 'unavailable',
        error: error.message
      });
    }
  }

  /**
   * Get health data from PulseMCP
   */
  async getHealthFromPulseMCP(serverId) {
    try {
      const serverDetails = await this.client.getServerDetails(serverId);
      
      if (!serverDetails) {
        throw new Error('Server not found in PulseMCP');
      }

      return {
        healthScore: serverDetails.healthScore || 0,
        status: this.determineHealthStatus(serverDetails.healthScore),
        lastUpdated: serverDetails.lastUpdated || new Date().toISOString(),
        source: 'pulsemcp',
        verified: serverDetails.verified,
        active: serverDetails.active,
        responseTime: null // PulseMCP doesn't provide this
      };

    } catch (error) {
      if (this.options.debug) {
        console.warn(`⚠️  Failed to get PulseMCP health for ${serverId}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Estimate health from available metadata
   */
  estimateHealthFromMetadata(server) {
    let healthScore = 50; // Base score
    let factors = [];

    // Factor in verification status
    if (server.verified) {
      healthScore += 20;
      factors.push('verified');
    }

    // Factor in repository activity
    if (server.github_stars && server.github_stars > 10) {
      healthScore += Math.min(server.github_stars / 10, 15);
      factors.push('popular');
    }

    // Factor in recent updates
    const lastUpdated = server.github_analyzed_at || server.pulsemcp_synced_at;
    if (lastUpdated) {
      const daysSinceUpdate = (Date.now() - new Date(lastUpdated).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceUpdate < 30) {
        healthScore += 10;
        factors.push('recently_updated');
      } else if (daysSinceUpdate > 180) {
        healthScore -= 20;
        factors.push('outdated');
      }
    }

    // Factor in confidence level
    if (server.confidence >= 70) {
      healthScore += 10;
      factors.push('high_confidence');
    }

    // Cap at 100
    healthScore = Math.min(healthScore, 100);

    return {
      healthScore: Math.round(healthScore),
      status: this.determineHealthStatus(healthScore),
      lastUpdated: new Date().toISOString(),
      source: 'estimated',
      factors: factors,
      responseTime: null
    };
  }

  /**
   * Determine health status from score
   */
  determineHealthStatus(score) {
    if (score >= this.options.warningHealthThreshold) return 'healthy';
    if (score >= this.options.criticalHealthThreshold) return 'warning';
    return 'critical';
  }

  /**
   * Record health measurement
   */
  async recordHealthMeasurement(serverId, healthData) {
    try {
      await this.storage.db.runAsync(`
        INSERT INTO health_measurements (
          server_id, health_score, status, response_time, source, 
          factors, error_message, measured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        serverId,
        healthData.healthScore,
        healthData.status,
        healthData.responseTime,
        healthData.source,
        JSON.stringify(healthData.factors || []),
        healthData.error || null,
        new Date().toISOString()
      ]);

    } catch (error) {
      if (this.options.debug) {
        console.warn(`⚠️  Failed to record health measurement:`, error.message);
      }
    }
  }

  /**
   * Update server health status
   */
  async updateServerHealthStatus(serverId, healthData) {
    try {
      // Calculate reliability score
      const reliability = await this.calculateReliability(serverId);
      
      await this.storage.db.runAsync(`
        UPDATE merged_servers 
        SET 
          health_score = ?,
          health_status = ?,
          reliability_score = ?,
          health_updated_at = ?
        WHERE id = ?
      `, [
        healthData.healthScore,
        healthData.status,
        reliability,
        new Date().toISOString(),
        serverId
      ]);

    } catch (error) {
      if (this.options.debug) {
        console.warn(`⚠️  Failed to update server health status:`, error.message);
      }
    }
  }

  /**
   * Calculate reliability score from historical data
   */
  async calculateReliability(serverId) {
    try {
      const measurements = await this.storage.db.allAsync(`
        SELECT health_score, status, measured_at
        FROM health_measurements
        WHERE server_id = ?
        ORDER BY measured_at DESC
        LIMIT 100
      `, [serverId]);

      if (measurements.length === 0) return 0;

      // Calculate weighted reliability (recent measurements matter more)
      let totalWeight = 0;
      let weightedScore = 0;

      measurements.forEach((measurement, index) => {
        const age = index + 1;
        const weight = 1 / Math.sqrt(age); // Exponential decay
        const score = measurement.status === 'unavailable' ? 0 : measurement.health_score;
        
        weightedScore += score * weight;
        totalWeight += weight;
      });

      return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    } catch (error) {
      console.warn(`⚠️  Failed to calculate reliability for server ${serverId}:`, error.message);
      return 0;
    }
  }

  /**
   * Categorize server health for statistics
   */
  categorizeServerHealth(healthScore) {
    if (healthScore >= this.options.warningHealthThreshold) {
      this.stats.servers.healthy++;
    } else if (healthScore >= this.options.criticalHealthThreshold) {
      this.stats.servers.warning++;
    } else {
      this.stats.servers.critical++;
    }
  }

  /**
   * Analyze health trends
   */
  async analyzeTrends() {
    try {
      const cutoffDate = new Date(Date.now() - this.options.trendAnalysisPeriod).toISOString();
      
      // Get servers with sufficient historical data
      const serversWithData = await this.storage.db.allAsync(`
        SELECT DISTINCT server_id
        FROM health_measurements
        WHERE measured_at >= ?
        GROUP BY server_id
        HAVING COUNT(*) >= ?
      `, [cutoffDate, this.options.minDataPoints]);

      for (const { server_id } of serversWithData) {
        const trend = await this.calculateHealthTrend(server_id, cutoffDate);
        await this.updateServerTrend(server_id, trend);
        
        // Update statistics
        this.stats.trends[trend]++;
      }

    } catch (error) {
      console.warn('⚠️  Failed to analyze trends:', error.message);
    }
  }

  /**
   * Calculate health trend for a server
   */
  async calculateHealthTrend(serverId, cutoffDate) {
    try {
      const measurements = await this.storage.db.allAsync(`
        SELECT health_score, measured_at
        FROM health_measurements
        WHERE server_id = ? AND measured_at >= ?
        ORDER BY measured_at ASC
      `, [serverId, cutoffDate]);

      if (measurements.length < this.options.minDataPoints) {
        return 'stable';
      }

      // Calculate trend using exponential smoothing
      let smoothedValues = [];
      let currentValue = measurements[0].health_score;
      
      for (const measurement of measurements) {
        currentValue = this.options.smoothingFactor * measurement.health_score + 
                      (1 - this.options.smoothingFactor) * currentValue;
        smoothedValues.push(currentValue);
      }

      // Determine trend from first and last smoothed values
      const start = smoothedValues[0];
      const end = smoothedValues[smoothedValues.length - 1];
      const change = end - start;
      const changePercent = Math.abs(change) / start;

      if (changePercent < 0.1) return 'stable';
      return change > 0 ? 'improving' : 'declining';

    } catch (error) {
      console.warn(`⚠️  Failed to calculate trend for server ${serverId}:`, error.message);
      return 'stable';
    }
  }

  /**
   * Update server trend in database
   */
  async updateServerTrend(serverId, trend) {
    try {
      await this.storage.db.runAsync(`
        UPDATE merged_servers 
        SET health_trend = ?
        WHERE id = ?
      `, [trend, serverId]);

    } catch (error) {
      if (this.options.debug) {
        console.warn(`⚠️  Failed to update trend for server ${serverId}:`, error.message);
      }
    }
  }

  /**
   * Generate health alerts
   */
  async generateAlerts() {
    try {
      // Find critical servers
      const criticalServers = await this.storage.db.allAsync(`
        SELECT * FROM merged_servers
        WHERE health_score < ? AND health_status = 'critical'
      `, [this.options.criticalHealthThreshold]);

      for (const server of criticalServers) {
        await this.generateAlert(server, 'critical', `Server health is critical (${server.health_score}%)`);
        this.stats.alerts.critical++;
      }

      // Find warning servers
      const warningServers = await this.storage.db.allAsync(`
        SELECT * FROM merged_servers
        WHERE health_score BETWEEN ? AND ? AND health_status = 'warning'
      `, [this.options.criticalHealthThreshold, this.options.warningHealthThreshold]);

      for (const server of warningServers) {
        await this.generateAlert(server, 'warning', `Server health is degraded (${server.health_score}%)`);
        this.stats.alerts.warnings++;
      }

      // Find declining trend servers
      const decliningServers = await this.storage.db.allAsync(`
        SELECT * FROM merged_servers
        WHERE health_trend = 'declining' AND reliability_score < ?
      `, [this.options.reliabilityThreshold]);

      for (const server of decliningServers) {
        await this.generateAlert(server, 'warning', `Server showing declining health trend`);
        this.stats.alerts.warnings++;
      }

      this.stats.alerts.generated = this.stats.alerts.critical + this.stats.alerts.warnings;

    } catch (error) {
      console.warn('⚠️  Failed to generate alerts:', error.message);
    }
  }

  /**
   * Generate individual alert
   */
  async generateAlert(server, severity, message) {
    try {
      // Check if we've already alerted for this server recently
      const recentAlert = await this.storage.db.getAsync(`
        SELECT id FROM health_alerts
        WHERE server_id = ? AND severity = ? AND created_at > ?
      `, [
        server.id,
        severity,
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
      ]);

      if (recentAlert) {
        return; // Don't spam alerts
      }

      await this.storage.db.runAsync(`
        INSERT INTO health_alerts (
          server_id, server_name, severity, message, 
          health_score, reliability_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        server.id,
        server.name,
        severity,
        message,
        server.health_score,
        server.reliability_score,
        new Date().toISOString()
      ]);

      if (this.options.debug) {
        console.log(`🚨 ${severity.toUpperCase()} Alert: ${server.name} - ${message}`);
      }

    } catch (error) {
      if (this.options.debug) {
        console.warn(`⚠️  Failed to generate alert for ${server.name}:`, error.message);
      }
    }
  }

  /**
   * Generate health report
   */
  async generateHealthReport(options = {}) {
    try {
      const { period = 7, includeAlerts = true, includeDetails = false } = options;
      const cutoffDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

      console.log('📊 Generating health report...');

      // Overall health statistics
      const overallStats = await this.storage.db.getAsync(`
        SELECT 
          COUNT(*) as total_servers,
          AVG(health_score) as avg_health,
          AVG(reliability_score) as avg_reliability,
          COUNT(CASE WHEN health_status = 'healthy' THEN 1 END) as healthy_count,
          COUNT(CASE WHEN health_status = 'warning' THEN 1 END) as warning_count,
          COUNT(CASE WHEN health_status = 'critical' THEN 1 END) as critical_count
        FROM merged_servers
        WHERE health_updated_at >= ?
      `, [cutoffDate]);

      // Trend analysis
      const trendStats = await this.storage.db.allAsync(`
        SELECT health_trend, COUNT(*) as count
        FROM merged_servers
        WHERE health_updated_at >= ?
        GROUP BY health_trend
      `, [cutoffDate]);

      // Top performing servers
      const topServers = await this.storage.db.allAsync(`
        SELECT name, health_score, reliability_score, health_trend
        FROM merged_servers
        WHERE health_updated_at >= ?
        ORDER BY reliability_score DESC, health_score DESC
        LIMIT 10
      `, [cutoffDate]);

      // Problematic servers
      const problematicServers = await this.storage.db.allAsync(`
        SELECT name, health_score, reliability_score, health_status, health_trend
        FROM merged_servers
        WHERE (health_status IN ('warning', 'critical') OR health_trend = 'declining')
        AND health_updated_at >= ?
        ORDER BY health_score ASC, reliability_score ASC
        LIMIT 10
      `, [cutoffDate]);

      const report = {
        period: period,
        generatedAt: new Date().toISOString(),
        overview: {
          totalServers: overallStats.total_servers,
          averageHealth: Math.round(overallStats.avg_health || 0),
          averageReliability: Math.round(overallStats.avg_reliability || 0),
          healthDistribution: {
            healthy: overallStats.healthy_count,
            warning: overallStats.warning_count,
            critical: overallStats.critical_count
          }
        },
        trends: trendStats.reduce((acc, trend) => {
          acc[trend.health_trend || 'unknown'] = trend.count;
          return acc;
        }, {}),
        topPerformers: topServers,
        problematicServers: problematicServers
      };

      // Include alerts if requested
      if (includeAlerts) {
        const recentAlerts = await this.storage.db.allAsync(`
          SELECT * FROM health_alerts
          WHERE created_at >= ?
          ORDER BY created_at DESC
          LIMIT 50
        `, [cutoffDate]);

        report.alerts = {
          total: recentAlerts.length,
          critical: recentAlerts.filter(a => a.severity === 'critical').length,
          warnings: recentAlerts.filter(a => a.severity === 'warning').length,
          recent: recentAlerts.slice(0, 10)
        };
      }

      return report;

    } catch (error) {
      console.error('❌ Failed to generate health report:', error.message);
      throw error;
    }
  }

  /**
   * Get servers to monitor
   */
  async getServersToMonitor() {
    try {
      return await this.storage.db.allAsync(`
        SELECT id, name, pulsemcp_server_id, github_stars, confidence,
               verified, github_analyzed_at, pulsemcp_synced_at
        FROM merged_servers
        ORDER BY verified DESC, confidence DESC, github_stars DESC
      `);

    } catch (error) {
      console.warn('⚠️  Failed to get servers to monitor:', error.message);
      return [];
    }
  }

  /**
   * Create health monitoring database tables
   */
  async createHealthTables() {
    const tables = [
      // Health measurements
      `CREATE TABLE IF NOT EXISTS health_measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        health_score INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'healthy', 'warning', 'critical', 'unavailable'
        response_time INTEGER,
        source TEXT NOT NULL, -- 'pulsemcp', 'estimated', 'direct'
        factors TEXT, -- JSON array of contributing factors
        error_message TEXT,
        measured_at TEXT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES merged_servers(id)
      )`,

      // Health alerts
      `CREATE TABLE IF NOT EXISTS health_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        server_name TEXT NOT NULL,
        severity TEXT NOT NULL, -- 'critical', 'warning'
        message TEXT NOT NULL,
        health_score INTEGER,
        reliability_score INTEGER,
        acknowledged BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL,
        acknowledged_at TEXT,
        FOREIGN KEY (server_id) REFERENCES merged_servers(id)
      )`
    ];

    for (const table of tables) {
      await this.storage.db.runAsync(table);
    }

    // Add health columns to merged_servers if they don't exist
    try {
      await this.storage.db.runAsync(`
        ALTER TABLE merged_servers ADD COLUMN health_score INTEGER DEFAULT 0
      `);
    } catch (error) {
      // Column probably already exists
    }

    try {
      await this.storage.db.runAsync(`
        ALTER TABLE merged_servers ADD COLUMN health_status TEXT DEFAULT 'unknown'
      `);
    } catch (error) {
      // Column probably already exists
    }

    try {
      await this.storage.db.runAsync(`
        ALTER TABLE merged_servers ADD COLUMN reliability_score INTEGER DEFAULT 0
      `);
    } catch (error) {
      // Column probably already exists
    }

    try {
      await this.storage.db.runAsync(`
        ALTER TABLE merged_servers ADD COLUMN health_updated_at TEXT
      `);
    } catch (error) {
      // Column probably already exists
    }
  }

  /**
   * Utility methods
   */
  resetStats() {
    this.stats = {
      servers: { total: 0, healthy: 0, warning: 0, critical: 0, unavailable: 0 },
      trends: { improving: 0, stable: 0, declining: 0 },
      alerts: { generated: 0, critical: 0, warnings: 0 },
      processing: { lastCheck: null, errors: [], warnings: [] }
    };
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

  printHealthSummary() {
    console.log('\n🏥 Health Check Summary');
    console.log('======================');
    console.log(`📊 Total servers checked: ${this.stats.servers.total}`);
    console.log(`✅ Healthy: ${this.stats.servers.healthy}`);
    console.log(`⚠️  Warning: ${this.stats.servers.warning}`);
    console.log(`🚨 Critical: ${this.stats.servers.critical}`);
    console.log(`❌ Unavailable: ${this.stats.servers.unavailable}`);
    
    if (this.stats.trends.improving + this.stats.trends.stable + this.stats.trends.declining > 0) {
      console.log(`\n📈 Health Trends:`);
      console.log(`   Improving: ${this.stats.trends.improving}`);
      console.log(`   Stable: ${this.stats.trends.stable}`);
      console.log(`   Declining: ${this.stats.trends.declining}`);
    }
    
    if (this.stats.alerts.generated > 0) {
      console.log(`\n🚨 Alerts Generated: ${this.stats.alerts.generated}`);
      console.log(`   Critical: ${this.stats.alerts.critical}`);
      console.log(`   Warnings: ${this.stats.alerts.warnings}`);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.stopMonitoring();
    await this.storage.close();
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new HealthMonitor({ 
    debug: true,
    mockMode: process.argv.includes('--mock')
  });

  const args = process.argv.slice(2);
  const continuous = args.includes('--continuous');
  const report = args.includes('--report');

  try {
    console.log('🏥 Health Monitor v3.0');
    console.log('======================\n');

    await monitor.initialize();

    if (report) {
      console.log('📊 Generating health report...\n');
      const healthReport = await monitor.generateHealthReport({ period: 7, includeAlerts: true });
      
      console.log('📋 Health Report (7 days)');
      console.log('=========================');
      console.log(`Total servers: ${healthReport.overview.totalServers}`);
      console.log(`Average health: ${healthReport.overview.averageHealth}%`);
      console.log(`Average reliability: ${healthReport.overview.averageReliability}%`);
      console.log(`Health distribution:`, healthReport.overview.healthDistribution);
      console.log(`Trends:`, healthReport.trends);
      
      if (healthReport.alerts) {
        console.log(`\nAlerts (${healthReport.alerts.total} total):`);
        console.log(`   Critical: ${healthReport.alerts.critical}`);
        console.log(`   Warnings: ${healthReport.alerts.warnings}`);
      }

    } else if (continuous) {
      await monitor.startMonitoring();
      
      console.log('🏥 Health monitoring started. Press Ctrl+C to stop.');
      
      process.on('SIGINT', async () => {
        console.log('\n🛑 Stopping health monitoring...');
        await monitor.cleanup();
        process.exit(0);
      });
      
    } else {
      const result = await monitor.runHealthCheck();
      console.log('✅ Health check completed successfully!');
    }

  } catch (error) {
    console.error('❌ Health monitoring failed:', error.message);
    await monitor.cleanup();
    process.exit(1);
  }
}

export default HealthMonitor;