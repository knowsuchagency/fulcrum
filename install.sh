#!/bin/bash
# Vibora Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/knowsuchagency/vibora/main/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Ask user a yes/no question
ask_yes_no() {
    local prompt="$1"
    local default="${2:-n}"
    local response

    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n] "
    else
        prompt="$prompt [y/N] "
    fi

    read -r -p "$prompt" response
    response=${response:-$default}

    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# Install system prerequisites (build tools, unzip)
install_prerequisites() {
    print_step "Installing system prerequisites..."

    if command -v apt &> /dev/null; then
        # Debian/Ubuntu - install build-essential and unzip
        if sudo apt update && sudo apt install -y build-essential unzip; then
            print_success "System prerequisites installed"
            return 0
        fi
    elif command -v dnf &> /dev/null; then
        # Fedora/RHEL
        if sudo dnf install -y gcc gcc-c++ make unzip; then
            print_success "System prerequisites installed"
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        # Arch
        if sudo pacman -S --noconfirm base-devel unzip; then
            print_success "System prerequisites installed"
            return 0
        fi
    else
        print_warning "Could not detect package manager for prerequisites"
        echo "  Please ensure build tools (gcc, make) and unzip are installed"
        return 0  # Continue anyway, individual tools will fail if needed
    fi

    print_warning "Could not install prerequisites"
    return 1
}

# Check for git (required, won't install)
check_git() {
    print_step "Checking for git..."

    if ! command -v git &> /dev/null; then
        print_error "git is required but not installed."
        echo "  Install git using your system package manager"
        exit 1
    fi
    print_success "git $(git --version | cut -d' ' -f3)"
}

# Install bun
install_bun() {
    print_step "Checking for bun..."

    if command -v bun &> /dev/null; then
        print_success "bun is already installed ($(bun --version))"
        return 0
    fi

    print_warning "bun not found. Installing..."

    if curl -fsSL https://bun.sh/install | bash; then
        print_success "bun installed"
        # Source the updated PATH for this session
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        return 0
    fi

    print_error "Failed to install bun"
    echo "  Install manually: curl -fsSL https://bun.sh/install | bash"
    return 1
}

# Install Node.js
install_node() {
    print_step "Checking for Node.js..."

    if command -v node &> /dev/null; then
        print_success "Node.js is already installed ($(node --version))"
        return 0
    fi

    print_warning "Node.js not found. Installing..."

    # Try Homebrew first (works on both macOS and Linux)
    if command -v brew &> /dev/null; then
        if brew install node; then
            print_success "Node.js installed via Homebrew"
            return 0
        fi
    fi

    # Fallback to system package managers
    if command -v apt &> /dev/null; then
        # Use NodeSource for a recent LTS version
        if curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && \
           sudo apt install -y nodejs; then
            print_success "Node.js installed via apt"
            return 0
        fi
    elif command -v dnf &> /dev/null; then
        if sudo dnf install -y nodejs; then
            print_success "Node.js installed via dnf"
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        if sudo pacman -S --noconfirm nodejs npm; then
            print_success "Node.js installed via pacman"
            return 0
        fi
    fi

    print_warning "Could not install Node.js automatically"
    echo "  Install manually: https://nodejs.org/"
    return 1
}

# Install dtach
install_dtach() {
    print_step "Checking for dtach..."

    if command -v dtach &> /dev/null; then
        print_success "dtach is already installed"
        return 0
    fi

    print_warning "dtach not found. Installing..."

    # Try Homebrew first (works on both macOS and Linux)
    if command -v brew &> /dev/null; then
        if brew install dtach; then
            print_success "dtach installed via Homebrew"
            return 0
        fi
    fi

    # Fallback to system package managers
    if command -v apt &> /dev/null; then
        if sudo apt install -y dtach; then
            print_success "dtach installed via apt"
            return 0
        fi
    elif command -v dnf &> /dev/null; then
        if sudo dnf install -y dtach; then
            print_success "dtach installed via dnf"
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        if sudo pacman -S --noconfirm dtach; then
            print_success "dtach installed via pacman"
            return 0
        fi
    fi

    print_warning "Could not install dtach automatically"
    echo "  Install manually using your package manager"
    return 1
}

