#!/bin/bash

# =============================================================================
# MCP-7 Discovery Engine - Environment Setup Helper
# =============================================================================
# This script helps you set up your environment configuration interactively
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Helper functions
print_header() {
    echo -e "\n${CYAN}${BOLD}$1${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..60})${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if .env already exists
check_existing_env() {
    if [ -f ".env" ]; then
        print_warning ".env file already exists!"
        echo -n "Do you want to (b)ackup and recreate, (u)pdate existing, or (c)ancel? [b/u/c]: "
        read -r choice
        case $choice in
            b|B)
                backup_file=".env.backup.$(date +%Y%m%d_%H%M%S)"
                mv .env "$backup_file"
                print_success "Existing .env backed up to $backup_file"
                return 0
                ;;
            u|U)
                print_info "Updating existing .env file..."
                return 1
                ;;
            c|C)
                print_info "Setup cancelled"
                exit 0
                ;;
            *)
                print_error "Invalid choice"
                exit 1
                ;;
        esac
    fi
    return 0
}

# Create or update .env file
setup_env_file() {
    local create_new=$1
    
    if [ "$create_new" = true ]; then
        # Start with the template
        if [ -f ".env.template" ]; then
            cp .env.template .env
            print_success "Created .env from template"
        else
            touch .env
            print_info "Created new .env file"
        fi
    fi
}

# Setup GitHub token
setup_github_token() {
    print_header "GitHub API Configuration"
    
    echo "The Discovery Engine uses GitHub API to find MCP repositories."
    echo "Without a token: 60 requests/hour (very limited)"
    echo "With a token: 5,000 requests/hour (recommended)"
    echo
    echo "Get your token at: ${CYAN}https://github.com/settings/tokens${NC}"
    echo "Required scopes: ${BOLD}public_repo${NC} (for public repositories)"
    echo
    
    # Check if token already exists in environment
    if [ -n "$GITHUB_TOKEN" ]; then
        print_info "GITHUB_TOKEN already set in environment"
        echo -n "Use existing token? [Y/n]: "
        read -r use_existing
        if [[ "$use_existing" =~ ^[Nn]$ ]]; then
            GITHUB_TOKEN=""
        else
            return 0
        fi
    fi
    
    echo -n "Enter your GitHub Personal Access Token (or press Enter to skip): "
    read -rs github_token
    echo
    
    if [ -n "$github_token" ]; then
        # Validate token format
        if [[ "$github_token" =~ ^gh[ps]_[a-zA-Z0-9]{36,}$ ]]; then
            GITHUB_TOKEN="$github_token"
            print_success "GitHub token configured"
            
            # Test the token
            echo -n "Test GitHub token? [Y/n]: "
            read -r test_token
            if [[ ! "$test_token" =~ ^[Nn]$ ]]; then
                test_github_token "$github_token"
            fi
        else
            print_warning "Token doesn't match expected format (ghp_... or ghs_...)"
            echo -n "Use anyway? [y/N]: "
            read -r use_anyway
            if [[ "$use_anyway" =~ ^[Yy]$ ]]; then
                GITHUB_TOKEN="$github_token"
                print_info "GitHub token configured (unvalidated)"
            else
                GITHUB_TOKEN=""
                print_warning "Skipping GitHub token configuration"
            fi
        fi
    else
        print_warning "No GitHub token provided - will use limited anonymous access"
        GITHUB_TOKEN=""
    fi
}

