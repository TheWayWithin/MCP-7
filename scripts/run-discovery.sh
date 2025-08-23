#!/bin/bash

# MCP-7 GitHub Discovery Engine Runner
# Provides convenient CLI interface for running discovery

set -e

# Default configuration
MAX_REPOS=5000
MIN_STARS=1
CONCURRENCY=5
BATCH_SIZE=50
DRY_RUN=false
STRICT_MODE=false
DEBUG=false
EXPORT_RESULTS=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Print usage information
usage() {
    echo "MCP-7 GitHub Discovery Engine"
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --max-repos=N       Maximum repositories to discover (default: 5000)"
    echo "  --min-stars=N       Minimum stars filter (default: 1)"
    echo "  --concurrency=N     Concurrent requests (default: 5)"
    echo "  --batch-size=N      Repositories per batch (default: 50)"
    echo "  --dry-run          Skip database storage"
    echo "  --strict           Enable strict detection mode"
    echo "  --debug            Enable debug logging"
    echo "  --export           Export results after discovery"
    echo "  --quick            Quick discovery (1000 repos, 5 stars)"
    echo "  --test             Test run (100 repos, 10 stars)"
    echo "  --setup            Set up GitHub token"
    echo "  --stats            Show database statistics"
    echo "  --clean            Clean database"
    echo "  --help             Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                           # Full discovery with defaults"
    echo "  $0 --quick --debug           # Quick discovery with debug"
    echo "  $0 --max-repos=2000 --strict # Custom configuration"
    echo "  $0 --dry-run --test          # Test without database"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm dependencies
    if [ ! -d "node_modules" ]; then
        print_warning "Dependencies not installed. Running npm install..."
        npm install
    fi
    
    # Check GitHub token
    if [ -z "$GITHUB_TOKEN" ]; then
        print_warning "GITHUB_TOKEN not set. Rate limits will be severe (60 requests/hour)"
        echo "Consider setting up authentication with: $0 --setup"
    else
        print_success "GitHub token configured"
    fi
    
    print_success "Prerequisites check complete"
}

# Set up GitHub token
setup_github_token() {
    echo "GitHub Token Setup"
    echo "=================="
    echo ""
    echo "To get higher rate limits (5,000/hour vs 60/hour), you need a GitHub token."
    echo ""
    echo "Steps:"
    echo "1. Go to https://github.com/settings/tokens"
    echo "2. Click 'Generate new token' > 'Generate new token (classic)'"
    echo "3. Give it a name like 'MCP-7 Discovery'"
    echo "4. No specific scopes needed (public repos only)"
    echo "5. Click 'Generate token'"
    echo "6. Copy the token (starts with ghp_)"
    echo ""
    echo "Then run one of these:"
    echo "  export GITHUB_TOKEN=\"your_token_here\"  # For current session"
    echo "  echo 'export GITHUB_TOKEN=\"your_token_here\"' >> ~/.bashrc  # Permanent"
    echo ""
}

