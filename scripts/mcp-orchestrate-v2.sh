#!/bin/bash

# MCP-7 Orchestration Script v2 - With Real-World Fixes
# Handles config.json vs claude_desktop_config.json and validates packages

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Detect OS and config file
detect_os_and_config() {
    case "$(uname -s)" in
        Darwin*)    
            OS="macos"
            # Check for new config.json first
            if [ -f "$HOME/Library/Application Support/Claude/config.json" ]; then
                CONFIG_PATH="$HOME/Library/Application Support/Claude/config.json"
                CONFIG_FORMAT="new"
            elif [ -f "$HOME/Library/Application Support/Claude/claude_desktop_config.json" ]; then
                CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
                CONFIG_FORMAT="old"
            else
                CONFIG_PATH="$HOME/Library/Application Support/Claude/config.json"
                CONFIG_FORMAT="new"
            fi
            ;;
        Linux*)     
            OS="linux"
            if [ -f "$HOME/.config/Claude/config.json" ]; then
                CONFIG_PATH="$HOME/.config/Claude/config.json"
                CONFIG_FORMAT="new"
            elif [ -f "$HOME/.config/Claude/claude_desktop_config.json" ]; then
                CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
                CONFIG_FORMAT="old"
            else
                CONFIG_PATH="$HOME/.config/Claude/config.json"
                CONFIG_FORMAT="new"
            fi
            ;;
        MINGW*|MSYS*|CYGWIN*) 
            OS="windows"
            if [ -f "$APPDATA/Claude/config.json" ]; then
                CONFIG_PATH="$APPDATA/Claude/config.json"
                CONFIG_FORMAT="new"
            elif [ -f "$APPDATA/Claude/claude_desktop_config.json" ]; then
                CONFIG_PATH="$APPDATA/Claude/claude_desktop_config.json"
                CONFIG_FORMAT="old"
            else
                CONFIG_PATH="$APPDATA/Claude/config.json"
                CONFIG_FORMAT="new"
            fi
            ;;
        *)          
            OS="unknown"
            CONFIG_PATH=""
            CONFIG_FORMAT=""
            ;;
    esac
}

# Print header
print_header() {
    echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   MCP-7 Service Orchestrator v2.0      ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
    echo ""
}

# Validate npm package exists
validate_package() {
    local package_name="$1"
    echo -e "${YELLOW}→${NC} Validating package: $package_name"
    
    if npm view "$package_name" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Package exists on npm"
        return 0
    else
        echo -e "${RED}✗${NC} Package NOT found on npm"
        echo -e "${YELLOW}!${NC} Searching for similar packages..."
        npm search "${package_name%%-*}" 2>/dev/null | head -5
        return 1
    fi
}

# Backup existing config
backup_config() {
    if [ -f "$CONFIG_PATH" ]; then
        local backup_path="${CONFIG_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CONFIG_PATH" "$backup_path"
        echo -e "${GREEN}✓${NC} Backed up existing config"
        echo -e "  Location: $backup_path"
    else
        echo -e "${YELLOW}→${NC} No existing config to backup"
        mkdir -p "$(dirname "$CONFIG_PATH")"
    fi
}

# Add MCP to config with proper format detection
add_to_config() {
    local service_name="$1"
    local service_config="$2"
    
    echo -e "${YELLOW}→${NC} Adding $service_name to configuration..."
    
    # Create or update config using Python for proper JSON handling
    python3 -c "
import json
import os

config_path = '$CONFIG_PATH'
config_format = '$CONFIG_FORMAT'
service_name = '$service_name'
service_config = $service_config

# Load existing config or create new
if os.path.exists(config_path):
    with open(config_path, 'r') as f:
        config = json.load(f)
else:
    config = {}

# Handle new format (mcp.servers) vs old format (mcpServers)
if config_format == 'new':
    if 'mcp' not in config:
        config['mcp'] = {'servers': {}}
    elif 'servers' not in config['mcp']:
        config['mcp']['servers'] = {}
    config['mcp']['servers'][service_name] = service_config
else:
    if 'mcpServers' not in config:
        config['mcpServers'] = {}
    config['mcpServers'][service_name] = service_config

# Write back
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print(f'✓ Added {service_name} to configuration')
"
}

# List available verified MCPs
list_verified_mcps() {
    echo -e "\n${BLUE}Verified Working MCP Packages:${NC}"
    echo "1. Filesystem (@modelcontextprotocol/server-filesystem)"
    echo "2. Git (@cyanheads/git-mcp-server)"
    echo "3. GitHub (github-mcp-custom)"
    echo "4. Firecrawl (firecrawl-mcp)"
    echo "5. Playwright (@playwright/mcp@latest)"
    echo "6. Figma (figma-developer-mcp)"
    echo "7. Supabase (@supabase/mcp-server-supabase@latest)"
    echo "8. Custom (enter package name)"
}

