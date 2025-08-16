# MCP Service Connection Guide

## Quick Reference for MCP Orchestration

### 1. Official MCP Services (npm installable)

#### Filesystem MCP
- **Built-in**: No installation needed
- **Purpose**: File system access
- **Config**: Enabled by default in Claude Desktop

#### GitHub MCP
```bash
npm install -g @modelcontextprotocol/server-github
```
**Required**: GITHUB_PERSONAL_ACCESS_TOKEN

#### Anthropic MCP Tools
```bash
npm install -g @anthropic/mcp-tools
```
**Includes**: Web search, calculations, utilities

#### Google Drive MCP
```bash
npm install -g @modelcontextprotocol/server-googledrive
```
**Required**: OAuth2 credentials

#### Slack MCP
```bash
npm install -g @modelcontextprotocol/server-slack
```
**Required**: SLACK_BOT_TOKEN

### 2. Community MCP Services

#### Supabase MCP
```bash
git clone https://github.com/supabase/mcp-server
cd mcp-server && npm install && npm link
```
**Required**: SUPABASE_URL, SUPABASE_SERVICE_KEY

#### Railway MCP
```bash
git clone https://github.com/railwayapp/mcp-server
cd mcp-server && npm install && npm link
```
**Required**: RAILWAY_TOKEN

#### Vercel MCP
```bash
npm install -g @vercel/mcp-server
```
**Required**: VERCEL_TOKEN

### 3. Configuration Template

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "PROJECT_SPECIFIC_MCP": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/server.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### 4. Platform-Specific Paths

#### macOS
```bash
# Config location
~/Library/Application Support/Claude/claude_desktop_config.json

# Logs location  
~/Library/Logs/Claude/

# Update config
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
[JSON_CONFIG]
EOF
```

#### Windows
```bash
# Config location
%APPDATA%\Claude\claude_desktop_config.json

# Logs location
%LOCALAPPDATA%\Claude\logs\

# Update config (PowerShell)
@"
[JSON_CONFIG]
"@ | Out-File -FilePath "$env:APPDATA\Claude\claude_desktop_config.json"
```

#### Linux
```bash
# Config location
~/.config/Claude/claude_desktop_config.json

# Logs location
~/.local/share/Claude/logs/

# Update config
cat > ~/.config/Claude/claude_desktop_config.json << 'EOF'
[JSON_CONFIG]
EOF
```

### 5. Connection Validation Tests

#### Test GitHub MCP
```
List my GitHub repositories
```

#### Test Filesystem MCP
```
List files in current directory
```

#### Test Supabase MCP
```
Show Supabase tables
```

#### Test Generic MCP
```
Show available MCP commands
```

### 6. Troubleshooting Commands

#### Check if MCP service is running
```bash
# List all node processes
ps aux | grep node

# Check specific port
lsof -i :3000

# View Claude logs (macOS)
tail -f ~/Library/Logs/Claude/main.log
```

#### Validate JSON config
```bash
# Using Python
python -m json.tool ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Using jq
jq . ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

#### Reset configuration
```bash
# Backup current
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json ~/Desktop/claude_config_backup.json

# Reset to minimal
echo '{"mcpServers":{}}' > ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 7. Session Restart Procedure

**CRITICAL: Always follow this exact sequence**

1. **Save Work**: Export any important conversations
2. **Close Claude**: Use Cmd+Q (Mac) or Alt+F4 (Windows)
3. **Wait**: Count to 5 slowly
4. **Reopen**: Launch Claude Desktop
5. **Verify**: Type "Show MCP services" in new conversation

### 8. Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| MCP not appearing | Restart Claude Desktop completely |
| "Command not found" | Check npm global path: `npm config get prefix` |
| Authentication error | Verify token in config file |
| Connection timeout | Check firewall/proxy settings |
| Invalid JSON | Use JSON validator before saving |

### 9. Quick Setup Scripts

#### Install All Common MCPs (macOS/Linux)
```bash
#!/bin/bash
# Install common MCP services
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-filesystem  
npm install -g @anthropic/mcp-tools

echo "MCP services installed. Configure tokens in claude_desktop_config.json"
```

#### Generate Config with Placeholders
```bash
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "REPLACE_WITH_YOUR_TOKEN"
      }
    }
  }
}
EOF

echo "Config created. Replace GITHUB_PERSONAL_ACCESS_TOKEN with your actual token"
```

### 10. Project-Specific MCP Detection

When analyzing a project, check for:
- `package.json` - Node.js project → GitHub, npm MCPs
- `requirements.txt` - Python → GitHub, PyPI MCPs  
- `Dockerfile` - Containerized → Docker, Railway MCPs
- `.env` files - API integrations → Relevant service MCPs
- `supabase/` directory - Supabase project → Supabase MCP
- `vercel.json` - Vercel deployment → Vercel MCP