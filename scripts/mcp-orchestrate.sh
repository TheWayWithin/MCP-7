#!/bin/bash

# MCP-7 Orchestration Script
# Automates MCP service installation and configuration

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

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    
            OS="macos"
            CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
            ;;
        Linux*)     
            OS="linux"
            CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
            ;;
        MINGW*|MSYS*|CYGWIN*) 
            OS="windows"
            CONFIG_PATH="$APPDATA/Claude/claude_desktop_config.json"
            ;;
        *)          
            OS="unknown"
            CONFIG_PATH=""
            ;;
    esac
}

# Print header
print_header() {
    echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     MCP-7 Service Orchestrator         ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
    echo ""
}

# Backup existing config
backup_config() {
    if [ -f "$CONFIG_PATH" ]; then
        local backup_path="${CONFIG_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CONFIG_PATH" "$backup_path"
        echo -e "${GREEN}✓${NC} Backed up existing config to: $(basename "$backup_path")"
    else
        echo -e "${YELLOW}→${NC} No existing config to backup"
        mkdir -p "$(dirname "$CONFIG_PATH")"
    fi
}

# Install MCP service
install_mcp_service() {
    local service_name="$1"
    local package_name="$2"
    
    echo -e "\n${BLUE}Installing $service_name...${NC}"
    
    if npm list -g "$package_name" --depth=0 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $service_name already installed"
    else
        echo -e "${YELLOW}→${NC} Installing $package_name..."
        if npm install -g "$package_name"; then
            echo -e "${GREEN}✓${NC} $service_name installed successfully"
        else
            echo -e "${RED}✗${NC} Failed to install $service_name"
            return 1
        fi
    fi
}

# Add MCP to config
add_to_config() {
    local service_name="$1"
    local service_config="$2"
    
    echo -e "${YELLOW}→${NC} Adding $service_name to configuration..."
    
    # Create or update config using Python for proper JSON handling
    python3 -c "
import json
import os

config_path = '$CONFIG_PATH'
service_name = '$service_name'
service_config = $service_config

# Load existing config or create new
if os.path.exists(config_path):
    with open(config_path, 'r') as f:
        config = json.load(f)
else:
    config = {'mcpServers': {}}

# Ensure mcpServers exists
if 'mcpServers' not in config:
    config['mcpServers'] = {}

# Add or update service
config['mcpServers'][service_name] = service_config

# Write back
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print(f'✓ Added {service_name} to configuration')
"
}

# Orchestrate GitHub MCP
orchestrate_github() {
    echo -e "\n${CYAN}═══ GitHub MCP ═══${NC}"
    
    install_mcp_service "GitHub MCP" "@modelcontextprotocol/server-github"
    
    # Check for existing token
    echo -e "${YELLOW}→${NC} GitHub Personal Access Token required"
    echo -e "  Get yours at: ${BLUE}https://github.com/settings/tokens${NC}"
    echo -n "  Enter token (or press Enter to skip): "
    read -s github_token
    echo ""
    
    if [ -n "$github_token" ]; then
        local config='{
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": {
                "GITHUB_PERSONAL_ACCESS_TOKEN": "'$github_token'"
            }
        }'
        add_to_config "github" "$config"
    else
        echo -e "${YELLOW}!${NC} Skipping GitHub MCP configuration (no token provided)"
    fi
}

# Orchestrate Filesystem MCP
orchestrate_filesystem() {
    echo -e "\n${CYAN}═══ Filesystem MCP ═══${NC}"
    
    install_mcp_service "Filesystem MCP" "@modelcontextprotocol/server-filesystem"
    
    local config='{
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/"],
        "env": {}
    }'
    add_to_config "filesystem" "$config"
}