# Install uv
install_uv() {
    print_step "Checking for uv..."

    if command -v uv &> /dev/null; then
        print_success "uv is already installed"
        return 0
    fi

    print_warning "uv not found. Installing..."

    if command -v brew &> /dev/null; then
        if brew install uv; then
            print_success "uv installed via Homebrew"
            return 0
        fi
    fi

    # Fall back to curl installer
    if curl -LsSf https://astral.sh/uv/install.sh | sh; then
        print_success "uv installed via curl"
        # Source the updated PATH
        export PATH="$HOME/.local/bin:$PATH"
        return 0
    fi

    print_warning "Could not install uv automatically"
    echo "  Install manually: curl -LsSf https://astral.sh/uv/install.sh | sh"
    return 1
}

# Install Claude Code
install_claude_code() {
    print_step "Checking for Claude Code..."

    if command -v claude &> /dev/null; then
        print_success "Claude Code is already installed"
        return 0
    fi

    print_warning "Claude Code not found. Installing..."

    # Use Anthropic's official installer
    if curl -fsSL https://claude.ai/install.sh | bash; then
        print_success "Claude Code installed"
        # Source common installation paths
        export PATH="$HOME/.claude/bin:$HOME/.local/bin:$PATH"
        return 0
    fi

    print_warning "Could not install Claude Code automatically"
    echo "  Install manually: curl -fsSL https://claude.ai/install.sh | bash"
    return 1
}

# Install OpenCode
install_opencode() {
    print_step "Checking for OpenCode..."

    if command -v opencode &> /dev/null; then
        print_success "OpenCode is already installed"
        return 0
    fi

    print_warning "OpenCode not found. Installing..."

    # Use OpenCode's official installer
    if curl -fsSL https://opencode.ai/install | bash; then
        print_success "OpenCode installed"
        # Source common installation paths
        export PATH="$HOME/.opencode/bin:$HOME/.local/bin:$PATH"
        return 0
    fi

    print_warning "Could not install OpenCode automatically"
    echo "  Install manually: curl -fsSL https://opencode.ai/install | bash"
    return 1
}

# Interactive agent selection
select_and_install_agents() {
    echo ""
    print_step "AI Agent Selection"
    echo ""
    echo "Vibora can orchestrate these AI coding agents:"
    echo "  1) Claude Code - Anthropic's AI coding assistant"
    echo "  2) OpenCode - Open-source AI coding agent"
    echo "  3) Both"
    echo "  4) Neither (install later)"
    echo ""

    local choice
    read -r -p "Which agent(s) would you like to install? [1/2/3/4] " choice
    choice=${choice:-1}  # Default to Claude Code

    case "$choice" in
        1)
            install_claude_code
            ;;
        2)
            install_opencode
            ;;
        3)
            install_claude_code
            install_opencode
            ;;
        4)
            print_warning "Skipping agent installation"
            echo "  You can install agents later:"
            echo "    Claude Code: curl -fsSL https://claude.ai/install.sh | bash"
            echo "    OpenCode:    curl -fsSL https://opencode.ai/install | bash"
            ;;
        *)
            print_warning "Invalid choice, skipping agent installation"
            ;;
    esac
}

# Install GitHub CLI
install_gh() {
    print_step "Checking for GitHub CLI..."

    if command -v gh &> /dev/null; then
        print_success "GitHub CLI is already installed"
        return 0
    fi

    print_warning "GitHub CLI not found. Installing..."

    # Try Homebrew first
    if command -v brew &> /dev/null; then
        if brew install gh; then
            print_success "gh installed via Homebrew"
            return 0
        fi
    fi

    # Fallback to system package managers
    if command -v apt &> /dev/null; then
        # GitHub's official apt repository
        if (type -p wget >/dev/null || sudo apt install wget -y) && \
           sudo mkdir -p -m 755 /etc/apt/keyrings && \
           wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && \
           sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
           echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
           sudo apt update && \
           sudo apt install gh -y; then
            print_success "gh installed via apt"
            return 0
        fi
    elif command -v dnf &> /dev/null; then
        if sudo dnf install -y gh; then
            print_success "gh installed via dnf"
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        if sudo pacman -S --noconfirm github-cli; then
            print_success "gh installed via pacman"
            return 0
        fi
    fi

    print_warning "Could not install GitHub CLI automatically"
    echo "  Install manually: https://github.com/cli/cli#installation"
    return 1
}