# Test GitHub token
test_github_token() {
    local token=$1
    print_info "Testing GitHub token..."
    
    response=$(curl -s -H "Authorization: token $token" https://api.github.com/user 2>/dev/null)
    
    if echo "$response" | grep -q '"login"'; then
        username=$(echo "$response" | grep '"login"' | cut -d'"' -f4)
        print_success "Token valid! Authenticated as: $username"
        
        # Check rate limit
        rate_limit=$(curl -s -H "Authorization: token $token" https://api.github.com/rate_limit 2>/dev/null)
        remaining=$(echo "$rate_limit" | grep -A2 '"core"' | grep '"remaining"' | grep -o '[0-9]*')
        limit=$(echo "$rate_limit" | grep -A2 '"core"' | grep '"limit"' | grep -o '[0-9]*' | head -1)
        
        if [ -n "$remaining" ] && [ -n "$limit" ]; then
            print_info "Rate limit: $remaining/$limit requests remaining"
        fi
    else
        print_error "Token validation failed - token may be invalid or expired"
    fi
}

# Setup PulseMCP API
setup_pulsemcp() {
    print_header "PulseMCP API Configuration"
    
    echo "PulseMCP provides a curated directory of 5,670+ MCP servers."
    echo "API access is currently experimental."
    echo
    echo "Without API key: Uses mock data (great for testing!)"
    echo "With API key: Access to live PulseMCP directory"
    echo
    
    echo -n "Enter your PulseMCP API Key (or press Enter to use mock data): "
    read -rs pulsemcp_key
    echo
    
    if [ -n "$pulsemcp_key" ]; then
        PULSEMCP_API_KEY="$pulsemcp_key"
        print_success "PulseMCP API key configured"
    else
        PULSEMCP_API_KEY=""
        print_info "Will use mock PulseMCP data for testing"
    fi
}

# Setup discovery options
setup_discovery_options() {
    print_header "Discovery Engine Configuration"
    
    echo "Configure discovery engine parameters:"
    echo
    
    # Max repositories
    echo -n "Maximum repositories to discover per run [1000]: "
    read -r max_repos
    MAX_REPOSITORIES=${max_repos:-1000}
    
    # Min stars
    echo -n "Minimum star count for repositories [1]: "
    read -r min_stars
    MIN_STARS=${min_stars:-1}
    
    # Concurrency
    echo -n "Concurrent processing threads [5]: "
    read -r concurrency
    CONCURRENCY=${concurrency:-5}
    
    # Mock mode
    echo -n "Enable mock mode for testing? [y/N]: "
    read -r mock_mode
    if [[ "$mock_mode" =~ ^[Yy]$ ]]; then
        MOCK_MODE="true"
        print_info "Mock mode enabled - will use simulated data"
    else
        MOCK_MODE="false"
    fi
    
    print_success "Discovery options configured"
}

# Setup environment type
setup_environment() {
    print_header "Environment Configuration"
    
    echo "Select environment type:"
    echo "  1) Development (verbose logging, debug features)"
    echo "  2) Production (optimized, minimal logging)"
    echo "  3) Test (for running tests)"
    echo
    echo -n "Choose environment [1-3, default: 1]: "
    read -r env_choice
    
    case ${env_choice:-1} in
        1)
            NODE_ENV="development"
            LOG_LEVEL="debug"
            DEBUG="true"
            ;;
        2)
            NODE_ENV="production"
            LOG_LEVEL="info"
            DEBUG="false"
            ;;
        3)
            NODE_ENV="test"
            LOG_LEVEL="error"
            DEBUG="false"
            ;;
        *)
            NODE_ENV="development"
            LOG_LEVEL="info"
            DEBUG="false"
            ;;
    esac
    
    print_success "Environment set to: $NODE_ENV"
}

# Write configuration to .env
write_env_file() {
    print_header "Writing Configuration"
    
    cat > .env << EOF
# ===============================================
# MCP-7 Discovery Engine Configuration
# Generated: $(date)
# ===============================================

# GitHub API Configuration
GITHUB_TOKEN=${GITHUB_TOKEN}

# PulseMCP API Configuration
PULSEMCP_API_KEY=${PULSEMCP_API_KEY}

# Database Configuration
DATABASE_PATH=./data/mcp-discovery.db

# Environment Configuration
NODE_ENV=${NODE_ENV}
LOG_LEVEL=${LOG_LEVEL}
DEBUG=${DEBUG}

# Discovery Engine Configuration
MAX_REPOSITORIES=${MAX_REPOSITORIES}
MIN_STARS=${MIN_STARS}
CONCURRENCY=${CONCURRENCY}
MOCK_MODE=${MOCK_MODE}

# API Rate Limiting
GITHUB_REQUEST_DELAY=100

# Sync Schedules
PULSEMCP_SYNC_SCHEDULE="0 2 * * *"
HEALTH_CHECK_INTERVAL=60

# Cache Configuration
CACHE_TTL=3600

# Export Configuration
EXPORT_PATH=./data/exports

# Feature Flags
ENABLE_GITHUB_DISCOVERY=true
ENABLE_PULSEMCP_SYNC=true
ENABLE_HEALTH_MONITORING=true
ENABLE_ML_CLASSIFICATION=false

# Performance Settings
BATCH_SIZE=50
NODE_OPTIONS="--max-old-space-size=2048"

# Analytics
ENABLE_ANALYTICS=false
EOF
    
    print_success ".env file created successfully!"
}

# Main setup flow
main() {
    clear
    echo -e "${CYAN}${BOLD}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║     MCP-7 Discovery Engine - Environment Setup v3.0     ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "src/discovery" ]; then
        print_error "Please run this script from the MCP-7 project root directory"
        exit 1
    fi
    
    # Check for existing .env
    if check_existing_env; then
        create_new=true
    else
        create_new=false
    fi
    
    # Setup configuration
    setup_github_token
    setup_pulsemcp
    setup_discovery_options
    setup_environment
    
    # Write configuration
    write_env_file
    
    # Final instructions
    print_header "Setup Complete!"
    
    echo "Your environment is configured and ready to use!"
    echo
    echo "Next steps:"
    echo "  1. Install dependencies: ${BOLD}npm install${NC}"
    echo "  2. Run the demo: ${BOLD}npm run demo${NC}"
    echo "  3. Start discovery: ${BOLD}npm start${NC}"
    echo
    
    if [ -z "$GITHUB_TOKEN" ]; then
        print_warning "Remember to add a GitHub token for full functionality"
        echo "  Get one at: https://github.com/settings/tokens"
    fi
    
    echo
    print_success "Happy discovering! 🚀"
}

# Run main function
main "$@"