# Orchestrate Filesystem MCP
orchestrate_filesystem() {
    echo -e "\n${CYAN}═══ Filesystem MCP ═══${NC}"
    
    if validate_package "@modelcontextprotocol/server-filesystem"; then
        local config='{
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/"],
            "env": {}
        }'
        add_to_config "filesystem" "$config"
    else
        echo -e "${RED}Skipping Filesystem MCP${NC}"
    fi
}

# Orchestrate GitHub MCP (Community)
orchestrate_github() {
    echo -e "\n${CYAN}═══ GitHub MCP (Community) ═══${NC}"
    
    if validate_package "github-mcp-custom"; then
        echo -e "${YELLOW}→${NC} GitHub Personal Access Token required"
        echo -e "  Get yours at: ${BLUE}https://github.com/settings/tokens${NC}"
        echo -n "  Enter token (or press Enter to skip): "
        read -s github_token
        echo ""
        
        if [ -n "$github_token" ]; then
            local config="{
                \"command\": \"npx\",
                \"args\": [\"-y\", \"github-mcp-custom\"],
                \"env\": {
                    \"GITHUB_PERSONAL_ACCESS_TOKEN\": \"$github_token\"
                }
            }"
            add_to_config "github" "$config"
        else
            echo -e "${YELLOW}!${NC} Skipping GitHub MCP (no token)"
        fi
    else
        echo -e "${RED}Skipping GitHub MCP${NC}"
    fi
}

# Show current configuration
show_current_config() {
    echo -e "\n${BLUE}Current MCP Configuration:${NC}"
    if [ -f "$CONFIG_PATH" ]; then
        python3 -c "
import json
with open('$CONFIG_PATH', 'r') as f:
    config = json.load(f)
    services = config.get('mcp', {}).get('servers', {})
    if not services:
        services = config.get('mcpServers', {})
    
    if services:
        for name in services:
            print(f'  • {name}')
    else:
        print('  No services configured')
"
    else
        echo "  No configuration file found"
    fi
}

# Show restart instructions
show_restart_instructions() {
    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}    SESSION RESTART REQUIRED${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    
    echo -e "\n${YELLOW}IMPORTANT:${NC} Restart Claude Desktop for changes to take effect\n"
    
    case "$OS" in
        macos)
            echo -e "${GREEN}macOS Instructions:${NC}"
            echo "1. Press ${BLUE}Cmd+Q${NC} to quit Claude Desktop"
            echo "2. Wait 5 seconds"
            echo "3. Reopen Claude Desktop"
            echo "4. Test: 'Show available MCP services'"
            ;;
        windows)
            echo -e "${GREEN}Windows Instructions:${NC}"
            echo "1. Press ${BLUE}Alt+F4${NC} to close Claude Desktop"
            echo "2. Wait 5 seconds"
            echo "3. Reopen Claude Desktop"
            echo "4. Test: 'Show available MCP services'"
            ;;
        linux)
            echo -e "${GREEN}Linux Instructions:${NC}"
            echo "1. Close Claude Desktop"
            echo "2. Wait 5 seconds"
            echo "3. Reopen Claude Desktop"
            echo "4. Test: 'Show available MCP services'"
            ;;
    esac
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}Select action:${NC}"
    echo "1) Show current configuration"
    echo "2) Add Filesystem MCP"
    echo "3) Add GitHub MCP (Community)"
    echo "4) Add custom MCP (with validation)"
    echo "5) Validate existing configuration"
    echo "6) Exit"
    echo -n "Choice [1-6]: "
}

# Main execution
main() {
    print_header
    detect_os_and_config
    
    if [ "$OS" = "unknown" ]; then
        echo -e "${RED}Error: Unknown operating system${NC}"
        exit 1
    fi
    
    echo -e "OS: ${GREEN}$OS${NC}"
    echo -e "Config: ${BLUE}$CONFIG_PATH${NC}"
    echo -e "Format: ${YELLOW}$CONFIG_FORMAT${NC} (${CONFIG_FORMAT} == 'new' ? 'mcp.servers' : 'mcpServers')"
    
    while true; do
        show_menu
        read choice
        
        case $choice in
            1)
                show_current_config
                ;;
            2)
                backup_config
                orchestrate_filesystem
                show_restart_instructions
                ;;
            3)
                backup_config
                orchestrate_github
                show_restart_instructions
                ;;
            4)
                echo -n "Enter npm package name: "
                read package_name
                if validate_package "$package_name"; then
                    echo -e "${GREEN}Package validated!${NC}"
                    # Add custom orchestration logic here
                fi
                ;;
            5)
                "$SCRIPT_DIR/validate-mcp.sh"
                ;;
            6)
                echo -e "${GREEN}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                ;;
        esac
    done
}

# Run main
main "$@"