# Install Docker
install_docker() {
    print_step "Checking for Docker..."

    if command -v docker &> /dev/null; then
        print_success "Docker is already installed"
        return 0
    fi

    print_warning "Docker not found. Installing..."

    # Try Homebrew first (works on both macOS and Linux)
    if command -v brew &> /dev/null; then
        if [[ "$(uname)" == "Darwin" ]]; then
            # macOS: use cask for Docker Desktop
            if brew install --cask docker; then
                print_success "Docker installed via Homebrew"
                echo "  Please open Docker Desktop to complete setup"
                return 0
            fi
        else
            # Linux: use formula for docker engine
            if brew install docker docker-compose; then
                print_success "Docker installed via Homebrew"
                return 0
            fi
        fi
    fi

    # Fallback to system package managers / official script
    if command -v apt &> /dev/null; then
        # Docker's official install script
        if curl -fsSL https://get.docker.com | sh; then
            print_success "Docker installed"
            # Add user to docker group
            if [ -n "$SUDO_USER" ]; then
                sudo usermod -aG docker "$SUDO_USER"
                echo "  Log out and back in for group changes to take effect"
            elif [ -n "$USER" ] && [ "$USER" != "root" ]; then
                sudo usermod -aG docker "$USER"
                echo "  Log out and back in for group changes to take effect"
            fi
            return 0
        fi
    elif command -v dnf &> /dev/null; then
        if sudo dnf install -y docker docker-compose-plugin && sudo systemctl enable --now docker; then
            print_success "Docker installed via dnf"
            if [ -n "$SUDO_USER" ]; then
                sudo usermod -aG docker "$SUDO_USER"
            elif [ -n "$USER" ] && [ "$USER" != "root" ]; then
                sudo usermod -aG docker "$USER"
            fi
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        if sudo pacman -S --noconfirm docker docker-compose && sudo systemctl enable --now docker; then
            print_success "Docker installed via pacman"
            if [ -n "$SUDO_USER" ]; then
                sudo usermod -aG docker "$SUDO_USER"
            elif [ -n "$USER" ] && [ "$USER" != "root" ]; then
                sudo usermod -aG docker "$USER"
            fi
            return 0
        fi
    fi

    print_warning "Could not install Docker automatically"
    echo "  Install manually: https://docs.docker.com/get-docker/"
    return 1
}

# Install cloudflared
install_cloudflared() {
    print_step "Checking for cloudflared..."

    if command -v cloudflared &> /dev/null; then
        print_success "cloudflared is already installed"
        return 0
    fi

    print_warning "cloudflared not found. Installing..."

    # Try Homebrew first (works on both macOS and Linux)
    if command -v brew &> /dev/null; then
        if brew install cloudflared; then
            print_success "cloudflared installed via Homebrew"
            return 0
        fi
    fi

    # Fallback to system package managers
    if command -v apt &> /dev/null; then
        # Add Cloudflare's GPG key and repo
        if curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null && \
           echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list && \
           sudo apt update && sudo apt install -y cloudflared; then
            print_success "cloudflared installed via apt"
            return 0
        fi
    elif command -v dnf &> /dev/null; then
        if sudo dnf install -y cloudflared; then
            print_success "cloudflared installed via dnf"
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        if sudo pacman -S --noconfirm cloudflared; then
            print_success "cloudflared installed via pacman"
            return 0
        fi
    fi

    # Fallback: try downloading binary directly
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) print_warning "Unsupported architecture: $arch"; return 1 ;;
    esac

    local os
    os=$(uname -s | tr '[:upper:]' '[:lower:]')

    if curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${os}-${arch}" -o /tmp/cloudflared && \
       chmod +x /tmp/cloudflared && \
       sudo mv /tmp/cloudflared /usr/local/bin/cloudflared; then
        print_success "cloudflared installed"
        return 0
    fi

    print_warning "Could not install cloudflared automatically"
    echo "  Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    return 1
}