# Orchestrate custom MCP
orchestrate_custom() {
    echo -e "\n${CYAN}═══ Custom MCP Service ═══${NC}"
    
    echo -n "Service name: "
    read service_name
    
    echo -n "npm package name: "
    read package_name
    
    echo -n "Requires API key? (y/n): "
    read requires_key
    
    if [ "$requires_key" = "y" ]; then
        echo -n "Environment variable name: "
        read env_var_name
        echo -n "Enter value: "
        read -s env_var_value
        echo ""
        
        local config="{
            \"command\": \"npx\",
            \"args\": [\"-y\", \"$package_name\"],
            \"env\": {
                \"$env_var_name\": \"$env_var_value\"
            }
        }"
    else
        local config="{
            \"command\": \"npx\",
            \"args\": [\"-y\", \"$package_name\"],
            \"env\": {}
        }"
    fi
    
    install_mcp_service "$service_name" "$package_name"
    add_to_config "$service_name" "$config"
}

# Show restart instructions
show_restart_instructions() {
    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}    SESSION RESTART REQUIRED${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    
    echo -e "\n${YELLOW}IMPORTANT:${NC} You must restart Claude Desktop for changes to take effect\n"
    
    case "$OS" in
        macos)
            echo -e "${GREEN}Steps for macOS:${NC}"
            echo "1. Save any important work in Claude"
            echo "2. Press ${BLUE}Cmd+Q${NC} to quit Claude Desktop"
            echo "3. Wait 5 seconds"
            echo "4. Reopen Claude Desktop from Applications"
            echo "5. Start a new conversation"
            echo "6. Type: 'Show available MCP commands' to verify"
            ;;
        windows)
            echo -e "${GREEN}Steps for Windows:${NC}"
            echo "1. Save any important work in Claude"
            echo "2. Press ${BLUE}Alt+F4${NC} to close Claude Desktop"
            echo "3. Wait 5 seconds"
            echo "4. Reopen Claude Desktop from Start Menu"
            echo "5. Start a new conversation"
            echo "6. Type: 'Show available MCP commands' to verify"
            ;;
        linux)
            echo -e "${GREEN}Steps for Linux:${NC}"
            echo "1. Save any important work in Claude"
            echo "2. Close Claude Desktop window"
            echo "3. Wait 5 seconds"
            echo "4. Reopen Claude Desktop"
            echo "5. Start a new conversation"
            echo "6. Type: 'Show available MCP commands' to verify"
            ;;
    esac
    
    echo -e "\n${BLUE}Test Commands:${NC}"
    echo "  • 'List my GitHub repositories' (if GitHub MCP installed)"
    echo "  • 'Show files in current directory' (if Filesystem MCP installed)"
    echo "  • 'What MCP services are available?'"
}

# Interactive menu
show_menu() {
    echo -e "\n${BLUE}Select MCP services to install:${NC}"
    echo "1) GitHub MCP - Access GitHub repositories"
    echo "2) Filesystem MCP - File system access"
    echo "3) Both GitHub and Filesystem"
    echo "4) Custom MCP service"
    echo "5) Validate existing configuration"
    echo "6) Exit"
    echo -n "Choice [1-6]: "
}

# Main orchestration
main() {
    print_header
    detect_os
    
    if [ "$OS" = "unknown" ]; then
        echo -e "${RED}Error: Unknown operating system${NC}"
        exit 1
    fi
    
    echo -e "Detected OS: ${GREEN}$OS${NC}"
    echo -e "Config path: ${BLUE}$CONFIG_PATH${NC}"
    
    while true; do
        show_menu
        read choice
        
        case $choice in
            1)
                backup_config
                orchestrate_github
                show_restart_instructions
                break
                ;;
            2)
                backup_config
                orchestrate_filesystem
                show_restart_instructions
                break
                ;;
            3)
                backup_config
                orchestrate_github
                orchestrate_filesystem
                show_restart_instructions
                break
                ;;
            4)
                backup_config
                orchestrate_custom
                show_restart_instructions
                break
                ;;
            5)
                "$SCRIPT_DIR/validate-mcp.sh"
                break
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
    
    echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}    Orchestration Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
}

# Run main
main "$@"