# Show database statistics
show_stats() {
    print_info "Database Statistics"
    echo "==================="
    
    if [ ! -f "data/mcp-discovery.db" ]; then
        print_warning "No database found. Run discovery first."
        return 1
    fi
    
    node -e "
    import { MCPStorage } from './src/discovery/storage.js';
    const storage = new MCPStorage();
    await storage.initialize();
    const stats = await storage.getDiscoveryStats();
    
    console.log(\`📊 Repository Statistics:\`);
    console.log(\`   Total repositories: \${stats.totalRepositories}\`);
    console.log(\`   Analyzed repositories: \${stats.analyzedRepositories}\`);
    console.log(\`   MCP servers detected: \${stats.mcpServers}\`);
    console.log(\`   High confidence MCPs: \${stats.highConfidenceMCPs}\`);
    
    console.log(\`\n🔤 Language Distribution:\`);
    Object.entries(stats.languageDistribution).slice(0, 10).forEach(([lang, count]) => {
        console.log(\`   \${lang}: \${count}\`);
    });
    
    console.log(\`\n🏷️  Server Type Distribution:\`);
    Object.entries(stats.serverTypeDistribution).slice(0, 10).forEach(([type, count]) => {
        console.log(\`   \${type}: \${count}\`);
    });
    
    if (stats.lastDiscoveryRun) {
        console.log(\`\n🕒 Last Discovery Run:\`);
        console.log(\`   Started: \${stats.lastDiscoveryRun.started_at}\`);
        console.log(\`   Completed: \${stats.lastDiscoveryRun.completed_at}\`);
        console.log(\`   Repositories found: \${stats.lastDiscoveryRun.repositories_found}\`);
        console.log(\`   MCPs detected: \${stats.lastDiscoveryRun.mcp_servers_detected}\`);
    }
    
    await storage.close();
    "
}

# Clean database
clean_database() {
    print_warning "This will delete all discovery data!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "data/mcp-discovery.db" ]; then
            rm "data/mcp-discovery.db"
            print_success "Database cleaned"
        else
            print_info "Database already clean"
        fi
    else
        print_info "Cancelled"
    fi
}

# Export discovery results
export_results() {
    print_info "Exporting discovery results..."
    
    node -e "
    import { MCPStorage } from './src/discovery/storage.js';
    import fs from 'fs/promises';
    
    const storage = new MCPStorage();
    await storage.initialize();
    const data = await storage.exportData();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = \`mcp-discovery-export-\${timestamp}.json\`;
    
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
    console.log(\`✅ Results exported to: \${filename}\`);
    console.log(\`   Total repositories: \${data.repositories.length}\`);
    console.log(\`   With analysis: \${data.analysis?.length || 0}\`);
    console.log(\`   With detection: \${data.detection?.length || 0}\`);
    
    await storage.close();
    "
}

# Run the discovery process
run_discovery() {
    print_info "Starting MCP-7 GitHub Discovery Engine"
    
    # Build command arguments
    ARGS=""
    
    if [ "$DRY_RUN" = true ]; then
        ARGS="$ARGS --dry-run"
    fi
    
    if [ "$STRICT_MODE" = true ]; then
        ARGS="$ARGS --strict"
    fi
    
    # Set environment variables
    if [ "$DEBUG" = true ]; then
        export DEBUG=true
    fi
    
    # Run discovery
    print_info "Configuration: $MAX_REPOS repos, $MIN_STARS min stars, $CONCURRENCY concurrency"
    
    node src/discovery/orchestrator.js \
        --max-repos="$MAX_REPOS" \
        --min-stars="$MIN_STARS" \
        --concurrency="$CONCURRENCY" \
        --batch-size="$BATCH_SIZE" \
        $ARGS
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        print_success "Discovery completed successfully!"
        
        if [ "$EXPORT_RESULTS" = true ]; then
            export_results
        fi
    else
        print_error "Discovery failed with exit code $exit_code"
        exit $exit_code
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-repos=*)
            MAX_REPOS="${1#*=}"
            shift
            ;;
        --min-stars=*)
            MIN_STARS="${1#*=}"
            shift
            ;;
        --concurrency=*)
            CONCURRENCY="${1#*=}"
            shift
            ;;
        --batch-size=*)
            BATCH_SIZE="${1#*=}"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --export)
            EXPORT_RESULTS=true
            shift
            ;;
        --quick)
            MAX_REPOS=1000
            MIN_STARS=5
            print_info "Quick discovery mode: $MAX_REPOS repos, $MIN_STARS min stars"
            shift
            ;;
        --test)
            MAX_REPOS=100
            MIN_STARS=10
            DRY_RUN=true
            DEBUG=true
            print_info "Test mode: $MAX_REPOS repos, $MIN_STARS min stars, dry run"
            shift
            ;;
        --setup)
            setup_github_token
            exit 0
            ;;
        --stats)
            show_stats
            exit 0
            ;;
        --clean)
            clean_database
            exit 0
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
echo "🚀 MCP-7 GitHub Discovery Engine v3.0"
echo "======================================"
echo ""

check_prerequisites

# If no specific action requested, run discovery
run_discovery