# Install vibora CLI globally
install_vibora() {
    print_step "Installing vibora..."

    if bun install -g vibora@latest; then
        print_success "vibora installed"
    else
        print_error "Failed to install vibora"
        exit 1
    fi
}

# Install vibora plugin for Claude Code
install_vibora_plugin() {
    print_step "Installing vibora plugin for Claude Code..."

    if ! command -v claude &> /dev/null; then
        print_warning "Skipping plugin installation (Claude Code not available)"
        return 0
    fi

    # Add the vibora marketplace
    if claude plugin marketplace add knowsuchagency/vibora 2>/dev/null; then
        print_success "Added vibora marketplace"
    else
        print_warning "Could not add vibora marketplace (may already exist)"
    fi

    # Install the plugin globally
    if claude plugin install vibora@vibora --scope user 2>/dev/null; then
        print_success "Installed vibora plugin"
    else
        print_warning "Could not install vibora plugin"
        echo "  Try manually: claude plugin install vibora@vibora --scope user"
    fi
}

# Install vibora plugin for OpenCode
install_opencode_plugin() {
    print_step "Installing vibora plugin for OpenCode..."

    if ! command -v opencode &> /dev/null; then
        print_warning "Skipping plugin installation (OpenCode not available)"
        return 0
    fi

    # Install the plugin globally using vibora CLI
    if vibora opencode install; then
        print_success "Installed vibora plugin for OpenCode"
    else
        print_warning "Could not install vibora plugin for OpenCode"
        echo "  Try manually: vibora opencode install"
    fi
}

# Start vibora server
start_vibora() {
    print_step "Starting vibora server..."

    if vibora up; then
        print_success "vibora server started"
        echo ""
        echo -e "${GREEN}Installation complete!${NC}"
        echo ""
        echo "Open http://localhost:7777 in your browser"
        echo ""
        echo "Commands:"
        echo "  vibora status           # Check server status"
        echo "  vibora doctor           # Check all dependencies"
        echo "  vibora down             # Stop server"
        echo "  vibora up               # Start server"
        echo "  npx vibora@latest up    # Update and start"
    else
        print_error "Failed to start vibora server"
        echo "  Try: vibora up --help"
        exit 1
    fi
}

# Main installation flow
main() {
    echo ""
    echo -e "${BLUE}╔═════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}           Vibora Installation Script            ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Harness Attention. Orchestrate Agents. Ship.  ${BLUE}║${NC}"
    echo -e "${BLUE}╚═════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "This will install:"
    echo "  - bun (JavaScript runtime)"
    echo "  - Node.js (JavaScript runtime)"
    echo "  - dtach (terminal persistence)"
    echo "  - uv (Python package manager)"
    echo "  - AI agent (Claude Code and/or OpenCode - you choose)"
    echo "  - GitHub CLI (PR creation)"
    echo "  - Docker (app deployment)"
    echo "  - cloudflared (secure tunnels)"
    echo "  - vibora (this tool)"
    echo ""

    if ! ask_yes_no "Proceed with installation?" "y"; then
        echo "Installation cancelled."
        exit 0
    fi

    echo ""

    # Check required dependencies
    check_git

    # Install system prerequisites (build tools, unzip)
    install_prerequisites

    # Install all tools
    install_bun
    install_node
    install_dtach
    install_uv
    select_and_install_agents
    install_gh
    install_docker
    install_cloudflared
    install_vibora
    install_vibora_plugin
    install_opencode_plugin

    # Start the server
    start_vibora
}

main "$@"
